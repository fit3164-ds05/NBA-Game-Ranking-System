import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))  # add <repo>/backend

import importlib
import pandas as pd
import pytest

from services import ratings


@pytest.fixture(autouse=True)
def _clear_cache():
    try:
        ratings.load_full.cache_clear()
    except Exception:
        pass
    yield
    try:
        ratings.load_full.cache_clear()
    except Exception:
        pass


def make_csv(tmp_path: Path) -> Path:
    df = pd.DataFrame(
        {
            "GAME_DATE": pd.to_datetime(
                [
                    "2021-01-10",
                    "2021-02-15",
                    "2022-03-20",
                    "2022-04-01",
                    "2022-05-01",
                ]
            ),
            "TEAM": [
                "Boston Celtics",
                "Los Angeles Lakers",
                "Boston Celtics",
                "Los Angeles Lakers",
                "Boston Celtics",
            ],
            "RATING": [1500.0, 1510.0, 1525.0, 1530.0, 1530.0],
        }
    )
    path = tmp_path / "full_ratings.csv"
    df.to_csv(path, index=False)
    return path


def test_teams_unique_sorted(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    names = ratings.teams()
    assert names == ["Boston Celtics", "Los Angeles Lakers"]


def test_seasons_for_team_descending(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    seasons = ratings.seasons_for_team("Boston Celtics")
    assert seasons == [2022, 2021]
    assert all(isinstance(s, int) for s in seasons)


def test_predict_prob_equal_ratings_gives_half(tmp_path, monkeypatch):
    df = pd.DataFrame(
        {
            "GAME_DATE": pd.to_datetime(["2021-01-01", "2021-01-01"]),
            "TEAM": ["A", "B"],
            "RATING": [1500.0, 1500.0],
        }
    )
    csv = tmp_path / "full_ratings.csv"
    df.to_csv(csv, index=False)
    monkeypatch.setenv("RATINGS_CSV", str(csv))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    out = ratings.predict_prob("A", 2021, "B", 2021)
    assert pytest.approx(out["home_win_prob"], rel=0, abs=1e-9) == 0.5
    assert pytest.approx(out["predicted_margin"], rel=0, abs=1e-9) == 0.0


def test_predict_prob_missing_team_returns_error(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    out = ratings.predict_prob("Unknown Team", 2021, "Boston Celtics", 2021)
    assert "error" in out and "Unknown Team" in out["error"]


def test_get_series_unknown_team_and_inverted_dates(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    # Unknown team -> empty
    out = ratings.get_series(teams=["Nope Team"])
    assert out.empty

    # start after end -> empty
    out2 = ratings.get_series(start="2023-01-01", end="2022-01-01")
    assert out2.empty

