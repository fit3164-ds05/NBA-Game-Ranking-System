"""
services/drivers.py

Helpers for loading the drivers-of-ratings correlation table that powers
the frontend heatmap. Data lives alongside other static CSV assets in
backend/data/.
"""

from functools import lru_cache
from pathlib import Path
from typing import List, Dict

import pandas as pd


@lru_cache(maxsize=1)
def _dataset_path(filename: str) -> Path:
    return Path(__file__).resolve().parents[1] / "data" / filename


def load_drivers() -> List[Dict[str, object]]:
    """
    Return the drivers-of-ratings dataset as a list of dicts.

    The CSV stores column headers Metric, Correlation, Name, Description.
    Normalise them to lowerCamelCase keys for the API payload.
    """
    frame = pd.read_csv(_dataset_path("drivers_of_ratings_top.csv"))
    # Ensure predictable ordering: descending correlation just in case the CSV changes
    frame = frame.sort_values("Correlation", ascending=False)
    payload = []
    for row in frame.itertuples(index=False):
        payload.append(
            {
                "metric": getattr(row, "Metric"),
                "correlation": float(getattr(row, "Correlation")),
                "name": getattr(row, "Name"),
                "description": getattr(row, "Description"),
            }
        )
    return payload


@lru_cache(maxsize=1)
def load_drivers_seasonal() -> List[Dict[str, object]]:
    """
    Return the seasonal correlation table as dictionaries.
    Each row contains the season string, metric identifiers, and correlation value.
    """
    frame = pd.read_csv(_dataset_path("drivers_of_ratings_seasonal.csv"))
    frame = frame.sort_values(["Name", "SEASON"])
    payload = []
    for row in frame.itertuples(index=False):
        payload.append(
            {
                "season": getattr(row, "SEASON"),
                "metric": getattr(row, "Metric"),
                "correlation": float(getattr(row, "Correlation")),
                "name": getattr(row, "Name"),
                "description": getattr(row, "Description"),
            }
        )
    return payload


def clear_cache():
    """Clear the cached drivers table (mostly useful in tests)."""
    load_drivers.cache_clear()
    load_drivers_seasonal.cache_clear()
