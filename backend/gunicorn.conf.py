# backend/gunicorn.conf.py
import os

bind = f"0.0.0.0:{os.getenv('PORT', '5055')}"  # default to 5055 locally
workers = 2
worker_class = "gthread"
threads = 8
timeout = 120