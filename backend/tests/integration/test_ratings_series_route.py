import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))  # add <repo>/backend

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
                    "2023-01-05",
                ]
            ),
            "TEAM": [
                "Boston Celtics",
                "Los Angeles Lakers",
                "Boston Celtics",
                "Los Angeles Lakers",
                "Boston Celtics",
            ],
            "RATING": [1500.0, 1510.0, 1525.0, 1530.0, 1545.0],
        }
    )
    path = tmp_path / "full_ratings.csv"
    df.to_csv(path, index=False)
    return path


def test_series_happy_path(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get(
        "/api/ratings/series",
        query_string={
            "teams": "Boston Celtics,Los Angeles Lakers",
            "start": "2021-01-01",
            "end": "2023-12-31",
        },
    )
    assert res.status_code == 200
    payload = res.get_json()
    assert set(["data", "total", "offset", "limit"]) <= set(payload.keys())
    data = payload["data"]
    assert isinstance(data, list) and len(data) >= 5
    # Check record shape
    assert {"date", "team", "rating"} <= set(data[0].keys())
    # Teams filtered correctly
    assert set({r["team"] for r in data}) <= {"Boston Celtics", "Los Angeles Lakers"}


def test_series_pagination(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    # No pagination
    full = client.get("/api/ratings/series").get_json()
    total = int(full["total"])

    # With offset/limit
    res = client.get(
        "/api/ratings/series",
        query_string={"offset": 1, "limit": 2},
    )
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["offset"] == 1
    assert payload["limit"] == 2
    assert len(payload["data"]) == 2
    assert payload["total"] == total


def test_series_invalid_offset_limit(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/ratings/series", query_string={"offset": "abc"})
    assert res.status_code == 400
    assert "offset and limit must be integers" in res.get_json()["error"]


def test_series_missing_csv_returns_500(tmp_path, monkeypatch):
    missing = tmp_path / "nope.csv"
    monkeypatch.setenv("RATINGS_CSV", str(missing))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/ratings/series")
    assert res.status_code == 500
    assert "error" in res.get_json()


def test_api_root_health_payload(tmp_path, monkeypatch):
    path = make_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/")
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("status") == "ok"
    assert "csv_path" in data
    # Should include row count when CSV can be loaded
    assert isinstance(data.get("csv_rows"), int)

