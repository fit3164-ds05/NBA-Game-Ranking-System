FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5055 \
    RATINGS_CSV=/app/data/full_ratings.csv

WORKDIR /app

# System build tools for any wheels that need compiling
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the entire build context to a temp folder so this works whether the
# context is repo root or backend/. Then stage files into /app explicitly.
COPY . /tmp/buildctx

# If the context contains a backend/ dir, use that as the app root; otherwise use the context root
RUN if [ -d /tmp/buildctx/backend ]; then \
      cp -r /tmp/buildctx/backend/* /app/; \
    else \
      cp -r /tmp/buildctx/* /app/; \
    fi

# Install Python deps (requirements.txt is now in /app)
RUN pip install --no-cache-dir -r requirements.txt

# Ensure data dir exists, copy ratings CSV from either location, and assert presence
RUN mkdir -p /app/data && \
    if [ -f /tmp/buildctx/backend/data/full_ratings.csv ]; then \
      cp /tmp/buildctx/backend/data/full_ratings.csv /app/data/full_ratings.csv; \
    elif [ -f /tmp/buildctx/data/full_ratings.csv ]; then \
      cp /tmp/buildctx/data/full_ratings.csv /app/data/full_ratings.csv; \
    else \
      echo "ERROR: full_ratings.csv not found in build context (expected backend/data or data)" && exit 1; \
    fi

# Debug listings (remove if noisy)
RUN echo "DEBUG: Listing /app" && ls -la /app || true
RUN echo "DEBUG: Listing /app/data" && ls -la /app/data || true

EXPOSE 5055
# Rely on gunicorn.conf.py to set bind from PORT env; avoid shell var expansion issues
CMD ["gunicorn", "main:app", "-c", "gunicorn.conf.py", "--preload", "--workers", "1", "--threads", "4", "--timeout", "180", "--graceful-timeout", "30"]
