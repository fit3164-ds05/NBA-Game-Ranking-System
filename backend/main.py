from flask import Flask, jsonify
from flask_cors import CORS
import os
from app.routes import api_bp
from services.ratings import load_full

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

# Preload the ratings CSV at startup so the first request is fast
try:
    _df = load_full()
    # Optionally log to stdout for deploy diagnostics
    print(f"[startup] Preloaded ratings CSV with {_df.shape[0]} rows")
except Exception as _e:
    # Do not crash the process; the health endpoints will report the error
    print(f"[startup] WARNING: Failed to preload ratings CSV: {_e}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5055)), debug=True)
