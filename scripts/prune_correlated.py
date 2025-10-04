#!/usr/bin/env python3
"""Stage 2 helper: drop highly-correlated features based on recent training data.

Usage:
  python scripts/prune_correlated.py cls --feature-list backend/models/xgb_cls_features_pruned.txt
  python scripts/prune_correlated.py reg --correlation-threshold 0.97

The script loads the training split (same split used during training), computes
Pearson correlations between features, removes one feature from each highly
correlated pair (keep the higher-gain feature from the latest run), and writes a
new feature list. A JSON summary is emitted alongside the output file.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Iterable, List, Tuple

import numpy as np
import pandas as pd

# Import repo modules
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Force CSV fallback if parquet engines are unavailable
os.environ.setdefault("DATA_FORMAT", "csv")

from backend.ml.features import build_features
from backend.ml.splits import time_split

MODELS_DIR = Path("backend/models")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prune highly correlated features")
    parser.add_argument("model", choices=["cls", "reg"], help="Model type to prune")
    parser.add_argument(
        "--feature-list",
        help="Source feature list to prune (default: current xgb_<model>_features.txt)",
    )
    parser.add_argument(
        "--importance-csv",
        help="CSV file with feature_importances (default: latest run)",
    )
    parser.add_argument(
        "--correlation-threshold",
        type=float,
        default=0.97,
        help="Absolute correlation threshold for pruning",
    )
    parser.add_argument(
        "--out-file",
        help="Output file for pruned feature list (default: xgb_<model>_features_pruned_corr.txt)",
    )
    return parser.parse_args()


def load_feature_list(model: str, feature_file: Path | None) -> List[str]:
    if feature_file is None:
        feature_file = MODELS_DIR / f"xgb_{model}_features.txt"
    if not feature_file.exists():
        raise FileNotFoundError(f"Feature list not found: {feature_file}")
    features = [line.strip() for line in feature_file.read_text().splitlines() if line.strip()]
    if not features:
        raise ValueError(f"Feature list {feature_file} is empty")
    return features


def find_latest_importance_csv(model: str) -> Path:
    runs_dir = MODELS_DIR / f"xgb_{model}_runs"
    if not runs_dir.exists():
        raise FileNotFoundError(f"Run directory not found: {runs_dir}")
    candidates = sorted([p for p in runs_dir.iterdir() if p.is_dir()], key=lambda p: p.name)
    if not candidates:
        raise FileNotFoundError(f"No runs found in {runs_dir}")
    csv_path = candidates[-1] / "feature_importances.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"feature_importances.csv missing in {csv_path.parent}")
    return csv_path


def load_importance_order(csv_path: Path) -> List[str]:
    df = pd.read_csv(csv_path)
    if "feature" not in df.columns or "gain" not in df.columns:
        raise ValueError(f"Unexpected importance schema in {csv_path}")
    df_sorted = df.sort_values("gain", ascending=False)
    return df_sorted["feature"].tolist()


def compute_correlations(df: pd.DataFrame, features: List[str]) -> pd.DataFrame:
    subset = df.loc[:, features].copy()
    subset = subset.fillna(0.0)  # safe default; features should already be clean
    corr = subset.corr(method="pearson").abs()
    return corr


def prune_correlated_features(
    corr: pd.DataFrame,
    importance_order: List[str],
    threshold: float,
) -> List[str]:
    keep = set(importance_order)  # start with everything
    order_index = {feature: idx for idx, feature in enumerate(importance_order)}
    features = corr.columns.tolist()

    removed = set()
    for i, feat_a in enumerate(features):
        if feat_a not in keep:
            continue
        for feat_b in features[i + 1 :]:
            if feat_b not in keep:
                continue
            if corr.loc[feat_a, feat_b] >= threshold:
                # Remove the less important feature
                if order_index.get(feat_a, 0) <= order_index.get(feat_b, 0):
                    keep.discard(feat_b)
                    removed.add(feat_b)
                else:
                    keep.discard(feat_a)
                    removed.add(feat_a)
                    break  # feat_a removed; go to next feature
    return [f for f in importance_order if f in keep and f in corr.columns]


def main() -> None:
    args = parse_args()

    features = load_feature_list(args.model, Path(args.feature_list) if args.feature_list else None)
    importance_csv = Path(args.importance_csv) if args.importance_csv else find_latest_importance_csv(args.model)
    importance_order = load_importance_order(importance_csv)

    # Build training split and compute correlations
    games, X_cols = build_features(ratings_kind="elo")  # features unaffected by ratings kind for structure
    train, _, _ = time_split(games)
    available = [f for f in features if f in train.columns]
    missing = [f for f in features if f not in train.columns]
    if missing:
        print(f"[prune-corr] WARNING: {len(missing)} features missing from training data and will be dropped.")
    corr = compute_correlations(train, available)

    pruned = prune_correlated_features(corr, importance_order, args.correlation_threshold)
    pruned = [f for f in pruned if f in available]

    out_file = Path(args.out_file) if args.out_file else MODELS_DIR / f"xgb_{args.model}_features_pruned_corr.txt"
    out_file.write_text("\n".join(pruned))

    summary = {
        "model": args.model,
        "feature_source": args.feature_list,
        "importance_csv": str(importance_csv),
        "baseline_count": len(features),
        "available_count": len(available),
        "missing_count": len(missing),
        "kept_count": len(pruned),
        "removed_count": len(features) - len(pruned),
        "correlation_threshold": args.correlation_threshold,
        "output_file": str(out_file),
    }
    out_file.with_suffix(out_file.suffix + ".json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
