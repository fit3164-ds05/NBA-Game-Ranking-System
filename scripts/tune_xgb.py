#!/usr/bin/env python3
"""Small Optuna tuner for XGBoost models (classification or regression).

Usage:
  python scripts/tune_xgb.py cls [elo|glicko|trueskill]
  python scripts/tune_xgb.py reg [elo|glicko|trueskill]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import optuna
from sklearn.metrics import roc_auc_score, mean_squared_error
from xgboost import XGBClassifier, XGBRegressor

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split

OUT_DIR = Path("backend/models"); OUT_DIR.mkdir(parents=True, exist_ok=True)


def suggest_params(trial: optuna.trial.Trial):
    return {
        "max_depth": trial.suggest_int("max_depth", 3, 9),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 8),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "eta": trial.suggest_float("eta", 0.02, 0.15),
        "n_estimators": trial.suggest_int("n_estimators", 400, 1500),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 2.0),
    }


def tune_cls(ratings_kind: str = "elo", n_trials: int = 50):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    train, valid, _ = time_split(games)
    y_tr = train["y_cls"].astype(int).values
    y_va = valid["y_cls"].astype(int).values
    X_tr, X_va = train[X_cols], valid[X_cols]

    def objective(trial: optuna.trial.Trial):
        params = suggest_params(trial)
        model = XGBClassifier(
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            random_state=42,
            n_jobs=8,
            **params,
        )
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)
        p = model.predict_proba(X_va)[:, 1]
        auc = float(roc_auc_score(y_va, p))
        return auc

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials)
    best = study.best_params
    (OUT_DIR / "xgb_cls_best_params.json").write_text(json.dumps(best, indent=2))
    print(json.dumps(best, indent=2))


def tune_reg(ratings_kind: str = "elo", n_trials: int = 50):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    games = games.dropna(subset=["y_reg"]).copy()
    train, valid, _ = time_split(games)
    y_tr = train["y_reg"].values
    y_va = valid["y_reg"].values
    X_tr, X_va = train[X_cols], valid[X_cols]

    def objective(trial: optuna.trial.Trial):
        params = suggest_params(trial)
        model = XGBRegressor(
            objective="reg:squarederror",
            tree_method="hist",
            random_state=42,
            n_jobs=8,
            **params,
        )
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)
        mu = model.predict(X_va)
        rmse = float(np.sqrt(mean_squared_error(y_va, mu)))
        return rmse

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials)
    best = study.best_params
    (OUT_DIR / "xgb_reg_best_params.json").write_text(json.dumps(best, indent=2))
    print(json.dumps(best, indent=2))


if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else "cls"
    rk = sys.argv[2] if len(sys.argv) > 2 else "elo"
    if task == "cls":
        tune_cls(ratings_kind=rk)
    else:
        tune_reg(ratings_kind=rk)

