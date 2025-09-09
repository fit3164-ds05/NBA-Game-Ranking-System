import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import importlib
import pandas as pd
import pytest

from main import app
from services import ratings as ratings_mod


@pytest.fixture(autouse=True)
def _clear_cache():
    try:
        ratings_mod.load_full.cache_clear()
    except Exception:
        pass
    yield
    try:
        ratings_mod.load_full.cache_clear()
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


def test_seasons_unknown_team_returns_empty_list(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/seasons", query_string={"team": "Chicago Bulls"})
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["team"] == "Chicago Bulls"
    assert payload["seasons"] == []


def test_predict_invalid_season_types_400(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    body = {
        "home_team": "Boston Celtics",
        "home_season": "not-an-int",
        "away_team": "Los Angeles Lakers",
        "away_season": 2022,
    }
    res = client.post("/api/predict", json=body)
    assert res.status_code == 400
    assert "must be integers" in res.get_json()["error"]


def test_predict_unknown_team_or_year_returns_404(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    body = {
        "home_team": "Boston Celtics",
        "home_season": 1999,  # not present
        "away_team": "Los Angeles Lakers",
        "away_season": 2022,
    }
    res = client.post("/api/predict", json=body)
    assert res.status_code == 404
    assert "No rating found" in res.get_json()["error"]


def test_series_limit_zero_and_offset_beyond_total(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    base = client.get("/api/ratings/series").get_json()
    total = int(base["total"])

    # limit=0 -> empty slice
    res = client.get("/api/ratings/series", query_string={"limit": 0})
    assert res.status_code == 200
    assert res.get_json()["data"] == []

    # offset > total -> empty slice
    res2 = client.get("/api/ratings/series", query_string={"offset": total + 10})
    assert res2.status_code == 200
    assert res2.get_json()["data"] == []

    # negative offset -> normalised to 0 (same as full when limit unset)
    res3 = client.get("/api/ratings/series", query_string={"offset": -5})
    assert res3.status_code == 200
    assert len(res3.get_json()["data"]) == len(base["data"])  # effectively from start

