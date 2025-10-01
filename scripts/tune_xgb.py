#!/usr/bin/env python3
"""Optuna tuner for XGBoost models with feature-group toggles."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set

import numpy as np
import optuna
from sklearn.metrics import mean_squared_error, roc_auc_score
from xgboost import XGBClassifier, XGBRegressor

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.feature_groups import build_feature_groups
from backend.ml.splits import time_split

OUT_DIR = Path("backend/models")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Force CSV fallback so tuning works without optional parquet deps
os.environ.setdefault("DATA_FORMAT", "csv")


def suggest_params(trial: optuna.trial.Trial) -> Dict[str, float]:
    return {
        "max_depth": trial.suggest_int("max_depth", 3, 6),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 12),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "colsample_bynode": trial.suggest_float("colsample_bynode", 0.5, 1.0),
        "gamma": trial.suggest_float("gamma", 0.0, 2.0),
        "eta": trial.suggest_float("eta", 0.02, 0.12),
        "n_estimators": trial.suggest_int("n_estimators", 400, 1600),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 5.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.5, 5.0),
    }


def load_feature_list(model: str) -> List[str] | None:
    path = OUT_DIR / f"xgb_{model}_features.txt"
    if not path.exists():
        return None
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def prepare_groups(features: List[str]):
    groups, feature_to_group = build_feature_groups(features)
    mandatory = {g for g in ("static", "other") if g in groups}
    optional = sorted(g for g in groups if g not in mandatory)
    return groups, feature_to_group, mandatory, optional


def tune_cls(ratings_kind: str = "elo", n_trials: int = 50):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    baseline = load_feature_list("cls")
    if baseline:
        X_cols = [f for f in X_cols if f in baseline]

    train, valid, _ = time_split(games)
    y_tr = train["y_cls"].astype(int).values
    y_va = valid["y_cls"].astype(int).values

    groups, feature_to_group, mandatory, optional = prepare_groups(X_cols)
    X_tr_all, X_va_all = train[X_cols], valid[X_cols]

    def objective(trial: optuna.trial.Trial):
        params = suggest_params(trial)
        selected: Set[str] = set(mandatory)
        for group in optional:
            if trial.suggest_categorical(f"group_{group}", [True, False]):
                selected.add(group)

        selected_features = [f for f in X_cols if feature_to_group.get(f) in selected]
        if len(selected_features) < 5:
            raise optuna.TrialPruned("Too few features selected")

        model_params = params.copy()
        model_params["learning_rate"] = model_params.pop("eta")
        model = XGBClassifier(
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            random_state=42,
            n_jobs=8,
            **model_params,
        )
        model.fit(
            X_tr_all[selected_features],
            y_tr,
            eval_set=[(X_va_all[selected_features], y_va)],
            verbose=False,
        )
        p = model.predict_proba(X_va_all[selected_features])[:, 1]
        auc = float(roc_auc_score(y_va, p))
        trial.set_user_attr("selected_groups", sorted(selected))
        trial.set_user_attr("feature_count", len(selected_features))
        return auc

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials)

    best = study.best_trial
    best_params = {k: v for k, v in best.params.items() if not k.startswith("group_")}
    if "eta" in best_params:
        best_params["learning_rate"] = best_params.pop("eta")
    (OUT_DIR / "xgb_cls_best_params.json").write_text(json.dumps(best_params, indent=2))

    selected_groups = set(mandatory)
    for group in optional:
        if best.params.get(f"group_{group}"):
            selected_groups.add(group)

    groups_payload = {
        "selected_groups": sorted(selected_groups),
        "mandatory_groups": sorted(mandatory),
        "optional_groups": optional,
        "feature_count": best.user_attrs.get("feature_count"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    (OUT_DIR / "xgb_cls_best_groups.json").write_text(json.dumps(groups_payload, indent=2))

    print(json.dumps({
        "params": best_params,
        "selected_groups": sorted(selected_groups),
        "feature_count": best.user_attrs.get("feature_count"),
    }, indent=2))


def tune_reg(ratings_kind: str = "elo", n_trials: int = 50):
    games, X_cols = build_features(ratings_kind=ratings_kind)
    games = games.dropna(subset=["y_reg"]).copy()
    baseline = load_feature_list("reg")
    if baseline:
        X_cols = [f for f in X_cols if f in baseline]

    train, valid, _ = time_split(games)
    y_tr = train["y_reg"].values
    y_va = valid["y_reg"].values

    groups, feature_to_group, mandatory, optional = prepare_groups(X_cols)
    X_tr_all, X_va_all = train[X_cols], valid[X_cols]

    def objective(trial: optuna.trial.Trial):
        params = suggest_params(trial)
        selected: Set[str] = set(mandatory)
        for group in optional:
            if trial.suggest_categorical(f"group_{group}", [True, False]):
                selected.add(group)

        selected_features = [f for f in X_cols if feature_to_group.get(f) in selected]
        if len(selected_features) < 5:
            raise optuna.TrialPruned("Too few features selected")

        model_params = params.copy()
        model_params["learning_rate"] = model_params.pop("eta")
        model = XGBRegressor(
            objective="reg:squarederror",
            tree_method="hist",
            random_state=42,
            n_jobs=8,
            **model_params,
        )
        model.fit(
            X_tr_all[selected_features],
            y_tr,
            eval_set=[(X_va_all[selected_features], y_va)],
            verbose=False,
        )
        mu = model.predict(X_va_all[selected_features])
        rmse = float(np.sqrt(mean_squared_error(y_va, mu)))
        trial.set_user_attr("selected_groups", sorted(selected))
        trial.set_user_attr("feature_count", len(selected_features))
        return rmse

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials)

    best = study.best_trial
    best_params = {k: v for k, v in best.params.items() if not k.startswith("group_")}
    if "eta" in best_params:
        best_params["learning_rate"] = best_params.pop("eta")
    (OUT_DIR / "xgb_reg_best_params.json").write_text(json.dumps(best_params, indent=2))

    selected_groups = set(mandatory)
    for group in optional:
        if best.params.get(f"group_{group}"):
            selected_groups.add(group)

    groups_payload = {
        "selected_groups": sorted(selected_groups),
        "mandatory_groups": sorted(mandatory),
        "optional_groups": optional,
        "feature_count": best.user_attrs.get("feature_count"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    (OUT_DIR / "xgb_reg_best_groups.json").write_text(json.dumps(groups_payload, indent=2))

    print(json.dumps({
        "params": best_params,
        "selected_groups": sorted(selected_groups),
        "feature_count": best.user_attrs.get("feature_count"),
    }, indent=2))


if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else "cls"
    rk = sys.argv[2] if len(sys.argv) > 2 else "elo"
    if task == "cls":
        tune_cls(ratings_kind=rk)
    else:
        tune_reg(ratings_kind=rk)
