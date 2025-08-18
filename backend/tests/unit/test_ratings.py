import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))  # adds <repo>/backend to PYTHONPATH
"""
Unit tests for services.ratings using NBA team names.

These tests generate tiny CSVs in a temp folder so they are fully self contained
and fast. We point RATINGS_CSV at the temp file so production code runs unchanged.
"""

from pathlib import Path
import pandas as pd
from services import ratings
import pytest
import importlib


@pytest.fixture(autouse=True)
def _clear_ratings_cache():
    """Ensure services.ratings.load_full cache does not leak across tests."""
    try:
        ratings.load_full.cache_clear()
    except Exception:
        pass
    yield
    try:
        ratings.load_full.cache_clear()
    except Exception:
        pass


def make_sample_csv(tmp_path: Path) -> Path:
    """Create a small but realistic ratings CSV."""
    df = pd.DataFrame(
        {
            "GAME_DATE": pd.to_datetime(["2021-10-19", "2022-04-10", "2022-12-01"]),
            "TEAM": ["Boston Celtics", "Los Angeles Lakers", "Boston Celtics"],
            "RATING": [1500.0, 1512.0, 1530.0],
        }
    )
    path = tmp_path / "full_ratings.csv"
    df.to_csv(path, index=False)
    return path


def test_load_full_adds_year_column(tmp_path, monkeypatch):
    """
    load_full should return a DataFrame that contains a YEAR column
    derived from GAME_DATE. We are not writing back to CSV here.
    We are asserting the in memory DataFrame has YEAR as expected.
    """
    csv_path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    df = ratings.load_full()
    assert {"GAME_DATE", "TEAM", "RATING", "YEAR"} <= set(df.columns)
    # YEAR values should be derived from the parsed dates above
    assert set(df["YEAR"].unique().tolist()) == {2021, 2022}
    # Basic type sanity check
    assert pd.api.types.is_integer_dtype(df["YEAR"])


def test_latest_rating_in_season_returns_last_value(tmp_path, monkeypatch):
    """
    latest_rating_in_season should select the most recent rating
    within the requested season for the given team.
    """
    csv_path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    val = ratings.latest_rating_in_season("Boston Celtics", 2022)
    assert val == 1530.0

    none_val = ratings.latest_rating_in_season("Chicago Bulls", 2022)
    assert none_val is None


def test_predict_prob_monotonic_and_margin_sign(tmp_path, monkeypatch):
    """
    When the home team has a higher rating than the away team,
    home_win_prob should exceed 0.5 and predicted_margin should be positive.
    """
    df = pd.DataFrame(
        {
            "GAME_DATE": pd.to_datetime(["2021-11-01", "2021-11-01"]),
            "TEAM": ["Golden State Warriors", "Phoenix Suns"],
            "RATING": [1600.0, 1500.0],
        }
    )
    csv_path = tmp_path / "full_ratings.csv"
    df.to_csv(csv_path, index=False)

    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    out = ratings.predict_prob("Golden State Warriors", 2021, "Phoenix Suns", 2021)
    assert "home_win_prob" in out
    assert 0.5 < out["home_win_prob"] < 1.0
    assert out["predicted_margin"] > 0

    out_rev = ratings.predict_prob("Phoenix Suns", 2021, "Golden State Warriors", 2021)
    assert out_rev["home_win_prob"] < 0.5
    assert out_rev["predicted_margin"] < 0