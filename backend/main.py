from flask import Flask, jsonify
from flask_cors import CORS
import os
from app.routes import api_bp

def create_app():
    app = Flask(__name__)
    allowed = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else "*"
    CORS(app, resources={r"/*": {"origins": allowed}}, supports_credentials=True)
    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5055)), debug=True)