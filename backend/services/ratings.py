# services/ratings.py
"""
Loads precomputed team ratings and provides helpers used by the API.
Prefers Parquet/Arrow if available, falling back to CSV.

Default location is backend/data/full_ratings (any of .parquet/.feather/.csv).
Set RATINGS_CSV to override the path (with or without extension) at runtime.
"""

import os
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional, List, Set, Dict

import pandas as pd
# Import that works when backend/ is on sys.path (tests run from backend)
from utils.data_loader import load_table  # type: ignore
from services.team_history import active_years_for_team, load_team_history

# Build a robust path to the ratings CSV
def _default_per_game_path() -> Path:
    root = Path(__file__).resolve().parents[1]
    return root / "data" / "team_ratings"


def _default_seasonal_path() -> Path:
    root = Path(__file__).resolve().parents[1]
    return root / "data" / "team_ratings_seasonal"

def get_ratings_csv_path() -> Path:
    env = os.getenv("RATINGS_CSV")
    if env:
        return Path(env).expanduser().resolve()
    return _default_per_game_path()

@lru_cache(maxsize=1)
def load_full() -> pd.DataFrame:
    """
    Read the ratings CSV once and cache the DataFrame.
    Ensures a YEAR column exists derived from GAME_DATE.
    """
    base = get_ratings_csv_path()
    df = load_table(str(base))
    if "DATE" in df.columns and "GAME_DATE" not in df.columns:
        df = df.rename(columns={"DATE": "GAME_DATE"})
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if "TEAM_FULL_NAME" in df.columns and "TEAM" not in df.columns:
        df = df.rename(columns={"TEAM_FULL_NAME": "TEAM"})
    if "YEAR" not in df.columns and "GAME_DATE" in df.columns:
        df["YEAR"] = df["GAME_DATE"].dt.year
    if "TEAM" in df.columns:
        base = df["TEAM"].map(_primary_team_label)
        df["TEAM_BASE"] = base
        df["TEAM_KEY"] = df["TEAM"].map(_normalise_team)
        df["TEAM_BASE_KEY"] = base.map(_normalise_team)
    return df


@lru_cache(maxsize=1)
def load_seasonal() -> pd.DataFrame:
    base = _default_seasonal_path()
    df = load_table(str(base))
    if "DATE" in df.columns and "GAME_DATE" not in df.columns:
        df = df.rename(columns={"DATE": "GAME_DATE"})
    if "TEAM_FULL_NAME" in df.columns and "TEAM" not in df.columns:
        df = df.rename(columns={"TEAM_FULL_NAME": "TEAM"})
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if "TEAM" in df.columns:
        base = df["TEAM"].map(_primary_team_label)
        df["TEAM_BASE"] = base
        df["TEAM_KEY"] = df["TEAM"].map(_normalise_team)
        df["TEAM_BASE_KEY"] = base.map(_normalise_team)
    return df

def resolved_csv_path() -> str:
    """Return the absolute base path the service will use for diagnostics."""
    return str(get_ratings_csv_path())

def clear_cache():
    """Clear the cached ratings DataFrame."""
    load_full.cache_clear()
    load_seasonal.cache_clear()

def get_series(teams: Optional[List[str]] = None, start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
    """
    Return a DataFrame with rating time series filtered by teams and date range.

    Performance: filter early and select minimal columns to reduce work on
    multi-million-row tables. Only compute the formatted date for the subset.
    """
    df = load_full()

    sub = df
    if teams:
        wanted = { _normalise_team(t) for t in teams }
        mask = None
        if "TEAM_KEY" in df.columns:
            mask = df["TEAM_KEY"].isin(wanted)
        if "TEAM_BASE_KEY" in df.columns:
            base_mask = df["TEAM_BASE_KEY"].isin(wanted)
            mask = base_mask if mask is None else (mask | base_mask)
        if mask is None:
            sub = df.iloc[0:0]
        else:
            sub = df[mask]

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
    sub = sub.loc[:, ["GAME_DATE", "TEAM", "TEAM_BASE", "RATING"]].sort_values("GAME_DATE").copy()

    sub["date"] = sub["GAME_DATE"].dt.strftime("%Y-%m-%d")
    team_display = sub["TEAM_BASE"].where(sub["TEAM_BASE"].notna(), sub["TEAM"])
    out = sub.loc[:, ["date", "RATING"]].copy()
    out.insert(1, "team", team_display.values)
    out.rename(columns={"RATING": "rating"}, inplace=True)
    return out

def get_seasonal_summary(teams: Optional[List[str]] = None) -> pd.DataFrame:
    df = load_seasonal()
    sub = df
    if teams:
        wanted = {_normalise_team(t) for t in teams}
        mask = None
        if "TEAM_KEY" in df.columns:
            mask = df["TEAM_KEY"].isin(wanted)
        if "TEAM_BASE_KEY" in df.columns:
            base_mask = df["TEAM_BASE_KEY"].isin(wanted)
            mask = base_mask if mask is None else (mask | base_mask)
        sub = df.iloc[0:0] if mask is None else df[mask]
    if "GAME_DATE" in sub.columns:
        sub = sub.sort_values("GAME_DATE")
    sub = sub.loc[:, ["SEASON", "TEAM_BASE", "RATING"]].copy()
    sub.rename(columns={"SEASON": "season", "TEAM_BASE": "team", "RATING": "rating"}, inplace=True)
    return sub

def teams() -> List[str]:
    """Return all unique team names sorted alphabetically."""
    df = load_full()
    column = "TEAM_BASE" if "TEAM_BASE" in df.columns else "TEAM"
    raw_names = df[column].dropna().map(_primary_team_label).unique().tolist()

    history = load_team_history()
    season_counts: Dict[str, int] = {}
    if "YEAR" in df.columns:
        try:
            counts = (
                df.loc[:, [column, "YEAR"]]
                .dropna(subset=[column, "YEAR"])
                .assign(_team=lambda frame: frame[column].map(_primary_team_label))
                .groupby("_team")["YEAR"]
                .nunique(dropna=True)
            )
            season_counts = counts.to_dict()
        except Exception:
            season_counts = {}

    seen: Set[str] = set()
    filtered: List[str] = []

    for base in sorted(raw_names, key=lambda name: name.casefold()):
        if base in seen:
            continue
        entry = history.get(base)
        years = entry.get("years") if entry else None
        unique_years = {int(y) for y in years or [] if isinstance(y, int)}
        seasons = len(unique_years)
        if seasons <= 1:
            seasons = season_counts.get(base, seasons)
        if seasons <= 1:
            continue
        seen.add(base)
        filtered.append(base)

    return filtered

def seasons_for_team(team: str) -> List[int]:
    """Return all seasons available for a team sorted from newest to oldest."""
    df = load_full()
    norm = _normalise_team(team)
    mask = None
    if "TEAM_KEY" in df.columns:
        mask = df["TEAM_KEY"].isin([norm])
    if "TEAM_BASE_KEY" in df.columns:
        base_mask = df["TEAM_BASE_KEY"].isin([norm])
        mask = base_mask if mask is None else (mask | base_mask)
    subset = df.iloc[0:0] if mask is None else df[mask]
    vals = (
        subset.loc[:, "YEAR"]
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )
    allowed = active_years_for_team(team)
    if allowed:
        allowed_set = set(int(y) for y in allowed)
        vals = [year for year in vals if year in allowed_set]
    return sorted(vals, reverse=True)

def latest_rating_in_season(team: str, year: int) -> Optional[float]:
    """
    Return the team's most recent rating within that season.
    If no rows match, return None.
    """
    allowed_years = active_years_for_team(team)
    if allowed_years and int(year) not in allowed_years:
        return None
    df = load_full()
    norm = _normalise_team(team)
    mask_team = None
    if "TEAM_KEY" in df.columns:
        mask_team = df["TEAM_KEY"].isin([norm])
    if "TEAM_BASE_KEY" in df.columns:
        base_mask = df["TEAM_BASE_KEY"].isin([norm])
        mask_team = base_mask if mask_team is None else (mask_team | base_mask)
    sub = df.iloc[0:0] if mask_team is None else df[mask_team]
    sub = sub[sub["YEAR"] == int(year)].sort_values("GAME_DATE")
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


def _primary_team_label(name: object) -> str:
    """Prefer the core team label when full names include era ranges."""
    if not isinstance(name, str):
        return ""
    base = name.split("(", 1)[0].strip()
    return base or name


def _normalise_team(name: object) -> str:
    if not isinstance(name, str):
        return ""
    base = _primary_team_label(name)
    return "".join(ch.lower() for ch in base if ch.isalnum())


@lru_cache(maxsize=1)
def _load_games_table() -> pd.DataFrame:
    """Load full NBA game data for head-to-head summaries."""
    base_root = Path(__file__).resolve().parents[1]
    dataset = base_root / "data" / "nba_game_outcomes"
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

    winner_source = None
    if "WINNER_TEAM_FULL_NAME" in games.columns:
        winner_source = games["WINNER_TEAM_FULL_NAME"]
    elif "WINNER_TEAM_NAME" in games.columns:
        winner_source = games["WINNER_TEAM_NAME"]
    if winner_source is not None:
        games["winner_key"] = winner_source.map(lambda v: _normalise_team(_primary_team_label(v)))
    else:
        games["winner_key"] = ""

    if "LOSER_TEAM_FULL_NAME" in games.columns:
        loser_source = games["LOSER_TEAM_FULL_NAME"]
    elif "LOSER_TEAM_NAME" in games.columns:
        loser_source = games["LOSER_TEAM_NAME"]
    else:
        loser_source = None
    if loser_source is not None:
        games["loser_key"] = loser_source.map(lambda v: _normalise_team(_primary_team_label(v)))
    else:
        games["loser_key"] = ""
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
