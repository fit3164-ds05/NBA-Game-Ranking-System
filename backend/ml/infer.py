"""Inference helpers for trained XGBoost models.

Provides:
  - predict_winprob_xgb: classification model → P(home win)
  - predict_margin_and_prob_xgb: regression model → (margin, P(home win), σ)
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, Tuple, List, Optional

import joblib
import numpy as np
import xgboost as xgb
from xgboost import XGBClassifier

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = (REPO_ROOT / "backend" / "models").resolve()
SIMPLE_MODEL_PATH = MODELS_DIR / "xgb_cls_simple.joblib"
SIMPLE_FEATURES_PATH = MODELS_DIR / "xgb_cls_simple_features.txt"

CLS_CALIBRATION_PATH = MODELS_DIR / "xgb_cls_calibration.json"

_simple_model_cache: XGBClassifier | None = None  # type: ignore[name-defined]
_simple_features_cache: list[str] | None = None
_cls_calibration_cache: Optional[list[dict]] = None


def _load_features(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def _load_simple_model() -> Tuple[XGBClassifier, list[str]]:  # type: ignore[name-defined]
    global _simple_model_cache, _simple_features_cache
    if _simple_model_cache is None or _simple_features_cache is None:
        if not SIMPLE_MODEL_PATH.exists() or not SIMPLE_FEATURES_PATH.exists():
            raise FileNotFoundError("Simplified XGBoost model artifacts missing; run scripts/train_xgb_simple.py")
        _simple_model_cache = joblib.load(SIMPLE_MODEL_PATH)
        _simple_features_cache = _load_features(SIMPLE_FEATURES_PATH)
    return _simple_model_cache, _simple_features_cache  # type: ignore[return-value]


def _phi(x: np.ndarray | float) -> np.ndarray | float:
    """Standard normal CDF without SciPy: Phi(x) = 0.5 * [1 + erf(x / sqrt(2))]."""
    if isinstance(x, np.ndarray):
        return 0.5 * (1.0 + np.vectorize(math.erf)(x / math.sqrt(2.0)))
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def predict_winprob_xgb(
    game_row: Dict,
    *,
    return_contribs: bool = False,
    top_n: int = 5,
) -> float | Tuple[float, list[Dict[str, float]], float]:
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

    if not return_contribs:
        return float(p)

    booster = model.get_booster()
    dmatrix = xgb.DMatrix(X, feature_names=feats)
    contribs = booster.predict(dmatrix, pred_contribs=True)[0]

    rows: list[Dict[str, float]] = []
    for fname, contrib, value in zip(feats, contribs[:-1], X[0]):
        rows.append(
            {
                "feature": fname,
                "contribution": float(contrib),
                "value": float(value),
            }
        )

    rows.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    bias = float(contribs[-1])
    interval = calibrate_classifier_confidence(float(p))
    payload = {
        "prob": float(p),
        "factors": rows[:top_n],
        "bias": bias,
        "interval": interval,
    }
    return payload


def _pick_bucket(abs_mu: float, buckets: list[list[int]]) -> str:
    for lo, hi in buckets:
        if lo <= abs_mu < hi:
            return f"{lo}-{hi}"
    return "other"


def predict_margin_and_prob_xgb(game_row: Dict) -> Tuple[float, float, float]:
    """Predict home margin and derive win probability using calibrated σ.

    Uses bucketed σ if available; otherwise falls back to global σ.
    Returns (margin_mu, win_probability, sigma).
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
    return mu, p, sigma


def predict_winprob_xgb_simple(game_row: Dict, top_n: int = 5) -> Tuple[float, List[Dict[str, float]], float]:
    """Predict home win probability using compact model plus top feature contributions."""

    model, feats = _load_simple_model()
    X = np.array([[game_row.get(f, 0.0) for f in feats]], dtype=float)
    proba = model.predict_proba(X)[0, 1]

    booster = model.get_booster()
    dmatrix = xgb.DMatrix(X, feature_names=feats)
    contribs = booster.predict(dmatrix, pred_contribs=True)[0]

    feature_contribs: List[Dict[str, float]] = []
    for fname, contrib, value in zip(feats, contribs[:-1], X[0]):
        feature_contribs.append(
            {
                "feature": fname,
                "contribution": float(contrib),
                "value": float(value),
            }
        )

    feature_contribs.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    top = feature_contribs[:top_n]
    bias = float(contribs[-1])
    return float(proba), top, bias
def _load_cls_calibration() -> Optional[list[dict]]:
    global _cls_calibration_cache
    if _cls_calibration_cache is not None:
        return _cls_calibration_cache
    if not CLS_CALIBRATION_PATH.exists():
        return None
    try:
        data = json.loads(CLS_CALIBRATION_PATH.read_text())
        bins = data.get("bins")
        if isinstance(bins, list):
            _cls_calibration_cache = bins
            return bins
    except Exception:
        return None
    return None


def calibrate_classifier_confidence(prob: float) -> Optional[dict]:
    table = _load_cls_calibration()
    if not table:
        return None
    for entry in table:
        try:
            low = float(entry.get("low", 0.0))
            high = float(entry.get("high", 1.0))
        except (TypeError, ValueError):
            continue
        if low <= prob < high or (prob == 1.0 and abs(prob - high) < 1e-9):
            return entry
    return table[-1] if table else None
