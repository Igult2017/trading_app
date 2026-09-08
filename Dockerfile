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

# NO BROWSER IN THIS IMAGE — deliberately, 2026-09-09.
#
# Google Chrome, Xvfb, the extra font families and the playwright package all lived here to clear
# MyFXBook's JavaScript challenge. They are gone because the calendar no longer needs a browser:
# the source is ForexFactory's weekly JSON feed, one plain HTTPS request (news_calendar._FF_URL).
#
# It is not only that they became unnecessary. A browser in this container was actively DANGEROUS:
# on 2026-09-07 a Chrome process that failed to shut down was started every 15 minutes, the leak
# accumulated until the box ran out of memory, and the site and Coolify both stopped answering.
# Anything that reintroduces a browser here has to solve that first — unconditional shutdown, a hard
# cap on browser lifetime, and a leak test that proves the process count returns to zero.

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
