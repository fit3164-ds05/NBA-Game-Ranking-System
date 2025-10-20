#!/usr/bin/env python3
"""Walk-forward cross-validation for XGBoost models.

Evaluates year-by-year folds: train on years < Y, validate on year == Y.
Outputs averaged metrics and per-year breakdown under backend/models/.

Usage:
  python scripts/walk_forward_eval.py cls [elo|glicko|trueskill]
  python scripts/walk_forward_eval.py reg [elo|glicko|trueskill]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from xgboost import XGBClassifier, XGBRegressor

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.metrics import accuracy_score, roc_auc_score, mean_absolute_error, mean_squared_error

OUT_DIR = Path("backend/models"); OUT_DIR.mkdir(parents=True, exist_ok=True)


def years_from_df(df):
    ys = sorted(int(y) for y in df["YEAR"].dropna().unique())
    # Require at least one prior year for training
    return [y for y in ys if any(df["YEAR"] < y)]


def eval_cls(games, X_cols, ratings_kind, feature_source):
    per_year = []
    model = XGBClassifier(
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
    for y in years_from_df(games):
        tr = games[games["YEAR"] < y]
        va = games[games["YEAR"] == y]
        if tr.empty or va.empty:
            continue
        y_tr = tr["y_cls"].astype(int).values
        y_va = va["y_cls"].astype(int).values
        model.fit(tr[X_cols], y_tr, eval_set=[(va[X_cols], y_va)], verbose=False)
        p = model.predict_proba(va[X_cols])[:, 1]
        yhat = (p >= 0.5).astype(int)
        acc = float(accuracy_score(y_va, yhat))
        # Handle folds where validation has a single class (AUC undefined)
        auc_val = None
        try:
            if len(np.unique(y_va)) >= 2:
                auc_val = float(roc_auc_score(y_va, p))
        except Exception:
            auc_val = None
        rec = {"year": int(y), "acc": acc, "n": int(va.shape[0])}
        if auc_val is not None:
            rec["auc"] = auc_val
        per_year.append(rec)

    if not per_year:
        return {"error": "No valid folds"}
    accs = [r["acc"] for r in per_year]
    aucs = [r.get("auc") for r in per_year if r.get("auc") is not None]
    out = {
        "ratings_kind": ratings_kind,
        "feature_source": feature_source,
        "folds": per_year,
        "summary": {
            "mean_acc": float(np.mean(accs)) if accs else None,
            "mean_auc": float(np.mean(aucs)) if aucs else None,
            "folds": len(per_year),
            "auc_folds": len(aucs),
        },
    }
    (OUT_DIR / "xgb_cls_walkcv.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out["summary"], indent=2))


def eval_reg(games, X_cols, ratings_kind, feature_source):
    per_year = []
    model = XGBRegressor(
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
    for y in years_from_df(games):
        tr = games[(games["YEAR"] < y) & games["y_reg"].notna()]
        va = games[(games["YEAR"] == y) & games["y_reg"].notna()]
        if tr.empty or va.empty:
            continue
        model.fit(tr[X_cols], tr["y_reg"].values, eval_set=[(va[X_cols], va["y_reg"].values)], verbose=False)
        mu = model.predict(va[X_cols])
        rmse = float(np.sqrt(mean_squared_error(va["y_reg"].values, mu)))
        mae = float(mean_absolute_error(va["y_reg"].values, mu))
        per_year.append({"year": int(y), "rmse": rmse, "mae": mae, "n": int(va.shape[0])})

    if not per_year:
        return {"error": "No valid folds"}
    rmses = [r["rmse"] for r in per_year]
    maes = [r["mae"] for r in per_year]
    out = {
        "ratings_kind": ratings_kind,
        "feature_source": feature_source,
        "folds": per_year,
        "summary": {"mean_rmse": float(np.mean(rmses)), "mean_mae": float(np.mean(maes)), "folds": len(per_year)},
    }
    (OUT_DIR / "xgb_reg_walkcv.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out["summary"], indent=2))


def main():
    task = sys.argv[1] if len(sys.argv) > 1 else "cls"
    rk = sys.argv[2] if len(sys.argv) > 2 else "elo"
    fs = sys.argv[3] if len(sys.argv) > 3 else "metrics"
    games, X_cols = build_features(ratings_kind=rk, feature_source=fs)
    if task == "cls":
        eval_cls(games, X_cols, rk, fs)
    else:
        eval_reg(games, X_cols, rk, fs)


if __name__ == "__main__":
    main()
