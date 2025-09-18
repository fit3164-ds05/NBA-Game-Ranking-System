"""Inference helpers for trained XGBoost models.

Provides:
  - predict_winprob_xgb: classification model → P(home win)
  - predict_margin_and_prob_xgb: regression model → (margin, P(home win)) via calibrated σ
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np

MODELS_DIR = Path("backend/models")


def _load_features(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def _phi(x: np.ndarray | float) -> np.ndarray | float:
    """Standard normal CDF without SciPy: Phi(x) = 0.5 * [1 + erf(x / sqrt(2))]."""
    if isinstance(x, np.ndarray):
        return 0.5 * (1.0 + np.vectorize(math.erf)(x / math.sqrt(2.0)))
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def predict_winprob_xgb(game_row: Dict) -> float:
    """Predict home win probability using classification model.

    game_row: mapping of feature name → value; must include same features used in training.
    """
    model = joblib.load(MODELS_DIR / "xgb_cls_winprob.joblib")
    feats = _load_features(MODELS_DIR / "xgb_cls_features.txt")
    # Ensure critical feature rating_diff is present
    if "rating_diff" not in game_row or game_row.get("rating_diff") is None:
        raise ValueError("rating_diff missing; cannot predict without pre-game ratings for both teams on this date")
    X = np.array([[game_row.get(f, 0.0) for f in feats]], dtype=float)
    p = model.predict_proba(X)[0, 1]
    return float(p)


def _pick_bucket(abs_mu: float, buckets: list[list[int]]) -> str:
    for lo, hi in buckets:
        if lo <= abs_mu < hi:
            return f"{lo}-{hi}"
    return "other"


def predict_margin_and_prob_xgb(game_row: Dict) -> Tuple[float, float]:
    """Predict home margin and derive win probability using calibrated σ.

    Uses bucketed σ if available; otherwise falls back to global σ.
    """
    model = joblib.load(MODELS_DIR / "xgb_reg_margin.joblib")
    feats = _load_features(MODELS_DIR / "xgb_reg_features.txt")
    calib = json.loads((MODELS_DIR / "xgb_reg_calibration.json").read_text())

    if "rating_diff" not in game_row or game_row.get("rating_diff") is None:
        raise ValueError("rating_diff missing; cannot predict without pre-game ratings for both teams on this date")
    X = np.array([[game_row.get(f, 0.0) for f in feats]], dtype=float)
    mu = float(model.predict(X)[0])

    buckets = calib.get("buckets", [])
    sigma_map = calib.get("sigma_bucketed", {})
    sigma = calib.get("sigma_global", 12.0)
    if buckets and sigma_map:
        key = _pick_bucket(abs(mu), buckets)
        sigma = float(sigma_map.get(key, sigma))

    # P(home win) = Phi(mu / sigma)
    p = float(_phi(mu / sigma))
    return mu, p
