#!/usr/bin/env python3
"""Train XGBoost regression model for home margin and calibrate σ.

Outputs:
  - backend/models/xgb_reg_margin.joblib
  - backend/models/xgb_reg_features.txt
  - backend/models/xgb_reg_calibration.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split

OUT_DIR = Path("backend/models"); OUT_DIR.mkdir(parents=True, exist_ok=True)

BUCKETS = [(0, 5), (5, 10), (10, 20), (20, 999)]


def pick_bucket(abs_mu: float) -> str:
    for lo, hi in BUCKETS:
        if lo <= abs_mu < hi:
            return f"{lo}-{hi}"
    return "other"


def main(ratings_kind: str = "elo"):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    games = games.dropna(subset=["y_reg"]).copy()
    train, valid, test = time_split(games)
    ytr, yva, yte = train["y_reg"].values, valid["y_reg"].values, test["y_reg"].values
    Xtr, Xva, Xte = train[X_cols], valid[X_cols], test[X_cols]

    # Load tuned params if present
    base_params = dict(
        n_estimators=1200,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.9,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        reg_alpha=0.0,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=8,
        tree_method="hist",
    )
    best_path = OUT_DIR / "xgb_reg_best_params.json"
    if best_path.exists():
        try:
            best = json.loads(best_path.read_text())
            if "eta" in best and "learning_rate" not in best:
                best["learning_rate"] = best.pop("eta")
            print(f"[train-reg] Using tuned params from {best_path}")
            base_params.update(best)
        except Exception:
            pass
    model = XGBRegressor(**base_params)
    model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)

    def eval_reg(X, y):
        mu = model.predict(X)
        rmse = float(np.sqrt(mean_squared_error(y, mu)))
        mae = float(mean_absolute_error(y, mu))
        return mu, rmse, mae

    mu_tr, rmse_tr, mae_tr = eval_reg(Xtr, ytr)
    mu_va, rmse_va, mae_va = eval_reg(Xva, yva)
    mu_te, rmse_te, mae_te = eval_reg(Xte, yte)

    # Sigma calibration on validation residuals
    res_va = yva - mu_va
    sigma_global = float(np.std(res_va, ddof=1))

    sigmas_bucket: dict[str, float] = {}
    abs_mu = np.abs(mu_va)
    for lo, hi in BUCKETS:
        mask = (abs_mu >= lo) & (abs_mu < hi)
        if mask.sum() >= 50:  # need enough samples
            sigmas_bucket[f"{lo}-{hi}"] = float(np.std(res_va[mask], ddof=1))

    calib = {
        "sigma_global": sigma_global,
        "sigma_bucketed": sigmas_bucket,
        "buckets": BUCKETS,
        "ratings_kind": ratings_kind,
        "features": X_cols,
        "metrics": {
            "train": {"rmse": rmse_tr, "mae": mae_tr},
            "valid": {"rmse": rmse_va, "mae": mae_va},
            "test": {"rmse": rmse_te, "mae": mae_te},
        },
    }

    # Save
    joblib.dump(model, OUT_DIR / "xgb_reg_margin.joblib")
    (OUT_DIR / "xgb_reg_features.txt").write_text("\n".join(X_cols))
    (OUT_DIR / "xgb_reg_calibration.json").write_text(json.dumps(calib, indent=2))

    print(json.dumps(calib, indent=2))
    print("Use Phi(mu/sigma) for win prob, bucketed sigma if available.")


if __name__ == "__main__":
    rk = sys.argv[1] if len(sys.argv) > 1 else "elo"
    main(ratings_kind=rk)
