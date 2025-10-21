# Game Prediction Cleanup TODOs

Use this checklist when you return to the Game Prediction experience.

## Backend / Models
- [x] Retire the logistic regression fallback from `/api/predict` and the UI. Update routes, model payloads, and docs accordingly.

## Frontend (GamePrediction.jsx)
- [x] Refresh copy: simplify/descope lengthy descriptions in the classifier, margin, and confidence cards so they stay concise.
- [x] Enforce team validation in the form with two bullet points beneath the selects:
  - Same franchise can be chosen on both sides **only if** seasons differ.
  - If different franchises are picked, seasons may match.
- [x] Add a tooltip near the team selectors that repeats the rules above so users don’t miss them.

## Verification
- [x] Update `docs/GamePrediction.md` and `docs/InsightsExploration.md` to reflect the new model lineup and copy.
- [x] Run frontend tests (`npm run test -- GamePrediction`) to confirm snapshots and text expectations stay in sync.
