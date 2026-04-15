#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copy Trading Bridge — VPS Deployment Script
# Tested on Ubuntu 22.04 LTS (single VPS, Phase 1 — up to 10 users)
#
# Run once as root (or sudo):
#   chmod +x python/copy_trading/deploy.sh
#   sudo ./python/copy_trading/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CT_DIR="$REPO_DIR/python/copy_trading"

echo "══════════════════════════════════════════════════════════"
echo "  TradeSync Copy Trading Bridge — VPS Setup"
echo "══════════════════════════════════════════════════════════"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/7] Installing system packages…"
apt-get update -q
apt-get install -y -q docker.io docker-compose-plugin curl git python3 python3-pip

# Start & enable Docker
systemctl enable --now docker
docker --version

# ── 2. Environment file ───────────────────────────────────────────────────────
echo "[2/7] Checking environment file…"
ENV_FILE="$REPO_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "  Creating .env from template…"
  cat > "$ENV_FILE" << 'EOF'
# ── Shared (already set by Node.js journal) ───────────────────────────────────
DATABASE_URL=postgresql://USER:PASS@localhost:5432/trading_app

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# ── Copy Trading Bridge ───────────────────────────────────────────────────────
COPY_API_HOST=0.0.0.0
COPY_API_PORT=8001
COPY_API_SECRET=CHANGE_ME_STRONG_SECRET
COPY_ENCRYPTION_KEY=         # 32-byte hex: openssl rand -hex 32
COPY_LOG_LEVEL=INFO

# ── Telegram sessions storage ─────────────────────────────────────────────────
TELEGRAM_SESSION_DIR=/var/lib/tradesync/tg_sessions

# ── Worker tuning ─────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=4
WORKER_MAX_RETRIES=3
MT5_POLL_INTERVAL=1.0
EOF
  echo "  ⚠  Edit $ENV_FILE and fill in secrets before starting services!"
else
  echo "  .env already exists — skipping"
fi

# ── 3. Session storage directory ──────────────────────────────────────────────
echo "[3/7] Creating Telegram session directory…"
mkdir -p /var/lib/tradesync/tg_sessions
chmod 700 /var/lib/tradesync/tg_sessions

# ── 4. Build Docker images ────────────────────────────────────────────────────
echo "[4/7] Building Docker images…"
cd "$REPO_DIR"
docker compose -f "$CT_DIR/docker-compose.yml" build --no-cache

# ── 5. Start services ─────────────────────────────────────────────────────────
echo "[5/7] Starting Redis + API + Worker…"
docker compose -f "$CT_DIR/docker-compose.yml" up -d

sleep 4
echo "  Health check…"
curl -sf http://127.0.0.1:8001/health && echo "  ✓ API is up" || echo "  ✗ API not responding yet — check logs"

# ── 6. Systemd service for auto-restart on reboot ─────────────────────────────
echo "[6/7] Installing systemd service…"
cat > /etc/systemd/system/tradesync-bridge.service << EOF
[Unit]
Description=TradeSync Copy Trading Bridge
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REPO_DIR
ExecStart=docker compose -f $CT_DIR/docker-compose.yml up -d
ExecStop=docker compose -f $CT_DIR/docker-compose.yml down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tradesync-bridge
echo "  ✓ systemd service enabled"

# ── 7. Status summary ─────────────────────────────────────────────────────────
echo "[7/7] Status"
docker compose -f "$CT_DIR/docker-compose.yml" ps

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  API:     http://127.0.0.1:8001  (internal only)"
echo "  Logs:    docker compose -f $CT_DIR/docker-compose.yml logs -f"
echo "  Stop:    docker compose -f $CT_DIR/docker-compose.yml down"
echo "  Scale:   docker compose -f $CT_DIR/docker-compose.yml up -d --scale worker=4"
echo ""
echo "  Next steps:"
echo "   1. Edit .env — set DATABASE_URL, COPY_API_SECRET, COPY_ENCRYPTION_KEY"
echo "   2. Restart:  systemctl restart tradesync-bridge"
echo "   3. Open the journal → Sync Trade → Start Now to configure accounts"
echo "══════════════════════════════════════════════════════════"
