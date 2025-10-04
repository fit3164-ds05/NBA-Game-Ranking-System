#!/usr/bin/env python3
"""Stage 2 helper: remove zero-importance features from the latest XGBoost run.

Usage:
  python scripts/prune_zero_importance.py cls
  python scripts/prune_zero_importance.py reg --gain-threshold 1e-6
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List

import pandas as pd

MODELS_DIR = Path("backend/models")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prune zero-importance XGBoost features")
    parser.add_argument("model", choices=["cls", "reg"], help="Which model to prune")
    parser.add_argument(
        "--run-dir",
        help="Specific diagnostics run directory to use (defaults to latest run)",
    )
    parser.add_argument(
        "--gain-threshold",
        type=float,
        default=0.0,
        help="Minimum gain required to keep a feature (default: strictly > 0)",
    )
    parser.add_argument(
        "--out-file",
        help="Optional output file for the pruned feature list (default: xgb_<model>_features_pruned.txt)",
    )
    return parser.parse_args()


def find_latest_run(model: str) -> Path:
    runs_dir = MODELS_DIR / f"xgb_{model}_runs"
    if not runs_dir.exists():
        raise FileNotFoundError(f"Run directory not found: {runs_dir}")
    candidates = sorted(
        [p for p in runs_dir.iterdir() if p.is_dir()],
        key=lambda p: p.name,
    )
    if not candidates:
        raise FileNotFoundError(f"No runs found under {runs_dir}")
    return candidates[-1]


def load_feature_importances(run_dir: Path, gain_threshold: float) -> List[str]:
    csv_path = run_dir / "feature_importances.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"feature_importances.csv not found in {run_dir}")
    df = pd.read_csv(csv_path)
    if "feature" not in df.columns or "gain" not in df.columns:
        raise ValueError(f"Unexpected importance schema in {csv_path}")
    keep = df[df["gain"] > gain_threshold]["feature"].tolist()
    return keep


def prune_features(model: str, run_dir: Path, gain_threshold: float, out_file: Path | None) -> dict:
    current_features_path = MODELS_DIR / f"xgb_{model}_features.txt"
    if not current_features_path.exists():
        raise FileNotFoundError(f"Baseline feature list not found: {current_features_path}")
    baseline = [line.strip() for line in current_features_path.read_text().splitlines() if line.strip()]

    keep = load_feature_importances(run_dir, gain_threshold)
    keep_set = set(keep)
    pruned = [f for f in baseline if f in keep_set]

    if out_file is None:
        out_file = MODELS_DIR / f"xgb_{model}_features_pruned.txt"
    out_file.write_text("\n".join(pruned))

    removed = [f for f in baseline if f not in keep_set]
    summary = {
        "model": model,
        "run_dir": str(run_dir),
        "baseline_count": len(baseline),
        "kept_count": len(pruned),
        "removed_count": len(removed),
        "gain_threshold": gain_threshold,
        "output_file": str(out_file),
    }
    summary_path = out_file.with_suffix(out_file.suffix + ".json")
    summary_path.write_text(json.dumps(summary, indent=2))

    print(json.dumps(summary, indent=2))
    return summary


def main() -> None:
    args = parse_args()
    run_dir = Path(args.run_dir) if args.run_dir else find_latest_run(args.model)
    out_file = Path(args.out_file) if args.out_file else None
    prune_features(args.model, run_dir, args.gain_threshold, out_file)


if __name__ == "__main__":
    main()
