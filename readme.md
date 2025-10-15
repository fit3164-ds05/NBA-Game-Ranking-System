# NBA Game Ranking System

A modular, data-driven engine for producing up-to-date NBA team rankings and head-to-head predictions. This project combines classical rating methods (Elo / Glicko), Bayesian uncertainty modelling (TrueSkill2 / Bradley–Terry), machine-learning “learning-to-rank” algorithms (XGBoost / LambdaMART) and graph-based strength-of-schedule metrics. You can deploy it as a free proof-of-concept or on a low-cost VPS for continuous use.

This tool calculates the historical ratings for each NBA team using the Elo rating system.

---

## Fast Data Files (Parquet/Arrow)

- Parquet offers faster reads and smaller files with preserved types compared to CSV.
- This repo now prefers Parquet but falls back to CSV automatically.

How to convert existing CSVs to Parquet:

```bash
make convert
```

This writes sibling `.parquet` files next to each `.csv` and a report at `backend/data/qa/conversion_report.json`.

Switching formats at runtime (Flask, scripts):

```bash
export DATA_FORMAT=parquet   # options: parquet, csv, feather
export PARQUET_COMPRESSION=zstd  # or snappy
```

In code, load datasets via the unified loader:

```python
from backend.utils.data_loader import load_table
df = load_table("backend/data/full_ratings")  # no extension required
```

Notes:
- Colab typically ships with `pyarrow`; no extra steps needed.
- If `zstd` codec isn’t available, conversion falls back to `snappy` automatically.
- CSVs are not deleted; existing pipelines remain functional.
- Feather/Arrow IPC is supported by the loader if `.feather` files are present.

## XGBoost Models (Win Prob and Margin)

- Features are built from pre-game rolling stats and a historical rating diff (home − away).
- No leakage: features use `shift(1)` rolling windows per team prior to each game.
- Two models:
  - Classification (win probability): `scripts/train_xgb_classification.py`
  - Regression (margin): `scripts/train_xgb_regression.py` with σ calibration from validation residuals

### Current Pipeline Status (September 2025)

- Stage 1 instrumentation: training scripts emit diagnostics under `backend/models/xgb_<cls|reg>_runs/<timestamp>/` (feature importances, predictions, eval history) and accept CLI overrides (`--feature-list`, `--groups-file`).
- Stage 2 pruning: zero-importance and high-correlation features removed; promoted lists live at `backend/models/xgb_cls_features.txt` (≈308 columns pre-tuning) and `backend/models/xgb_reg_features.txt` (≈316 columns).
- Stage 3 tuning: Optuna sweeps delivered tuned hyperparameters (`xgb_<cls|reg>_best_params.json`) and group masks (`xgb_<cls|reg>_best_groups.json`). Classifier now uses ~106 features (groups: `static`, `rest`, `roll3_mean`, `roll10_mean`); regression has its own selected mask. Walk-forward validation remains stable (ACC ≈ 0.703/AUC ≈ 0.791; RMSE ≈ 11.82/MAE ≈ 9.10).

**Stage 4 (Next Session)** – Apply `SelectFromModel` on the tuned configs, experiment with blending classifier probabilities and regression-derived Φ(μ/σ), and export historical predictions for the upcoming “How the model works” page.

**Stage 5 (Future Ideas)** – Integrate league shooting splits or other datasets, explore alternative learners (LightGBM, neural nets), and schedule regular re-tuning.

Why σ calibration from validation residuals?
- Residual spread varies with predicted |margin|; estimating σ on validation prevents overfitting and improves calibration.
- We bucket σ by |μ| (e.g., 0–5, 5–10, 10–20, 20+) to capture heteroskedasticity. For win prob: `Phi(mu/sigma)` with bucketed σ when available.

Switch rating source
- Default: Elo; alternative: Glicko or TrueSkill.
- Pass rating kind as script arg, e.g., `python scripts/train_xgb_classification.py trueskill`.

### Training & Tuning Cheat Sheet

```bash
# Stage 3 tuned models
python scripts/train_xgb_classification.py elo \
  --groups-file backend/models/xgb_cls_best_groups.json \
  --out-dir backend/models

python scripts/train_xgb_regression.py elo \
  --groups-file backend/models/xgb_reg_best_groups.json \
  --out-dir backend/models

# Walk-forward validation (per-season CV)
python scripts/walk_forward_eval.py cls
python scripts/walk_forward_eval.py reg

# Optuna sweeps (Stage 3)
python scripts/tune_xgb.py cls
python scripts/tune_xgb.py reg

# Feature pruning helpers
python scripts/prune_zero_importance.py cls
python scripts/prune_correlated.py cls --feature-list backend/models/xgb_cls_features.txt
```

### Website Integration Checklist

1. **Backend**: ensure `/api/predict` loads the tuned `.joblib` models and, if blended, returns both the raw and combined probabilities. Consider adding endpoints for historical predictions or power rankings using stored diagnostics.
2. **Frontend**: build a “How the model works” page showing training curves, feature importances, and historical accuracy charts (files are already written per run under `backend/models/xgb_*_runs/`).
3. **Deployment**: confirm Vercel builds and Railway jobs pull the latest artefacts; document any extra environment variables or data files required.

Historical rankings/predictions can be generated by scoring the full feature matrix (`backend/ml/features.build_features()`) with the trained models and aggregating results per season/week.

Make targets
```bash
make train-cls       # train classification model
make train-reg       # train regression model + calibration
make tune            # small Optuna tuner (cls/reg)
```


## High-Level Overview

1. **Data & Models**  
   - Ingests final game results plus box-score features (shooting %, passes, home/away, win-streaks, injuries).  
   - Computes multiple ratings in parallel: Elo/Glicko for interpretability, Bayesian for uncertainty, ML for accuracy, PageRank for schedule effects.  
   - Optionally ensembles these into a single prediction via stacked learning.

2. **Architecture**  
   - **Back-end**: Flask API serves JSON endpoints (`/api/ratings`, `/api/predict`, `/api/head2head`).  
   - **Front-end**: React SPA (or static HTML fallback) fetches data and renders interactive charts.  
   - **Automated Updates**: Weekly batch jobs retrain models and refresh rating artefacts.

3. **Deployment Paths**
   - **Free**: GitHub Pages for UI + PythonAnywhere free tier for Flask API and scheduled scripts.
   - **Low-Cost**: Dockerised Flask + Gunicorn behind Nginx on a USD 5/month droplet; React on GitHub Pages.

## Testing & QA

We keep a running log of the testing strategy, coverage snapshots, and open QA tasks in [`docs/Testing.md`](docs/Testing.md). Update it whenever you add or revise test suites so future contributors can trace what protects each workflow.

## Running the ranking pipeline

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Execute the rating workflow. The script will scrape the latest season's
   games from the NBA Stats API if cached files are missing, then compute and
   export Elo/Glicko/TrueSkill ratings:

   ```bash
   python backend/Rating_Algorithms/elo_computation.py
   ```

   Outputs are written to `backend/data` with plots saved under
   `backend/data/visuals`.

3. To refresh or pull different seasons, adjust the call to
   `load_games(seasons=["2023-24"], refresh=True)` in
   `backend/Rating_Algorithms/elo_computation.py`.

---
