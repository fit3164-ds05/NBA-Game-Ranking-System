#!/usr/bin/env python3
"""Train XGBoost classification model for home win probability.

Outputs:
  - backend/models/xgb_cls_winprob.joblib
  - backend/models/xgb_cls_features.txt
  - backend/models/xgb_cls_metrics.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, roc_auc_score
from xgboost import XGBClassifier

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split

OUT_DIR = Path("backend/models"); OUT_DIR.mkdir(parents=True, exist_ok=True)


def _load_best_params() -> dict | None:
    """Load best params from Optuna tuner if present.
    Maps 'eta' to 'learning_rate' for XGBClassifier API.
    """
    path = OUT_DIR / "xgb_cls_best_params.json"
    if not path.exists():
        return None
    try:
        best = json.loads(path.read_text())
        if "eta" in best and "learning_rate" not in best:
            best["learning_rate"] = best.pop("eta")
        return best
    except Exception:
        return None


def main(ratings_kind: str = "elo"):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    train, valid, test = time_split(games)
    y_tr = train["y_cls"].astype(int).values
    y_va = valid["y_cls"].astype(int).values
    y_te = test["y_cls"].astype(int).values
    X_tr, X_va, X_te = train[X_cols], valid[X_cols], test[X_cols]

    base_params = dict(
        n_estimators=900,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.9,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        reg_alpha=0.0,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
        n_jobs=8,
        tree_method="hist",
    )
    best = _load_best_params()
    if best:
        print(f"[train-cls] Using tuned params from {OUT_DIR/'xgb_cls_best_params.json'}")
        base_params.update(best)
    model = XGBClassifier(**base_params)
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)

    def eval_split(X, y):
        p = model.predict_proba(X)[:, 1]
        yhat = (p >= 0.5).astype(int)
        return float(accuracy_score(y, yhat)), float(roc_auc_score(y, p))

    metrics = {
        "train": dict(zip(["acc", "auc"], eval_split(X_tr, y_tr))),
        "valid": dict(zip(["acc", "auc"], eval_split(X_va, y_va))),
        "test": dict(zip(["acc", "auc"], eval_split(X_te, y_te))),
        "features": X_cols,
        "ratings_kind": ratings_kind,
    }
    (OUT_DIR / "xgb_cls_features.txt").write_text("\n".join(X_cols))
    joblib.dump(model, OUT_DIR / "xgb_cls_winprob.joblib")
    (OUT_DIR / "xgb_cls_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    rk = sys.argv[1] if len(sys.argv) > 1 else "elo"
    main(ratings_kind=rk)
