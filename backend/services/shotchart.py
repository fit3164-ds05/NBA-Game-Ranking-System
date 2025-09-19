import time
from functools import lru_cache
from typing import List, Dict, Any, Optional

from nba_api.stats.endpoints import playercareerstats, shotchartdetail, playergamelog, commonallplayers
from nba_api.stats.library.parameters import SeasonAll
from nba_api.stats.library.parameters import ContextMeasureSimple
import os
import re

# --- Best practices for nba_api ---
#   - NBA API rate-limits & can be finicky; short sleeps between calls help.
#   - Some environments need a custom User-Agent (nba_api sets one).
#   - If you get 403s, consider adding tiny backoffs.

SLEEP = 0.35  # be gentle to the API

allowed_measures = {
        "FGA", "FGM", "FG_PCT", "FG3A", "FG3M", "FG3_PCT",
        "PTS", "FTM", "FTA", "FT_PCT"
    }

def resolve_context_measure(measure: str) -> str:
    """
    Convert a query like 'FG3_PCT' to the nba_api parameter value by
    using ContextMeasureSimple's attributes (e.g., ContextMeasureSimple.fg3_pct).
    """
    if not measure:
        measure = "FGA"

    # Defensive: strip accidental suffixes like 'FGA:1' if any tooling adds them
    # (browser logs sometimes show ':1' as a line hint; harmless to guard)
    measure = re.split(r"[:;]", measure, 1)[0].strip().upper()

    # Apply any aliases

    if measure not in allowed_measures:
        raise ValueError(f"Invalid measure '{measure}'. Allowed: {sorted(allowed_measures)}")

    attr_name = measure.lower()  # 'FG3_PCT' -> 'fg3_pct'
    try:
        return getattr(ContextMeasureSimple, attr_name)  # returns e.g. 'FG3_PCT'
    except AttributeError as _:
        # In case nba_api changes attribute names
        raise ValueError(f"Unsupported measure for nba_api: '{measure}'")


def season_default():
    return os.getenv("NBA_SEASON", "2024-25")

def season_type_default():
    return os.getenv("NBA_SEASON_TYPE", "Regular Season")  # "Regular Season", "Playoffs", etc.

@lru_cache(maxsize=256)
def players_index(season: str | None = None) -> List[Dict[str, Any]]:
    """
    Build the players index (active + historical) for a given season.
    """
    season = season or season_default()
    df = commonallplayers.CommonAllPlayers(
        is_only_current_season=0,  # include historical players for flexible search
        season=season
    ).get_data_frames()[0]
    return [dict(r) for r in df.to_dict(orient="records")]

def search_players(q: str, season: str | None = None, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Case-insensitive substring search over DISPLAY_FIRST_LAST.
    If q empty -> return up to `limit` active suggestions.
    Output schema: { playerId, name, active, team }
    """
    data = players_index(season)
    q = (q or "").strip().lower()

    def row_to_out(p: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "playerId": p["PERSON_ID"],
            "name": p["DISPLAY_FIRST_LAST"],
            "active": p["ROSTERSTATUS"] == "Active",
            "team": p.get("TEAM_NAME") or None,
        }

    if not q:
        # default suggestions: actives only
        return [row_to_out(p) for p in data if p["ROSTERSTATUS"] == "Active"][:limit]

    # substring match on full name
    out = [row_to_out(p) for p in data if q in p["DISPLAY_FIRST_LAST"].lower()]
    return out[:limit]

@lru_cache(maxsize=256)
def get_player_seasons(player_id: int) -> List[str]:
    """
    Return list of season strings like ['2024-25', '2023-24', ...] for this player,
    using career stats (reliable season list).
    """
    time.sleep(SLEEP)
    resp = playercareerstats.PlayerCareerStats(player_id=player_id)
    df = resp.get_data_frames()[0]  # 'SeasonTotalsRegularSeason'
    # Column 'SEASON_ID' looks like '2019-20'
    seasons = df["SEASON_ID"].dropna().unique().tolist()

    # Sort desc by season (lex works for 'YYYY-YY')
    seasons.sort(reverse=True)
    return seasons


@lru_cache(maxsize=512)
def get_player_shotchart(
    player_id: int,
    season: str,
    team_id: Optional[int] = 0,
    measure: str = "FGA",  # FGA | FG3A | FG3M | FGM | PTS
) -> Dict[str, Any]:
    """
    Fetch shot chart detail for a player + season.
    Returns geo-coordinates and useful fields for plotting.
    """
    # nba_api expects a bunch of parameters; the bare minimum below is often enough.
    # You can pass team_id=0 to include all teams that season (e.g., if traded).
    time.sleep(SLEEP)

    context_measure = resolve_context_measure(measure)


    sc = shotchartdetail.ShotChartDetail(
        team_id=team_id or 0,
        player_id=player_id,
        season_type_all_star="Regular Season",
        season_nullable=season,  # e.g. '2024-25'
        context_measure_simple=context_measure,  # validates measure
        # Other useful filters you might later expose:
        # period=0, game_id_nullable=None, opponent_team_id=0, etc.
    )

    shots_df = sc.get_data_frames()[0]  # 'Shot_Chart_Detail'
    # Normalize for frontend: x/y + common fields (you can add more as needed)
    records = shots_df.to_dict(orient="records")

    # Keep a thin payload that D3 can use directly
    trimmed = []
    for r in records:
        trimmed.append({
            "x": r.get("LOC_X"),                 # court X (inches)
            "y": r.get("LOC_Y"),                 # court Y (inches)
            "made": int(r.get("SHOT_MADE_FLAG", 0)),   # 1/0
            "zone_basic": r.get("SHOT_ZONE_BASIC"),
            "zone_area": r.get("SHOT_ZONE_AREA"),
            "zone_range": r.get("SHOT_ZONE_RANGE"),
            "action_type": r.get("ACTION_TYPE"),
            "shot_type": r.get("SHOT_TYPE"),
            "shot_distance": r.get("SHOT_DISTANCE"),
            "game_id": r.get("GAME_ID"),
            "game_event_id": r.get("GAME_EVENT_ID"),
            "game_date": r.get("GAME_DATE"),
            "team_id": r.get("TEAM_ID"),
            "team_name": r.get("TEAM_NAME"),
            "opponent": r.get("OPPONENT_TEAM_NAME"),
            "period": r.get("PERIOD"),
            "minutes_remaining": r.get("MINUTES_REMAINING"),
            "seconds_remaining": r.get("SECONDS_REMAINING"),
        })

    return {
        "playerId": player_id,
        "season": season,
        "teamId": team_id or 0,
        "measure": measure,
        "count": len(trimmed),
        "shots": trimmed,
    }


@lru_cache(maxsize=256)
def has_games_in_season(player_id: int, season: str) -> bool:
    """
    Optional helper if you want to filter seasons to only those with logged games.
    """
    time.sleep(SLEEP)
    gl = playergamelog.PlayerGameLog(player_id=player_id, season=season)
    df = gl.get_data_frames()[0]
    return not df.empty