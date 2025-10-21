# Game Prediction Insights Guide

Use this guide to walk stakeholders through the prediction detail view, explain what each card conveys, and highlight how the different models compare.

## 1. Getting to the insights page

1. Open the **Game Prediction** page in the frontend (`/predict` route).
2. Choose home and away teams plus seasons. You can pick the same franchise twice as long as the seasons differ.
3. Submit the form; the app calls `POST /api/predict` and renders the cards described below.

## 2. Headline summary

- **Projected winner** – The first card states the model bundle in use, echoes the teams and seasons, and shows the overall edge (e.g. “Boston Celtics win chance 52% · Margin −1.2 pts (±14.4) · Low confidence”).
- Treat this as the at-a-glance takeaway: which side the active model favours, by how much, and how confident the system feels.

## 3. XGBoost (win+margin) cards

These cards come from the XGBoost classifier and regression models (`backend/ml/infer.py`).

### Classifier win chance

- Displays the calibrated home/away win probabilities (e.g. 52% home vs 48% away).
- The donut chart allows quick comparison; the legend spells out each side.

### Margin projection

- Shows the regression mean and calibrated σ (standard deviation) as text plus a probability call-out (e.g. “−1.2 pts (±14.4) → 47% chance for Dallas Mavericks”).
- The bell-curve graphic highlights the area where the selected team would win. If the mean is negative, the chart emphasises the away team.

### Confidence badge

- Combines the regression margin lean, the distance from a coin-flip (z-score), and the classifier’s 68% calibration band (`xgb_cls_calibration.json`).
- Labels follow the thresholds defined in `docs/GamePrediction.md` (Low < 0.5σ, Medium 0.5–1.25σ, High ≥ 1.25σ).
- The bullet list under the badge expands the reasoning (regression lean, σ distance, and what past validation games in this probability range actually produced).

### Narrative cards

- **How to interpret** – A prose summary built from SHAP contributions (see `frontend/src/utils/featureNarratives.js`). Example: “XGBoost classifier gives 48% chance for Dallas Mavericks to win. Margin model translates −1.2 pts (±14.4) into 47% home win probability.”
- **Lead driver / Other key drivers** – Lists top SHAP factors with plain-language explanations (e.g. rating differences, rolling averages, rest).
- **Confidence drivers** – Repeats the bullet list so presenters can copy/paste rationale directly.

## 4. Model comparison

- Located at the bottom of the card stack.
- Compares the active XGBoost bundle with any other machine-learning variants that were loaded (e.g. the compact classifier).
- Highlights the probability gap in percentage points and summarises whether supporting models agree or diverge.

## 5. Switching models

- The toggle above the cards lets you switch between `xgboost` and `xgb_simple` when both are available.
- The compact classifier mirrors the win-chance card but omits the margin chart; use it when you want a small-footprint alternative.

## 6. Walkthrough example

For the sample matchup (Boston Celtics vs Dallas Mavericks):

1. **Projected winner** – XGBoost leans Boston (52% win chance, −1.2 pt margin). Confidence is low because the z-score is only 0.09.
2. **Classifier win chance** – Bar shows 52% Boston, 48% Dallas.
3. **Margin projection** – Regression says Dallas wins 47% of the time; the small negative spread reflects the away-friendly expectation.
4. **Confidence** – Low, supported by the bullets: small margin edge, tiny z-score, close probabilities, and a narrow calibrated interval (43–47%).
5. **How to interpret** – Narrative explains that the classifier likes Dallas slightly, but ratings differences (home vs away) nudge Boston back ahead.
6. **Lead driver** – “Home vs away Rating difference” signals that Boston’s season rating edge is the main reason for the 52% probability.
7. **Model comparison** – When multiple ML models load, the footer calls out any gaps (e.g. compact classifier ±X ppt). Large deltas flag lower confidence.

## 7. Sharing the insights

- When presenting, start with the projected winner card, then walk through classifier → margin → confidence → drivers → model comparison.
- Use the narrative text as ready-made commentary for reports or social snippets.
- Highlight areas where models disagree so decision-makers know when to dig deeper or gather more data.

## 8. Related files

- Backend inference: `backend/ml/infer.py`, `backend/ml/game_features.py`
- Frontend cards: `frontend/src/pages/GamePrediction.jsx`
- Calibration reference: `docs/GamePrediction.md`
- Deep dive on the pipeline: `docs/GamePredictionSystemDeepDive.md`

Keep this README alongside the deep-dive so newcomers can quickly learn how to read the cards and articulate what each model is saying.
