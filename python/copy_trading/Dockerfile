# Copy Trading Bridge — Dockerfile
# Built from the repo root so imports like `python.copy_trading.*` resolve.
FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY python/copy_trading/requirements.txt /app/ct_requirements.txt
RUN pip install --no-cache-dir -r /app/ct_requirements.txt

# Copy full project (needed for relative imports python.copy_trading.*)
COPY . /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Default: run the bridge entry point
CMD ["python", "-m", "python.copy_trading.main"]
