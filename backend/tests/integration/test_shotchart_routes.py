import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import importlib

import pytest

from main import app
import app.routes as routes_mod


@pytest.fixture(autouse=True)
def _reload_routes(monkeypatch):
    # Ensure the module uses our monkeypatches each test
    importlib.reload(routes_mod)
    yield
    importlib.reload(routes_mod)


def test_players_search_success(monkeypatch):
    monkeypatch.setattr(
        routes_mod,
        "search_players",
        lambda q, season, limit=20: [
            {"playerId": 1, "name": "LeBron James", "active": True, "team": "LAL"}
        ],
    )

    client = app.test_client()
    res = client.get("/api/nba/players/search", query_string={"q": "le", "season": "2024-25"})
    assert res.status_code == 200
    assert res.get_json() == [
        {"playerId": 1, "name": "LeBron James", "active": True, "team": "LAL"}
    ]


def test_players_search_error(monkeypatch):
    def _raiser(*_args, **_kwargs):
        raise RuntimeError("nba api down")

    monkeypatch.setattr(routes_mod, "search_players", _raiser)

    client = app.test_client()
    res = client.get("/api/nba/players/search")
    assert res.status_code == 500
    payload = res.get_json()
    assert payload["error"] == "nba api down"


def test_player_seasons_only_with_games(monkeypatch):
    monkeypatch.setattr(routes_mod, "get_player_seasons", lambda player_id: ["2024-25", "2023-24"])

    calls = []

    def _has_games(player_id, season):
        calls.append((player_id, season))
        return season == "2024-25"

    monkeypatch.setattr(routes_mod, "has_games_in_season", _has_games)

    client = app.test_client()
    res = client.get("/api/nba/players/23/seasons", query_string={"only_with_games": "true"})
    assert res.status_code == 200
    assert res.get_json() == ["2024-25"]
    assert calls == [(23, "2024-25"), (23, "2023-24")]


def test_player_shots_valid_request(monkeypatch):
    monkeypatch.setattr(
        routes_mod,
        "get_player_shotchart",
        lambda player_id, season, team_id=0, measure="FGA": {
            "playerId": player_id,
            "season": season,
            "teamId": team_id,
            "measure": measure,
            "count": 0,
            "shots": [],
        },
    )

    client = app.test_client()
    res = client.get(
        "/api/nba/players/23/shots",
        query_string={"season": "2024-25", "team_id": 1610612747, "measure": "fgm"},
    )
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["measure"] == "FGM"
    assert payload["playerId"] == 23


def test_player_shots_missing_season(monkeypatch):
    client = app.test_client()
    res = client.get("/api/nba/players/23/shots")
    assert res.status_code == 400
    assert "Missing required" in res.get_json()["error"]


def test_player_shots_invalid_measure(monkeypatch):
    client = app.test_client()
    res = client.get(
        "/api/nba/players/23/shots",
        query_string={"season": "2024-25", "measure": "bads"},
    )
    assert res.status_code == 400
    assert "Invalid measure" in res.get_json()["error"]


def test_player_shots_service_key_error(monkeypatch):
    def _raiser(*_args, **_kwargs):
        raise KeyError("measure")

    monkeypatch.setattr(routes_mod, "get_player_shotchart", _raiser)

    client = app.test_client()
    res = client.get(
        "/api/nba/players/23/shots",
        query_string={"season": "2024-25", "measure": "FGA"},
    )
    assert res.status_code == 400
    assert "Bad request" in res.get_json()["error"]


def test_player_shots_service_failure(monkeypatch):
    def _raiser(*_args, **_kwargs):
        raise RuntimeError("stats api offline")

    monkeypatch.setattr(routes_mod, "get_player_shotchart", _raiser)

    client = app.test_client()
    res = client.get(
        "/api/nba/players/23/shots",
        query_string={"season": "2024-25", "measure": "FGA"},
    )
    assert res.status_code == 500
    payload = res.get_json()
    assert payload["error"] == "Failed to load shot chart"
    assert payload["detail"] == "stats api offline"
