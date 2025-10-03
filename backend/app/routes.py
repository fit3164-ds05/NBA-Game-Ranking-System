# routes.py
"""
This file defines the API routes for the backend of the NBA Game Ranking System.
It acts as a bridge between the frontend and backend logic, mapping incoming HTTP requests
to Python functions that return JSON responses. Each route corresponds to a specific endpoint,
handling data retrieval, validation, and prediction logic as needed.
"""
import os
from flask import Blueprint, jsonify, request, current_app
from services.ratings import (
    teams,
    seasons_for_team,
    predict_prob,
    load_full,
    resolved_csv_path,
    summarize_matchup,
)
from services import ratings

try:  # prefer absolute import when backend package is discoverable
    from backend.ml.game_features import build_matchup_features
    from backend.ml.infer import (
        predict_winprob_xgb,
        predict_margin_and_prob_xgb,
    )
except ImportError:  # pragma: no cover - fallback when running inside backend/
    from ml.game_features import build_matchup_features
    from ml.infer import (
        predict_winprob_xgb,
        predict_margin_and_prob_xgb,
    )
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from nba_api.stats.endpoints import commonallplayers, playergamelog, shotchartdetail
from services.shotchart import search_players, get_player_seasons, has_games_in_season, get_player_shotchart, season_default, season_type_default
import time

api_bp = Blueprint("api", __name__)

@api_bp.get("/")
def health():
    # Enhanced health with build and data diagnostics
    version = os.getenv("GIT_SHA") or os.getenv("RAILWAY_GIT_COMMIT_SHA") or "unknown"
    csv_path = resolved_csv_path()
    csv_rows = None
    csv_error = None
    try:
        # keep this light by not materialising the whole DataFrame if already cached
        df = load_full()
        csv_rows = int(getattr(df, "shape", [0])[0])
    except Exception as e:
        csv_error = str(e)

    payload = {
        "status": "ok",
        "version": version,
        "csv_path": csv_path,
    }
    if csv_rows is not None:
        payload["csv_rows"] = csv_rows
    if csv_error:
        payload["csv_error"] = csv_error
    return jsonify(payload)

@api_bp.get("/teams")
def get_teams():
    # Get all available NBA teams
    # URL: GET /teams
    # Returns: JSON list of team names
    return jsonify(teams=teams())

@api_bp.get("/seasons")
def get_seasons():
    # Get all seasons for a specific team
    # URL: GET /seasons?team=TEAM_NAME
    # Returns: JSON with the team and list of available seasons
    team = request.args.get("team")
    if not team:
        # Validate that the team query parameter is provided
        return jsonify(error="team query param required"), 400
    return jsonify(team=team, seasons=seasons_for_team(team))

@api_bp.post("/predict")
def predict():
    # Predict the outcome probability between two teams in given seasons
    # URL: POST /predict
    # Accepts: JSON with home_team, away_team, home_season, away_season
    # Returns: JSON with prediction result and model version
    data = request.get_json(force=True) or {}
    home_team = data.get("home_team")
    away_team = data.get("away_team")
    home_season = data.get("home_season")
    away_season = data.get("away_season")

    # Validate that all required fields are present
    if not all([home_team, away_team, home_season, away_season]):
        return jsonify(error="home_team, away_team, home_season, away_season are required"), 400

    # Prevent comparing the same team in the same season
    if home_team == away_team and home_season == away_season:
        return jsonify(error="If the same team is chosen the seasons must differ"), 400

    try:
        hs = int(home_season)
        as_ = int(away_season)
    except (TypeError, ValueError):
        return jsonify(error="home_season and away_season must be integers"), 400

    # Call the prediction logic from the services layer
    result = predict_prob(home_team, hs, away_team, as_)
    if "error" in result:
        # If prediction returns an error, return 404
        return jsonify(error=result["error"]), 404

    models_payload = {
        "elo": {
            "label": "Ratings (logistic)",
            "home_win_prob": result.get("home_win_prob"),
            "predicted_margin": result.get("predicted_margin"),
            "home_rating": result.get("home_rating"),
            "away_rating": result.get("away_rating"),
        }
    }

    xgb_error = None
    try:
        features, feature_meta = build_matchup_features(
            home_team,
            hs,
            away_team,
            as_,
            ratings_kind="elo",
            season_type="Playoffs" if result.get("is_playoffs") else None,
        )
        cls_payload = predict_winprob_xgb(features, return_contribs=True)
        if isinstance(cls_payload, dict):
            cls_prob = cls_payload.get("prob", 0.5)
            cls_factors = cls_payload.get("factors", [])
            cls_bias = cls_payload.get("bias", 0.0)
            cls_interval = cls_payload.get("interval")
        else:  # pragma: no cover
            cls_prob, cls_factors, cls_bias = float(cls_payload), [], 0.0
            cls_interval = None
        margin_pred, reg_prob, margin_sigma = predict_margin_and_prob_xgb(features)
        models_payload["xgboost"] = {
            "label": "XGBoost (win+margin)",
            "home_win_prob": cls_prob,
            "predicted_margin": margin_pred,
            "win_prob_from_margin": reg_prob,
            "margin_sigma": margin_sigma,
            "feature_context": feature_meta,
            "top_factors": cls_factors,
            "bias": cls_bias,
            "confidence_interval": cls_interval,
        }
    except FileNotFoundError as exc:
        xgb_error = f"{exc}"
    except Exception as exc:  # pragma: no cover - safeguard for optional model
        current_app.logger.warning("XGBoost inference failed: %s", exc, exc_info=exc)
        xgb_error = str(exc)

    h2h = summarize_matchup(home_team, away_team, hs, as_)

    payload = {
        "inputs": {
            "home_team": home_team,
            "home_season": hs,
            "away_team": away_team,
            "away_season": as_,
        },
        **result,
        "model_version": "glicko_csv_v1",
        "models": models_payload,
        "available_models": list(models_payload.keys()),
    }
    if h2h:
        payload["head_to_head"] = h2h
    if xgb_error:
        payload["xgboost_error"] = xgb_error

    return jsonify(payload)

@api_bp.get("/ratings/series")
def ratings_series():
    """
    Returns rating time series for all teams or a subset.
    Optional query params:
      teams=Team1,Team2
      start=YYYY-MM-DD
      end=YYYY-MM-DD
      offset=integer
      limit=integer
    """
    teams_param = request.args.get("teams")
    wanted = None
    if teams_param:
        wanted = [t.strip() for t in teams_param.split(",") if t.strip()]

    start = request.args.get("start")
    end = request.args.get("end")

    try:
        df = ratings.get_series(teams=wanted, start=start, end=end)
    except FileNotFoundError as e:
        return jsonify(error=str(e)), 500

    # Optional pagination for large responses
    try:
        offset = int(request.args.get("offset", 0))
        limit = request.args.get("limit")
        if limit is not None:
            limit = int(limit)
    except ValueError:
        return jsonify(error="offset and limit must be integers"), 400

    # Slice before serializing to JSON to avoid converting the entire dataset
    total = int(df.shape[0])
    if offset < 0:
        offset = 0
    if limit is not None and limit >= 0:
        sliced_df = df.iloc[offset: offset + limit]
    else:
        sliced_df = df.iloc[offset:]

    records = sliced_df.to_dict(orient="records")

    return jsonify(data=records, total=total, offset=offset, limit=limit)


# ------------------------------------------- SHOT CHARTS AND PLAYER GAMES -------------------------------------------
# -------- Player search --------
@api_bp.get("/nba/players/search")
def players_search():
    q = request.args.get("q", "")
    season = request.args.get("season", season_default())
    try:
        results = search_players(q=q, season=season, limit=20)
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------- Player seasons --------
@api_bp.get("/nba/players/<int:player_id>/seasons")
def player_seasons(player_id: int):
    try:
        seasons = get_player_seasons(player_id)
        only_with_games = request.args.get("only_with_games", "false").lower() == "true"
        if only_with_games:
            seasons = [s for s in seasons if has_games_in_season(player_id, s)]
        return jsonify(seasons)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------- Player shot chart --------
@api_bp.get("/nba/players/<int:player_id>/shots")
def player_shots(player_id: int):
    season = request.args.get("season")
    if not season:
        return jsonify({"error": "Missing required query param: season"}), 400

    team_id = request.args.get("team_id", default=0, type=int)
    measure = request.args.get("measure", default="FGA")

    # Normalise and validate measure to avoid unexpected KeyErrors downstream
    measure = (measure or "FGA").upper().strip()
    allowed_measures = {
        "FGA", "FGM", "FG_PCT", "FG3A", "FG3M", "FG3_PCT",
        "PTS", "FTM", "FTA", "FT_PCT"
    }
    if measure not in allowed_measures:
        return jsonify({"error": f"Invalid measure '{measure}'. Allowed: {sorted(list(allowed_measures))}"}), 400

    try:
        payload = get_player_shotchart(player_id, season, team_id=team_id, measure=measure)
        return jsonify(payload)
    except KeyError as ke:
        # If the services layer signalled a bad measure or missing key, surface it cleanly
        return jsonify({"error": f"Bad request: {str(ke)}"}), 400
    except Exception as e:
        # Log full traceback server-side for debugging; return concise client error
        current_app.logger.exception("/nba/players/%s/shots failed", player_id)
        return jsonify({
            "error": "Failed to load shot chart",
            "detail": str(e)
        }), 500


# ------------------------------------------------- SHOT CHARTS -------------------------------------------------

# Self test endpoint for integration diagnostics
@api_bp.get("/selftest")
def selftest():
    """
    Performs a quick integration check.
    Returns ok true if the ratings CSV can be loaded, else ok false with error details.
    """
    try:
        df = load_full()
        return jsonify(ok=True, rows=int(df.shape[0]), csv_path=resolved_csv_path())
    except Exception as e:
        return jsonify(ok=False, error=str(e), csv_path=resolved_csv_path()), 500
