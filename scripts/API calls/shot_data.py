"""Utilities for building an NBA shot dataset from stats.nba.com.
The script downloads per-shot information for every game in the requested
seasons and writes a tidy CSV file with the following schema::
    date | season | gameID | player | shot_distance | in
Usage
-----
Run from the repository root::
    python "scripts/API calls/shot_data.py" --seasons 2023-24 2024-25 --out data/shots.csv
By default only regular-season games are included.  Use ``--season-type`` to
switch to other season types (e.g. ``Playoffs``).  The script makes repeated
requests to the public NBA statistics API (``stats.nba.com``) and therefore
includes basic retry + rate limiting to remain a good API citizen.
Requirements
------------
``pandas`` and ``tqdm`` are required for running the script.  Install them in a
virtual environment before executing the script::
    python -m venv .venv
    source .venv/bin/activate
    pip install pandas requests tqdm
``requests`` ships with Python's standard virtual environment but is listed for
clarity.
"""
from __future__ import annotations
import argparse
import datetime as dt
import logging
import time
from dataclasses import dataclass
from typing import Iterable, List, Optional
import pandas as pd
import requests
from tqdm import tqdm
_LOGGER = logging.getLogger(__name__)
# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------
NBA_API_ROOT = "https://stats.nba.com/stats"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/stats",
    "Connection": "keep-alive",
}
class NBAStatsClient:
    """Tiny HTTP client tailored for stats.nba.com endpoints."""
    def __init__(
        self,
        *,
        base_url: str = NBA_API_ROOT,
        headers: Optional[dict[str, str]] = None,
        timeout: int = 30,
        pause: float = 0.6,
        max_retries: int = 5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.pause = pause
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        if headers:
            self.session.headers.update(headers)
        # `trust_env = False` disables environment configured proxies.  NBA blocks
        # many cloud provider proxy IP ranges with 403 responses, so we bypass them
        # and rely on the direct outbound network configured for this environment.
        self.session.trust_env = False
    def get_json(self, endpoint: str, params: Optional[dict[str, object]] = None) -> dict:
        """Fetch JSON from ``stats.nba.com`` with retries and throttling."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        attempts = 0
        while True:
            try:
                response = self.session.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                time.sleep(self.pause)
                return data
            except requests.HTTPError as exc:  # pragma: no cover - network/HTTP errors
                attempts += 1
                status = exc.response.status_code if exc.response else "unknown"
                if attempts >= self.max_retries:
                    raise
                wait_for = self.pause * attempts
                _LOGGER.warning(
                    "HTTP %s for %s (attempt %s/%s). Retrying in %.1fs...",
                    status,
                    endpoint,
                    attempts,
                    self.max_retries,
                    wait_for,
                )
                time.sleep(wait_for)
            except requests.RequestException:  # pragma: no cover
                attempts += 1
                if attempts >= self.max_retries:
                    raise
                wait_for = self.pause * attempts
                _LOGGER.warning(
                    "Request error for %s (attempt %s/%s). Retrying in %.1fs...",
                    endpoint,
                    attempts,
                    self.max_retries,
                    wait_for,
                )
                time.sleep(wait_for)
# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------
def _result_set_to_frame(payload: dict, name: str) -> pd.DataFrame:
    """Convert the NBA stats JSON format into a ``pandas.DataFrame``."""
    result_sets = payload.get("resultSets") or payload.get("resultSet")
    if not result_sets:
        raise KeyError(f"No resultSets in payload for {name!r}")
    if isinstance(result_sets, dict):
        # Some endpoints use ``resultSet`` instead of a list of ``resultSets``.
        result_sets = [result_sets]
    for result in result_sets:
        if result.get("name") == name:
            headers = result.get("headers", [])
            rows = result.get("rowSet", [])
            return pd.DataFrame(rows, columns=headers)
    raise KeyError(f"Result set {name!r} not found in payload")
@dataclass(frozen=True)
class Game:
    game_id: str
    date: dt.date
    season: str
def fetch_games(
    client: NBAStatsClient,
    season: str,
    season_type: str,
    *,
    start: Optional[dt.date] = None,
    end: Optional[dt.date] = None,
) -> List[Game]:
    """Return all games for a ``season`` filtered by dates if provided."""
    payload = client.get_json(
        "leaguegamelog",
        params={
            "Counter": 0,
            "Direction": "ASC",
            "LeagueID": "00",
            "PlayerOrTeam": "T",
            "Season": season,
            "SeasonType": season_type,
            "Sorter": "DATE",
        },
    )
    frame = _result_set_to_frame(payload, "LeagueGameLog")
    if frame.empty:
        return []
    frame["GAME_DATE"] = pd.to_datetime(frame["GAME_DATE"])
    frame = frame.sort_values("GAME_DATE")
    if start is not None:
        frame = frame[frame["GAME_DATE"].dt.date >= start]
    if end is not None:
        frame = frame[frame["GAME_DATE"].dt.date <= end]
    # ``LeagueGameLog`` returns one row per team per game.  Deduplicate by game id
    # while preserving the earliest (chronological) occurrence.
    frame = frame.drop_duplicates("GAME_ID", keep="first")
    games = [
        Game(game_id=row.GAME_ID, date=row.GAME_DATE.date(), season=season)
        for row in frame.itertuples(index=False)
    ]
    return games
def fetch_shots_for_game(
    client: NBAStatsClient,
    game: Game,
    season_type: str,
) -> pd.DataFrame:
    """Download all shots for a single ``game``."""
    payload = client.get_json(
        "shotchartdetail",
        params={
            "GameID": game.game_id,
            "Season": game.season,
            "SeasonType": season_type,
            "PlayerID": 0,
            "TeamID": 0,
            "ContextMeasure": "FGA",
            "RangeType": 0,
        },
    )
    frame = _result_set_to_frame(payload, "Shot_Chart_Detail")
    if frame.empty:
        return frame
    columns = {
        "GAME_DATE": "date",
        "SEASON": "season",
        "GAME_ID": "gameID",
        "PLAYER_NAME": "player",
        "SHOT_DISTANCE": "shot_distance",
        "SHOT_MADE_FLAG": "in",
    }
    missing = [key for key in columns if key not in frame.columns]
    if missing:
        raise KeyError(
            "Shot chart payload missing expected columns: " + ", ".join(missing)
        )
    tidy = frame[list(columns.keys())].rename(columns=columns)
    tidy["date"] = pd.to_datetime(tidy["date"]).dt.date
    tidy["season"] = game.season  # enforce season string for consistency
    tidy["gameID"] = game.game_id
    tidy["shot_distance"] = pd.to_numeric(tidy["shot_distance"], errors="coerce")
    tidy["in"] = tidy["in"].astype(int)
    tidy = tidy.sort_values(["player", "date", "gameID"]).reset_index(drop=True)
    return tidy
def build_shot_dataset(
    seasons: Iterable[str],
    *,
    season_type: str = "Regular Season",
    start: Optional[dt.date] = None,
    end: Optional[dt.date] = None,
    limit: Optional[int] = None,
    pause: float = 0.6,
) -> pd.DataFrame:
    """Aggregate per-shot data for every game in ``seasons``."""
    client = NBAStatsClient(pause=pause)
    frames: List[pd.DataFrame] = []
    for season in seasons:
        games = fetch_games(client, season, season_type, start=start, end=end)
        if not games:
            _LOGGER.warning("No games returned for season %s", season)
            continue
        if limit is not None:
            games = games[:limit]
        _LOGGER.info(
            "Fetching shots for %s %s (%s games)", season, season_type, len(games)
        )
        for game in tqdm(games, desc=f"{season} games", unit="game"):
            shots = fetch_shots_for_game(client, game, season_type)
            if not shots.empty:
                frames.append(shots)
    if not frames:
        return pd.DataFrame(columns=["date", "season", "gameID", "player", "shot_distance", "in"])
    dataset = pd.concat(frames, ignore_index=True)
    dataset = dataset.sort_values(["date", "gameID", "player"]).reset_index(drop=True)
    return dataset
# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def _parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seasons",
        nargs="+",
        required=True,
        help="Season strings such as '2023-24'.  Provide multiple to aggregate.",
    )
    parser.add_argument(
        "--season-type",
        default="Regular Season",
        help="NBA season type (Regular Season, Playoffs, PlayIn, etc).",
    )
    parser.add_argument(
        "--start",
        type=lambda s: dt.datetime.strptime(s, "%Y-%m-%d").date(),
        help="Optional start date filter (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--end",
        type=lambda s: dt.datetime.strptime(s, "%Y-%m-%d").date(),
        help="Optional end date filter (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit the number of games per season (useful for smoke tests).",
    )
    parser.add_argument(
        "--out",
        type=str,
        required=True,
        help="Path to the CSV file that will be written.",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=0.6,
        help="Seconds to pause between API requests (default: 0.6s).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args(argv)
def main(argv: Optional[Iterable[str]] = None) -> None:
    args = _parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    dataset = build_shot_dataset(
        args.seasons,
        season_type=args.season_type,
        start=args.start,
        end=args.end,
        limit=args.limit,
        pause=args.pause,
    )
    if dataset.empty:
        _LOGGER.warning("No shot data retrieved.  CSV will still be created.")
    dataset.to_csv(args.out, index=False)
    _LOGGER.info("Wrote %d rows to %s", len(dataset), args.out)
if __name__ == "__main__":  # pragma: no cover - script entry point
    main()