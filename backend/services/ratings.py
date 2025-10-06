# services/ratings.py
"""
Loads precomputed team ratings and provides helpers used by the API.
Prefers Parquet/Arrow if available, falling back to CSV.

Default location is backend/data/full_ratings (any of .parquet/.feather/.csv).
Set RATINGS_CSV to override the path (with or without extension) at runtime.
"""

import os
import math
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional, List, Dict, Any

import pandas as pd
# Import that works when backend/ is on sys.path (tests run from backend)
from utils.data_loader import load_table  # type: ignore

# Build a robust path to the ratings CSV
def _default_ratings_path() -> Path:
    # services/ -> app/ -> project root (/app in Docker)
    root = Path(__file__).resolve().parents[1]
    # Intentionally do not include extension so the loader can choose the best format
    return root / "data" / "full_ratings"

def get_ratings_csv_path() -> Path:
    env = os.getenv("RATINGS_CSV")
    if env:
        return Path(env).expanduser().resolve()
    return _default_ratings_path()

@lru_cache(maxsize=1)
def load_full() -> pd.DataFrame:
    """
    Read the ratings CSV once and cache the DataFrame.
    Ensures a YEAR column exists derived from GAME_DATE.
    """
    base = get_ratings_csv_path()
    # Use unified loader: it will try .parquet, .feather, then .csv on the same stem
    # Keep parse_dates semantics for CSV by normalizing dtype after load if needed.
    df = load_table(str(base))
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        # Normalize to datetime if the source didn't carry datetime type (CSV fallback)
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if "YEAR" not in df.columns and "GAME_DATE" in df.columns:
        df["YEAR"] = df["GAME_DATE"].dt.year
    return df

def resolved_csv_path() -> str:
    """Return the absolute base path the service will use for diagnostics."""
    return str(get_ratings_csv_path())

def clear_cache():
    """Clear the cached ratings DataFrame."""
    load_full.cache_clear()

def get_series(teams: Optional[List[str]] = None, start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
    """
    Return a DataFrame with rating time series filtered by teams and date range.

    Performance: filter early and select minimal columns to reduce work on
    multi-million-row tables. Only compute the formatted date for the subset.
    """
    df = load_full()

    # Build a filtered view first (no full-frame copy)
    sub = df
    if teams:
        sub = sub[sub["TEAM"].isin(teams)]

    if start:
        # Compare using datetime to avoid creating string dates for full frame
        start_dt = pd.to_datetime(start, errors="coerce")
        if pd.notna(start_dt):
            sub = sub[sub["GAME_DATE"] >= start_dt]

    if end:
        end_dt = pd.to_datetime(end, errors="coerce")
        if pd.notna(end_dt):
            sub = sub[sub["GAME_DATE"] <= end_dt]

    # Only keep the columns we need and sort at the end
    sub = sub.loc[:, ["GAME_DATE", "TEAM", "RATING"]].sort_values("GAME_DATE").copy()

    # Derive presentation date on the subset only
    sub["date"] = sub["GAME_DATE"].dt.strftime("%Y-%m-%d")
    out = sub.loc[:, ["date", "TEAM", "RATING"]].rename(columns={"TEAM": "team", "RATING": "rating"})
    return out


def _format_season_label(year: int) -> str:
    tail = abs(int(year)) % 100
    nxt = (tail + 1) % 100
    return f"{tail:02d}/{nxt:02d}"


def _ensure_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def build_series_bundle(df: pd.DataFrame) -> Dict[str, Any]:
    """Return aggregated structures used by the frontend chart.

    The bundle mirrors the JS-side transformations so the client can skip
    expensive per-render pivoting.
    """
    if df is None or df.empty:
        return {
            "seasonPivot": [],
            "seasonDetail": {},
            "seasonOptions": [],
            "seasonRange": None,
            "detailRange": None,
            "teams": [],
        }

    working = df.loc[:, ["date", "team", "rating"]].copy()
    working = working.dropna(subset=["date", "team"])
    if working.empty:
        return {
            "seasonPivot": [],
            "seasonDetail": {},
            "seasonOptions": [],
            "seasonRange": None,
            "detailRange": None,
            "teams": [],
        }

    working["date_obj"] = pd.to_datetime(working["date"], errors="coerce", utc=True)
    working = working.dropna(subset=["date_obj"])
    if working.empty:
        return {
            "seasonPivot": [],
            "seasonDetail": {},
            "seasonOptions": [],
            "seasonRange": None,
            "detailRange": None,
            "teams": []
        }

    working = working.sort_values("date_obj")

    pivot_map: Dict[int, Dict[str, float]] = {}
    detail_map: Dict[int, Dict[str, Any]] = {}
    teams_set = set()

    all_rows_accumulator = []

    for record in working.itertuples(index=False):
        team = record.team
        rating = record.rating
        if team is None or pd.isna(rating):
            continue
        dt_obj = record.date_obj
        if pd.isna(dt_obj):
            continue
        dt: datetime = _ensure_timestamp(dt_obj.to_pydatetime())
        month = dt.month
        year = dt.year
        season_start_year = year if month >= 9 else year - 1

        season_start = datetime(season_start_year, 9, 15, tzinfo=timezone.utc)
        season_end = datetime(season_start_year + 1, 6, 15, 23, 59, 59, tzinfo=timezone.utc)
        if dt < season_start or dt > season_end:
            continue

        season_key = season_start_year
        timestamp_ms = int(dt.timestamp() * 1000)

        teams_set.add(team)

        pivot_entry = pivot_map.setdefault(season_key, {"date": season_key})
        pivot_entry[team] = float(rating)

        season_detail = detail_map.setdefault(
            season_key,
            {
                "label": _format_season_label(season_key),
                "rows": {},
            },
        )

        day_key = record.date
        rows = season_detail["rows"]
        detail_row = rows.get(day_key)
        if not detail_row:
            detail_row = {
                "seasonKey": str(season_key),
                "date": day_key,
                "timestamp": timestamp_ms,
                "values": {},
            }
            rows[day_key] = detail_row
        detail_row["timestamp"] = timestamp_ms
        detail_row["values"][team] = float(rating)

    pivot_list = [pivot_map[key] for key in sorted(pivot_map.keys())]

    detail_output: Dict[str, Any] = {}
    detail_range = None
    for season_key in sorted(detail_map.keys()):
        info = detail_map[season_key]
        rows_dict: Dict[str, Dict[str, Any]] = info["rows"]
        rows_sorted = sorted(rows_dict.values(), key=lambda r: r["timestamp"])
        season_rows = []
        season_min = None
        season_max = None
        for idx, row in enumerate(rows_sorted, start=1):
            values = {name: float(val) for name, val in row["values"].items()}
            ts_val = row["timestamp"] if isinstance(row.get("timestamp"), (int, float)) else None
            if ts_val is None:
                try:
                    ts_val = float(row["timestamp"])
                except (TypeError, ValueError):
                    ts_val = None
            if ts_val is not None and math.isfinite(ts_val):
                if season_min is None or ts_val < season_min:
                    season_min = ts_val
                if season_max is None or ts_val > season_max:
                    season_max = ts_val
            output_row = {
                "seasonKey": str(season_key),
                "date": row["date"],
                "timestamp": row["timestamp"],
                "dayIndex": idx,
                "values": values,
            }
            season_rows.append(output_row)
            all_rows_accumulator.append(output_row.copy())
        detail_output[str(season_key)] = {
            "label": info["label"],
            "rows": season_rows,
            "range": (
                [int(season_min), int(season_max)]
                if season_min is not None and season_max is not None
                else None
            ),
        }
        if season_rows:
            min_ts = season_rows[0]["timestamp"]
            max_ts = season_rows[-1]["timestamp"]
            if detail_range is None:
                detail_range = [min_ts, max_ts]
            else:
                detail_range[0] = min(detail_range[0], min_ts)
                detail_range[1] = max(detail_range[1], max_ts)

    if all_rows_accumulator:
        all_rows_sorted = sorted(all_rows_accumulator, key=lambda r: r["timestamp"])
        all_rows = []
        for idx, row in enumerate(all_rows_sorted, start=1):
            combined_row = row.copy()
            combined_row["seasonKey"] = row.get("seasonKey")
            combined_row["dayIndex"] = idx
            all_rows.append(combined_row)
        detail_output["ALL"] = {
            "label": "All seasons",
            "rows": all_rows,
            "range": (
                [int(detail_range[0]), int(detail_range[1])]
                if detail_range is not None
                else None
            ),
        }
        if detail_range is None and all_rows:
            detail_range = [all_rows[0]["timestamp"], all_rows[-1]["timestamp"]]

    if detail_range is not None:
        detail_range = [int(detail_range[0]), int(detail_range[1])]

    if pivot_list:
        years = [entry["date"] for entry in pivot_list if isinstance(entry.get("date"), (int, float))]
        if years:
            min_year = int(min(years))
            max_year = int(max(years))
            season_range = {"min": min_year, "max": max_year}
        else:
            season_range = None
    else:
        season_range = None

    season_options = []
    if "ALL" in detail_output:
        season_options.append({
            "value": "ALL",
            "label": detail_output["ALL"].get("label"),
            "range": detail_output["ALL"].get("range"),
        })
    numeric_keys = [key for key in detail_output.keys() if key != "ALL"]
    numeric_keys.sort(key=lambda x: int(x), reverse=True)
    for key in numeric_keys:
        season_options.append({
            "value": key,
            "label": detail_output[key].get("label"),
            "range": detail_output[key].get("range"),
        })

    return {
        "seasonPivot": pivot_list,
        "seasonDetail": detail_output,
        "seasonOptions": season_options,
        "seasonRange": season_range,
        "detailRange": detail_range,
        "teams": sorted(teams_set),
    }

def teams() -> List[str]:
    """Return all unique team names sorted alphabetically."""
    df = load_full()
    vals = df["TEAM"].dropna().unique().tolist()
    return sorted(vals)

def seasons_for_team(team: str) -> List[int]:
    """Return all seasons available for a team sorted from newest to oldest."""
    df = load_full()
    vals = (
        df.loc[df["TEAM"] == team, "YEAR"]
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )
    return sorted(vals, reverse=True)

def latest_rating_in_season(team: str, year: int) -> Optional[float]:
    """
    Return the team's most recent rating within that season.
    If no rows match, return None.
    """
    df = load_full()
    sub = df[(df["TEAM"] == team) & (df["YEAR"] == int(year))].sort_values("GAME_DATE")
    if sub.empty:
        return None
    # If your CSV has a column named RATING use that. Adjust here if the name differs.
    col = "RATING"
    if col not in sub.columns:
        raise KeyError(f"Column '{col}' not found in ratings CSV")
    return float(sub.iloc[-1][col])

def predict_prob(home_team: str, home_year: int, away_team: str, away_year: int) -> dict:
    """
    Compute win probability and a simple margin proxy from rating difference.
    Uses an Elo style logistic with scale 400 and margin proxy diff divided by 25.
    """
    hr = latest_rating_in_season(home_team, home_year)
    ar = latest_rating_in_season(away_team, away_year)

    if hr is None:
        return {"error": f"No rating found for {home_team} in {home_year}"}
    if ar is None:
        return {"error": f"No rating found for {away_team} in {away_year}"}

    diff = hr - ar
    # Elo style probability for home
    p_home = 1.0 / (1.0 + math.pow(10.0, -diff / 400.0))
    # Simple linear margin proxy
    margin = diff / 25.0

    return {
        "home_rating": hr,
        "away_rating": ar,
        "rating_diff": diff,
        "home_win_prob": p_home,
        "predicted_margin": margin,
    }


def _normalise_team(name: object) -> str:
    if not isinstance(name, str):
        return ""
    return "".join(ch.lower() for ch in name if ch.isalnum())


@lru_cache(maxsize=1)
def _load_games_table() -> pd.DataFrame:
    """Load full NBA game data for head-to-head summaries."""
    base_root = Path(__file__).resolve().parents[1]
    dataset = base_root / "data" / "full_nba_data"
    try:
        games = load_table(str(dataset))
    except FileNotFoundError:
        return pd.DataFrame()
    games = games.copy()
    games["GAME_DATE"] = pd.to_datetime(games.get("GAME_DATE"), errors="coerce")
    if "SEASON_ID" in games.columns:
        season_start = games["SEASON_ID"].astype(str).str[-4:]
        games["SEASON_START"] = pd.to_numeric(season_start, errors="coerce")
    else:
        games["SEASON_START"] = games["GAME_DATE"].dt.year
    for col in ("HOME_TEAM_NAME", "AWAY_TEAM_NAME"):
        if col not in games.columns:
            return pd.DataFrame()
    for score_col in ("HOME_PTS", "AWAY_PTS"):
        if score_col not in games.columns:
            games[score_col] = pd.NA
    games["home_key"] = games["HOME_TEAM_NAME"].map(_normalise_team)
    games["away_key"] = games["AWAY_TEAM_NAME"].map(_normalise_team)
    if "WINNER_TEAM_NAME" in games.columns:
        games["winner_key"] = games["WINNER_TEAM_NAME"].map(_normalise_team)
    else:
        games["winner_key"] = ""
    return games


def summarize_matchup(
    home_team: str,
    away_team: str,
    home_year: int,
    away_year: int,
) -> Optional[dict]:
    """Return a compact head-to-head summary for the matchup."""
    games = _load_games_table()
    if games.empty:
        return None

    home_key = _normalise_team(home_team)
    away_key = _normalise_team(away_team)
    if not home_key or not away_key:
        return None

    mask = (
        ((games["home_key"] == home_key) & (games["away_key"] == away_key))
        | ((games["home_key"] == away_key) & (games["away_key"] == home_key))
    )
    matchups = games.loc[mask].copy()
    if matchups.empty:
        return None

    try:
        home_year_i = int(home_year)
        away_year_i = int(away_year)
    except (TypeError, ValueError):
        return None

    scope = "season" if home_year_i == away_year_i else "historical"
    reason = None
    cutoff_year = max(home_year_i, away_year_i)

    if scope == "season":
        season_subset = matchups.loc[matchups["SEASON_START"] == home_year_i]
        if season_subset.empty:
            scope = "historical"
            reason = "season_empty"
            candidate = matchups
        else:
            candidate = season_subset
    else:
        candidate = matchups

    applied_cutoff = False
    if scope == "historical":
        hist_subset = candidate.loc[candidate["SEASON_START"] < cutoff_year]
        if not hist_subset.empty:
            candidate = hist_subset
            applied_cutoff = True

    if candidate.empty:
        return None

    recent_df = candidate.sort_values("GAME_DATE", ascending=True, na_position="last").tail(5)
    if recent_df.empty:
        return None
    recent_df = recent_df.sort_values("GAME_DATE", ascending=False, na_position="last")

    home_wins = 0
    away_wins = 0
    margins: List[float] = []
    recent_games = []

    for _, row in recent_df.iterrows():
        home_score = row.get("HOME_PTS")
        away_score = row.get("AWAY_PTS")
        if pd.notna(home_score):
            try:
                home_score = int(home_score)
            except (TypeError, ValueError):
                home_score = None
        else:
            home_score = None
        if pd.notna(away_score):
            try:
                away_score = int(away_score)
            except (TypeError, ValueError):
                away_score = None
        else:
            away_score = None

        margin_for_home_team = None
        if home_score is not None and away_score is not None:
            margin_for_home_team = home_score - away_score

        margin_for_selection = None
        if margin_for_home_team is not None:
            if row.get("home_key") == home_key:
                margin_for_selection = margin_for_home_team
            elif row.get("home_key") == away_key:
                margin_for_selection = -margin_for_home_team
        else:
            winner_key = row.get("winner_key")
            if winner_key == home_key:
                home_wins += 1
            elif winner_key == away_key:
                away_wins += 1

        if margin_for_selection is not None:
            margins.append(float(margin_for_selection))
            if margin_for_selection > 0:
                home_wins += 1
            elif margin_for_selection < 0:
                away_wins += 1

        game_date = row.get("GAME_DATE")
        if pd.isna(game_date):
            date_str = ""
        elif isinstance(game_date, pd.Timestamp):
            date_str = game_date.strftime("%Y-%m-%d")
        else:
            date_str = str(game_date)

        recent_games.append(
            {
                "date": date_str,
                "home_team": row.get("HOME_TEAM_NAME"),
                "away_team": row.get("AWAY_TEAM_NAME"),
                "home_score": home_score,
                "away_score": away_score,
                "margin_for_home": margin_for_home_team,
            }
        )

    average_margin = float(sum(margins) / len(margins)) if margins else None
    total_games = len(recent_games)

    if scope == "season":
        note = f"Last {total_games} meetings in the {home_year_i} season."
        recent_heading = f"{home_year_i} season meetings"
    elif reason == "season_empty":
        note = f"No meetings in the {home_year_i} season; showing last {total_games} recorded games."
        recent_heading = "Recent meetings"
    elif applied_cutoff:
        note = f"Last {total_games} meetings before {cutoff_year}."
        recent_heading = f"Meetings before {cutoff_year}"
    else:
        note = f"Last {total_games} recorded meetings between the teams."
        recent_heading = "Recent meetings"

    return {
        "scope": scope,
        "home_team": home_team,
        "away_team": away_team,
        "home_season": home_year_i,
        "away_season": away_year_i,
        "total_games": total_games,
        "home_wins": home_wins,
        "away_wins": away_wins,
        "average_margin": average_margin,
        "recent_games": recent_games,
        "note": note,
        "recent_heading": recent_heading,
    }
