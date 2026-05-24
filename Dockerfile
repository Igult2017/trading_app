FROM node:20-slim AS builder

WORKDIR /app

# Install Python + uv so `npm run build` (which calls `uv sync`) works
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    && pip3 install --no-cache-dir --break-system-packages uv \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install ALL deps (including dev — needed for build)
COPY package*.json ./
RUN npm ci

# Copy source and build everything exactly as `npm run build` does
COPY . .
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# System libraries needed by Python scripts + sharp (libvips is bundled in
# sharp >= 0.31 but the Debian slim base still needs these for native addons)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Python packages
RUN pip3 install --no-cache-dir --break-system-packages \
    matplotlib \
    mplfinance \
    pandas \
    numpy \
    scipy \
    tessa \
    yfinance \
    pycoingecko \
    pytz \
    requests \
    ta \
    google-genai \
    google-generativeai \
    pillow \
    pytesseract \
    opencv-python-headless \
    psycopg2-binary \
    beautifulsoup4 \
    cloudscraper

# Install production Node dependencies (includes sharp)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy Python scripts
COPY server/python ./server/python
COPY python ./python

# Copy DB migration file
COPY docker-migrate.sql /app/docker-migrate.sql

# Startup script: run DB migrations then start the app
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "=== Environment Check ==="' >> /app/start.sh && \
    echo 'echo "NODE_ENV: $NODE_ENV"' >> /app/start.sh && \
    echo 'echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"' >> /app/start.sh && \
    echo 'echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"' >> /app/start.sh && \
    echo 'echo "========================="' >> /app/start.sh && \
    echo 'echo "=== Running DB migrations ==="' >> /app/start.sh && \
    echo 'if [ -n "$DATABASE_URL" ]; then psql "$DATABASE_URL" -f /app/docker-migrate.sql && echo "Migrations complete" || echo "Migration warning (non-fatal)"; fi' >> /app/start.sh && \
    echo 'exec node dist/index.prod.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 5000

ENV NODE_ENV=production
ENV PYTHON_BIN=/usr/bin/python3

CMD ["/app/start.sh"]
