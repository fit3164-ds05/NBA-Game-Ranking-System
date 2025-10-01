#!/usr/bin/env python3
"""Precompute season-level XGBoost feature profiles.

Generates backend/models/xgb_team_profiles.parquet so runtime predictions
need not touch the full team_metrics_dataset.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_team_rolling, load_team_metrics, select_metric_cols
from backend.Rating_Algorithms.teamdictionary import get_team_name, normalize_team_abbrev

OUT_PATH = Path("backend/models/xgb_team_profiles.parquet")
META_PATH = Path("backend/models/xgb_team_profiles_meta.json")


def main() -> None:
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
        "feature_columns": roll_cols,
        "source": "backend/data/team_metrics_dataset",
        "rows": int(summary.shape[0]),
        "columns": int(summary.shape[1]),
        "artifact": target_path.name,
    }, indent=2))
    print(f"[profiles] done. wrote {target_path}")
if __name__ == "__main__":
    main()
