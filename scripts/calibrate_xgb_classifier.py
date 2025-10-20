#!/usr/bin/env python3
"""Derive calibration table for the XGBoost classifier.

Outputs backend/models/xgb_cls_calibration.json containing per-probability-bin
empirical win rates and 68% confidence intervals using a Wilson-style formula.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import joblib
import argparse

# Ensure repo root in sys.path
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.metrics import accuracy_score
from backend.ml.splits import time_split

MODELS_DIR = ROOT / "backend" / "models"
MODEL_PATH = MODELS_DIR / "xgb_cls_winprob.joblib"
FEATURES_PATH = MODELS_DIR / "xgb_cls_features.txt"
OUT_PATH = MODELS_DIR / "xgb_cls_calibration.json"


def wilson_interval(p_hat: float, n: int, z: float = 1.0) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    denom = 1 + z**2 / n
    centre = p_hat + z**2 / (2 * n)
    half_width = z * np.sqrt((p_hat * (1 - p_hat) + z**2 / (4 * n)) / n)
    lower = max(0.0, (centre - half_width) / denom)
    upper = min(1.0, (centre + half_width) / denom)
    return float(lower), float(upper)


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate XGBoost classifier probabilities.")
    parser.add_argument("--ratings-kind", default="elo", help="Ratings source used during training")
    parser.add_argument(
        "--feature-source",
        choices=["metrics", "ratings"],
        default="metrics",
        help="Feature family to rebuild for calibration",
    )
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Classifier model not found at {MODEL_PATH}")
    feats = [line.strip() for line in FEATURES_PATH.read_text().splitlines() if line.strip()]

    print("[calibrate] building feature matrix…")
    games, _ = build_features(ratings_kind=args.ratings_kind, feature_source=args.feature_source)
    _, valid_df, test_df = time_split(games)
    calib_df = pd.concat([valid_df, test_df], ignore_index=True)

    y = calib_df["y_cls"].astype(int).values
    X = calib_df[feats]

    print("[calibrate] loading classifier…")
    model = joblib.load(MODEL_PATH)
    probs = model.predict_proba(X)[:, 1]

    df = pd.DataFrame({
        "prob": probs,
        "actual": y,
    })

    bins = np.linspace(0.0, 1.0, 11)
    df["bin"] = pd.cut(df["prob"], bins=bins, include_lowest=True)

    records = []
    running = []
    for interval, group in df.groupby("bin", observed=True):
        count = int(group.shape[0])
        successes = int(group["actual"].sum())
        p_hat = successes / count if count else 0.0
        lower, upper = wilson_interval(p_hat, count, z=1.0)
        low_edge = float(interval.left)
        high_edge = float(interval.right)
        mean_prob = float(group["prob"].mean()) if count else float(np.mean([low_edge, high_edge]))
        record = {
            "low": low_edge,
            "high": high_edge,
            "count": count,
            "successes": successes,
            "empirical_rate": float(p_hat),
            "mean_prob": mean_prob,
            "lower_68": lower,
            "upper_68": upper,
        }
        records.append(record)
        running.append((group["prob"], group["actual"]))

    overall_acc = float(accuracy_score(y, (probs >= 0.5).astype(int)))

    payload = {
        "model": str(MODEL_PATH.name),
        "feature_file": str(FEATURES_PATH.name),
        "bins": records,
        "overall_accuracy": overall_acc,
        "feature_source": args.feature_source,
        "ratings_kind": args.ratings_kind,
        "notes": "Wilson 68% intervals computed on validation+test split",
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"[calibrate] wrote calibration table with {len(records)} bins to {OUT_PATH}")


if __name__ == "__main__":
    main()
