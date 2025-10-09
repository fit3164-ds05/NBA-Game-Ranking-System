"""
Helpers for reasoning about NBA franchise active seasons based on nba_teams.csv.

Exposes cached lookups so other services (e.g. ratings) can filter out seasons
for defunct teams that fall outside their historical range.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "nba_teams.csv"


def _parse_start_year(season_str: Optional[str]) -> Optional[int]:
    """Return the season start year (e.g. '1946/47' -> 1946)."""
    if not season_str or not isinstance(season_str, str):
        return None
    token = season_str.strip()
    if not token:
        return None
    head = token.split("/")[0].strip()
    # Some CSVs store seasons like '1946-47' – normalise by keeping last 4 digits.
    if not head.isdigit():
        head = "".join(ch for ch in head if ch.isdigit())
        if len(head) >= 4:
            head = head[-4:]
    try:
        return int(head)
    except (TypeError, ValueError):
        return None


def _compute_years(first_start: int, last_start: int) -> List[int]:
    """
    Convert a first/last season start into inclusive start-year list.
    """
    if last_start < first_start:
        last_start = first_start
    return list(range(first_start, last_start + 1))


@lru_cache(maxsize=1)
def load_team_history() -> Dict[str, Dict[str, object]]:
    """
    Read nba_teams.csv and return metadata keyed by TEAM_NAME.

    Each entry includes:
      - team_id
      - abbreviation
      - first_season_start (int)
      - last_season_start (int)
      - years (list[int]) – calendar years in which the franchise played
    """
    if not DATA_PATH.exists():
        return {}

    history: Dict[str, Dict[str, object]] = {}
    with open(DATA_PATH, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            canonical = (row.get("TEAM_NAME") or "").strip()
            if not canonical:
                continue

            first = _parse_start_year(row.get("FIRST_SEASON"))
            last = _parse_start_year(row.get("LAST_SEASON"))
            if first is None:
                continue
            if last is None:
                last = first

            years = _compute_years(first, last)

            team_id_raw = row.get("TEAM_ID")
            try:
                team_id = int(team_id_raw) if team_id_raw is not None else None
            except ValueError:
                team_id = None

            entry = {
                "team_id": team_id,
                "abbreviation": (row.get("TEAM_ABBR") or "").strip(),
                "first_season_start": first,
                "last_season_start": last,
                "years": years,
            }
            aliases = {canonical}
            full_name = (row.get("TEAM_FULL_NAME") or "").strip()
            if full_name:
                aliases.add(full_name)
            # Include a verbose alias like "Team (1946-1950)" for display strings.
            try:
                alias_range = f"{canonical} ({first}-{last + 1})"
                aliases.add(alias_range)
            except Exception:
                pass
            for alias in aliases:
                if alias:
                    history[alias] = entry

    return history


def _normalise_key(name: str) -> str:
    return "".join(ch.lower() for ch in name if ch.isalnum())


def active_years_for_team(team_name: str) -> Optional[List[int]]:
    """Return sorted calendar years in which the team existed."""
    history = load_team_history()
    entry = history.get(team_name)
    if not entry:
        stripped = team_name.split("(")[0].strip()
        if stripped and stripped != team_name:
            entry = history.get(stripped)
        if not entry:
            norm = _normalise_key(team_name)
            for alias, candidate in history.items():
                if _normalise_key(alias) == norm:
                    entry = candidate
                    break
        if not entry:
            return None
    return list(entry["years"])  # return copy


def team_year_bounds() -> Dict[str, Dict[str, Optional[int]]]:
    """
    Return lightweight bounds per team for API responses.

    Shape: {team_name: {"team_id": int|None, "abbreviation": str,
                        "first_year": int, "last_year": int}}
    """
    bounds: Dict[str, Dict[str, Optional[int]]] = {}
    for name, entry in load_team_history().items():
        years: List[int] = entry["years"]  # type: ignore[assignment]
        if not years:
            continue
        bounds[name] = {
            "team_id": entry.get("team_id"),
            "abbreviation": entry.get("abbreviation"),
            "first_year": years[0],
            "last_year": years[-1],
        }
    return bounds


def teams_active_in_year(year: int) -> List[str]:
    """Return sorted team names active during the provided calendar year."""
    out = []
    for name, entry in load_team_history().items():
        years: List[int] = entry["years"]  # type: ignore[assignment]
        if years and years[0] <= year <= years[-1]:
            out.append(name)
    return sorted(out)
