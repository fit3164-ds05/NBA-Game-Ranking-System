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
from typing import List, Tuple

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
    if load_table:
        df = load_table(stem)
    else:
        p = Path(stem)
        if p.with_suffix(".parquet").exists():
            df = pd.read_parquet(p.with_suffix(".parquet"))
        else:
            df = pd.read_csv(p.with_suffix(".csv"))
    if not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if "TRAD_win" not in df.columns and "WINLOSS" in df.columns:
        df["TRAD_win"] = df["WINLOSS"].astype(str).str.upper().str.startswith("W").astype(int)

    # Attach team abbreviations/names for join steps downstream. Older extracts may not
    # include them, so derive from the enlarged game metadata table when available.
    if "HOME_TEAM_ABBREVIATION" not in df.columns or "AWAY_TEAM_ABBREVIATION" not in df.columns:
        try:
            meta = load_table("backend/data/enlarged_dataset") if load_table else None
        except FileNotFoundError:
            meta = None

        if meta is None:
            meta_path = Path("backend/data/enlarged_dataset")
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


def load_ratings(kind: str = "elo") -> pd.DataFrame:
    """Load ratings table for the given kind (elo|glicko|trueskill).

    Expected columns (flexible):
      - GAME_DATE: date of rating snapshot
      - TEAM: full team name (e.g., "Los Angeles Lakers")
      - RATING: numeric rating
    """
    stem = f"backend/data/ratings_{kind}"
    if load_table:
        r = load_table(stem)
    else:
        p = Path(stem)
        if p.with_suffix(".parquet").exists():
            r = pd.read_parquet(p.with_suffix(".parquet"))
        else:
            r = pd.read_csv(p.with_suffix(".csv"))
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


def build_features(ratings_kind: str = "elo") -> Tuple[pd.DataFrame, List[str]]:
    """Build game-level feature table and return (games_df, X_cols).

    - Loads team metrics, creates rolling pre-game features.
    - Pivots to game level and computes HOME−AWAY diffs.
    - Attaches pre-game rating diff from chosen ratings table.

    Returns:
        games_df: columns include X_cols, y_cls, y_reg, rating_diff, is_playoffs, YEAR
        X_cols: list of feature columns to train on
    """
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
