## Repository Cleanup Plan

### Objectives
- Reduce redundant assets (especially CSV/Parquet duplicates) to shrink repo size and speed up installs.
- Remove dead code, scripts, and configs that are no longer referenced in build or deploy.
- Tighten dependency lists and ignore rules so only necessary artifacts ship.

### Safety & Validation
- Keep a running checklist of deletions and always re-run:
  - `pytest` inside `backend/`
  - `npm run test` inside `frontend/`
  - `npm run build` inside `frontend/` (catches missing assets during bundle)
- For data removals, start by eliminating files that have a verified Parquet replacement and no direct references:
  - Search with `rg "filename.csv"` before deleting.
  - If loaders accept both CSV and Parquet (e.g. `services.utils.load_table`), confirm the default points to the Parquet stem.
- Stage deletions in small batches so regressions are easy to trace.

### Immediate Targets (Low Risk)
- Remove CSV files when the Parquet twin is the canonical source.
- Clean up scratch metadata (`cols_*.txt`, `h*.txt`, `qa/`, `visuals/`) if no active notebooks reference them.

### Progress Log
- **2025-10-13** — Removed redundant CSV twins (`enlarged_dataset`, `full_ratings`, `nba_game_outcomes`, `ratings_*`, `results_with_predictions`, `team_metrics_dataset`) after verifying Parquet coverage and script isolation.

### Investigation Items
- Audit the `legacy/` directory for any code paths still importing from it.
- Confirm whether `data_exploration.py` and scripts in `scripts/` are still needed or should move to docs/examples.
- Review Dockerfile, Procfile, and deployment scripts to ensure they don’t expect removed assets.
- Check `.gitignore` for stale entries once removal is complete.

### Follow-Up
- After each cleanup batch, document outcomes in this file (date + summary).
- When the plan is complete, condense learnings into `README.md` so contributors know the expected data layout.
