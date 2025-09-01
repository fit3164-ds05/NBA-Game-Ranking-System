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
import sys
import pandas as pd


DATA_DIR = Path("backend/Data")
OUT_CSV = DATA_DIR / "team_metrics_dataset.csv"


def _load_csv(name: str) -> pd.DataFrame:
    p = DATA_DIR / name
    if not p.exists():
        raise FileNotFoundError(f"Missing input CSV: {p}")
    # Avoid dtype fragmentation warnings; we'll coerce important ids below
    return pd.read_csv(p, low_memory=False)


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
    })
    # Coerce ids to consistent dtypes early
    if "GAME_ID" in df.columns:
        df["GAME_ID"] = df["GAME_ID"].astype(str)
    if "TEAM_ID" in df.columns:
        df["TEAM_ID"] = pd.to_numeric(df["TEAM_ID"], errors="coerce").astype("Int64")
    # Normalize types
    if "GAME_DATE" in df.columns:
        try:
            df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    if "SEASON_TYPE" in df.columns:
        df["SEASON_TYPE"] = df["SEASON_TYPE"].apply(_map_season_type)
    # Normalize SEASON start/end -> set YEAR to season start (align with canonical)
    if "season" in df.columns and "YEAR" not in df.columns:
        try:
            endy = pd.to_numeric(df["season"], errors="coerce")
            df["YEAR"] = (endy - 1).astype("Int64")
        except Exception:
            pass
    # Normalize abbreviations using teamdictionary mapping if available
    try:
        sys.path.append(str(Path("backend/Rating_Algorithms").resolve()))
        import teamdictionary as _td  # type: ignore
        for c in ["TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION"]:
            if c in df.columns:
                df[c] = df[c].apply(_td.normalize_team_abbrev)
    except Exception:
        pass
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
    # Collect metadata keys from all splits (union of GAME_ID, TEAM_ID pairs)
    def _keys(df: pd.DataFrame) -> pd.DataFrame:
        cols = ["GAME_ID","TEAM_ID","GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION"]
        have = [c for c in cols if c in df.columns]
        return df[have].copy()

    adv = _common_key_renames(_load_csv("team_advanced.csv"))
    ff  = _common_key_renames(_load_csv("team_fourfactors.csv"))
    misc= _common_key_renames(_load_csv("team_misc.csv"))
    scor= _common_key_renames(_load_csv("team_scoring.csv"))

    meta_union = pd.concat([
        _keys(trad), _keys(adv), _keys(ff), _keys(misc), _keys(scor)
    ], ignore_index=True)
    # Aggregate first non-null per column for each (GAME_ID, TEAM_ID)
    def _first_non_null(s: pd.Series):
        s2 = s.dropna()
        return s2.iloc[0] if not s2.empty else pd.NA
    base = (
        meta_union
        .groupby(["GAME_ID","TEAM_ID"], as_index=False)
        .agg(_first_non_null)
    )
    # Re-normalize season type text in case of inconsistencies
    if "SEASON_TYPE" in base.columns:
        base["SEASON_TYPE"] = base["SEASON_TYPE"].apply(_map_season_type)
    # Merge TRAD stats into base (may be missing for some games)
    base = base.merge(trad_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # ADVANCED
    adv_pref = _prefix_stats(
        adv,
        prefix="ADV",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(adv_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # FOUR FACTORS
    ff_pref = _prefix_stats(
        ff,
        prefix="FF",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(ff_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # MISC
    misc_pref = _prefix_stats(
        misc,
        prefix="MISC",
        drop_keys=["GAME_DATE","SEASON_TYPE","YEAR","TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","MIN","win"],
    )
    base = base.merge(misc_pref, on=["GAME_ID","TEAM_ID"], how="left")

    # SCORING
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

    # Apply optional SIDE overrides if provided by QA (manual curation)
    # Expected columns: GAME_ID (string), TEAM_ID (int), SIDE ('HOME'/'AWAY')
    overrides_path = Path("backend/Data/qa/side_overrides.csv")
    if overrides_path.exists():
        try:
            ov = pd.read_csv(overrides_path, dtype={"GAME_ID": str})
            have = {"GAME_ID","TEAM_ID","SIDE"}.issubset(ov.columns)
            if have:
                # Coerce TEAM_ID for join
                ov["TEAM_ID"] = pd.to_numeric(ov["TEAM_ID"], errors="coerce").astype("Int64")
                # Join and override
                base = base.merge(ov, on=["GAME_ID","TEAM_ID"], how="left", suffixes=("", "_OVR"))
                sel = base["SIDE_OVR"].notna()
                base.loc[sel, "SIDE"] = base.loc[sel, "SIDE_OVR"]
                base = base.drop(columns=[c for c in ["SIDE_OVR"] if c in base.columns])
                print(f"Applied SIDE overrides: {int(sel.sum())} rows updated")
        except Exception as e:
            print(f"[WARN] Could not apply side overrides: {e}")

    # Derive HOME_TEAM_ID and AWAY_TEAM_ID per GAME_ID from TEAM_ID using SIDE
    try:
        home_ids = base[base["SIDE"] == "HOME"][["GAME_ID","TEAM_ID"]].rename(columns={"TEAM_ID":"HOME_TEAM_ID"})
        away_ids = base[base["SIDE"] == "AWAY"][["GAME_ID","TEAM_ID"]].rename(columns={"TEAM_ID":"AWAY_TEAM_ID"})
        base = base.merge(home_ids, on="GAME_ID", how="left").merge(away_ids, on="GAME_ID", how="left")
    except Exception:
        pass
    # Ensure numeric ids for joins/QA
    for c in ["TEAM_ID","HOME_TEAM_ID","AWAY_TEAM_ID"]:
        if c in base.columns:
            try:
                base[c] = pd.to_numeric(base[c], errors="coerce").astype("Int64")
            except Exception:
                pass

    # Filter to Regular Season / Playoffs only and coerce types
    if "SEASON_TYPE" in base.columns:
        base = base[base["SEASON_TYPE"].isin(["Regular Season","Playoffs"])].copy()
    if "YEAR" in base.columns:
        try:
            base["YEAR"] = pd.to_numeric(base["YEAR"], errors="coerce").astype("Int64")
        except Exception:
            pass

    # Optionally exclude play-in dates if a QA exclusion file exists
    excl_dates_file = Path("backend/Data/qa/excluded_dates_playin.csv")
    if excl_dates_file.exists() and "GAME_DATE" in base.columns:
        try:
            excl = pd.read_csv(excl_dates_file)
            if "EXCLUDE_DATE" in excl.columns:
                before = len(base)
                base = base[~base["GAME_DATE"].isin(excl["EXCLUDE_DATE"].astype(str))].copy()
                after = len(base)
                print(f"Excluded Play-In dates: {before-after} rows removed based on {excl_dates_file}")
        except Exception:
            pass

    # Optional points overrides from QA to align TRAD_PTS with canonical scores
    pts_override_file = Path("backend/Data/qa/points_overrides.csv")
    if pts_override_file.exists() and "TRAD_PTS" in base.columns:
        try:
            po = pd.read_csv(pts_override_file, dtype={"GAME_ID": str})
            if {"GAME_ID","TEAM_ID","TRAD_PTS"}.issubset(po.columns):
                po["TEAM_ID"] = pd.to_numeric(po["TEAM_ID"], errors="coerce").astype("Int64")
                base = base.merge(po, on=["GAME_ID","TEAM_ID"], how="left", suffixes=("", "_OVR"))
                sel = base["TRAD_PTS_OVR"].notna()
                base.loc[sel, "TRAD_PTS"] = base.loc[sel, "TRAD_PTS_OVR"]
                base = base.drop(columns=[c for c in ["TRAD_PTS_OVR"] if c in base.columns])
                print(f"Applied points overrides: {int(sel.sum())} rows updated")
        except Exception as e:
            print(f"[WARN] Could not apply points overrides: {e}")

    # Order columns: keys/meta then categories
    key_cols = [
        "GAME_ID","TEAM_ID","TEAM_ABBREVIATION","GAME_DATE","SEASON_TYPE","YEAR",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","HOME_TEAM_ID","AWAY_TEAM_ID","SIDE"
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
