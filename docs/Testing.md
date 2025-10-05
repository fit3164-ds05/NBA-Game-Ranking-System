# Testing & QA Playbook

A living record of how we assess the NBA Game Ranking System. Revisit after each iteration so future contributors understand what exists, what changed, and what still needs attention.

## Guiding principles

1. **User flows first** – start with the outcomes we promise (game predictions, dashboard navigation, rating exports) and design tests that guard those flows.
2. **Explainability matters** – any regression that muddies the on-screen narratives (confidence copy, driver prose, tooltips) is treated as a functional failure, not a cosmetic nit.
3. **Tight feedback loops** – keep fast unit/component suites locally runnable (`npm run test -- <name>`, `pytest`, `make lint`), and push heavier integration/e2e checks to CI where practical.

## Current coverage snapshot (October 2025)

| Layer | What we exercise | Commands |
|-------|------------------|----------|
| Front-end (React/Vite) | Component tests for Game Prediction (`GamePrediction.test.jsx`) and Dashboard overview (`DashboardHome.test.jsx`). Includes router context checks, sanity assertions around headline stats, and confidence copy. | `npm run test -- GamePrediction`<br>`npm run test -- DashboardHome` |
| Back-end (Flask services) | Legacy pytest suite (ratings pipeline) – **stale**; needs refresh before the next backend push. | `pytest` (targeted modules) |
| Data QA | Conversion smoke tests run via `make convert` report type issues when toggling CSV⇄Parquet. | `make convert` |

## Recent additions

- **Router-aware Dashboard tests (Oct 2025):** Wrapped `DashboardHome` in `MemoryRouter` so `NavLink`/`useLocation` based components can mount in Vitest. This unblocks CI and documents how to render page-level components that depend on React Router.
- **Narrative verification hooks:** `GamePrediction` tests remain smoke-like, but the new prose generator lives in `frontend/src/utils/featureNarratives.js`. When we expand coverage, we can import and assert against specific phrases without re-rendering the full page.
- **Confidence bands update:** σ thresholds now map to Low (<0.5), Medium (0.5–1.25), High (≥1.25). Documented in `docs/GamePrediction.md` and exercised indirectly by the prediction test.

## Expansion roadmap

1. **Component expectations:** Add targeted tests for `featureNarratives` to guarantee that e.g. `ADV_OFFRTG_roll10_mean` turns into the expected sentence. Vitest + direct function calls suffice.
2. **API contract tests:** Stand up a lightweight pytest module that hits `/api/predict` using fixture payloads, validating confidence intervals, driver arrays, and schema drift.
3. **Smoke E2E:** Playwright (or Cypress) journey covering: launch dashboard → swap to shot chart → request a prediction → observe narratives. Gate merges with a nightly run at first.
4. **Data freshness:** Introduce regression checks that compare the latest exported ratings to prior runs (e.g. mean absolute delta thresholds) so accidental data wipes surface early.

## How to run and update tests

1. Install JS deps (`cd frontend && npm install`) and Python deps (`pip install -r requirements.txt`) if you haven’t already.
2. **Frontend:**
   ```bash
   cd frontend
   npm run test           # full suite
   npm run test -- GamePrediction
   npm run test -- DashboardHome
   ```
3. **Backend:**
   ```bash
   pytest backend/services  # focused modules once refurbished
   ```
4. **Document changes:** whenever you add/modify tests, append a short note here: what changed, why it matters, and any follow-up TODOs.

## Known gaps / TODOs

- Back-end pytest suite is outdated – create fixtures for the new CSV/Parquet loaders and rating service API endpoints.
- No automated guard for the `featureNarratives` helper yet – add unit coverage after the next copy refinement.
- Head-to-head card relies on API formatting; consider snapshot tests once the API stabilises.

Keep this file close to the work: link PRs to the sections you touch, and don’t hesitate to mark experiments or open questions. The goal is to make testing intent discoverable, not to write a novel.
