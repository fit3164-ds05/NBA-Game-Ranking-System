FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_FORMAT=parquet

WORKDIR /app

# System build tools for wheels that might need compiling
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install backend dependencies first (better build cache)
COPY backend/requirements.txt /app/backend_requirements.txt
RUN python -m pip install --no-cache-dir -r /app/backend_requirements.txt \
 && python -m pip show gunicorn || true

# Copy backend code, preserving directory structure expected by imports
COPY backend /app/backend

# Ensure required runtime datasets exist (fail fast during build)
RUN mkdir -p /app/backend/data \
 && echo "DEBUG: Listing /app" && ls -la /app || true \
 && echo "DEBUG: Listing /app/backend/data" && ls -la /app/backend/data || true \
 && missing=0 \
 && for name in team_ratings team_ratings_seasonal team_metrics team_metrics_seasonal drivers_of_ratings_top drivers_of_ratings_seasonal; do \
      if [ ! -f "/app/backend/data/${name}.parquet" ] \
         && [ ! -f "/app/backend/data/${name}.feather" ] \
         && [ ! -f "/app/backend/data/${name}.csv" ]; then \
        echo "ERROR: Missing dataset '${name}' (provide .parquet, .feather, or .csv)"; \
        missing=1; \
      fi; \
    done; \
    if ! test -f /app/backend/data/nba_teams.csv; then \
      echo "ERROR: Missing dataset 'nba_teams.csv'"; \
      missing=1; \
    fi; \
    if [ "$missing" -ne 0 ]; then exit 1; fi

WORKDIR /app/backend

EXPOSE 5055

# Use module form to avoid PATH issues; gunicorn.conf.py reads PORT env
CMD ["python", "-m", "gunicorn", "main:app", "-c", "gunicorn.conf.py", "--preload", "--workers", "1", "--threads", "4", "--timeout", "180", "--graceful-timeout", "30"]
