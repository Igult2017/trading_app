#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TradeSync Copy Trading Bridge — VPS Deployment Script
# Tested on Ubuntu 20.04 / 22.04 LTS (Hostinger KVM2 or higher recommended)
#
# Run once as root (or sudo):
#   chmod +x python/copy_trading/deploy.sh
#   sudo ./python/copy_trading/deploy.sh
#
# What this script does:
#   1. Installs system packages (Docker, Wine, Xvfb, Supervisor)
#   2. Creates the .env file from template (skips if it already exists)
#   3. Creates storage directories and a dedicated system user
#   4. (Optional) Sets up Wine + Python for Windows + MT5 terminal + bridge
#   5. Builds and starts Docker services (Redis + FastAPI + Worker)
#   6. Installs Supervisor configs for MT5 bridge and copy engine
#   7. Installs a systemd service for auto-restart on reboot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CT_DIR="$REPO_DIR/python/copy_trading"
LOG_DIR="/var/log/tradesync"
DATA_DIR="/var/lib/tradesync"
DEPLOY_USER="tradesync"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
err()  { echo -e "${RED}  ✗ $*${NC}"; }

echo "══════════════════════════════════════════════════════════"
echo "  TradeSync Copy Trading Bridge — VPS Setup"
echo "  Repo: $REPO_DIR"
echo "══════════════════════════════════════════════════════════"

# ── Require root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (or via sudo)."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1. System packages
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[1/7] Installing system packages…"

dpkg --add-architecture i386
apt-get update -q
apt-get install -y -q \
  docker.io docker-compose-plugin \
  curl git \
  python3 python3-pip \
  wine64 wine32 winetricks \
  xvfb x11-utils \
  supervisor \
  wget

systemctl enable --now docker
ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
ok "Wine $(wine --version)"
ok "Supervisor $(supervisord --version 2>/dev/null || echo installed)"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Environment file
# ─────────────────────────────────────────────────────────────────────────────
echo ""
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

# ── MT5 Remote Bridge (Wine on Linux) ────────────────────────────────────────
MT5_BRIDGE_HOST=127.0.0.1
MT5_BRIDGE_PORT=18812

# ── Worker tuning ─────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=4
WORKER_MAX_RETRIES=3
MT5_POLL_INTERVAL=1.0
EOF
  warn "Edit $ENV_FILE and fill in secrets before starting services!"
else
  ok ".env already exists — skipping"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Directories, log rotation, and system user
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[3/7] Creating directories and system user…"

mkdir -p "$LOG_DIR" "$DATA_DIR/tg_sessions"
chmod 750 "$LOG_DIR"
chmod 700 "$DATA_DIR/tg_sessions"

# Create a dedicated system user for the copy engine (no login shell)
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$DEPLOY_USER"
  ok "Created system user: $DEPLOY_USER"
else
  ok "System user $DEPLOY_USER already exists"
fi

# Install symlink so the engine finds the repo at /opt/tradesync
if [ ! -L /opt/tradesync ]; then
  ln -s "$REPO_DIR" /opt/tradesync
  ok "Symlink /opt/tradesync → $REPO_DIR"
fi

chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$LOG_DIR" "$DATA_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Wine + Python (Windows) + MT5 terminal + bridge (optional)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[4/7] MT5 Wine Bridge setup…"
echo ""
read -r -p "  Install/configure the MT5 Wine bridge now? [y/N] " SETUP_WINE
SETUP_WINE="${SETUP_WINE:-N}"

if [[ "$SETUP_WINE" =~ ^[Yy]$ ]]; then

  echo "  Starting virtual display (Xvfb :99)…"
  Xvfb :99 -screen 0 1024x768x16 &
  export DISPLAY=:99
  sleep 2

  # ── 4a. Python 3.9 for Windows inside Wine ──────────────────────────────────
  PY_WIN="$HOME/.wine/drive_c/users/$USER/AppData/Local/Programs/Python/Python39/python.exe"
  if ! DISPLAY=:99 wine python --version &>/dev/null 2>&1; then
    echo "  Downloading Python 3.9.13 Windows installer…"
    PY_INSTALLER="/tmp/python-3.9.13-amd64.exe"
    wget -q --show-progress -O "$PY_INSTALLER" \
      "https://www.python.org/ftp/python/3.9.13/python-3.9.13-amd64.exe"

    echo "  Installing Python 3.9 inside Wine (silent install)…"
    DISPLAY=:99 wine "$PY_INSTALLER" /quiet InstallAllUsers=0 PrependPath=1
    sleep 5
    ok "Python for Windows installed inside Wine"
  else
    ok "Python already present inside Wine — skipping"
  fi

  # ── 4b. MetaTrader5 + mt5-remote inside Wine Python ────────────────────────
  echo "  Installing MetaTrader5 and mt5-remote inside Wine Python…"
  DISPLAY=:99 wine python -m pip install --quiet MetaTrader5 mt5-remote
  ok "MetaTrader5 + mt5-remote installed inside Wine Python"

  # ── 4c. MT5 terminal ────────────────────────────────────────────────────────
  MT5_EXE="$HOME/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe"
  if [ ! -f "$MT5_EXE" ]; then
    echo "  Downloading MT5 installer…"
    MT5_INSTALLER="/tmp/mt5setup.exe"
    wget -q --show-progress -O "$MT5_INSTALLER" \
      "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

    echo "  Installing MT5 terminal inside Wine…"
    DISPLAY=:99 wine "$MT5_INSTALLER" /S
    sleep 10
    ok "MT5 terminal installed"
    warn "Launch MT5 via VNC and log in to your broker account before starting the bridge."
  else
    ok "MT5 terminal already installed — skipping"
  fi

  # ── 4d. Supervisor configs ──────────────────────────────────────────────────
  echo "  Installing Supervisor configs…"
  cp "$CT_DIR/supervisor/mt5bridge.conf"  /etc/supervisor/conf.d/tradesync-mt5bridge.conf
  cp "$CT_DIR/supervisor/copyengine.conf" /etc/supervisor/conf.d/tradesync-copyengine.conf

  # Fix absolute path in copyengine.conf (uses /opt/tradesync symlink)
  sed -i "s|/opt/tradesync|$REPO_DIR|g" /etc/supervisor/conf.d/tradesync-copyengine.conf

  supervisorctl reread
  supervisorctl update
  ok "Supervisor configs installed"

  echo ""
  warn "Next: log in to your MT5 broker account via VNC, then run:"
  warn "  supervisorctl start xvfb mt5terminal mt5bridge"

else
  warn "Skipping Wine/MT5 setup. Only the Telegram signal path will be active."
  warn "To set up the MT5 bridge later, re-run this script and answer Y."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Build Docker images
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[5/7] Building Docker images…"
cd "$REPO_DIR"
docker compose -f "$CT_DIR/docker-compose.yml" build --no-cache
ok "Docker images built"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Start services
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[6/7] Starting Redis + API + Worker…"
docker compose -f "$CT_DIR/docker-compose.yml" up -d

sleep 5
echo "  Health check…"
if curl -sf http://127.0.0.1:8001/health > /dev/null; then
  ok "API is up at http://127.0.0.1:8001"
else
  warn "API not responding yet — check: docker compose -f $CT_DIR/docker-compose.yml logs api"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. Systemd service for Docker services (auto-restart on reboot)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[7/7] Installing systemd service…"
cat > /etc/systemd/system/tradesync-bridge.service << EOF
[Unit]
Description=TradeSync Copy Trading Bridge (Docker)
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
ok "systemd service tradesync-bridge enabled"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  API:     http://127.0.0.1:8001  (internal only)"
echo "  Logs:    docker compose -f $CT_DIR/docker-compose.yml logs -f"
echo "  Stop:    docker compose -f $CT_DIR/docker-compose.yml down"
echo "  Scale:   docker compose -f $CT_DIR/docker-compose.yml up -d --scale worker=4"
echo ""
echo "  MT5 bridge logs:"
echo "    tail -f $LOG_DIR/mt5bridge.log"
echo "    tail -f $LOG_DIR/copyengine.log"
echo ""
echo "  Next steps:"
echo "   1. Edit .env — set DATABASE_URL, COPY_API_SECRET, COPY_ENCRYPTION_KEY"
if [[ "$SETUP_WINE" =~ ^[Yy]$ ]]; then
echo "   2. Log in to your MT5 broker via VNC, then:"
echo "      supervisorctl start xvfb mt5terminal mt5bridge"
echo "   3. Verify bridge: python3 -c \\"
echo "        \"from mt5_remote import MetaTrader5 as mt5; m=mt5(); m.initialize(); print(m.terminal_info())\""
fi
echo "   $([ "${SETUP_WINE:-N}" =~ ^[Yy]$ ] && echo 4 || echo 2). Restart:  systemctl restart tradesync-bridge"
echo "   $([ "${SETUP_WINE:-N}" =~ ^[Yy]$ ] && echo 5 || echo 3). Open the journal → Sync Trade → Start Now to configure accounts"
echo "══════════════════════════════════════════════════════════"
