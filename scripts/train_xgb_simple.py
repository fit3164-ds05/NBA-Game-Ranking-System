#!/usr/bin/env python3
"""Train a simplified XGBoost classifier using top feature importances.

This script:
  1. Builds the full feature matrix via backend.ml.features.build_features.
  2. Trains an initial classifier to score feature importance.
  3. Keeps the top-K features (default 20) and trains a compact model.
  4. Saves the model and feature list under backend/models/.

Usage:
  python scripts/train_xgb_simple.py --top-k 20 --ratings-kind elo
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from xgboost import XGBClassifier

# Ensure repo root on sys.path
import sys
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split

OUT_DIR = ROOT / "backend" / "models"
SIMPLE_MODEL_PATH = OUT_DIR / "xgb_cls_simple.joblib"
SIMPLE_FEATURES_PATH = OUT_DIR / "xgb_cls_simple_features.txt"
METRICS_PATH = OUT_DIR / "xgb_cls_simple_metrics.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a compact XGBoost classifier with top features")
    parser.add_argument("--top-k", type=int, default=20, help="Number of top features to retain")
    parser.add_argument("--ratings-kind", default="elo", help="Ratings source (elo|glicko|trueskill)")
    parser.add_argument("--eta", type=float, default=0.1, help="Learning rate for compact model")
    parser.add_argument("--max-depth", type=int, default=4, help="Tree depth for compact model")
    return parser.parse_args()


def train_full_model(X_tr: pd.DataFrame, y_tr: np.ndarray) -> XGBClassifier:
    model = XGBClassifier(
        n_estimators=400,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.9,
        colsample_bytree=0.8,
        random_state=42,
        tree_method="hist",
        objective="binary:logistic",
        eval_metric="logloss",
    )
    model.fit(X_tr, y_tr)
    return model


def top_features_by_gain(model: XGBClassifier, feature_names: list[str], k: int) -> list[str]:
    booster = model.get_booster()
    gain = booster.get_score(importance_type="gain")
    ranked = sorted(feature_names, key=lambda f: gain.get(f, 0.0), reverse=True)
    return ranked[:k]


def train_compact_model(X_tr: pd.DataFrame, y_tr: np.ndarray, X_va: pd.DataFrame, y_va: np.ndarray, *, eta: float, max_depth: int) -> XGBClassifier:
    model = XGBClassifier(
        n_estimators=500,
        learning_rate=eta,
        max_depth=max_depth,
        subsample=0.95,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        reg_alpha=0.0,
        random_state=42,
        tree_method="hist",
        objective="binary:logistic",
        eval_metric="logloss",
    )
    model.fit(
        X_tr,
        y_tr,
        eval_set=[(X_tr, y_tr), (X_va, y_va)],
        verbose=False,
    )
    return model


def evaluate(model: XGBClassifier, X: pd.DataFrame, y: np.ndarray) -> dict:
    proba = model.predict_proba(X)[:, 1]
    preds = (proba >= 0.5).astype(int)
    metrics = {
        "acc": float(accuracy_score(y, preds)),
        "auc": float(roc_auc_score(y, proba)) if len(np.unique(y)) > 1 else None,
        "logloss": float(log_loss(y, proba)) if len(np.unique(y)) > 1 else None,
    }
    return metrics


def main() -> None:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    games, feature_names = build_features(ratings_kind=args.ratings_kind)
    train_df, valid_df, test_df = time_split(games)

    y_tr = train_df["y_cls"].astype(int).values
    y_va = valid_df["y_cls"].astype(int).values
    y_te = test_df["y_cls"].astype(int).values

    X_tr_full = train_df[feature_names]
    full_model = train_full_model(X_tr_full, y_tr)

    selected = top_features_by_gain(full_model, feature_names, args.top_k)
    if not selected:
        raise RuntimeError("Top feature selection returned an empty list")

    X_tr = train_df[selected]
    X_va = valid_df[selected]
    X_te = test_df[selected]

    compact = train_compact_model(
        X_tr,
        y_tr,
        X_va,
        y_va,
        eta=args.eta,
        max_depth=args.max_depth,
    )

    metrics = {
        "train": evaluate(compact, X_tr, y_tr),
        "valid": evaluate(compact, X_va, y_va),
        "test": evaluate(compact, X_te, y_te),
        "features": selected,
    }

    joblib.dump(compact, SIMPLE_MODEL_PATH)
    SIMPLE_FEATURES_PATH.write_text("\n".join(selected))
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(f"[simple-xgb] saved model to {SIMPLE_MODEL_PATH}")
    print(f"[simple-xgb] saved feature list to {SIMPLE_FEATURES_PATH}")
    print(f"[simple-xgb] metrics written to {METRICS_PATH}")


if __name__ == "__main__":
    main()
