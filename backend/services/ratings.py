# services/ratings.py
"""
This module provides functions to load and process NBA team ratings data,
which are used to predict game outcomes based on historical team performance.
It reads rating data from a CSV file, extracts team and season information,
and calculates winning probabilities using an Elo rating system approach.
This module integrates with the backend services of the NBA Game Ranking System,
allowing other parts of the application to access team ratings and make predictions.
"""

"""
ratings.py
Loads precomputed team ratings from CSV and provides helpers used by the API.
Default CSV location is backend/data/full_ratings.csv.
Set RATINGS_CSV to override the path at runtime.
"""

import os
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional, List

import pandas as pd

# Resolve backend folder then point to backend/data/full_ratings.csv by default
BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CSV = BACKEND_DIR / "data" / "full_ratings.csv"
CSV_PATH = Path(os.getenv("RATINGS_CSV", str(DEFAULT_CSV)))


@lru_cache(maxsize=1)
def load_full() -> pd.DataFrame:
    """
    Read the ratings CSV once and cache the DataFrame.
    Ensures a YEAR column exists derived from GAME_DATE.
    """
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"Ratings CSV not found at {CSV_PATH}. "
            f"Place the file at backend/data/full_ratings.csv "
            f"or set RATINGS_CSV to an absolute path."
        )

    df = pd.read_csv(CSV_PATH, parse_dates=["GAME_DATE"])
    if "YEAR" not in df.columns:
        df["YEAR"] = df["GAME_DATE"].dt.year
    return df


def teams() -> List[str]:
    """
    Return all unique team names sorted alphabetically.
    """
    df = load_full()
    vals = df["TEAM"].dropna().unique().tolist()
    return sorted(vals)


def seasons_for_team(team: str) -> List[int]:
    """
    Return all seasons available for a team sorted from newest to oldest.
    """
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