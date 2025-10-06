# Game Prediction Page

This view blends three families of signals to explain a single matchup prediction:

* **XGBoost (win+margin)** – classification model for raw win probability plus a regression model for expected margin.  The regression output provides a calibrated standard deviation so we can say how far the matchup sits from a toss-up.
* **XGBoost (simple)** – compact classifier trained on the most influential features.  It trades a little accuracy for sharper, human-scale explanations.
* **Ratings (logistic)** – the legacy Glicko/Elo-style baseline computed from season-ending ratings.

## Response Payload

`POST /api/predict` returns:

* `models.xgboost`
  * `home_win_prob`: classifier probability.
  * `predicted_margin`, `margin_sigma`: regression mean μ and calibrated σ.
  * `win_prob_from_margin`: Φ(μ/σ) – margin-derived win chance.
  * `top_factors`: SHAP-style contributions from the classifier (home vs away features, rolling windows, etc.).
  * `confidence_interval`: 68% Wilson interval derived from the validation+test split (see calibration script).
* `models.xgb_simple`: same shape but without margin terms.
* `models.elo`: logistic probability and margin from rating difference.
* `head_to_head`: season-aware summary of the most recent meetings.

## Confidence badge

If μ and σ are available:

```
margin favours TEAM by |μ| points · ≈ zσ from even · Φ(μ/σ) via margin model · calibrated 68% interval
```

Thresholds:

| z-score | Label    |
|---------|----------|
| ≥ 1.25  | High     |
| 0.5–1.25 | Medium  |
| < 0.5   | Low      |

If the active model lacks margin info (e.g. the compact classifier) we fall back to how far the classifier probability is from 50% and still append the calibrated interval when available.

## Interpreting the cards

* **Projected winner** – headline card that states the favourite, classifier-derived win chance, and the margin projection.
* **Classifier win probability** – direct XGBoost output.
* **Margin projection** – regression spread with a bell curve showing the home-margin distribution: zero line, mean marker, shaded home-win area (≈ probability). The caption calls out the margin-derived home win chance.
* **Confidence** – combines the margin z-score with the calibrated interval. When only the classifier is available it explains how far the probability sits from a coin flip.
* **Lead driver** – the interpretation card now highlights the top SHAP contributor in plain English (e.g. “Miami hold a last 10 games average offensive rating edge…”).
* **Key drivers** – SHAP contributions translated to prose using the shared helper at `frontend/src/utils/featureNarratives.js`. Rolling windows become “10-game average”, diffs become “Home vs away …”, `ADV_*` ratings mention per-100 possession context, and `FF_*` four-factor stats expand their acronyms.
* **Head-to-head** – last five meetings in the selected season when both teams share a year, otherwise “Last 5 meetings before YYYY”.

## Calibration workflow

Calibrating the classifier produces `backend/models/xgb_cls_calibration.json`, which drives the confidence interval:

```bash
pip install scikit-learn pandas numpy  # once
python scripts/train_xgb_classification.py         # retrain classifier if needed
python scripts/calibrate_xgb_classifier.py         # build calibration table
```

The script builds the full feature matrix, scores the validation+test split, bins probabilities into deciles, and stores Wilson 68% intervals plus empirical win rates per bin. Inference looks up the bin covering the live probability.

## Updating models

1. `python scripts/train_xgb_classification.py` and `python scripts/train_xgb_regression.py`
2. `python scripts/train_xgb_simple.py --top-k 20`
3. `python scripts/calibrate_xgb_classifier.py`
4. Restart the backend so `/api/predict` loads the refreshed artefacts.

With those artefacts in place the Game Prediction UI automatically reflects the new probabilities, confidence, key drivers, and head-to-head context.
