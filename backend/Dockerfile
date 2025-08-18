FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway injects PORT at runtime. Gunicorn must bind to it.
CMD ["sh", "-c", "gunicorn 'main:app' --workers 2 --threads 4 --timeout 120 --bind 0.0.0.0:${PORT}"]