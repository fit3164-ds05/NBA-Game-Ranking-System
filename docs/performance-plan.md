## Performance Improvement Plan

Goal: reduce the time to first paint for ratings-heavy pages (Historical Rankings, Game Prediction) and minimise repeated work on subsequent navigations.

### 1. Baseline Measurements
- Capture cold-start response times for critical endpoints: `/api/ratings/series`, `/api/teams`, `/api/seasons`, `/api/predict`.
- Instrument backend logs or leverage `flask.g` timers to record load/processing per request.
- Profile frontend mounts with browser devtools (Performance tab) to quantify time spent fetching vs rendering.

### 2. Backend Optimisations
- **Warm caches on startup**: call `services.ratings.load_full()` during app initialisation to pre-load Parquet into memory before first request.
- **Materialise aggregates**: pre-compute per-team, per-season metrics into lightweight Parquet (or serve via DuckDB) so `/ratings/series` avoids scanning the full table.
- **Pagination/streaming**: allow requesting a narrower window (e.g., recent 5 seasons) by default and expand on demand.
- **Async background cache refresh**: keep processed slices (per team/per season) in Redis or an in-memory store keyed by request params.
- **Data pruning**: remove unused columns before serialisation to shrink payload size.

### 3. Frontend Optimisations
- **Incremental loading**: render an initial subset (e.g., top 5 teams or recent seasons) while background requests fetch the remaining data.
- **Memoised transforms**: audit `RatingChart.jsx` loops/pivots—shift heavy preprocessing to backend or memoise by `teams` selection.
- **Lazy routes**: code-split chart-heavy pages (`HistoricalRanking`, `DashboardFeature*`) with `React.lazy` to reduce initial JS bundle.
- **Persistent cache**: continue using `sessionStorage` but add versioning to avoid stale hits after schema changes.

### 4. Verification
- Add automated smoke tests or CI step that hits `/api/ratings/series` and asserts response under budget (e.g., < 500 ms on sample data).
- Track bundle size via `vite build --report` and fail if baseline increases beyond agreed limit.
- Document manual verification steps (run backend tests, run `npm run test`, Lighthouse check on deployed preview).

### 5. Next Actions
1. Measure current API and render timings (cold + warm cache) and record in this doc.
2. Prototype backend warm-up hook (e.g., in `create_app`) and compare first request latency.
3. Evaluate moving chart pivoting logic server-side; design API contract for pre-aggregated data.
4. Plan frontend code-splitting strategy (identify chunk boundaries, lazy load seldom-used dashboards).

Update this file after each milestone with observations and new tasks.
