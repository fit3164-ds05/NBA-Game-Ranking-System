import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import importlib
from types import SimpleNamespace

import pandas as pd
import pytest

from services import shotchart


@pytest.fixture(autouse=True)
def _clear_caches(monkeypatch):
    """Ensure shotchart caches do not leak across tests and skip real sleeps."""
    shotchart.players_index.cache_clear()
    shotchart.get_player_seasons.cache_clear()
    shotchart.get_player_shotchart.cache_clear()
    shotchart.has_games_in_season.cache_clear()
    monkeypatch.setattr(shotchart.time, "sleep", lambda *_args, **_kwargs: None)
    yield
    shotchart.players_index.cache_clear()
    shotchart.get_player_seasons.cache_clear()
    shotchart.get_player_shotchart.cache_clear()
    shotchart.has_games_in_season.cache_clear()


def _stub_common_all_players(monkeypatch, rows):
    class DummyCommonAllPlayers:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def get_data_frames(self):
            return [pd.DataFrame(rows)]

    monkeypatch.setattr(
        shotchart.commonallplayers,
        "CommonAllPlayers",
        DummyCommonAllPlayers,
    )


def _stub_player_career_stats(monkeypatch, seasons):
    class DummyCareerStats:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def get_data_frames(self):
            return [pd.DataFrame({"SEASON_ID": seasons})]

    monkeypatch.setattr(
        shotchart.playercareerstats,
        "PlayerCareerStats",
        DummyCareerStats,
    )


def _stub_shotchart_detail(monkeypatch, frame):
    captured = {}

    class DummyShotChartDetail:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def get_data_frames(self):
            return [frame]

    monkeypatch.setattr(
        shotchart.shotchartdetail,
        "ShotChartDetail",
        DummyShotChartDetail,
    )
    return captured


def test_resolve_context_measure_valid():
    result = shotchart.resolve_context_measure("FG3A")
    assert result == shotchart.ContextMeasureSimple.fg3a


def test_resolve_context_measure_invalid():
    with pytest.raises(ValueError):
        shotchart.resolve_context_measure("INVALID")


def test_search_players_filters_and_limits(monkeypatch):
    rows = [
        {
            "PERSON_ID": 1,
            "DISPLAY_FIRST_LAST": "LeBron James",
            "ROSTERSTATUS": "Active",
            "TEAM_NAME": "Los Angeles Lakers",
        },
        {
            "PERSON_ID": 2,
            "DISPLAY_FIRST_LAST": "Magic Johnson",
            "ROSTERSTATUS": "Inactive",
            "TEAM_NAME": "Lakers",
        },
    ]
    _stub_common_all_players(monkeypatch, rows)

    # Empty query -> actives only
    out_default = shotchart.search_players("", season="2024-25", limit=10)
    assert out_default == [
        {
            "playerId": 1,
            "name": "LeBron James",
            "active": True,
            "team": "Los Angeles Lakers",
        }
    ]

    out_query = shotchart.search_players("john", season="2024-25", limit=5)
    assert out_query == [
        {
            "playerId": 2,
            "name": "Magic Johnson",
            "active": False,
            "team": "Lakers",
        }
    ]


def test_get_player_seasons_returns_sorted(monkeypatch):
    _stub_player_career_stats(monkeypatch, ["2019-20", "2020-21", None])

    seasons = shotchart.get_player_seasons(23)
    assert seasons == ["2020-21", "2019-20"]


def test_get_player_shotchart_trims_payload(monkeypatch):
    frame = pd.DataFrame(
        {
            "LOC_X": [5],
            "LOC_Y": [10],
            "SHOT_MADE_FLAG": [1],
            "SHOT_ZONE_BASIC": ["Above the Break 3"],
            "SHOT_ZONE_AREA": ["Left Side(L)"],
            "SHOT_ZONE_RANGE": ["24+ ft."],
            "ACTION_TYPE": ["Jump Shot"],
            "SHOT_TYPE": ["3PT Field Goal"],
            "SHOT_DISTANCE": [25],
            "GAME_ID": ["002"],
            "GAME_EVENT_ID": [12],
            "GAME_DATE": ["20240101"],
            "TEAM_ID": [1610612747],
            "TEAM_NAME": ["Los Angeles Lakers"],
            "OPPONENT_TEAM_NAME": ["Boston Celtics"],
            "PERIOD": [2],
            "MINUTES_REMAINING": [5],
            "SECONDS_REMAINING": [30],
        }
    )
    captured = _stub_shotchart_detail(monkeypatch, frame)

    payload = shotchart.get_player_shotchart(23, "2024-25", team_id=1610612747, measure="FGM")
    assert payload["playerId"] == 23
    assert payload["season"] == "2024-25"
    assert payload["measure"] == "FGM"
    assert payload["count"] == 1
    assert payload["shots"] == [
        {
            "x": 5,
            "y": 10,
            "made": 1,
            "zone_basic": "Above the Break 3",
            "zone_area": "Left Side(L)",
            "zone_range": "24+ ft.",
            "action_type": "Jump Shot",
            "shot_type": "3PT Field Goal",
            "shot_distance": 25,
            "game_id": "002",
            "game_event_id": 12,
            "game_date": "20240101",
            "team_id": 1610612747,
            "team_name": "Los Angeles Lakers",
            "opponent": "Boston Celtics",
            "period": 2,
            "minutes_remaining": 5,
            "seconds_remaining": 30,
        }
    ]
    assert captured["context_measure_simple"] == shotchart.ContextMeasureSimple.fgm
    assert captured["player_id"] == 23
    assert captured["team_id"] == 1610612747
    assert captured["season_nullable"] == "2024-25"


def test_get_player_shotchart_invalid_measure(monkeypatch):
    frame = pd.DataFrame({})
    _stub_shotchart_detail(monkeypatch, frame)

    with pytest.raises(ValueError):
        shotchart.get_player_shotchart(1, "2024-25", measure="XYZ")
