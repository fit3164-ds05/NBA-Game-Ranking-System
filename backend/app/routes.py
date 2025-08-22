# routes.py
"""
This file defines the API routes for the backend of the NBA Game Ranking System.
It acts as a bridge between the frontend and backend logic, mapping incoming HTTP requests
to Python functions that return JSON responses. Each route corresponds to a specific endpoint,
handling data retrieval, validation, and prediction logic as needed.
"""
import os
from flask import Blueprint, jsonify, request
from services.ratings import teams, seasons_for_team, predict_prob, load_full, resolved_csv_path
from services import ratings

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

    # Return the prediction results along with the input parameters and model version
    return jsonify({
        "inputs": {
            "home_team": home_team,
            "home_season": hs,
            "away_team": away_team,
            "away_season": as_,
        },
        **result,
        "model_version": "glicko_csv_v1",
    })

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

    records = df.to_dict(orient="records")
    total = len(records)
    if offset < 0:
        offset = 0
    if limit is not None and limit >= 0:
        sliced = records[offset: offset + limit]
    else:
        sliced = records[offset:]

    return jsonify(data=sliced, total=total, offset=offset, limit=limit)


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