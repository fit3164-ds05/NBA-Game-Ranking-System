# services/ratings.py
"""
Loads precomputed team ratings from CSV and provides helpers used by the API.

Multiple rating models can be supported by placing CSV files named
``ratings_<model>.csv`` inside ``backend/data``.  The default model is
``elo`` which maps to ``ratings_elo.csv``.  A helper is exposed to list
available models and each data-loading function accepts a ``model``
argument so callers can request ratings for a specific engine.

Set ``RATINGS_CSV`` to override the path for the default model at runtime.
"""

import os
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional, List

import pandas as pd

# Build a robust path to the ratings CSV for a given model
def _default_ratings_path(model: Optional[str] = None) -> Path:
    """Return the default CSV path for ``model`` inside ``backend/data``."""
    root = Path(__file__).resolve().parents[1]
    if model:
        return root / "data" / f"ratings_{model}.csv"
    return root / "data" / "full_ratings.csv"


def get_ratings_csv_path(model: Optional[str] = None) -> Path:
    """Resolve the CSV path, honouring RATINGS_CSV for the default model."""
    env = os.getenv("RATINGS_CSV")
    if env and model is None:
        return Path(env).expanduser().resolve()
    return _default_ratings_path(model)

@lru_cache(maxsize=None)
def load_model(model: Optional[str] = None) -> pd.DataFrame:
    """Load a ratings CSV for ``model`` and cache the DataFrame."""
    csv_path = get_ratings_csv_path(model)
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Ratings CSV not found at {csv_path}. "
            "Place the file at backend/data/ratings_<model>.csv or set RATINGS_CSV."
        )

    df = pd.read_csv(csv_path, parse_dates=["GAME_DATE"])
    if "YEAR" not in df.columns and "GAME_DATE" in df.columns:
        df["YEAR"] = df["GAME_DATE"].dt.year
    return df


# Backwards compatibility for older callers/tests expecting load_full()
def load_full() -> pd.DataFrame:  # pragma: no cover - simple wrapper
    return load_model()

# expose cache_clear for compatibility
load_full.cache_clear = load_model.cache_clear

def resolved_csv_path(model: Optional[str] = None) -> str:
    """Return the absolute CSV path the service will use for diagnostics."""
    return str(get_ratings_csv_path(model))

def clear_cache():
    """Clear the cached ratings DataFrames."""
    load_model.cache_clear()


def available_models() -> List[str]:
    """Return a list of rating model names based on available CSV files."""
    root = Path(__file__).resolve().parents[1] / "data"
    models = []
    for p in root.glob("ratings_*.csv"):
        name = p.stem.split("ratings_")[-1]
        models.append(name)
    return sorted(models)

def get_series(
    teams: Optional[List[str]] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    model: Optional[str] = None,
) -> pd.DataFrame:
    """Return a DataFrame with rating time series filtered by teams/date/model."""
    df = load_model(model).copy()
    df = df.sort_values("GAME_DATE")
    df["date"] = df["GAME_DATE"].dt.strftime("%Y-%m-%d")

    if teams:
        df = df[df["TEAM"].isin(teams)]

    if start:
        df = df[df["date"] >= start]

    if end:
        df = df[df["date"] <= end]

    out = df.loc[:, ["date", "TEAM", "RATING"]].rename(columns={"TEAM": "team", "RATING": "rating"})
    return out

def teams() -> List[str]:
    """Return all unique team names sorted alphabetically."""
    df = load_model()
    vals = df["TEAM"].dropna().unique().tolist()
    return sorted(vals)

def seasons_for_team(team: str) -> List[int]:
    """Return all seasons available for a team sorted from newest to oldest."""
    df = load_model()
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
    df = load_model()
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