"""
Feature builder for XGBoost models (classification & regression).

Builds leak-proof, pre-game features from team metrics and attaches a
pre-game historical rating diff (home − away).

Datasets used:
  - Team metrics: backend/data/team_metrics_dataset.(parquet|csv)
  - Ratings (default Elo): backend/data/ratings_elo.(parquet|csv)
    Alternative kinds: ratings_glicko, ratings_trueskill

Notes:
- Uses backend.utils.data_loader.load_table to prefer Parquet and fall back to CSV.
- Rolling features are computed with shift(1) per team to avoid leakage.
- Ratings are joined by GAME_DATE and team full name derived from TEAM_ABBREVIATION.

# QUESTION: Confirm if ratings files have columns exactly: GAME_DATE, TEAM, RATING
# QUESTION: Any additional team name normalization needed beyond teamdictionary mapping?
"""

from __future__ import annotations

from pathlib import Path
from functools import lru_cache
from typing import List, Tuple, Dict

import numpy as np
import pandas as pd

# Import loader with dual-path fallback (works when running from repo root or backend/)
try:
    from backend.utils.data_loader import load_table  # type: ignore
except Exception:  # pragma: no cover - fallback for tests running from backend/
    try:
        from utils.data_loader import load_table  # type: ignore
    except Exception:  # last resort
        load_table = None  # type: ignore

# Team abbreviation/name helpers
try:
    from backend.Rating_Algorithms.teamdictionary import (
        get_team_name as _abbr_to_name,  # type: ignore
        normalize_team_abbrev as _abbr_norm,  # type: ignore
    )
except Exception:  # pragma: no cover
    from Rating_Algorithms.teamdictionary import (  # type: ignore
        get_team_name as _abbr_to_name,
        normalize_team_abbrev as _abbr_norm,
    )

ROLL_WINDOWS = [3, 5, 10]
PREFIXES = ["TRAD_", "ADV_", "FF_", "MISC_", "SCOR_"]
EXCLUDE = {
    # Obvious leak-prone or redundant
    "TRAD_PLUS_MINUS",
    "TRAD_PTS",
    "TRAD_MIN",
    "TRAD_win",
    "ADV_NETRTG",
    "ADV_PIE",
    # season keys (categoricals)
    "ADV_season",
    "FF_season",
    "MISC_season",
    "SCOR_season",
}


def load_team_metrics() -> pd.DataFrame:
    """Load team-per-game metrics with Parquet preference.

    Ensures GAME_DATE is datetime64[ns].
    """
    stem = "backend/data/team_metrics_dataset"
    df: pd.DataFrame | None = None
    if load_table:
        try:
            df = load_table(stem)
        except FileNotFoundError:
            df = None
    if df is None:
        p = Path(stem)
        if p.with_suffix(".parquet").exists():
            try:
                df = pd.read_parquet(p.with_suffix(".parquet"))
            except ImportError:
                df = None
        if df is None and p.with_suffix(".csv").exists():
            df = pd.read_csv(p.with_suffix(".csv"))
        if df is None:
            fallback = Path("backend/data/team_metrics.csv")
            if fallback.exists():
                df = pd.read_csv(fallback)
            else:
                raise FileNotFoundError(
                    "team_metrics dataset not found (looked for team_metrics_dataset.[parquet|csv] and team_metrics.csv)"
                )
    if not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if "TRAD_win" not in df.columns and "WINLOSS" in df.columns:
        df["TRAD_win"] = df["WINLOSS"].astype(str).str.upper().str.startswith("W").astype(int)

    # Attach team abbreviations/names for join steps downstream. Older extracts may not
    # include them, so derive from the enlarged game metadata table when available.
    if "HOME_TEAM_ABBREVIATION" not in df.columns or "AWAY_TEAM_ABBREVIATION" not in df.columns:
        try:
            meta = load_table("backend/data/nba_game_outcomes") if load_table else None
        except FileNotFoundError:
            meta = None

        if meta is None:
            meta_path = Path("backend/data/nba_game_outcomes")
            if meta_path.with_suffix(".parquet").exists():
                meta = pd.read_parquet(meta_path.with_suffix(".parquet"))
            elif meta_path.with_suffix(".csv").exists():
                meta = pd.read_csv(meta_path.with_suffix(".csv"))

        if meta is not None:
            keep_cols = [
                "GAME_ID",
                "HOME_TEAM_ABBREVIATION",
                "HOME_TEAM_NAME",
                "AWAY_TEAM_ABBREVIATION",
                "AWAY_TEAM_NAME",
            ]
            meta = meta.loc[:, [c for c in keep_cols if c in meta.columns]].drop_duplicates("GAME_ID")
            df = df.merge(meta, on="GAME_ID", how="left", validate="many_to_one")
            if "TEAM_ABBREVIATION" not in df.columns:
                home_mask = df["TEAM_ID"] == df["HOME_TEAM_ID"]
                df["TEAM_ABBREVIATION"] = df["AWAY_TEAM_ABBREVIATION"]
                df.loc[home_mask, "TEAM_ABBREVIATION"] = df.loc[home_mask, "HOME_TEAM_ABBREVIATION"]
            if "TEAM_NAME" not in df.columns and "HOME_TEAM_NAME" in df.columns and "AWAY_TEAM_NAME" in df.columns:
                home_mask = df["TEAM_ID"] == df["HOME_TEAM_ID"]
                df["TEAM_NAME"] = df["AWAY_TEAM_NAME"]
                df.loc[home_mask, "TEAM_NAME"] = df.loc[home_mask, "HOME_TEAM_NAME"]
    return df


TEAM_REFERENCE_PATH = Path("backend/data/nba_teams.csv")


@lru_cache(maxsize=1)
def _load_team_reference() -> pd.DataFrame:
    """Return dataframe mapping team identifiers to metadata."""
    if TEAM_REFERENCE_PATH.exists():
        refs = pd.read_csv(TEAM_REFERENCE_PATH, encoding="utf-8-sig")
        if "TEAM_ID" in refs.columns:
            refs["TEAM_ID"] = pd.to_numeric(refs["TEAM_ID"], errors="coerce").astype("Int64")
        return refs
    raise FileNotFoundError("backend/data/nba_teams.csv not found; required for team ratings features")


def _load_team_ratings_raw() -> pd.DataFrame:
    """Load team_ratings dataset with DATE column parsed."""
    stem = "backend/data/team_ratings"
    if load_table:
        df = load_table(stem)
    else:
        p = Path(stem)
        if p.with_suffix(".parquet").exists():
            df = pd.read_parquet(p.with_suffix(".parquet"))
        else:
            df = pd.read_csv(p.with_suffix(".csv"))
    if "DATE" not in df.columns:
        raise KeyError("team_ratings dataset missing DATE column")
    df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
    return df


@lru_cache(maxsize=1)
def _prepare_team_ratings_features() -> pd.DataFrame:
    """
    Return per-team pre-game rating features derived from team_ratings.csv.

    Columns: TEAM_ID, GAME_DATE, TR_RATING_PRE, TR_RATING_DELTA,
             TR_RATING_ROLL5, TR_RATING_ROLL10
    """
    raw = _load_team_ratings_raw().copy()
    refs = _load_team_reference()
    full_map = {
        str(row["TEAM_FULL_NAME"]).strip(): row["TEAM_ID"]
        for _, row in refs.iterrows()
        if pd.notna(row.get("TEAM_FULL_NAME")) and pd.notna(row.get("TEAM_ID"))
    }
    name_map = {
        str(row["TEAM_NAME"]).strip(): row["TEAM_ID"]
        for _, row in refs.iterrows()
        if pd.notna(row.get("TEAM_NAME")) and pd.notna(row.get("TEAM_ID"))
    }
    upper_full_map = {key.upper(): val for key, val in full_map.items()}

    def resolve_team_id(name: str) -> int | None:
        if not isinstance(name, str):
            return None
        key = name.strip()
        if not key:
            return None
        if key in full_map:
            return int(full_map[key])
        base = key.split("(")[0].strip()
        if base in name_map:
            return int(name_map[base])
        if base in full_map:
            return int(full_map[base])
        upper = base.upper()
        if upper in upper_full_map:
            return int(upper_full_map[upper])
        return None

    raw["TEAM_NAME"] = raw["TEAM_FULL_NAME"].astype(str).str.split("(").str[0].str.strip()
    raw["TEAM_ID"] = raw["TEAM_FULL_NAME"].apply(resolve_team_id)
    mask_missing = raw["TEAM_ID"].isna()
    if mask_missing.any():
        raw.loc[mask_missing, "TEAM_ID"] = raw.loc[mask_missing, "TEAM_NAME"].apply(resolve_team_id)
    raw = raw.dropna(subset=["TEAM_ID", "DATE"]).copy()
    raw["TEAM_ID"] = raw["TEAM_ID"].astype(int)
    raw = raw.sort_values(["TEAM_ID", "DATE"])

    grouped = raw.groupby("TEAM_ID", sort=False)
    prev_rating = grouped["RATING"].shift(1)
    prev_prev_rating = grouped["RATING"].shift(2)

    raw["TR_RATING_PRE"] = prev_rating
    raw["TR_RATING_DELTA"] = prev_rating - prev_prev_rating
    raw["TR_RATING_ROLL5"] = prev_rating.groupby(raw["TEAM_ID"]).transform(lambda s: s.rolling(5, min_periods=2).mean())
    raw["TR_RATING_ROLL10"] = prev_rating.groupby(raw["TEAM_ID"]).transform(lambda s: s.rolling(10, min_periods=4).mean())

    raw["GAME_DATE"] = raw["DATE"].dt.normalize()

    features = raw.dropna(subset=["TR_RATING_PRE"]).loc[
        :,
        [
            "TEAM_ID",
            "GAME_DATE",
            "TR_RATING_PRE",
            "TR_RATING_DELTA",
            "TR_RATING_ROLL5",
            "TR_RATING_ROLL10",
        ],
    ]
    features["TR_RATING_DELTA"] = features["TR_RATING_DELTA"].fillna(0.0)
    return features


def _load_ratings_fallback(kind: str) -> pd.DataFrame:
    """
    Load alternate ratings when primary artifacts are unavailable.

    Currently supports Elo via backend/data/team_ratings.csv so the XGBoost
    pipeline can operate even if parquet dependencies are missing in prod.
    """
    if kind == "elo":
        csv_path = Path("backend/data/team_ratings.csv")
        if not csv_path.exists():
            raise FileNotFoundError(
                "ratings fallback failed: backend/data/team_ratings.csv not found"
            )
        fallback = pd.read_csv(csv_path)
        rename_map = {}
        if "DATE" in fallback.columns:
            rename_map["DATE"] = "GAME_DATE"
        if "TEAM_FULL_NAME" in fallback.columns:
            rename_map["TEAM_FULL_NAME"] = "TEAM"
        if rename_map:
            fallback = fallback.rename(columns=rename_map)
        keep = [c for c in ["GAME_DATE", "TEAM", "RATING"] if c in fallback.columns]
        if len(keep) < 3:
            missing = {"GAME_DATE", "TEAM", "RATING"} - set(fallback.columns)
            raise KeyError(
                f"team_ratings.csv missing columns required for fallback: {sorted(missing)}"
            )
        return fallback.loc[:, keep]
    raise FileNotFoundError(f"No fallback configured for ratings kind '{kind}'")


def load_ratings(kind: str = "elo") -> pd.DataFrame:
    """Load ratings table for the given kind (elo|glicko|trueskill).

    Expected columns (flexible):
      - GAME_DATE: date of rating snapshot
      - TEAM: full team name (e.g., "Los Angeles Lakers")
      - RATING: numeric rating
    """
    stem = f"backend/data/ratings_{kind}"
    r: pd.DataFrame | None = None
    load_error: Exception | None = None

    if load_table:
        try:
            r = load_table(stem)
        except (FileNotFoundError, ImportError) as exc:
            load_error = exc

    if r is None:
        p = Path(stem)
        try:
            if p.with_suffix(".parquet").exists():
                r = pd.read_parquet(p.with_suffix(".parquet"))
            elif p.with_suffix(".csv").exists():
                r = pd.read_csv(p.with_suffix(".csv"))
            else:
                raise FileNotFoundError(f"No artifact found for {stem}")
        except Exception as exc:
            load_error = exc
            r = None

    if r is None:
        try:
            r = _load_ratings_fallback(kind)
        except Exception as fallback_exc:
            if load_error is not None:
                raise type(load_error)(
                    f"Failed to load ratings_{kind}: {load_error}; fallback error: {fallback_exc}"
                ) from fallback_exc
            raise
    # Normalize columns
    cols = {c.lower(): c for c in r.columns}
    # # QUESTION: Confirm exact column names in ratings files
    # Assume columns include TEAM and RATING (case-insensitive)
    if "game_date" in cols:
        r.rename(columns={cols["game_date"]: "GAME_DATE"}, inplace=True)
    if "team" in cols and cols["team"] != "TEAM":
        r.rename(columns={cols["team"]: "TEAM"}, inplace=True)
    if "rating" in cols and cols["rating"] != "RATING":
        r.rename(columns={cols["rating"]: "RATING"}, inplace=True)

    if not pd.api.types.is_datetime64_any_dtype(r["GAME_DATE"]):
        r["GAME_DATE"] = pd.to_datetime(r["GAME_DATE"], errors="coerce")

    # Keep only necessary columns
    keep = [c for c in ["GAME_DATE", "TEAM", "RATING"] if c in r.columns]
    return r.loc[:, keep].dropna(subset=["GAME_DATE", "TEAM"]).copy()


def select_metric_cols(df: pd.DataFrame) -> List[str]:
    cols: List[str] = []
    for c in df.columns:
        if any(c.startswith(p) for p in PREFIXES):
            if c in EXCLUDE or c.endswith("_season"):
                continue
            if pd.api.types.is_numeric_dtype(df[c]):
                cols.append(c)
    return sorted(cols)


def compute_rest_days(df: pd.DataFrame) -> pd.Series:
    df = df.sort_values(["TEAM_ID", "GAME_DATE"])  # stable sort
    rest = df.groupby("TEAM_ID")["GAME_DATE"].diff().dt.days
    return rest.fillna(7)


def build_team_rolling(df: pd.DataFrame, metric_cols: List[str], windows: List[int] = ROLL_WINDOWS) -> pd.DataFrame:
    df = df.sort_values(["TEAM_ID", "GAME_DATE"]).copy()
    df["rest_days"] = compute_rest_days(df)
    g = df.groupby("TEAM_ID", group_keys=False)
    # Build columns in batches per window to avoid fragmentation warnings
    for w in windows:
        minp = max(2, w // 2)
        new_cols = {}
        for col in metric_cols:
            # shift(1) to use only pre-game info
            new_cols[f"{col}_roll{w}_mean"] = g[col].transform(lambda s: s.shift(1).rolling(w, min_periods=minp).mean())
            new_cols[f"{col}_roll{w}_std"] = g[col].transform(lambda s: s.shift(1).rolling(w, min_periods=minp).std(ddof=0))
        # rolling for rest_days
        new_cols[f"rest_days_roll{w}_mean"] = g["rest_days"].transform(lambda s: s.shift(1).rolling(w, min_periods=minp).mean())
        df = pd.concat([df, pd.DataFrame(new_cols, index=df.index)], axis=1)
    return df


def to_game_level(df_roll: pd.DataFrame, feature_cols: List[str]) -> Tuple[pd.DataFrame, List[str]]:
    """Pivot team-level rolling features to game-level HOME−AWAY diffs.

    Returns (game_level_df, diff_feature_names).
    y_cls is computed from the home team TRAD_win; y_reg is margin HOME_PTS - AWAY_PTS.
    """
    # Ensure SIDE exists; derive if missing
    if "SIDE" not in df_roll.columns:
        df_roll = df_roll.copy()
        df_roll["SIDE"] = np.where(
            df_roll["TEAM_ID"] == df_roll["HOME_TEAM_ID"],
            "HOME",
            np.where(df_roll["TEAM_ID"] == df_roll["AWAY_TEAM_ID"], "AWAY", None),
        )

    keys = [
        "GAME_ID",
        "GAME_DATE",
        "SEASON_TYPE",
        "YEAR",
        "HOME_TEAM_ID",
        "AWAY_TEAM_ID",
        "HOME_TEAM_ABBREVIATION",
        "AWAY_TEAM_ABBREVIATION",
        "SIDE",
    ]
    label_keys = ["TRAD_PTS", "TRAD_win"]
    base = df_roll.loc[:, list(dict.fromkeys(keys + label_keys + feature_cols))]
    home = base[base["SIDE"] == "HOME"].copy()
    away = base[base["SIDE"] == "AWAY"].copy()

    # prefix for future difference computation
    home_pref = home.add_prefix("HOME_")
    away_pref = away.add_prefix("AWAY_")
    ren = {f"HOME_{k}": k for k in [
        "GAME_ID",
        "GAME_DATE",
        "SEASON_TYPE",
        "YEAR",
        "HOME_TEAM_ID",
        "AWAY_TEAM_ID",
        "HOME_TEAM_ABBREVIATION",
        "AWAY_TEAM_ABBREVIATION",
    ]}
    home_pref.rename(columns=ren, inplace=True)

    merge_keys = [
        "GAME_ID",
        "GAME_DATE",
        "SEASON_TYPE",
        "YEAR",
        "HOME_TEAM_ID",
        "AWAY_TEAM_ID",
        "HOME_TEAM_ABBREVIATION",
        "AWAY_TEAM_ABBREVIATION",
    ]
    game = home_pref.merge(
        away_pref,
        left_on=merge_keys,
        right_on=[f"AWAY_{k}" for k in merge_keys],
        how="inner",
        validate="one_to_one",
    )

    # derive labels and pts
    # After merge, home-side columns keep HOME_ prefix; away-side keep AWAY_ prefix
    # Use those explicitly to derive points and classification label
    if "HOME_TRAD_PTS" in game.columns and "AWAY_TRAD_PTS" in game.columns:
        game["HOME_PTS"] = game["HOME_TRAD_PTS"]
        game["AWAY_PTS"] = game["AWAY_TRAD_PTS"]
    else:
        # Fallback if naming differs
        game["HOME_PTS"] = np.nan
        game["AWAY_PTS"] = np.nan

    # Home win indicator from the home row's TRAD_win flag if present
    if "HOME_TRAD_win" in game.columns:
        game["y_cls"] = game["HOME_TRAD_win"].fillna(0).astype(int)
    else:
        # Fallback: compare points if available
        if "HOME_PTS" in game.columns and "AWAY_PTS" in game.columns:
            game["y_cls"] = (game["HOME_PTS"] > game["AWAY_PTS"]).astype(int)
        else:
            game["y_cls"] = 0
    game["y_reg"] = (game["HOME_PTS"] - game["AWAY_PTS"]).astype(float)

    # diffs for rolled features (batch add to avoid fragmentation warnings)
    diff_cols: List[str] = []
    add_cols: dict[str, np.ndarray] = {}
    for c in feature_cols + [f"rest_days_roll{w}_mean" for w in ROLL_WINDOWS]:
        hc, ac = f"HOME_{c}", f"AWAY_{c}"
        if hc in game.columns and ac in game.columns:
            d = f"DIFF_{c}"
            add_cols[d] = (game[hc].to_numpy() - game[ac].to_numpy())
            diff_cols.append(d)

    # add is_playoffs together with diff columns
    add_df = pd.DataFrame(add_cols, index=game.index)
    add_df["is_playoffs"] = game["SEASON_TYPE"].str.contains("Playoffs", case=False, na=False).astype(int)
    game = pd.concat([game, add_df], axis=1)
    return game, diff_cols


def _abbr_to_full_name_series(abbr: pd.Series) -> pd.Series:
    return abbr.fillna("").astype(str).map(lambda s: _abbr_to_name(_abbr_norm(s)))


def attach_ratings(game_df: pd.DataFrame, ratings_kind: str = "elo") -> pd.DataFrame:
    """Attach pre-game ratings for home and away teams and compute rating_diff.

    Joins on (GAME_DATE, TEAM_NAME) where TEAM_NAME is derived from abbreviations.
    """
    ratings = load_ratings(ratings_kind)
    # Normalize names and date to date (discard time component)
    ratings = ratings.copy()
    ratings["GAME_DATE"] = pd.to_datetime(ratings["GAME_DATE"], errors="coerce").dt.normalize()
    ratings.rename(columns={"TEAM": "TEAM_NAME", "RATING": "RATING_VAL"}, inplace=True)

    out = game_df.copy()
    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"], errors="coerce").dt.normalize()
    out["HOME_TEAM_NAME"] = _abbr_to_full_name_series(out["HOME_TEAM_ABBREVIATION"])  # type: ignore
    out["AWAY_TEAM_NAME"] = _abbr_to_full_name_series(out["AWAY_TEAM_ABBREVIATION"])  # type: ignore

    home = ratings.rename(columns={"TEAM_NAME": "HOME_TEAM_NAME", "RATING_VAL": "HOME_RATING_PRE"})
    away = ratings.rename(columns={"TEAM_NAME": "AWAY_TEAM_NAME", "RATING_VAL": "AWAY_RATING_PRE"})

    out = out.merge(home, on=["GAME_DATE", "HOME_TEAM_NAME"], how="left")
    out = out.merge(away, on=["GAME_DATE", "AWAY_TEAM_NAME"], how="left")

    out["rating_diff"] = out["HOME_RATING_PRE"].astype(float) - out["AWAY_RATING_PRE"].astype(float)
    return out


def _ensure_team_abbreviations(game_df: pd.DataFrame) -> pd.DataFrame:
    """Attach team abbreviations when missing so Elo ratings can join."""
    out = game_df.copy()
    refs = _load_team_reference()
    id_to_abbr: Dict[int, str] = {
        int(row["TEAM_ID"]): str(row["TEAM_ABBR"]).strip()
        for _, row in refs.iterrows()
        if pd.notna(row.get("TEAM_ID")) and pd.notna(row.get("TEAM_ABBR"))
    }
    if "HOME_TEAM_ABBREVIATION" not in out.columns:
        out["HOME_TEAM_ABBREVIATION"] = out.get("HOME_TEAM_ID", pd.Series(dtype=int)).map(id_to_abbr)
    if "AWAY_TEAM_ABBREVIATION" not in out.columns:
        out["AWAY_TEAM_ABBREVIATION"] = out.get("AWAY_TEAM_ID", pd.Series(dtype=int)).map(id_to_abbr)
    return out


def build_team_ratings_features(ratings_kind: str = "elo") -> Tuple[pd.DataFrame, List[str]]:
    """
    Build game-level feature table using team_ratings-derived metrics.
    """
    df = load_team_metrics()
    rating_features = _prepare_team_ratings_features()
    df = df.merge(rating_features, on=["TEAM_ID", "GAME_DATE"], how="left")

    refs = _load_team_reference()
    id_to_abbr: Dict[int, str] = {
        int(row["TEAM_ID"]): str(row["TEAM_ABBR"]).strip()
        for _, row in refs.iterrows()
        if pd.notna(row.get("TEAM_ID")) and pd.notna(row.get("TEAM_ABBR"))
    }
    df["TEAM_ABBREVIATION"] = df.get("TEAM_ID", pd.Series(dtype=int)).map(id_to_abbr)
    df["HOME_TEAM_ABBREVIATION"] = df.get("HOME_TEAM_ID", pd.Series(dtype=int)).map(id_to_abbr)
    df["AWAY_TEAM_ABBREVIATION"] = df.get("AWAY_TEAM_ID", pd.Series(dtype=int)).map(id_to_abbr)

    feature_cols = [
        "TR_RATING_PRE",
        "TR_RATING_DELTA",
        "TR_RATING_ROLL5",
        "TR_RATING_ROLL10",
    ]

    games, _ = to_game_level(df, feature_cols)
    games = _ensure_team_abbreviations(games)
    games = attach_ratings(games, ratings_kind=ratings_kind)

    if "HOME_RATING_PRE" in games.columns:
        games.rename(columns={"HOME_RATING_PRE": "HOME_ELO_PRE"}, inplace=True)
    if "AWAY_RATING_PRE" in games.columns:
        games.rename(columns={"AWAY_RATING_PRE": "AWAY_ELO_PRE"}, inplace=True)
    elo_valid = games.get("rating_diff").notna().any()
    if not elo_valid:
        games["rating_diff"] = games.get("DIFF_TR_RATING_PRE", 0.0)
    if "HOME_ELO_PRE" not in games.columns or games["HOME_ELO_PRE"].isna().all():
        games["HOME_ELO_PRE"] = games.get("HOME_TR_RATING_PRE", 0.0)
    if "AWAY_ELO_PRE" not in games.columns or games["AWAY_ELO_PRE"].isna().all():
        games["AWAY_ELO_PRE"] = games.get("AWAY_TR_RATING_PRE", 0.0)

    # Align rating_diff with the TR rating features so training and inference share the same signal.
    games["HOME_ELO_PRE"] = games["HOME_TR_RATING_PRE"]
    games["AWAY_ELO_PRE"] = games["AWAY_TR_RATING_PRE"]
    games["rating_diff"] = games["HOME_TR_RATING_PRE"] - games["AWAY_TR_RATING_PRE"]

    numeric_cols = ["HOME_ELO_PRE", "AWAY_ELO_PRE", "rating_diff", "is_playoffs", "YEAR"]
    for base in feature_cols:
        numeric_cols.extend([f"HOME_{base}", f"AWAY_{base}", f"DIFF_{base}"])

    for col in numeric_cols:
        if col not in games.columns:
            games[col] = np.nan

    core_required = ["HOME_TR_RATING_PRE", "AWAY_TR_RATING_PRE", "rating_diff"]
    games = games.dropna(subset=[c for c in core_required if c in games.columns]).copy()

    fill_targets = [col for col in numeric_cols if col in games.columns]
    medians = games[fill_targets].median(numeric_only=True)
    games[fill_targets] = games[fill_targets].fillna(medians)
    games[fill_targets] = games[fill_targets].fillna(0.0)

    diff_cols = sorted({c for c in fill_targets if c.startswith("DIFF_")})
    home_cols = sorted({c for c in fill_targets if c.startswith("HOME_TR_")})
    away_cols = sorted({c for c in fill_targets if c.startswith("AWAY_TR_")})

    X_cols = ["rating_diff", "HOME_ELO_PRE", "AWAY_ELO_PRE", "is_playoffs", "YEAR"]
    X_cols.extend(diff_cols)
    X_cols.extend(home_cols)
    X_cols.extend(away_cols)

    return games, X_cols


def build_features(ratings_kind: str = "elo", feature_source: str = "metrics") -> Tuple[pd.DataFrame, List[str]]:
    """Build game-level feature table and return (games_df, X_cols).

    - Loads team metrics, creates rolling pre-game features.
    - Pivots to game level and computes HOME−AWAY diffs.
    - Attaches pre-game rating diff from chosen ratings table.

    Returns:
        games_df: columns include X_cols, y_cls, y_reg, rating_diff, is_playoffs, YEAR
        X_cols: list of feature columns to train on
    """
    if feature_source == "ratings":
        return build_team_ratings_features(ratings_kind=ratings_kind)
    if feature_source != "metrics":
        raise ValueError(f"Unknown feature_source '{feature_source}'. Expected 'metrics' or 'ratings'.")
    df = load_team_metrics()
    metric_cols = select_metric_cols(df)
    df_roll = build_team_rolling(df, metric_cols)

    # Keep only rolled features and rest roll features
    rolled = [c for c in df_roll.columns if c.endswith("_mean") or c.endswith("_std")]
    games, _ = to_game_level(df_roll, rolled)
    games = attach_ratings(games, ratings_kind=ratings_kind)

    # Assemble final features
    diff_cols = [c for c in games.columns if c.startswith("DIFF_")]
    X_cols = ["rating_diff", "is_playoffs", "YEAR"] + diff_cols

    # Enforce rating presence: if a team had no rating (e.g., franchise didn't exist yet),
    # drop those games from training/evaluation to avoid imputing rating_diff.
    games = games[games["rating_diff"].notna()].copy()

    # Clean remaining NaNs (tolerate up to 30% missing across rolled features)
    frac_na = games[X_cols].isna().mean(axis=1)
    games = games[frac_na <= 0.3].copy()
    games[X_cols] = games[X_cols].fillna(games[X_cols].median(numeric_only=True))

    return games, X_cols
