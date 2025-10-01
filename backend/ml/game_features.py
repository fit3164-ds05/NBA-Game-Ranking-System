"""Feature assembly helpers for serving XGBoost predictions on demand.

These helpers summarise the pre-game rolling feature set per (team, season)
so we can build matchup-level feature vectors without recomputing the full
training matrix every time a user requests a prediction.

Workflow:
  1. Load the team metrics dataset and recreate the rolling features used
     during training.
  2. Aggregate those features per (TEAM_NAME, YEAR) using the median of the
     pre-game values to obtain a season-level profile for each team.
  3. When asked for a matchup, take the difference between the home and away
     profiles, attach the calibrated rating difference, and inject constant
     signals such as `is_playoffs` and `YEAR`.

The resulting feature dict can be passed directly to the inference helpers in
``backend.ml.infer`` for both the classification and regression XGBoost models.
"""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd

from .features import (
    build_team_rolling,
    load_ratings,
    load_team_metrics,
    select_metric_cols,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES_DIR = REPO_ROOT / "backend" / "models"
PROFILES_PATH = PROFILES_DIR / "xgb_team_profiles.parquet"
PROFILES_META = PROFILES_DIR / "xgb_team_profiles_meta.json"


SeasonVector = Tuple[pd.Series, int]


@lru_cache(maxsize=1)
def _team_feature_summary() -> Tuple[pd.DataFrame, Tuple[str, ...]]:
    """Return (summary_df, feature_cols) for season-level team profiles."""
    meta: dict[str, object] = {}
    if PROFILES_META.exists():
        try:
            meta = json.loads(PROFILES_META.read_text())
        except Exception:
            meta = {}

    candidates: list[Path] = []
    artifact = meta.get("artifact") if isinstance(meta, dict) else None
    if isinstance(artifact, str) and artifact:
        art_path = Path(artifact)
        if not art_path.is_absolute():
            candidate = PROFILES_META.parent / art_path
            if not candidate.exists():
                candidate = REPO_ROOT / art_path
            art_path = candidate
        candidates.append(art_path)
    candidates.extend([
        PROFILES_PATH,
        PROFILES_PATH.with_suffix(".csv"),
    ])

    summary = None
    for path in candidates:
        if not path.exists():
            continue
        suffix = path.suffix.lower()
        try:
            if suffix == ".parquet":
                summary = pd.read_parquet(path)
            elif suffix == ".csv":
                summary = pd.read_csv(path)
            else:
                continue
        except ImportError:
            continue
        if summary is not None:
            break

    if summary is not None:
        if not isinstance(summary.index, pd.MultiIndex):
            idx_cols = [c for c in ["TEAM_NAME", "YEAR"] if c in summary.columns]
            if len(idx_cols) == 2:
                summary.set_index(idx_cols, inplace=True)
        try:
            roll_cols = tuple(meta.get("feature_columns", list(summary.columns)))
        except Exception:
            roll_cols = tuple(summary.columns)
        return summary.astype(np.float64), roll_cols

    # No cached profiles found; compute from base dataset as a fallback.
    try:
        df = load_team_metrics()
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            "team feature profiles missing and raw dataset not found. "
            "Run `python scripts/precompute_team_profiles.py` to generate "
            "backend/models/xgb_team_profiles.parquet."
        ) from exc
    metric_cols = select_metric_cols(df)
    df_roll = build_team_rolling(df, metric_cols)

    roll_cols = [c for c in df_roll.columns if c.endswith("_mean") or c.endswith("_std")]
    summary = (
        df_roll
        .groupby(["TEAM_NAME", "YEAR"], dropna=True)[roll_cols]
        .median()
        .sort_index()
    )

    # Fill remaining gaps column-wise (median per feature), then fall back to 0.0.
    col_medians = summary.median()
    summary = summary.fillna(col_medians).fillna(0.0)

    summary = summary.astype(np.float64)

    # Try persisting for next time so runtime no longer needs raw dataset
    try:
        PROFILES_PATH.parent.mkdir(parents=True, exist_ok=True)
        artifact: Path = PROFILES_PATH
        try:
            summary.to_parquet(PROFILES_PATH)
        except ImportError:
            artifact = PROFILES_PATH.with_suffix(".csv")
            summary.to_csv(artifact)
        meta = {
            "feature_columns": roll_cols,
            "source": "backend/data/team_metrics_dataset",
            "artifact": str(artifact),
        }
        PROFILES_META.write_text(json.dumps(meta, indent=2))
    except Exception:
        # Persistence is best-effort; continue even if writing fails.
        pass

    return summary, tuple(roll_cols)


@lru_cache(maxsize=8)
def _season_rating_lookup(ratings_kind: str) -> pd.Series:
    """Return final rating per (team, year) for the requested ratings kind."""
    ratings = load_ratings(ratings_kind)
    ratings = ratings.copy()
    ratings["GAME_DATE"] = pd.to_datetime(ratings["GAME_DATE"], errors="coerce").dt.normalize()
    ratings["YEAR"] = ratings["GAME_DATE"].dt.year
    ratings = ratings.dropna(subset=["RATING"]).sort_values(["TEAM", "GAME_DATE"])
    latest = ratings.groupby(["TEAM", "YEAR"])  # type: ignore[arg-type]
    return latest["RATING"].last()


def _lookup_team_vector(team: str, year: int) -> SeasonVector:
    summary, _ = _team_feature_summary()
    try:
        vec = summary.loc[(team, year)]
        return vec.astype(np.float64), int(year)
    except KeyError:
        try:
            team_df = summary.xs(team, level=0)
        except KeyError as exc:  # team not present at all
            raise KeyError(f"No feature data found for team '{team}'") from exc

    if isinstance(team_df, pd.Series):  # Only one season available
        chosen_year = int(team_df.name) if team_df.name is not None else int(year)
        return team_df.astype(np.float64), chosen_year

    candidate_years = [int(y) for y in team_df.index if int(y) <= year]
    if not candidate_years:
        candidate_years = [int(y) for y in team_df.index]

    chosen_year = max(candidate_years)
    vec = team_df.loc[chosen_year]
    if isinstance(vec, pd.DataFrame):  # defensive: multi-value selection
        vec = vec.iloc[0]
    return vec.astype(np.float64), int(chosen_year)


def _lookup_rating(team: str, year: int, ratings_kind: str) -> Tuple[float, int]:
    table = _season_rating_lookup(ratings_kind)
    try:
        rating = table.loc[(team, year)]
        return float(rating), year
    except KeyError:
        try:
            team_series = table.loc[team]
        except KeyError as exc:
            raise KeyError(f"No rating data found for team '{team}' ({ratings_kind})") from exc

    years = team_series.index
    if not isinstance(years, pd.Index):
        return float(team_series), int(year)

    candidate_years = [int(y) for y in years if int(y) <= year]
    if not candidate_years:
        candidate_years = [int(y) for y in years]

    chosen_year = max(candidate_years)
    return float(team_series.loc[chosen_year]), int(chosen_year)


def build_matchup_features(
    home_team: str,
    home_year: int,
    away_team: str,
    away_year: int,
    *,
    ratings_kind: str = "elo",
    season_type: str | None = None,
) -> Tuple[Dict[str, float], Dict[str, Dict[str, int | str]]]:
    """Construct a feature dict for the saved XGBoost models.

    Returns (features, metadata) where features align with the training columns
    stored under ``backend/models/xgb_<cls|reg>_features.txt``. Metadata records
    any season fallbacks so callers can surface that context to the user.
    """

    summary, roll_cols = _team_feature_summary()

    home_vec, home_year_used = _lookup_team_vector(home_team, int(home_year))
    away_vec, away_year_used = _lookup_team_vector(away_team, int(away_year))

    # Align on the known feature columns before differencing
    home_vec = home_vec.reindex(roll_cols).fillna(0.0)
    away_vec = away_vec.reindex(roll_cols).fillna(0.0)
    diff = (home_vec - away_vec).fillna(0.0)

    home_rating, home_rating_year = _lookup_rating(home_team, int(home_year), ratings_kind)
    away_rating, away_rating_year = _lookup_rating(away_team, int(away_year), ratings_kind)

    features: Dict[str, float] = {
        "rating_diff": float(home_rating - away_rating),
        "is_playoffs": 1.0 if season_type and "playoff" in season_type.lower() else 0.0,
        "YEAR": float(max(home_year_used, away_year_used)),
    }
    for col, value in diff.items():
        features[f"DIFF_{col}"] = float(value)

    metadata = {
        "home": {
            "team": home_team,
            "requested_year": int(home_year),
            "used_year": int(home_year_used),
            "rating_year": int(home_rating_year),
        },
        "away": {
            "team": away_team,
            "requested_year": int(away_year),
            "used_year": int(away_year_used),
            "rating_year": int(away_rating_year),
        },
        "ratings_kind": ratings_kind,
    }

    return features, metadata
