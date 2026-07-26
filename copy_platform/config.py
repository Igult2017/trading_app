import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL      = os.environ["DATABASE_URL"]
ENCRYPTION_KEY    = os.environ["COPY_ENCRYPTION_KEY"]
CTRADER_CLIENT_ID = os.environ["CTRADER_CLIENT_ID"]
CTRADER_CLIENT_SECRET = os.environ["CTRADER_CLIENT_SECRET"]
# The "Journal Trade Sync" cTrader app — accounts CONNECTED under it carry `app: "sync"` in their
# stored creds, and their tokens only authenticate under THIS app's credentials. Optional: when
# unset, everything falls back to the legacy pair above.
CTRADER_SYNC_CLIENT_ID     = os.environ.get("CTRADER_SYNC_CLIENT_ID", "")
CTRADER_SYNC_CLIENT_SECRET = os.environ.get("CTRADER_SYNC_CLIENT_SECRET", "")


def ctrader_app_creds(creds: dict | None) -> tuple[str, str]:
    """(client_id, client_secret) for the app that ISSUED this account's tokens — tokens are
    app-bound, so authenticating with the other app's credentials fails (invalid client)."""
    if (creds or {}).get("app") == "sync" and CTRADER_SYNC_CLIENT_ID and CTRADER_SYNC_CLIENT_SECRET:
        return CTRADER_SYNC_CLIENT_ID, CTRADER_SYNC_CLIENT_SECRET
    return CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET

# Telegram copy-bot — added as ADMIN to provider channels; one shared poller reads
# their posts. Optional: if unset, Telegram providers are simply skipped.
TELEGRAM_COPY_BOT_TOKEN = os.environ.get("TELEGRAM_COPY_BOT_TOKEN", "")
# The notification bot (TELEGRAM_BOT_TOKEN) already long-polls getUpdates; using the
# SAME token here would make two pollers 409-conflict. Warn loudly — use a separate bot.
_notif_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
if TELEGRAM_COPY_BOT_TOKEN and _notif_token and \
        TELEGRAM_COPY_BOT_TOKEN.strip() == _notif_token.strip():
    print("[config] WARNING: TELEGRAM_COPY_BOT_TOKEN == TELEGRAM_BOT_TOKEN — two "
          "getUpdates pollers on one bot will 409-conflict. Use a SEPARATE copy bot.")

# User-session relay (optional, advanced) — ONE app registered at my.telegram.org lets
# users authorize their OWN Telegram account to relay channels the bot can't be admin of.
# Unset → relay disabled; the bot marketplace/direct flows are unaffected.
TELEGRAM_API_ID   = int(os.environ.get("TELEGRAM_API_ID", "0") or "0")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")

# cTrader Open API endpoints. NOTE: the live gateway is "live.ctraderapi.com" — NOT
# "trade.ctrader.com" (the web terminal). The working signal platform + Node broker
# adapter both use live.ctraderapi.com; the old value silently failed every live account.
CT_LIVE_HOST  = "live.ctraderapi.com"
CT_DEMO_HOST  = "demo.ctraderapi.com"
CT_PORT       = 5035

# OAuth token refresh
CT_TOKEN_URL  = "https://connect.ctrader.com/oauth2/token"

# ── COPY ENGINE SAFETY ─────────────────────────────────────────────────────────
# COPY_ENABLED defaults TRUE so deploying this changes nothing. It exists because until now there
# was NO way to stop the copy engine trading short of killing the process — and "kill the process"
# is not a control you want to reach for while positions are open.
# COPY_DRY_RUN runs the entire path — risk guard, sizing, symbol resolution, credential decrypt —
# and LOGS the order it would have placed instead of sending it. That is what makes a change to
# order sizing verifiable against a real account before a single real order is sized by it.
COPY_ENABLED = os.environ.get("COPY_ENABLED", "true").strip().lower() not in ("false", "0", "no")
COPY_DRY_RUN = os.environ.get("COPY_DRY_RUN", "false").strip().lower() in ("true", "1", "yes")

POLL_INTERVAL_SEC = 2      # fallback REST poll interval
RECONNECT_DELAY   = 5      # seconds before reconnecting a dropped provider
MAX_EXEC_RETRIES  = 3

# Periodic safety reconcile — re-fetch a master's open positions to catch closes
# that arrived while disconnected (so followers don't strand).
RECONCILE_INTERVAL = int(os.environ.get("COPY_RECONCILE_SEC", "30"))

# Horizontal-scale seam — run N engine processes, each with a distinct
# COPY_WORKER_INDEX (0..COUNT-1) and the same COPY_WORKER_COUNT. Each worker owns
# a hash-disjoint subset of masters, so no master is ever copied twice. Defaults
# to a single worker that owns everything (no behaviour change).
COPY_WORKER_INDEX = int(os.environ.get("COPY_WORKER_INDEX", "0"))
COPY_WORKER_COUNT = max(1, int(os.environ.get("COPY_WORKER_COUNT", "1")))
