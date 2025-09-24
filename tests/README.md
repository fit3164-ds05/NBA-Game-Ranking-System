# Testing Roadmap

This document gives the team a single place to track the testing strategy, the
progress we have already made, and what comes next across backend and frontend
workstreams.

## Guiding Principles
- Follow the testing pyramid laid out in `backend/tests/README.md`: unit →
  integration → end-to-end.
- Keep fixtures tiny and deterministic; prefer stubs/mocks for external APIs
  like `nba_api`.
- Every new endpoint or UI flow should ship with a corresponding test so the
  regression suite stays meaningful as the product grows.

## Current Coverage Snapshot (March 2025)

### Backend
- **Ratings service/unit**: CSV loading, season/year logic, probability math,
  and series filters (`backend/tests/unit/test_ratings*.py`).
- **Shot chart service/unit**: player search, season discovery, measure
  validation, and trimmed payloads using stubbed `nba_api` calls
  (`backend/tests/unit/test_shotchart.py`).
- **Integration**: Flask routes for ratings and shot chart APIs including
  validation, pagination, and error propagation
  (`backend/tests/integration/test_*`).
- **Utility**: parquet/CSV loader fallback logic (`backend/tests/test_loader.py`).

### Frontend
- **API client**: axios helper behaviour, caching, and error handling
  (`frontend/src/lib/api*.test.js`).
- **Dashboard components**: player dropdown, season picker, year selector, and
  dashboard page measure hand-off (`frontend/src/components/__tests__/*.jsx`,
  `frontend/src/pages/DashboardHome.test.jsx`).
- **Prediction flow**: existing page-level tests cover the game prediction view
  (`frontend/src/pages/GamePrediction.test.jsx`).

### End-to-End (Planned)
- No automated E2E suite is running yet. We plan to adopt Playwright (or
  Cypress) once a stable staging environment is available.

## Recent Progress
- Stubbed `flask_limiter` for tests and added comprehensive shot chart route
  coverage.
- Added frontend vitest suites for the statistics dashboard widgets to confirm
  typeahead behaviour, season loading, and error surfacing.
- Brought the dashboard page under test to ensure the selected measure flows to
  downstream components.

## Next Milestones
1. **Backend**
   - Extend unit tests to cover edge cases in `services/shotchart` (e.g., playoff
     season types, team-specific filters) once implemented.
   - Add regression tests for any new datasets (league shooting splits) as they
     are ingested.
2. **Frontend**
   - Add chart rendering smoke tests once visualisations are wired up to the
     new league/shot data.
   - Cover form validation and error messaging on the predictions page when new
     inputs are introduced.
3. **End-to-End**
   - Automate the “fan requests a prediction” journey in Playwright, including
     the shot dashboard once deployed.
   - Record trace artifacts (screenshots/video) for debugging failed runs.

## How to Run the Suites
- **Backend (pytest)**
  ```bash
  cd backend
  pytest
  ```
- **Frontend (Vitest)**
  ```bash
  cd frontend
  npm test
  ```
- **Future E2E**
  - Playwright: `npx playwright test`
  - Cypress: `npx cypress run`

Keep this document updated as suites expand or priorities shift so everyone can
see at a glance where our automated safety net stands.
