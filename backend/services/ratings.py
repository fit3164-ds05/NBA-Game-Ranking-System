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
from typing import Optional, List

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
