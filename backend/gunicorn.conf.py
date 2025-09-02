# backend/gunicorn.conf.py
import os

# Robust port resolution: fall back if PORT is unset or contains a literal like "$PORT"
_env_port = os.getenv('PORT', '5055')
try:
    # Accept numeric strings only
    _port_int = int(str(_env_port).strip())
    if _port_int <= 0:
        raise ValueError
    _port = str(_port_int)
except Exception:
    _port = '5055'

bind = f"0.0.0.0:{_port}"  # default to 5055 locally
workers = 2
worker_class = "gthread"
threads = 8
timeout = 120
