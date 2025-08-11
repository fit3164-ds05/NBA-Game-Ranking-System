# services/ratings.py
"""
This module provides functions to load and process NBA team ratings data,
which are used to predict game outcomes based on historical team performance.
It reads rating data from a CSV file, extracts team and season information,
and calculates winning probabilities using an Elo rating system approach.
This module integrates with the backend services of the NBA Game Ranking System,
allowing other parts of the application to access team ratings and make predictions.
"""

from functools import lru_cache
import os
from pathlib import Path
import pandas as pd
import math

# Resolve CSV path relative to backend folder, with optional environment override
BACKEND_DIR = Path(__file__).resolve().parents[1]
# CSV_PATH = Path(os.getenv("RATINGS_CSV", str(BACKEND_DIR / "Datasets_Analysis" / "full_ratings.csv")))
CSV_PATH = Path(os.getenv("RATINGS_CSV", str(BACKEND_DIR.parent / "Datasets_Analysis" / "full_ratings.csv")))

@lru_cache(maxsize=1)
def load_full() -> pd.DataFrame:
    """
    Load the full ratings dataset from a CSV file.
    Uses caching to avoid reloading the data multiple times.
    Parses the game date and adds a year column for easy filtering.
    """
    # Ensure the CSV file exists
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Ratings CSV not found at {CSV_PATH}. "
                                f"Set RATINGS_CSV environment variable or move the file to this location.")
    # Read the CSV file with game dates parsed as datetime objects
    df = pd.read_csv(CSV_PATH, parse_dates=["GAME_DATE"])
    # Add a YEAR column extracted from the GAME_DATE for filtering by season
    df["YEAR"] = df["GAME_DATE"].dt.year
    return df

def teams() -> list[str]:
    """
    Return a sorted list of all unique team names present in the dataset.
    Useful for populating dropdowns or validating team inputs.
    """
    df = load_full()
    # Extract unique team names, drop any missing values, and sort alphabetically
    return sorted(df["TEAM"].dropna().unique().tolist())

def seasons_for_team(team: str) -> list[int]:
    """
    Get a list of seasons (years) in which the specified team has ratings.
    The list is sorted from most recent to oldest season.
    """
    df = load_full()
    # Filter the dataframe for the given team and get unique years they played
    yrs = df.loc[df["TEAM"] == team, "YEAR"].dropna().unique().tolist()
    # Sort years descending so the most recent seasons come first
    return sorted(int(y) for y in yrs)[::-1]

def latest_rating_in_season(team: str, year: int) -> float | None:
    """
    Retrieve the latest rating for a given team in a specified season.
    Returns None if no rating data is available for that team and year.
    """
    df = load_full()
    # Filter data for the team and season
    sub = df[(df["TEAM"] == team) & (df["YEAR"] == year)]
    if sub.empty:
        # No data found for the team in that season
        return None
    # Sort by game date to get the most recent rating
    sub = sub.sort_values("GAME_DATE")
    # Return the rating from the last game of the season
    return float(sub.iloc[-1]["RATING"])

def predict_prob(home_team: str, home_year: int, away_team: str, away_year: int) -> dict:
    """
    Predict the probability that the home team will win against the away team,
    based on their latest ratings in their respective seasons.
    Returns a dictionary containing ratings, rating difference, win probability,
    and predicted margin of victory.
    """
    # Get the latest ratings for both teams in their respective seasons
    r_home = latest_rating_in_season(home_team, home_year)
    r_away = latest_rating_in_season(away_team, away_year)
    if r_home is None or r_away is None:
        # If either rating is missing, return an error message
        return {"error": "Missing rating for the provided team or season"}
    # Calculate the rating difference (home - away)
    diff = r_home - r_away
    # Calculate the probability of home team winning using Elo formula
    p_home = 1.0 / (1.0 + math.pow(10.0, -diff / 400.0))
    # Estimate margin of victory as a simple linear function of rating difference
    margin = diff / 25.0
    return {
        "home_rating": r_home,
        "away_rating": r_away,
        "rating_diff": diff,
        "home_win_prob": p_home,
        "predicted_margin": margin,
    }