import os

# Bind only locally (Apache reverse proxy connects to this)
bind = "127.0.0.1:5000"

# Keep it simple; adjust as needed
workers = int(os.environ.get("GUNICORN_WORKERS", "1"))
threads = int(os.environ.get("GUNICORN_THREADS", "2"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))

accesslog = os.environ.get("GUNICORN_ACCESSLOG", "-")  # stdout
errorlog = os.environ.get("GUNICORN_ERRORLOG", "-")    # stderr
loglevel = os.environ.get("GUNICORN_LOGLEVEL", "warning")

preload_app = True


