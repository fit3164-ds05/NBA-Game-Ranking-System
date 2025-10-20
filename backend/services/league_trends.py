"""
services/league_trends.py

Helpers for serving league-wide trend datasets to the frontend.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List, Dict

import pandas as pd


def _data_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "team_metrics_seasonal.csv"


def _season_sort_key(season: str) -> int:
    if not isinstance(season, str):
        return 0
    token = season.split("/", 1)[0]
    try:
        return int(token)
    except (TypeError, ValueError):
        digits = "".join(ch for ch in token if ch.isdigit())
        try:
            return int(digits[-4:]) if digits else 0
        except (TypeError, ValueError):
            return 0


@lru_cache(maxsize=1)
def load_fga_composition() -> List[Dict[str, float]]:
    """
    Return league-wide field goal attempt composition by season.

    Data source: backend/data/team_metrics_seasonal.csv with columns
    SCOR_PCTFGA_2PT and SCOR_PCTFGA_3PT expressed as percentages.
    """
    csv_path = _data_path()
    df = pd.read_csv(
        csv_path,
        usecols=["SEASON", "SCOR_PCTFGA_2PT", "SCOR_PCTFGA_3PT"],
    )
    df = df.dropna(subset=["SEASON", "SCOR_PCTFGA_2PT", "SCOR_PCTFGA_3PT"]).copy()
    df["__sort"] = df["SEASON"].apply(_season_sort_key)
    df = df.sort_values("__sort")

    payload: List[Dict[str, float]] = []
    for row in df.itertuples(index=False):
        payload.append(
            {
                "season": getattr(row, "SEASON"),
                "pct_2pt": float(getattr(row, "SCOR_PCTFGA_2PT")),
                "pct_3pt": float(getattr(row, "SCOR_PCTFGA_3PT")),
            }
        )
    return payload


def clear_cache() -> None:
    load_fga_composition.cache_clear()
    load_scoring_zone_composition.cache_clear()


@lru_cache(maxsize=1)
def load_scoring_zone_composition() -> List[Dict[str, float]]:
    """
    Return league-wide scoring zone breakdown by season.

    Columns used:
      - SCOR_PCTPTS_PITP: % of points in the paint
      - SCOR_PCTPTS_2PT_MR: % of points from mid-range 2s
      - SCOR_PCTPTS_3PT: % of points from 3s
      - SCOR_PCTPTS_FT: % of points from free throws
    """
    csv_path = _data_path()
    df = pd.read_csv(
        csv_path,
        usecols=[
            "SEASON",
            "SCOR_PCTPTS_PITP",
            "SCOR_PCTPTS_2PT_MR",
            "SCOR_PCTPTS_3PT",
            "SCOR_PCTPTS_FT",
        ],
    )
    df = df.dropna(
        subset=[
            "SEASON",
            "SCOR_PCTPTS_PITP",
            "SCOR_PCTPTS_2PT_MR",
            "SCOR_PCTPTS_3PT",
            "SCOR_PCTPTS_FT",
        ]
    ).copy()
    df["__sort"] = df["SEASON"].apply(_season_sort_key)
    df = df.sort_values("__sort")

    payload: List[Dict[str, float]] = []
    for row in df.itertuples(index=False):
        payload.append(
            {
                "season": getattr(row, "SEASON"),
                "pct_pitp": float(getattr(row, "SCOR_PCTPTS_PITP")),
                "pct_midrange": float(getattr(row, "SCOR_PCTPTS_2PT_MR")),
                "pct_three": float(getattr(row, "SCOR_PCTPTS_3PT")),
                "pct_ft": float(getattr(row, "SCOR_PCTPTS_FT")),
            }
        )
    return payload
