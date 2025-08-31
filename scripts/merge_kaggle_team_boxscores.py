#!/usr/bin/env python3
"""
Merge Kaggle-style team boxscore CSVs into one normalized team-level dataset
aligned to the canonical enlarged schema keys. No network calls.

Inputs (expected in backend/Data/):
  - team_traditional.csv
  - team_advanced.csv
  - team_fourfactors.csv
  - team_misc.csv
  - team_scoring.csv

Output:
  - backend/Data/team_metrics_dataset.csv

Join keys: (gameid, teamid)
We keep common keys once and prefix metrics by category: TRAD_, ADV_, FF_, MISC_, SCOR_.
We also add canonical-friendly columns: GAME_ID, TEAM_ID, TEAM_ABBREVIATION,
GAME_DATE (YYYY-MM-DD), SEASON_TYPE (Regular Season/Playoffs), YEAR, HOME_TEAM_ABBREVIATION,
AWAY_TEAM_ABBREVIATION, SIDE (HOME/AWAY).
"""

from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd


DATA_DIR = Path("backend/Data")
OUT_CSV = DATA_DIR / "team_metrics_dataset.csv"


def _load_csv(name: str) -> pd.DataFrame:
    p = DATA_DIR / name
    if not p.exists():
        raise FileNotFoundError(f"Missing input CSV: {p}")
    return pd.read_csv(p)


def _map_season_type(s: str) -> str:
    if not isinstance(s, str):
        return s
    s = s.strip().lower()
    if s.startswith("reg"):  # regular
        return "Regular Season"
    if s.startswith("play"):  # playoff(s)
        return "Playoffs"
    return s.title()


def _common_key_renames(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={
        "gameid": "GAME_ID",
        "date": "GAME_DATE",
        "type": "SEASON_TYPE",
        "teamid": "TEAM_ID",
        "team": "TEAM_ABBREVIATION",
        "home": "HOME_TEAM_ABBREVIATION",
        "away": "AWAY_TEAM_ABBREVIATION",
        "season": "YEAR",
    })
    # Normalize types
    if "GAME_DATE" in df.columns:
        try:
            df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    if "SEASON_TYPE" in df.columns:
        df["SEASON_TYPE"] = df["SEASON_TYPE"].apply(_map_season_type)
    return df


def _prefix_stats(df: pd.DataFrame, prefix: str, drop_keys: list[str]) -> pd.DataFrame:
    # Make a shallow copy, drop duplicated keys/metadata that will be kept from TRAD base
    keep = [c for c in df.columns if c not in drop_keys]
    df = df[keep].copy()
    # Clean problematic characters in column names first
    ren = {}
    for c in df.columns:
        if c in {"GAME_ID", "TEAM_ID"}:  # join keys retained without prefix
            continue
        # Replace special characters
        nc = c
        nc = nc.replace("%", "_PCT")
        nc = nc.replace(" ", "_")
        nc = nc.replace("+/-", "PLUS_MINUS")
        nc = nc.replace("/", "_")
        nc = nc.lstrip("_")  # avoid leading underscore after % replacement
        ren[c] = nc
    df = df.rename(columns=ren)
    # Prefix all non-key columns
    pref = {}
    for c in df.columns:
        if c in {"GAME_ID", "TEAM_ID"}:
            continue
        pref[c] = f"{prefix}_{c}"
    return df.rename(columns=pref)


def build_dataset() -> pd.DataFrame:
    # Base: traditional
    trad = _load_csv("team_traditional.csv")
    trad = _common_key_renames(trad)
    # Rename % cols and +/- and prefix TRAD
    trad_stats = [
        "PTS","FGM","FGA","FG%","3PM","3PA","3P%","FTM","FTA","FT%","OREB","DREB","REB","AST","TOV","STL","BLK","PF","+/-","MIN","win"
    ]
    # Some files have MIN as float vs int; keep as-is
    trad_pref = trad[["GAME_ID","TEAM_ID"] + [c for c in trad_stats if c in trad.columns]].copy()
    # Clean and prefix
    ren = {}
    for c in trad_pref.columns:
        if c in {"GAME_ID","TEAM_ID"}: continue
        nc = c.replace("%", "_PCT").replace(" ", "_").replace("+/-", "PLUS_MINUS").replace("/", "_")
        nc = nc.lstrip("_")
        ren[c] = f"TRAD_{nc}"
    trad_pref = trad_pref.rename(columns=ren)
    # Keep base keys/metadata from traditional (one copy only)
    base_meta_cols = [
        "GAME_ID","GAME_DATE","SEASON_TYPE","YEAR","TEAM_ID","TEAM_ABBREVIATION",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION"
    ]
    base = trad[base_meta_cols].drop_duplicates(subset=["GAME_ID","TEAM_ID"]).copy()
    # Merge TRAD stats into base
    base = base.merge(trad_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # ADVANCED
    adv = _common_key_renames(_load_csv("team_advanced.csv"))
    adv_pref = _prefix_stats(
        adv,
        prefix="ADV",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(adv_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # FOUR FACTORS
    ff = _common_key_renames(_load_csv("team_fourfactors.csv"))
    ff_pref = _prefix_stats(
        ff,
        prefix="FF",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(ff_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # MISC
    misc = _common_key_renames(_load_csv("team_misc.csv"))
    misc_pref = _prefix_stats(
        misc,
        prefix="MISC",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(misc_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # SCORING
    scor = _common_key_renames(_load_csv("team_scoring.csv"))
    scor_pref = _prefix_stats(
        scor,
        prefix="SCOR",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(scor_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # Add SIDE column for convenience
    side = []
    for _, r in base.iterrows():
        abbr = r.get("TEAM_ABBREVIATION")
        home = r.get("HOME_TEAM_ABBREVIATION")
        away = r.get("AWAY_TEAM_ABBREVIATION")
        if pd.notna(abbr) and pd.notna(home) and abbr == home:
            side.append("HOME")
        elif pd.notna(abbr) and pd.notna(away) and abbr == away:
            side.append("AWAY")
        else:
            side.append(pd.NA)
    base["SIDE"] = side

    # Order columns: keys/meta then categories
    key_cols = [
        "GAME_ID","TEAM_ID","TEAM_ABBREVIATION","GAME_DATE","SEASON_TYPE","YEAR",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","SIDE"
    ]
    cat_order = [
        [c for c in base.columns if c.startswith("TRAD_")],
        [c for c in base.columns if c.startswith("ADV_")],
        [c for c in base.columns if c.startswith("FF_")],
        [c for c in base.columns if c.startswith("MISC_")],
        [c for c in base.columns if c.startswith("SCOR_")],
    ]
    ordered = key_cols + [c for group in cat_order for c in group]
    # Keep only existing
    ordered = [c for c in ordered if c in base.columns]
    base = base[ordered]
    return base


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Merge Kaggle team boxscores into one normalized dataset")
    p.add_argument("--out", default=str(OUT_CSV), help="Output CSV path")
    return p.parse_args()


def main():
    args = parse_args()
    df = build_dataset()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Wrote {len(df):,} rows -> {out}")


if __name__ == "__main__":
    main()
