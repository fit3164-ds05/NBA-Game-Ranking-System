#!/usr/bin/env python3
from __future__ import annotations
"""
Local data exploration for Kaggle-style team boxscore splits and
play-in exclusion documentation. This script does NOT hit any
external APIs; it only reads CSVs under backend/Data/.

Usage examples:
  - Explore problem seasons and write samples + coverage:
      python data_exploration.py --explore-years 2002,2003,2024,2025 --print-samples 5 --exclude-playin

  - Just generate play-in exclusion dates (derived from QA extra games):
      python data_exploration.py --exclude-playin

Outputs (under backend/Data/qa/):
  - splits_coverage_by_year.csv   # Per-split coverage grouped by season start year + season type
  - samples/sample_<SPLIT>_<YEAR>.csv  # Small samples for target seasons
  - excluded_dates_playin.csv     # Unique dates to exclude (Play-In)
  - README_exclusions.txt         # Short note documenting the exclusions
"""

import argparse
from pathlib import Path
from typing import Iterable, List
import pandas as pd


DATA_DIR = Path("backend/Data")
QA_DIR = DATA_DIR / "qa"

SPLIT_FILES = [
    ("team_traditional.csv", "TRAD"),
    ("team_advanced.csv", "ADV"),
    ("team_fourfactors.csv", "FF"),
    ("team_misc.csv", "MISC"),
    ("team_scoring.csv", "SCOR"),
]


def _load_split(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    # Normalize basic fields
    if "date" in df.columns:
        try:
            df["date_iso"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
        except Exception:
            df["date_iso"] = df.get("date")
    else:
        df["date_iso"] = pd.NA
    if "type" in df.columns:
        t = df["type"].astype(str).str.lower().str.strip()
        df["SEASON_TYPE"] = t.map({
            "regular": "Regular Season",
            "playoff": "Playoffs",
            "playoffs": "Playoffs",
            "play-in": "Play-In",
            "playin": "Play-In",
        }).fillna(df["type"])
    else:
        df["SEASON_TYPE"] = pd.NA
    # Kaggle season is end-year (e.g., 1997 for 1996-97). Compute start-year.
    if "season" in df.columns:
        df["SEASON_END"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
        df["SEASON_START"] = (df["SEASON_END"] - 1).astype("Int64")
    else:
        df["SEASON_END"] = pd.NA
        df["SEASON_START"] = pd.NA
    return df


def write_playin_exclusions_from_extra_games(extra_games_csv: Path, out_csv: Path) -> pd.DataFrame:
    """Derive Play-In dates from QA extra_games.csv and write a unique date list."""
    if not extra_games_csv.exists():
        print(f"[WARN] Extra games file not found: {extra_games_csv}")
        return pd.DataFrame()
    eg = pd.read_csv(extra_games_csv)
    if "GAME_DATE" not in eg.columns:
        print("[WARN] GAME_DATE column not in extra_games.csv")
        return pd.DataFrame()
    dates = eg["GAME_DATE"].dropna().astype(str).sort_values().unique()
    out = pd.DataFrame({"EXCLUDE_DATE": dates})
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(out_csv, index=False)
    print(f"Wrote {len(out)} play-in exclusion dates -> {out_csv}")
    # Also write a tiny README note
    readme = QA_DIR / "README_exclusions.txt"
    note = (
        "These dates are excluded from merges because they correspond to \n"
        "NBA Play-In games often labeled as 'Playoffs' in public splits, \n"
        "but excluded or labeled differently in the canonical enlarged dataset.\n"
    )
    try:
        readme.write_text(note)
    except Exception:
        pass
    return out


def explore_years(target_years: Iterable[int], sample_n: int = 5, exclude_playin: bool = False) -> None:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    # Load splits
    loaded = []
    for fname, tag in SPLIT_FILES:
        p = DATA_DIR / fname
        if not p.exists():
            print(f"[WARN] Missing split: {p}")
            continue
        df = _load_split(p)
        df["_SOURCE"] = tag
        loaded.append(df)
    if not loaded:
        print("[ERROR] No team_*.csv splits found in backend/Data/")
        return
    all_df = pd.concat(loaded, ignore_index=True, sort=False)

    # Exclude Play-In dates if requested, based on QA extra list
    if exclude_playin:
        extra_csv = QA_DIR / "extra_games.csv"
        excl_csv = QA_DIR / "excluded_dates_playin.csv"
        try:
            excl = write_playin_exclusions_from_extra_games(extra_csv, excl_csv)
            if not excl.empty:
                all_df = all_df[~all_df["date_iso"].isin(excl["EXCLUDE_DATE"])].copy()
        except Exception as e:
            print(f"[WARN] Could not build play-in exclusion list: {e}")

    # Coverage by SEASON_START (start year) and SEASON_TYPE per split
    cov = (
        all_df.groupby(["_SOURCE","SEASON_START","SEASON_TYPE"], dropna=False)
              .size().rename("rows").reset_index()
              .sort_values(["_SOURCE","SEASON_START","SEASON_TYPE"]) )
    cov_out = QA_DIR / "splits_coverage_by_year.csv"
    cov.to_csv(cov_out, index=False)
    print(f"Wrote coverage by year per split -> {cov_out}")

    # Summarize target years
    target_years = [int(y) for y in target_years]
    sub = all_df[all_df["SEASON_START"].isin(target_years)].copy()
    if sub.empty:
        print(f"[INFO] No rows found for target years {target_years} in splits.")
    else:
        print("\n=== Target Years Summary ===")
        print(sub.groupby(["_SOURCE","SEASON_START","SEASON_TYPE"]).size().rename("rows"))

    # Sample a few records from each split for each target year
    samples_dir = QA_DIR / "samples"
    samples_dir.mkdir(parents=True, exist_ok=True)
    for y in target_years:
        year_df = sub[sub["SEASON_START"] == y]
        if year_df.empty:
            continue
        for tag in sorted(year_df["_SOURCE"].unique()):
            ex = year_df[year_df["_SOURCE"] == tag].head(sample_n)
            outp = samples_dir / f"sample_{tag}_{y}.csv"
            ex.to_csv(outp, index=False)
            print(f"Sampled {len(ex)} rows -> {outp}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Explore Kaggle team boxscore splits and document exclusions")
    p.add_argument("--explore-years", type=str, default=None,
                   help="Comma-separated start years to inspect, e.g., '2002,2003,2024,2025'")
    p.add_argument("--print-samples", type=int, default=5, help="Sample rows per split per target year")
    p.add_argument("--exclude-playin", action="store_true",
                   help="Exclude dates derived from QA extra_games.csv and write excluded_dates_playin.csv")
    return p.parse_args()


def main():
    args = parse_args()
    years = []
    if args.explore_years:
        years = [int(x.strip()) for x in args.explore_years.split(",") if x.strip()]
    # Always perform exploration if years provided
    if years:
        explore_years(years, sample_n=args.print_samples, exclude_playin=args.exclude_playin)
        return
    # If only exclusion requested
    if args.exclude_playin:
        QA_DIR.mkdir(parents=True, exist_ok=True)
        extra_csv = QA_DIR / "extra_games.csv"
        excl_csv = QA_DIR / "excluded_dates_playin.csv"
        write_playin_exclusions_from_extra_games(extra_csv, excl_csv)
        return
    print("No action specified. Use --explore-years or --exclude-playin. Run with -h for help.")


if __name__ == "__main__":
    main()

