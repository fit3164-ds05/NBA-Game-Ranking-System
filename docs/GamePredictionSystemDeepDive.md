# NBA Game Prediction System Deep Dive

This reference explains how the prediction stack is wired end to end: how we prepare data, train and serve the XGBoost models, how the logistic baseline differs, where frontend requests travel through Flask, and what our current testing and hosting choices guarantee (and do not).

## 1. Model Family Overview

- **Legacy ratings baseline** (optional) – a single-step Elo-style logistic using the most recent in-season ratings for each team (`backend/services/ratings.py:239`). It now only supplies rating context; the UI no longer surfaces its probabilities.
- **XGBoost classifier (win probability)** – gradient-boosted trees trained on pre-game rolling stats, rating diffs, season context, and rest metrics. Serves calibrated win probabilities and SHAP-style top factors (`backend/ml/infer.py:53`).
- **XGBoost regression (margin + σ)** – companion regressor trained on the same features to predict the home scoring margin; its calibrated residual spread yields a second win probability (`backend/ml/infer.py:107`).
- **Compact classifier** – optional lightweight model that keeps only the top feature importances for narrative clarity (`backend/ml/infer.py:134`). Used when we need a quick explanation with fewer features.

The `/api/predict` endpoint blends these signals, exposing model-specific cards so the UI can highlight different perspectives (`backend/app/routes.py:207`).

## 2. Feature Engineering & Offline Pipeline

1. **Team metrics ingestion** – We load per-game box score aggregates (traditional, advanced, four factors, shooting splits) via `load_team_metrics()` with a Parquet preference (`backend/ml/features.py:70`).
2. **Leak-proof rolling windows** – For each metric we compute `roll3/5/10` means and standard deviations using `shift(1)` so only pre-game information is visible to the model (`backend/ml/features.py:352`).
3. **Game-level join** – Home and away rows are merged and differences (home minus away) are computed for every rolling stat (`backend/ml/features.py:370`).
4. **Rating signals** – Elo/Glicko/TrueSkill snapshots are joined on game date to provide `rating_diff` plus raw home/away ratings (`backend/ml/features.py:477` and `backend/ml/features.py:563`).
5. **Targets** – `y_cls` is the home win indicator, `y_reg` is margin (home points − away points) (`backend/ml/features.py:445`).
6. **Artefacts** – Training scripts under `scripts/` export `.joblib` models, feature lists, and calibration JSON into `backend/models/`.

For faster inference, we pre-aggregate the rolling feature vectors per team-season and persist them to `backend/models/xgb_team_profiles.parquet`. The request-time helper rehydrates those summaries and only computes home/away differences (`backend/ml/game_features.py:225`).

## 3. XGBoost Classification Model (Win Probability)

- **Training target** – home win flag (`y_cls`).
- **Feature space** – `rating_diff`, raw rating levels, playoff indicator, season year, and the full set of `DIFF_*`, `HOME_*`, `AWAY_*` rolling metrics (`backend/ml/features.py:585`).
- **Hyperparameters** – tuned with Optuna; artifacts recorded under `backend/models/xgb_cls_runs/`.
- **Calibration** – After training, we bin validation probabilities into deciles to compute empirical win rates and Wilson confidence intervals. The lookup table `xgb_cls_calibration.json` powers the per-prediction confidence badge (`backend/ml/infer.py:159`).
- **Inference path** – `build_matchup_features()` assembles the feature dict, `predict_winprob_xgb()` loads `xgb_cls_winprob.joblib`, injects missing defaults, and returns both the raw probability and the top SHAP contributors for interpretability (`backend/ml/infer.py:63`).
- **UI usage** – The Game Prediction page renders classifier probabilities, factors, and the calibrated interval inside the `ResultPanel` card stack (`frontend/src/pages/GamePrediction.jsx:746`).

### Why the classifier matters

- Provides a calibrated single-number probability for headline communication.
- SHAP contributions translate to narrative sentences via `buildFactorNarrative` so fans understand *why* the model leans toward a team.
- Serves as a stable probability even when the regression output is unavailable (e.g., missing artefacts).

## 4. XGBoost Regression Model (Margin & Derived Probability)

- **Training target** – `y_reg`: home margin in points.
- **Feature space** – mirrors the classifier to keep alignment (`backend/ml/features.py:585`).
- **Calibration** – Residuals on the validation split reveal heteroskedasticity: blowouts are harder to predict than toss-ups. We bucket absolute margin predictions and store a σ per bucket in `xgb_reg_calibration.json`. At inference we lookup σ and return Φ(μ/σ) as a second win probability (`backend/ml/infer.py:115`).
- **Why run both models?** – Margin predictions unlock richer UI elements (bell-curve, confidence z-score) and spot cases where a modest win probability still implies a decisive margin due to σ shrinkage.
- **Fallbacks** – If artefacts are missing we log a warning but still return the logistic baseline and whatever XGBoost pieces succeeded (`backend/app/routes.py:254`).

## 5. Legacy Ratings Baseline (context only)

- **Data source** – Latest pre-game rating per team-season from the cached rating table (`backend/services/ratings.py:213`).
- **What remains** – We still pull `home_rating`, `away_rating`, and `rating_diff` for storytelling context.
- **What changed** – The logistic win probability and margin proxy are no longer returned to the UI; XGBoost models are now the sole prediction sources.

## 6. Classification vs Regression – When to Use Each

| Aspect | Classification model | Regression model |
| --- | --- | --- |
| Target | Home win (0/1) | Home margin (continuous) |
| Output | Probability, SHAP factors, calibration interval | Margin μ, σ bucket, derived probability |
| Strengths | Stable communication, explainability | Quantifies expected spread and confidence |
| Weaknesses | Does not express “by how much” | Sensitive to calibration artefacts; errors inflate when data sparse |
| UI usage | Lead probability card, driver narratives | Margin chart, confidence z-score, backup probability |

The UI lets users toggle between models; when one model is unavailable the other still renders (`frontend/src/pages/GamePrediction.jsx:489`).

## 7. Runtime Request Flow (User → Frontend → Backend)

1. **Load teams** – The Game Prediction page mounts, calls `getTeams()` via the shared Axios client (`frontend/src/lib/api.js:96`). The backend returns display names plus first/last seasons for each team (`backend/app/routes.py:35` onwards).
2. **Load seasons** – Selecting a team triggers `getSeasons(team)` which simply proxies to `/api/seasons` and returns descending years (`backend/app/routes.py:69`).
3. **User submits** – The form validates input (teams, seasons, no duplicate year) and posts to `/api/predict` (`frontend/src/pages/GamePrediction.jsx:452` and `frontend/src/pages/GamePrediction.jsx:463`).
4. **Backend orchestration** – `/api/predict` runs the logistic baseline, then enriches the payload with XGBoost outputs and head-to-head summaries (`backend/app/routes.py:207`). Errors bubble back as structured JSON.
5. **Display results** – The response updates local state; UI cards re-render with the selected model, driver narratives, confidence labels, and head-to-head history (`frontend/src/pages/GamePrediction.jsx:631`).
6. **Historical charts** – In parallel, `RatingChart` fetches `/api/ratings/series` using cached time-series calls with sessionStorage persistence (`frontend/src/lib/api.js:126`).

## 8. Backend Execution Details

- **Blueprint setup** – Flask registers the API blueprint under `/api` and enables configurable CORS to support different frontend origins (`backend/main.py:7`).
- **Data loading and caching** – `load_full()` lazily loads ratings and caches them under LRU, reducing disk hits (`backend/services/ratings.py:35`). Feature summaries for XGBoost are cached in-memory (`backend/ml/game_features.py:118`).
- **Graceful degradation** – Missing ML artefacts throw `FileNotFoundError`; the route translates that into `xgboost_error` while still returning the logistic result (`backend/app/routes.py:254`).
- **Head-to-head context** – We reuse the cached NBA game outcomes table to produce recent matchups and aggregate stats (`backend/services/ratings.py:282`).

## 9. Frontend Components & Data Handling

- **GamePrediction page** – Orchestrates all prediction calls, handles validation, shows loading states, and maps SHAP factors to human-readable sentences (`frontend/src/pages/GamePrediction.jsx:463`).
- **HistoricalRanking page** – Reuses the teams endpoint, highlights ratings per team, and interacts with the shared `RatingChart` component (`frontend/src/pages/HistoricalRanking.jsx:35`). Demonstrates how other pages reuse the same API layer while offering different UX.
- **API abstraction** – A single Axios instance defines the base URL and interceptors, handles sessionStorage caching for charts, and surfaces errors as friendly messages (`frontend/src/lib/api.js:10` and `frontend/src/lib/api.js:75`).
- **Testing hooks** – Components rely on dependency-injected API helpers, which Vitest mocks in unit tests, keeping the UI decoupled from network specifics (`frontend/src/pages/GamePrediction.test.jsx:6`).

## 10. Testing & Quality Assurance

Current guardrails:

- **Frontend component tests** – Vitest suite covers the happy path for Game Prediction, asserting that a mocked `/predict` response drives the UI cards, narratives, and confidence labelling (`frontend/src/pages/GamePrediction.test.jsx:1`). Another suite exercises the dashboard routing (see `docs/Testing.md`).
- **Backend unit tests** – Focus on rating service math, date handling, and CSV fallbacks (`backend/tests/unit/test_ratings.py`).
- **Backend integration tests** – Flask test client checks that `/api/teams`, `/api/seasons`, and `/api/predict` honour validation rules and response schemas (`backend/tests/integration/test_routes.py`).
- **Testing handbook** – `docs/Testing.md` documents current coverage, commands, and next steps, keeping quality intent visible.

Guarantees today:

- Probability and margin math are regression-tested with synthetic fixtures.
- UI obeys the critical fan journey: load teams → choose seasons → see a prediction with narratives.
- Session cache logic is smoke-tested by the component suite.

Gaps to address:

- Backend tests are marked “stale” and need refresh for the new Parquet loaders and XGBoost artefacts.
- No automated verification of SHAP narrative phrasing yet (planned via unit tests on `featureNarratives`).
- No end-to-end browser test against a deployed environment; Playwright/Cypress is on the roadmap (see `backend/tests/README.md:60`).

## 11. Hosting & Deployment

- **Frontend (Vercel)** – Vite builds a static bundle (`npm run build`). On Vercel, configure `VITE_API_BASE_URL` so the SPA points at the hosted Flask API. Local dev relies on the Vite proxy definition (`frontend/vite.config.js:7`), keeping API paths consistent.
- **Backend (Flask + Gunicorn)** – We expose the Flask app through Gunicorn with gthread workers (`backend/gunicorn.conf.py:15`). The `Procfile` and `Dockerfile` support deployment to Railway or any container host. The Docker image ensures required datasets exist at build time and preloads the ratings table on startup (`backend/main.py:15`).
- **Data artefacts** – Model files and Parquet datasets live under `backend/models` and `backend/data`. Hosts must mount or bake these artefacts into the image; the Dockerfile fails fast if critical assets are missing (`Dockerfile:17`).
- **Environment flags** – `DATA_FORMAT` toggles CSV vs Parquet; `ALLOWED_ORIGINS` opens CORS; `RATINGS_CSV` overrides the ratings file path for testing.

## 12. Guarantees vs Limitations

What the system guarantees today:

- Deterministic logistic fallback even in absence of ML artefacts.
- Calibrated classifier probabilities with confidence bins drawn from validation data.
- Runtime feature assembly that mirrors training (same rating source, same rolling stats).
- User-facing narratives grounded in SHAP contributions rather than hard-coded copy.

What it does **not** yet guarantee:

- Continuous retraining or automated artefact refresh — model updates are manual (`docs/GamePrediction.md` outlines the script order).
- Real-time roster or injury adjustments; features rely on historical box scores and do not ingest live feeds.
- End-to-end integration tests on production infrastructure; manual verification is still required after deploys.

## 13. Suggested Next Steps

1. Refresh backend pytest fixtures to cover Parquet loading, `build_matchup_features`, and error handling around missing artefacts.
2. Add focused unit tests for `featureNarratives` to lock the copy that explains SHAP factors.
3. Automate a nightly walk-forward evaluation and publish metrics so stakeholders can see drift.
4. Document Vercel ↔ Railway environment variables in a runbook (ports, dataset mounting, secrets).

Armed with this guide you can describe the system to stakeholders, onboard contributors, and reason about future improvements with a clear picture of the existing flow.
