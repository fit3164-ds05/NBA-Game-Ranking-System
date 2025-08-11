from flask import Flask
from flask_cors import CORS
from app.routes import api_bp


def create_app():
    app = Flask(__name__)
    # Enable CORS for all routes so the frontend can call the API during development
    CORS(app)

    # Mount the API blueprint at /api so routes in routes.py appear under /api
    # For example health will be at GET /api/
    app.register_blueprint(api_bp, url_prefix="/api")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
