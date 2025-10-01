"""Head-to-head matchup summaries for the prediction endpoint."""

from __future__ import annotations

from functools import lru_cache
from typing import Dict, List, Optional

import pandas as pd

try:  # when running from repo root
    from backend.utils.data_loader import load_table  # type: ignore
except ImportError:  # fallback when backend/ is cwd
    from utils.data_loader import load_table  # type: ignore


@lru_cache(maxsize=1)
def _load_games() -> pd.DataFrame:
    df = load_table("backend/data/enlarged_dataset")
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    return df


def _filter_matchups(df: pd.DataFrame, team_a: str, team_b: str) -> pd.DataFrame:
    mask = (
        ((df["HOME_TEAM_NAME"] == team_a) & (df["AWAY_TEAM_NAME"] == team_b))
        | ((df["HOME_TEAM_NAME"] == team_b) & (df["AWAY_TEAM_NAME"] == team_a))
    )
    return df.loc[mask].copy()


def _apply_home_team_pov(row: pd.Series, home_team: str) -> float:
    margin = float(row.get("HOME_PTS", 0.0) - row.get("AWAY_PTS", 0.0))
    if row.get("HOME_TEAM_NAME") == home_team:
        return margin
    return -margin


def summarize_matchup(
    home_team: str,
    away_team: str,
    home_season: int,
    away_season: int,
    recent_limit: int = 5,
) -> Optional[Dict]:
    games = _filter_matchups(_load_games(), home_team, away_team)
    if games.empty:
        return None

    games.sort_values("GAME_DATE", inplace=True)
    games["margin_from_home"] = games.apply(_apply_home_team_pov, axis=1, home_team=home_team)
    games["home_win"] = games["margin_from_home"] > 0

    same_season = home_season == away_season

    if same_season:
        scope = "season"
        season_games = games[games["YEAR"] == home_season]
        if season_games.empty:
            recent = games.tail(recent_limit)
        else:
            recent = season_games.tail(recent_limit)
            games = season_games  # statistics limited to the season when available
        note = f"Latest {len(recent)} meetings in {home_season}" if not recent.empty else "No meetings this season"
    else:
        scope = "historical"
        recent = games.tail(recent_limit)
        note = f"Most recent {len(recent)} meetings (all seasons)"

    total_games = int(games.shape[0])
    home_wins = int(games["home_win"].sum())
    away_wins = total_games - home_wins
    avg_margin = float(games["margin_from_home"].mean()) if total_games else 0.0

    recent_games: List[Dict] = []
    for _, row in recent.sort_values("GAME_DATE", ascending=False).iterrows():
        recent_games.append(
            {
                "date": row["GAME_DATE"].strftime("%Y-%m-%d") if pd.notna(row["GAME_DATE"]) else None,
                "home_team": row.get("HOME_TEAM_NAME"),
                "away_team": row.get("AWAY_TEAM_NAME"),
                "home_score": float(row.get("HOME_PTS", float("nan"))),
                "away_score": float(row.get("AWAY_PTS", float("nan"))),
                "margin_for_home": float(row.get("margin_from_home", float("nan"))),
            }
        )

    return {
        "scope": scope,
        "home_team": home_team,
        "away_team": away_team,
        "home_season": int(home_season),
        "away_season": int(away_season),
        "total_games": total_games,
        "home_wins": home_wins,
        "away_wins": away_wins,
        "average_margin": avg_margin,
        "recent_games": recent_games,
        "note": note,
    }
