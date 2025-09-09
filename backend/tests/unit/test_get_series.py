import sys
from pathlib import Path

# Ensure <repo>/backend is on PYTHONPATH when running from backend/
sys.path.append(str(Path(__file__).resolve().parents[2]))

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
                ]
            ),
            "TEAM": [
                "Boston Celtics",
                "Los Angeles Lakers",
                "Boston Celtics",
                "Los Angeles Lakers",
            ],
            "RATING": [1500.0, 1510.0, 1525.0, 1530.0],
        }
    )
    path = tmp_path / "full_ratings.csv"
    df.to_csv(path, index=False)
    return path


def test_get_series_shape_and_sorting(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    out = ratings.get_series()
    # Columns renamed and ordered
    assert list(out.columns) == ["date", "team", "rating"]
    # Sorted by GAME_DATE ascending, coerced to YYYY-MM-DD
    assert out.iloc[0]["date"] == "2021-01-10"
    assert out.iloc[-1]["date"] == "2022-04-01"
    # Row count matches input
    assert len(out) == 4


def test_get_series_team_filter(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    out = ratings.get_series(teams=["Boston Celtics"])  # filter one team
    assert set(out["team"].unique().tolist()) == {"Boston Celtics"}
    assert len(out) == 2


def test_get_series_date_filters(tmp_path, monkeypatch):
    csv_path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(csv_path))
    importlib.reload(ratings)
    ratings.load_full.cache_clear()

    # Only 2022 rows
    out = ratings.get_series(start="2022-01-01", end="2022-12-31")
    assert set(out["date"].unique().tolist()) == {"2022-03-20", "2022-04-01"}
    assert len(out) == 2

