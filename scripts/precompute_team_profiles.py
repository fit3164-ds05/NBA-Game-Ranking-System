#!/usr/bin/env python3
"""Precompute season-level XGBoost feature profiles.

Generates backend/models/xgb_team_profiles.parquet so runtime predictions
can fetch pre-aggregated vectors instead of rebuilding from raw data.
Supports both the original team metrics feature set and the ratings-only
feature family derived from backend/data/team_ratings.csv.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.Rating_Algorithms.teamdictionary import get_team_name, normalize_team_abbrev
from backend.ml.features import (
    build_team_rolling,
    load_team_metrics,
    select_metric_cols,
    _prepare_team_ratings_features,
    _load_team_reference,
)

OUT_PATH = Path("backend/models/xgb_team_profiles.parquet")
META_PATH = Path("backend/models/xgb_team_profiles_meta.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Precompute team profiles for XGBoost inference.")
    parser.add_argument(
        "--feature-source",
        choices=["metrics", "ratings"],
        default="metrics",
        help="Feature family to profile (metrics=rolling box score metrics, ratings=team_ratings)",
    )
    return parser.parse_args()


def build_metrics_summary() -> tuple[pd.DataFrame, list[str], str]:
    print("[profiles] loading team metrics…")
    df = load_team_metrics()
    metric_cols = select_metric_cols(df)
    df_roll = build_team_rolling(df, metric_cols)

    if "TEAM_NAME" not in df_roll.columns:
        if "TEAM_ABBREVIATION" in df_roll.columns:
            df_roll["TEAM_NAME"] = (
                df_roll["TEAM_ABBREVIATION"]
                .fillna("")
                .astype(str)
                .map(lambda code: get_team_name(normalize_team_abbrev(code)))
            )
        else:
            raise KeyError("TEAM_NAME column missing and TEAM_ABBREVIATION unavailable; cannot build profiles")

    roll_cols = [c for c in df_roll.columns if c.endswith("_mean") or c.endswith("_std")]
    print(f"[profiles] aggregating {len(roll_cols)} rolling features across seasons…")
    summary = (
        df_roll
        .groupby(["TEAM_NAME", "YEAR"], dropna=True)[roll_cols]
        .median()
        .sort_index()
        .astype(np.float64)
    )
    return summary, roll_cols, "backend/data/team_metrics_dataset"


def build_ratings_summary() -> tuple[pd.DataFrame, list[str], str]:
    print("[profiles] loading team ratings…")
    df = load_team_metrics()
    refs = _load_team_reference()
    id_to_name = {
        int(row["TEAM_ID"]): str(row["TEAM_NAME"]).strip()
        for _, row in refs.iterrows()
        if pd.notna(row.get("TEAM_ID")) and pd.notna(row.get("TEAM_NAME"))
    }

    ratings = _prepare_team_ratings_features()
    df = df.merge(ratings, on=["TEAM_ID", "GAME_DATE"], how="left")

    rating_cols = [
        "TR_RATING_PRE",
        "TR_RATING_DELTA",
        "TR_RATING_ROLL5",
        "TR_RATING_ROLL10",
    ]

    df["YEAR"] = pd.to_numeric(df["YEAR"], errors="coerce").astype("Int64")
    summary = (
        df.dropna(subset=["TEAM_ID", "YEAR"])
        .groupby(["TEAM_ID", "YEAR"])[rating_cols]
        .median()
        .astype(np.float64)
    )
    summary["TEAM_NAME"] = summary.index.get_level_values(0).map(id_to_name)
    summary = summary.dropna(subset=["TEAM_NAME"]).copy()
    summary.index = pd.MultiIndex.from_arrays(
        [
            summary["TEAM_NAME"].astype(str),
            summary.index.get_level_values(1).astype(int),
        ],
        names=["TEAM_NAME", "YEAR"],
    )
    summary = summary.drop(columns=["TEAM_NAME"]).sort_index()
    return summary, rating_cols, "backend/data/team_ratings.csv"


def main() -> None:
    args = parse_args()
    if args.feature_source == "ratings":
        summary, feature_cols, source = build_ratings_summary()
    else:
        summary, feature_cols, source = build_metrics_summary()

    # Fill residual NaNs column-wise, then with zeros for safety
    summary = summary.fillna(summary.median()).fillna(0.0)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[profiles] writing {OUT_PATH}…")
    target_path: Path = OUT_PATH
    try:
        summary.to_parquet(OUT_PATH)
    except ImportError:
        target_path = OUT_PATH.with_suffix(".csv")
        print("[profiles] parquet support missing; writing CSV fallback…")
        summary.to_csv(target_path)

    META_PATH.write_text(json.dumps({
        "feature_columns": feature_cols,
        "source": source,
        "rows": int(summary.shape[0]),
        "columns": int(summary.shape[1]),
        "artifact": target_path.name,
        "feature_source": args.feature_source,
    }, indent=2))
    print(f"[profiles] done. wrote {target_path}")


if __name__ == "__main__":
    main()
