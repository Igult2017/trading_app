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
