ARG BASE_IMAGE=ghcr.io/igult2017/trading-app-base:latest

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS builder

WORKDIR /app

# Install ALL Node deps (dev included — vite, esbuild, tsx needed for build)
COPY package*.json ./
RUN npm ci --registry https://registry.npmjs.org

# Copy source and compile
COPY . .
# Run vite + esbuild directly — Python packages are already in the base image
# so uv sync is not needed here
RUN node_modules/.bin/vite build && \
    node_modules/.bin/esbuild server/index.ts \
        --platform=node --packages=external --bundle --format=esm --outdir=dist && \
    node_modules/.bin/esbuild server/index.prod.ts \
        --platform=node --packages=external --bundle --format=esm --outdir=dist

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS production

WORKDIR /app

# Production Node deps only (no dev tools)
COPY package*.json ./
RUN npm ci --omit=dev --registry https://registry.npmjs.org

# Compiled JS from builder
COPY --from=builder /app/dist ./dist

# Python scripts invoked at runtime by the Node server
COPY server/python ./server/python
COPY python ./python

# Signal platform (Python — runs alongside Node.js in the same container)
COPY signal_platform ./signal_platform

# Install signal platform Python deps (separate from the base image's server/python deps)
RUN pip install --no-cache-dir --break-system-packages -r signal_platform/requirements.txt

# Copy-trading engine (Python — runs alongside Node.js + signal platform in the same container)
COPY copy_platform ./copy_platform

# Install copy engine Python deps
RUN pip install --no-cache-dir --break-system-packages -r copy_platform/requirements.txt

# ── Real Google Chrome + a virtual display, for the economic calendar ────────
#
# MyFXBook now serves a JavaScript challenge. Measured 2026-09-07, getting past it needs all three
# of: REAL Chrome (Chromium is refused), a VISIBLE window (headless is refused), and the launch flag
# --disable-blink-features=AutomationControlled. Remove any one and the page never resolves.
#
# So: google-chrome-stable for the first, xvfb for the second (start.sh runs the display), and the
# playwright python package to drive it. No browser download — playwright drives the system Chrome
# via channel="chrome", which is the whole point; `playwright install` would fetch Chromium, which
# is the build that does NOT work.
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget gnupg xvfb fonts-liberation && \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --break-system-packages playwright

# DB migration file (applied at container startup)
COPY docker-migrate.sql /app/docker-migrate.sql

# Startup script — copied from repo so any change invalidates the Docker layer cache
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 5000
ENV NODE_ENV=production
ENV PYTHON_BIN=/usr/bin/python3
ENV PYTHONUNBUFFERED=1

CMD ["/app/start.sh"]
