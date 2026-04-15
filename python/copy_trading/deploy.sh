#!/usr/bin/env bash
# =============================================================================
# TradeSync — Full VPS Deployment Script
# Tested on: Ubuntu 20.04 / 22.04 / 24.04 LTS
#
# Usage (run once as root or via sudo):
#   chmod +x python/copy_trading/deploy.sh
#   sudo ./python/copy_trading/deploy.sh
#
# What this installs automatically:
#   1. System packages  — Node.js 20, Python 3, Docker, Wine, Xvfb, Supervisor
#   2. PostgreSQL       — database server
#   3. Redis            — trade queue (via Docker)
#   4. Node.js app      — main trading dashboard (systemd service)
#   5. Wine + MT5       — MetaTrader 5 terminal inside Wine
#   6. mt5-remote       — Python-to-MT5 RPC bridge inside Wine
#   7. Copy engine      — FastAPI + Worker (via Docker)
#   8. Supervisor       — keeps MT5 bridge and copy engine alive
#
# After this script finishes you only need to:
#   1. Fill in /opt/tradesync/.env  (DATABASE_URL, COPY_ENCRYPTION_KEY, etc.)
#   2. Open VNC to log in to the MT5 terminal with your broker credentials
#   3. Run: supervisorctl start xvfb mt5terminal mt5bridge
# =============================================================================
set -euo pipefail

# ── Paths & constants ─────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CT_DIR="$REPO_DIR/python/copy_trading"
LOG_DIR="/var/log/tradesync"
DATA_DIR="/var/lib/tradesync"
DEPLOY_USER="tradesync"
SYMLINK="/opt/tradesync"
NODE_PORT=5000

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()      { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${NC}"; }
err()     { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
section() { echo -e "\n${CYAN}[$1/9] $2${NC}"; }

echo "============================================================"
echo "  TradeSync — Full VPS Setup"
echo "  Repo : $REPO_DIR"
echo "  User : $DEPLOY_USER"
echo "============================================================"

# ── Guard: must be root ───────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run this script as root or with sudo."

# =============================================================================
# 1. System packages
# =============================================================================
section 1 "System packages"

dpkg --add-architecture i386
apt-get update -q

# Node.js 20 (official NodeSource repo)
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
fi

apt-get install -y -q \
  nodejs \
  python3 python3-pip python3-venv \
  docker.io docker-compose-plugin \
  wine64 wine32 winetricks \
  xvfb x11-utils xdotool \
  supervisor \
  postgresql postgresql-contrib \
  redis-tools \
  curl wget git build-essential \
  libpq-dev

systemctl enable --now docker postgresql

ok "Node  $(node -v)"
ok "npm   $(npm -v)"
ok "Wine  $(wine --version)"
ok "PG    $(psql --version | head -1)"
ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"

# =============================================================================
# 2. Directories, symlink, and system user
# =============================================================================
section 2 "Directories & system user"

mkdir -p "$LOG_DIR" "$DATA_DIR/tg_sessions"
chmod 750 "$LOG_DIR"
chmod 700 "$DATA_DIR/tg_sessions"

if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$DEPLOY_USER"
  ok "Created system user: $DEPLOY_USER"
else
  ok "System user $DEPLOY_USER already exists"
fi

# Canonical path for all configs
if [ ! -L "$SYMLINK" ]; then
  ln -s "$REPO_DIR" "$SYMLINK"
  ok "Symlink $SYMLINK → $REPO_DIR"
else
  ok "Symlink $SYMLINK already exists"
fi

chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$LOG_DIR" "$DATA_DIR"

# =============================================================================
# 3. Environment file
# =============================================================================
section 3 "Environment file"

ENV_FILE="$REPO_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'ENVEOF'
# =============================================================================
# TradeSync — Environment Variables
# Fill in every value marked  ← REQUIRED  before starting services.
# =============================================================================

# ── Database (PostgreSQL) ─────────────────────────────────────────────────────
DATABASE_URL=postgresql://tradesync:CHANGE_ME_DB_PASS@localhost:5432/tradesync

# ── Session secret (Node.js) ──────────────────────────────────────────────────
# Generate with:  openssl rand -hex 32
SESSION_SECRET=CHANGE_ME_SESSION_SECRET

# ── Google Gemini AI ──────────────────────────────────────────────────────────
GOOGLE_API_KEY=

# ── Telegram Bot ─────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# ── Copy Trading API ──────────────────────────────────────────────────────────
COPY_API_HOST=0.0.0.0
COPY_API_PORT=8001
# Generate with:  openssl rand -hex 24
COPY_API_SECRET=CHANGE_ME_STRONG_SECRET

# ── Copy Trading Encryption ───────────────────────────────────────────────────
# Generate with:  openssl rand -hex 32          ← REQUIRED for copy trading
COPY_ENCRYPTION_KEY=

# ── MT5 Remote Bridge ─────────────────────────────────────────────────────────
MT5_BRIDGE_HOST=127.0.0.1
MT5_BRIDGE_PORT=18812
MT5_POLL_INTERVAL=1.0
MT5_RECONNECT_ATTEMPTS=5
MT5_RECONNECT_DELAY=5.0

# ── Telegram session storage ──────────────────────────────────────────────────
TELEGRAM_SESSION_DIR=/var/lib/tradesync/tg_sessions

# ── Worker tuning ─────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=4
WORKER_MAX_RETRIES=3

# ── App ───────────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=production
PYTHON_BIN=/usr/bin/python3
ENVEOF
  warn "Created $ENV_FILE — edit it and fill in every CHANGE_ME value before starting."
else
  ok ".env already exists — skipping"
fi

# =============================================================================
# 4. PostgreSQL — create DB and user
# =============================================================================
section 4 "PostgreSQL database"

PG_DB="tradesync"
PG_USER="tradesync"

# Read password from .env if already set, else use placeholder
DB_PASS=$(grep -oP '(?<=postgresql://tradesync:)[^@]+' "$ENV_FILE" 2>/dev/null || true)
DB_PASS="${DB_PASS:-CHANGE_ME_DB_PASS}"

if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1; then
  ok "PostgreSQL user $PG_USER already exists"
else
  sudo -u postgres psql -c "CREATE USER $PG_USER WITH PASSWORD '$DB_PASS';"
  ok "Created PostgreSQL user: $PG_USER"
fi

if sudo -u postgres psql -lqt | cut -d\| -f1 | grep -qw "$PG_DB"; then
  ok "Database $PG_DB already exists"
else
  sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"
  ok "Created database: $PG_DB"
fi

# =============================================================================
# 5. Node.js app — install dependencies & build
# =============================================================================
section 5 "Node.js app (trading dashboard)"

cd "$REPO_DIR"
npm ci --prefer-offline 2>/dev/null || npm install
npm run build
ok "Node.js app built"

# Python deps
python3 -m pip install --quiet -r "$CT_DIR/requirements.txt"
ok "Python deps installed"

# ── Systemd service for Node.js app ──────────────────────────────────────────
cat > /etc/systemd/system/tradesync-app.service << SVCEOF
[Unit]
Description=TradeSync Trading Dashboard (Node.js)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$REPO_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(which node) dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/app.log
StandardError=append:$LOG_DIR/app_err.log

[Install]
WantedBy=multi-user.target
SVCEOF

chown "$DEPLOY_USER":"$DEPLOY_USER" "$REPO_DIR" -R 2>/dev/null || true
systemctl daemon-reload
systemctl enable tradesync-app
ok "tradesync-app systemd service enabled"

# =============================================================================
# 6. Wine + Python (Windows) + MT5 terminal + mt5-remote bridge
# =============================================================================
section 6 "Wine / MT5 terminal setup"

# Initialise a Wine prefix as root (runs on :99 display)
echo "  Initialising Wine prefix…"
Xvfb :99 -screen 0 1024x768x16 &
XVFB_PID=$!
export DISPLAY=:99
sleep 3

# Silence Wine debug noise
export WINEDEBUG=-all
export WINEPREFIX="$HOME/.wine"

# Install .NET 4.0 stub + common fonts (MT5 needs these)
winetricks -q dotnet40 corefonts vcrun2019 2>/dev/null || true

# ── Python 3.9 for Windows inside Wine ───────────────────────────────────────
if ! DISPLAY=:99 wine python --version &>/dev/null 2>&1; then
  echo "  Downloading Python 3.9.13 (Windows)…"
  PY_INSTALLER="/tmp/python-3.9.13-amd64.exe"
  wget -q --show-progress -O "$PY_INSTALLER" \
    "https://www.python.org/ftp/python/3.9.13/python-3.9.13-amd64.exe"

  echo "  Installing Python inside Wine…"
  DISPLAY=:99 wine "$PY_INSTALLER" /quiet InstallAllUsers=0 PrependPath=1
  sleep 8
  ok "Python 3.9 installed inside Wine"
else
  ok "Python already present inside Wine — skipping"
fi

# ── MetaTrader5 + mt5-remote inside Wine Python ──────────────────────────────
echo "  Installing MetaTrader5 + mt5-remote inside Wine Python…"
DISPLAY=:99 wine python -m pip install --quiet --upgrade pip MetaTrader5 mt5-remote
ok "MetaTrader5 + mt5-remote installed inside Wine Python"

# ── MT5 terminal binary ───────────────────────────────────────────────────────
MT5_EXE="$HOME/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe"
if [ ! -f "$MT5_EXE" ]; then
  echo "  Downloading MetaTrader 5 installer (official MQL5 CDN)…"
  MT5_INSTALLER="/tmp/mt5setup.exe"
  wget -q --show-progress -O "$MT5_INSTALLER" \
    "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

  echo "  Installing MT5 terminal inside Wine (silent)…"
  DISPLAY=:99 wine "$MT5_INSTALLER" /S
  sleep 15
  ok "MT5 terminal installed"
else
  ok "MT5 terminal already installed — skipping"
fi

# Stop the temporary Xvfb we started for setup
kill $XVFB_PID 2>/dev/null || true

# =============================================================================
# 7. Supervisor — keeps Xvfb, MT5, bridge, and copy engine alive
# =============================================================================
section 7 "Supervisor configs"

mkdir -p /etc/supervisor/conf.d

# mt5bridge.conf already targets /opt/tradesync symlink
cp "$CT_DIR/supervisor/mt5bridge.conf"  /etc/supervisor/conf.d/tradesync-mt5bridge.conf
cp "$CT_DIR/supervisor/copyengine.conf" /etc/supervisor/conf.d/tradesync-copyengine.conf

# Replace placeholder path with actual repo path
sed -i "s|/opt/tradesync|$REPO_DIR|g" /etc/supervisor/conf.d/tradesync-copyengine.conf

supervisorctl reread  2>/dev/null || true
supervisorctl update  2>/dev/null || true
ok "Supervisor configs installed (MT5 bridge and copy engine)"

# =============================================================================
# 8. Docker services — Redis + FastAPI copy bridge + Worker
# =============================================================================
section 8 "Docker services (Redis + Copy API + Worker)"

cd "$REPO_DIR"
docker compose -f "$CT_DIR/docker-compose.yml" build --no-cache
docker compose -f "$CT_DIR/docker-compose.yml" up -d

sleep 6
if curl -sf http://127.0.0.1:8001/health > /dev/null 2>&1; then
  ok "Copy Trading API is up at http://127.0.0.1:8001"
else
  warn "Copy API not yet responding — check: docker compose -f $CT_DIR/docker-compose.yml logs api"
fi

# Systemd service to restart Docker services on reboot
cat > /etc/systemd/system/tradesync-bridge.service << BRIDGESVC
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
BRIDGESVC

systemctl daemon-reload
systemctl enable tradesync-bridge
ok "tradesync-bridge systemd service enabled"

# =============================================================================
# 9. Logrotate
# =============================================================================
section 9 "Log rotation"

cat > /etc/logrotate.d/tradesync << 'LOGEOF'
/var/log/tradesync/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  sharedscripts
  postrotate
    supervisorctl signal HUP all > /dev/null 2>&1 || true
  endscript
}
LOGEOF
ok "Log rotation configured"

# =============================================================================
# Done — post-install checklist
# =============================================================================
echo ""
echo "============================================================"
echo -e "${GREEN}  Installation complete!${NC}"
echo "============================================================"
echo ""
echo "  REQUIRED — edit your env file and set these values:"
echo ""
echo "    $ENV_FILE"
echo ""
echo "    DATABASE_URL        postgresql://tradesync:<password>@localhost:5432/tradesync"
echo "    SESSION_SECRET      openssl rand -hex 32"
echo "    COPY_API_SECRET     openssl rand -hex 24"
echo "    COPY_ENCRYPTION_KEY openssl rand -hex 32"
echo "    GOOGLE_API_KEY      (your Gemini API key)"
echo "    TELEGRAM_BOT_TOKEN  (your bot token, if using Telegram)"
echo ""
echo "  AFTER setting env vars, run:"
echo ""
echo "    1. Start the trading dashboard:"
echo "       systemctl start tradesync-app"
echo "       journalctl -u tradesync-app -f"
echo ""
echo "    2. Connect MT5 to your broker (one-time, done via VNC):"
echo "       Install a VNC server:  apt install tigervnc-standalone-server"
echo "       Start VNC:             vncserver :1"
echo "       In the VNC session:    DISPLAY=:99 wine '$MT5_EXE'"
echo "       Log in to your broker account inside the MT5 terminal window."
echo ""
echo "    3. Start the MT5 bridge + copy engine:"
echo "       supervisorctl start xvfb mt5terminal mt5bridge copyengine"
echo ""
echo "    4. Verify the bridge is connected:"
echo "       python3 -c \"from mt5_remote import MetaTrader5 as mt5; m=mt5(); m.initialize(); print(m.terminal_info())\""
echo ""
echo "  Logs:"
echo "    App     : journalctl -u tradesync-app -f"
echo "    Bridge  : tail -f $LOG_DIR/mt5bridge.log"
echo "    Engine  : tail -f $LOG_DIR/copyengine.log"
echo "    Docker  : docker compose -f $CT_DIR/docker-compose.yml logs -f"
echo ""
echo "  Management:"
echo "    Stop all  : systemctl stop tradesync-app tradesync-bridge"
echo "    Restart   : systemctl restart tradesync-app"
echo "    Scale     : docker compose -f $CT_DIR/docker-compose.yml up -d --scale worker=4"
echo "============================================================"
