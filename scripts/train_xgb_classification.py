#!/usr/bin/env python3
"""Train XGBoost classification model for home win probability.

Outputs (per run):
  • `backend/models/xgb_cls_winprob.joblib`
  • `backend/models/xgb_cls_features.txt`
  • `backend/models/xgb_cls_metrics.json`
  • Diagnostics artefacts under `backend/models/xgb_cls_runs/<timestamp>/`
    (evaluation curves, feature importances, predictions) to monitor
    overfitting and aid explainability.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from xgboost import XGBClassifier

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split
from backend.ml.feature_groups import select_features_by_groups

DEFAULT_OUT_DIR = Path("backend/models")


def prepare_run_dirs(base_dir: Path) -> tuple[Path, Path]:
    """Return (models_dir, run_dir) ensuring both exist."""

    models_dir = base_dir
    models_dir.mkdir(parents=True, exist_ok=True)

    diag_root = models_dir / "xgb_cls_runs"
    diag_root.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    run_dir = diag_root / ts
    run_dir.mkdir(parents=True, exist_ok=False)
    return models_dir, run_dir


def _load_best_params(models_dir: Path) -> dict | None:
    """Load tuned parameters, mapping `eta` to `learning_rate` if needed."""

    path = models_dir / "xgb_cls_best_params.json"
    if not path.exists():
        return None
    try:
        best = json.loads(path.read_text())
        if "eta" in best and "learning_rate" not in best:
            best["learning_rate"] = best.pop("eta")
        return best
    except Exception:
        return None


def dump_feature_importance(model: XGBClassifier, feature_names: list[str], out_csv: Path) -> None:
    booster = model.get_booster()
    gain = booster.get_score(importance_type="gain")
    weight = booster.get_score(importance_type="weight")
    cover = booster.get_score(importance_type="cover")

    rows = []
    for fn in feature_names:
        rows.append({
            "feature": fn,
            "gain": float(gain.get(fn, 0.0)),
            "weight": float(weight.get(fn, 0.0)),
            "cover": float(cover.get(fn, 0.0)),
        })
    pd.DataFrame(rows).sort_values("gain", ascending=False).to_csv(out_csv, index=False)


def dump_predictions(
    model: XGBClassifier,
    X: pd.DataFrame,
    y: np.ndarray,
    split: str,
    run_dir: Path,
    best_ntree_limit: int | None,
) -> dict:
    kwargs = {"ntree_limit": best_ntree_limit} if best_ntree_limit else {}
    proba = model.predict_proba(X, **kwargs)[:, 1]
    yhat = (proba >= 0.5).astype(int)
    df = pd.DataFrame({
        "actual": y,
        "pred": yhat,
        "prob": proba,
    }, index=X.index)
    df.to_parquet(run_dir / f"predictions_{split}.parquet")

    metrics = {
        "acc": float(accuracy_score(y, yhat)),
        "auc": float(roc_auc_score(y, proba)) if len(np.unique(y)) >= 2 else None,
        "logloss": float(log_loss(y, proba)) if len(np.unique(y)) >= 2 else None,
    }
    return metrics


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train XGBoost classifier (home win probability)")
    parser.add_argument("ratings_kind", nargs="?", default="elo", help="Ratings source (elo|glicko|trueskill)")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Directory for trained models and artefacts")
    parser.add_argument("--early-stopping-rounds", type=int, default=75, help="Rounds without validation improvement before stopping")
    parser.add_argument("--verbosity", type=int, default=0, help="XGBoost training verbosity (0=silent)")
    parser.add_argument(
        "--feature-list",
        help="Optional newline-delimited file listing features to keep (others will be dropped)",
    )
    parser.add_argument(
        "--groups-file",
        help="Optional JSON file describing selected feature groups",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    ratings_kind = args.ratings_kind
    models_dir, run_dir = prepare_run_dirs(Path(args.out_dir))

    games, X_cols = build_features(ratings_kind=ratings_kind)
    feature_filter: list[str] | None = None
    if args.feature_list:
        feature_path = Path(args.feature_list)
        if not feature_path.exists():
            raise FileNotFoundError(f"Feature list not found: {feature_path}")
        feature_filter = [line.strip() for line in feature_path.read_text().splitlines() if line.strip()]
        missing = [f for f in feature_filter if f not in X_cols]
        if missing:
            print(f"[train-cls] WARNING: {len(missing)} requested features not found in dataset and will be ignored.")
        X_cols = [f for f in X_cols if feature_filter is None or f in feature_filter]
        if not X_cols:
            raise ValueError("Feature list intersection is empty; nothing to train on.")
    train, valid, test = time_split(games)
    y_tr = train["y_cls"].astype(int).values
    y_va = valid["y_cls"].astype(int).values
    y_te = test["y_cls"].astype(int).values

    selected_groups_meta = None
    if args.groups_file:
        group_path = Path(args.groups_file)
        if not group_path.exists():
            raise FileNotFoundError(f"Groups file not found: {group_path}")
        groups_config = json.loads(group_path.read_text())
        requested_groups = groups_config.get("selected_groups")
        X_cols, groups_map, feature_to_group, final_groups = select_features_by_groups(X_cols, requested_groups)
        selected_groups_meta = {
            "source": str(group_path),
            "requested": requested_groups,
            "selected": final_groups,
            "available_groups": sorted(groups_map.keys()),
        }

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
    best = _load_best_params(models_dir)
    if best:
        print(f"[train-cls] Using tuned params from {models_dir/'xgb_cls_best_params.json'}")
        base_params.update(best)

    model = XGBClassifier(**base_params)
    fit_kwargs = dict(eval_set=[(X_tr, y_tr), (X_va, y_va)], verbose=args.verbosity)
    early_stop_used = False
    if args.early_stopping_rounds and args.early_stopping_rounds > 0:
        fit_kwargs["early_stopping_rounds"] = args.early_stopping_rounds

    try:
        model.fit(X_tr, y_tr, **fit_kwargs)
        early_stop_used = bool(fit_kwargs.get("early_stopping_rounds"))
    except TypeError:
        if fit_kwargs.pop("early_stopping_rounds", None) is not None:
            print("[train-cls] WARNING: installed xgboost does not support early_stopping_rounds; training without early stopping.")
        model.fit(X_tr, y_tr, **fit_kwargs)
        early_stop_used = False

    best_ntree_limit = getattr(model, "best_ntree_limit", None)
    best_iteration = getattr(model, "best_iteration", None)
    if best_iteration is None:
        booster = model.get_booster()
        best_iteration = getattr(booster, "best_iteration", None)
    if not early_stop_used:
        best_iteration = None
        best_ntree_limit = None
    if best_ntree_limit is None and best_iteration is not None:
        best_ntree_limit = best_iteration + 1
    evals_result = model.evals_result()
    (run_dir / "eval_history.json").write_text(json.dumps(evals_result, indent=2))

    metrics_train = dump_predictions(model, X_tr, y_tr, "train", run_dir, best_ntree_limit)
    metrics_valid = dump_predictions(model, X_va, y_va, "valid", run_dir, best_ntree_limit)
    metrics_test = dump_predictions(model, X_te, y_te, "test", run_dir, best_ntree_limit)

    dump_feature_importance(model, X_cols, run_dir / "feature_importances.csv")

    metrics = {
        "train": metrics_train,
        "valid": metrics_valid,
        "test": metrics_test,
        "features": X_cols,
        "ratings_kind": ratings_kind,
        "model": {
            "best_iteration": int(best_iteration) if best_iteration is not None else None,
            "best_ntree_limit": int(best_ntree_limit) if best_ntree_limit is not None else None,
            "params": base_params,
        },
        "run_dir": str(run_dir),
        "feature_source": args.feature_list,
        "feature_groups": selected_groups_meta,
    }

    (models_dir / "xgb_cls_features.txt").write_text("\n".join(X_cols))
    joblib.dump(model, models_dir / "xgb_cls_winprob.joblib")
    (models_dir / "xgb_cls_metrics.json").write_text(json.dumps(metrics, indent=2))

    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))

    summary = {
        "train": metrics_train,
        "valid": metrics_valid,
        "test": metrics_test,
        "best_iteration": metrics["model"]["best_iteration"],
        "best_ntree_limit": metrics["model"]["best_ntree_limit"],
        "run_dir": str(run_dir),
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
