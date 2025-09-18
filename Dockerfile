FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_FORMAT=parquet

WORKDIR /app

# System build tools for wheels that might need compiling
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install backend dependencies first (better build cache)
COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt \
 && python -m pip show gunicorn || true

# Copy backend code into /app
COPY backend/ /app/

# Ensure data exists; fail clearly if ratings CSV is missing
RUN mkdir -p /app/data \
 && echo "DEBUG: Listing /app" && ls -la /app || true \
 && echo "DEBUG: Listing /app/data" && ls -la /app/data || true \
 && (\
      test -f /app/data/full_ratings.parquet \
   || test -f /app/data/full_ratings.feather \
   || test -f /app/data/full_ratings.csv \
   || (echo "ERROR: Missing ratings data. Provide one of: full_ratings.parquet, full_ratings.feather, or full_ratings.csv in backend/data" && exit 1)\
    )

EXPOSE 5055

# Use module form to avoid PATH issues; gunicorn.conf.py reads PORT env
CMD ["python", "-m", "gunicorn", "main:app", "-c", "gunicorn.conf.py", "--preload", "--workers", "1", "--threads", "4", "--timeout", "180", "--graceful-timeout", "30"]
