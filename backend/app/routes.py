# routes.py
# routes.py
"""
This file defines the API routes for the backend of the NBA Game Ranking System.
It acts as a bridge between the frontend and backend logic, mapping incoming HTTP requests
to Python functions that return JSON responses. Each route corresponds to a specific endpoint,
handling data retrieval, validation, and prediction logic as needed.
"""
from flask import Blueprint, jsonify, request
from services.ratings import teams, seasons_for_team, predict_prob

api_bp = Blueprint("api", __name__)

@api_bp.get("/")
def health():
    # Health check endpoint
    # URL: GET /
    # Returns: JSON indicating the service is running
    return jsonify(status="ok")

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

    # Call the prediction logic from the services layer
    result = predict_prob(home_team, int(home_season), away_team, int(away_season))
    if "error" in result:
        # If prediction returns an error, return 404
        return jsonify(error=result["error"]), 404

    # Return the prediction results along with the input parameters and model version
    return jsonify({
        "inputs": {
            "home_team": home_team,
            "home_season": int(home_season),
            "away_team": away_team,
            "away_season": int(away_season),
        },
        **result,
        "model_version": "glicko_csv_v1",
    })