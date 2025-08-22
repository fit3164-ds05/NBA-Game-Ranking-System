FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System build tools for any wheels that need compiling
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

COPY data/full_ratings.csv /app/data/full_ratings.csv

EXPOSE 5055
CMD ["sh", "-c", "gunicorn 'main:app' --workers 1 --threads 2 --timeout 120 --graceful-timeout 20 --bind 0.0.0.0:${PORT}"]