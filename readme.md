# NBA Game Ranking System

A modular, data-driven engine for producing up-to-date NBA team rankings and head-to-head predictions. This project combines classical rating methods (Elo / Glicko), Bayesian uncertainty modelling (TrueSkill2 / Bradley–Terry), machine-learning “learning-to-rank” algorithms (XGBoost / LambdaMART) and graph-based strength-of-schedule metrics. You can deploy it as a free proof-of-concept or on a low-cost VPS for continuous use.

---

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

---