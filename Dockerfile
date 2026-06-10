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

# DB migration file (applied at container startup)
COPY docker-migrate.sql /app/docker-migrate.sql

# Startup: run DB migrations then launch the app
RUN printf '%s\n' \
    '#!/bin/sh' \
    'echo "=== Environment Check ==="' \
    'echo "NODE_ENV: $NODE_ENV"' \
    'echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"' \
    'echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"' \
    'echo "========================="' \
    'echo "=== Running DB migrations ==="' \
    'if [ -n "$DATABASE_URL" ]; then psql "$DATABASE_URL" -f /app/docker-migrate.sql && echo "Migrations complete" || echo "Migration warning (non-fatal)"; fi' \
    'exec node dist/index.prod.js' \
    > /app/start.sh && chmod +x /app/start.sh

EXPOSE 5000
ENV NODE_ENV=production
ENV PYTHON_BIN=/usr/bin/python3

CMD ["/app/start.sh"]
