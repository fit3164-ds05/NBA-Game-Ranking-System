import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))  # adds <repo>/backend to PYTHONPATH
"""
Integration tests for Flask routes using NBA team names.

We exercise the real Flask app and blueprint. We still use a tiny CSV
but now through the HTTP interface rather than calling helpers directly.
"""

from pathlib import Path
import pandas as pd
from main import app
import pytest
from services import ratings as ratings_mod
import importlib


@pytest.fixture(autouse=True)
def _clear_ratings_cache():
    """Ensure services.ratings.load_full cache does not leak across tests."""
    try:
        ratings_mod.load_full.cache_clear()
    except Exception:
        pass
    yield
    try:
        ratings_mod.load_full.cache_clear()
    except Exception:
        pass


def make_sample_csv(tmp_path: Path) -> Path:
    df = pd.DataFrame(
        {
            "GAME_DATE": pd.to_datetime(
                ["2021-10-19", "2021-10-19", "2022-12-01", "2022-12-01"]
            ),
            "TEAM": ["Boston Celtics", "Los Angeles Lakers", "Boston Celtics", "Los Angeles Lakers"],
            "RATING": [1500.0, 1525.0, 1530.0, 1540.0],
        }
    )
    path = tmp_path / "full_ratings.csv"
    df.to_csv(path, index=False)
    return path


def test_health_ok():
    client = app.test_client()
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_teams_lists_unique_sorted(tmp_path, monkeypatch):
    path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/teams")
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["teams"] == ["Boston Celtics", "Los Angeles Lakers"]


def test_seasons_for_team_validates_param(tmp_path, monkeypatch):
    path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    res = client.get("/api/seasons")
    assert res.status_code == 400
    assert "team query param required" in res.get_json()["error"]


def test_predict_happy_path(tmp_path, monkeypatch):
    path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    body = {
        "home_team": "Los Angeles Lakers",
        "home_season": 2021,
        "away_team": "Boston Celtics",
        "away_season": 2021,
    }
    res = client.post("/api/predict", json=body)
    assert res.status_code == 200
    data = res.get_json()
    assert "home_win_prob" in data
    assert 0.0 <= data["home_win_prob"] <= 1.0
    assert data["inputs"]["home_team"] == "Los Angeles Lakers"
    assert data["model_version"] == "glicko_csv_v1"


def test_predict_validates_same_team_same_season(tmp_path, monkeypatch):
    path = make_sample_csv(tmp_path)
    monkeypatch.setenv("RATINGS_CSV", str(path))
    importlib.reload(ratings_mod)
    ratings_mod.load_full.cache_clear()

    client = app.test_client()
    body = {
        "home_team": "Boston Celtics",
        "home_season": 2022,
        "away_team": "Boston Celtics",
        "away_season": 2022,
    }
    res = client.post("/api/predict", json=body)
    assert res.status_code == 400
    assert "If the same team is chosen the seasons must differ" in res.get_json()["error"]