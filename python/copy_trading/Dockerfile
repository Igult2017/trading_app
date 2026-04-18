# Copy Trading Bridge — Dockerfile
# Build context is the repo root so python.copy_trading.* imports resolve.
#
# Startup sequence (handled by entrypoint.sh):
#   1. Wait for MT5 RPyC port to accept connections (up to 10 min on first boot)
#   2. Wait 10 s for MT5 to finish internal initialisation
#   3. exec the CMD (worker or uvicorn)

FROM python:3.11-slim

WORKDIR /app

# System deps — netcat-openbsd provides the nc command used by entrypoint.sh
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libpq-dev \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer cached unless requirements change)
COPY python/copy_trading/requirements.txt /app/ct_requirements.txt
RUN pip install --no-cache-dir -r /app/ct_requirements.txt

# Copy full project (needed for relative imports python.copy_trading.*)
COPY . /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Make the entrypoint executable
RUN chmod +x /app/python/copy_trading/entrypoint.sh

ENTRYPOINT ["/app/python/copy_trading/entrypoint.sh"]

# Default: run the bridge worker.
# The bridge-api service overrides this with the uvicorn command.
CMD ["python", "-m", "python.copy_trading.main"]
