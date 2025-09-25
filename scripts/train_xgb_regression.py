#!/usr/bin/env python3
"""Train XGBoost regression model for home margin and calibrate σ.

Outputs (per run):
  • `backend/models/xgb_reg_margin.joblib`
  • `backend/models/xgb_reg_features.txt`
  • `backend/models/xgb_reg_calibration.json`
  • Diagnostics artefacts under
    `backend/models/xgb_reg_runs/<timestamp>/` (eval curves, feature importances,
    predictions, metrics) to support model interpretability and overfitting checks.
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
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

# Ensure repo root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.features import build_features
from backend.ml.splits import time_split

DEFAULT_OUT_DIR = Path("backend/models")


def prepare_run_dirs(base_dir: Path) -> tuple[Path, Path]:
    """Return (models_dir, run_dir) ensuring both exist."""

    models_dir = base_dir
    models_dir.mkdir(parents=True, exist_ok=True)

    diag_root = models_dir / "xgb_reg_runs"
    diag_root.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    run_dir = diag_root / ts
    run_dir.mkdir(parents=True, exist_ok=False)
    return models_dir, run_dir

BUCKETS = [(0, 5), (5, 10), (10, 20), (20, 999)]


def pick_bucket(abs_mu: float) -> str:
    for lo, hi in BUCKETS:
        if lo <= abs_mu < hi:
            return f"{lo}-{hi}"
    return "other"


def dump_feature_importance(model: XGBRegressor, feature_names: list[str], out_csv: Path) -> None:
    booster = model.get_booster()
    scores = {}
    for importance_type in ("gain", "weight", "cover"):
        raw = booster.get_score(importance_type=importance_type)
        # Ensure every feature is represented for easier downstream parsing
        scores[importance_type] = {fn: float(raw.get(fn, 0.0)) for fn in feature_names}

    rows = []
    for fn in feature_names:
        rows.append({
            "feature": fn,
            "gain": scores["gain"][fn],
            "weight": scores["weight"][fn],
            "cover": scores["cover"][fn],
        })
    df = pd.DataFrame(rows)
    df.sort_values("gain", ascending=False).to_csv(out_csv, index=False)


def dump_predictions(model: XGBRegressor, X: pd.DataFrame, y: np.ndarray, split: str, run_dir: Path, best_ntree_limit: int | None) -> dict:
    kwargs = {"ntree_limit": best_ntree_limit} if best_ntree_limit else {}
    mu = model.predict(X, **kwargs)
    df = pd.DataFrame({
        "actual": y,
        "pred": mu,
        "residual": y - mu,
    }, index=X.index)
    df.to_parquet(run_dir / f"predictions_{split}.parquet")
    rmse = float(np.sqrt(mean_squared_error(y, mu)))
    mae = float(mean_absolute_error(y, mu))
    return {"rmse": rmse, "mae": mae}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train XGBoost regression model (margin)")
    parser.add_argument("ratings_kind", nargs="?", default="elo", help="Ratings source (elo|glicko|trueskill)")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Directory for trained models and artefacts")
    parser.add_argument("--early-stopping-rounds", type=int, default=75, help="Rounds with no improvement before stopping")
    parser.add_argument("--verbosity", type=int, default=0, help="XGBoost training verbosity (0=silent)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    ratings_kind = args.ratings_kind
    models_dir, run_dir = prepare_run_dirs(Path(args.out_dir))

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
    best_path = models_dir / "xgb_reg_best_params.json"
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
    eval_set = [(Xtr, ytr), (Xva, yva)]
    fit_kwargs = dict(eval_set=eval_set, verbose=args.verbosity)
    if args.early_stopping_rounds and args.early_stopping_rounds > 0:
        fit_kwargs["early_stopping_rounds"] = args.early_stopping_rounds

    model.fit(Xtr, ytr, **fit_kwargs)

    best_ntree_limit = getattr(model, "best_ntree_limit", None)
    best_iteration = getattr(model, "best_iteration", None)
    if best_iteration is None:
        booster = model.get_booster()
        best_iteration = getattr(booster, "best_iteration", None)
    if best_ntree_limit is None and best_iteration is not None:
        best_ntree_limit = best_iteration + 1
    evals_result = model.evals_result()
    (run_dir / "eval_history.json").write_text(json.dumps(evals_result, indent=2))

    metrics_train = dump_predictions(model, Xtr, ytr, "train", run_dir, best_ntree_limit)
    metrics_valid = dump_predictions(model, Xva, yva, "valid", run_dir, best_ntree_limit)
    metrics_test = dump_predictions(model, Xte, yte, "test", run_dir, best_ntree_limit)

    # Sigma calibration on validation residuals
    mu_va = pd.read_parquet(run_dir / "predictions_valid.parquet")
    res_va = mu_va["residual"].to_numpy()
    sigma_global = float(np.std(res_va, ddof=1))

    sigmas_bucket: dict[str, float] = {}
    abs_mu = np.abs(mu_va["pred"].to_numpy())
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
            "train": metrics_train,
            "valid": metrics_valid,
            "test": metrics_test,
        },
        "model": {
            "best_iteration": int(best_iteration) if best_iteration is not None else None,
            "best_ntree_limit": int(best_ntree_limit) if best_ntree_limit is not None else None,
            "params": base_params,
        },
        "run_dir": str(run_dir),
    }

    # Save artefacts
    dump_feature_importance(model, X_cols, run_dir / "feature_importances.csv")

    joblib.dump(model, models_dir / "xgb_reg_margin.joblib")
    (models_dir / "xgb_reg_features.txt").write_text("\n".join(X_cols))
    (models_dir / "xgb_reg_calibration.json").write_text(json.dumps(calib, indent=2))

    (run_dir / "calibration.json").write_text(json.dumps(calib, indent=2))
    summary = {
        "train": metrics_train,
        "valid": metrics_valid,
        "test": metrics_test,
        "best_iteration": calib["model"]["best_iteration"],
        "best_ntree_limit": calib["model"]["best_ntree_limit"],
        "run_dir": str(run_dir),
    }

    print(json.dumps(summary, indent=2))
    print("Use Phi(mu/sigma) for win prob, bucketed sigma if available.")


if __name__ == "__main__":
    main()
