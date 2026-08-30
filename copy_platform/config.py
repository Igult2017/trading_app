import os
from dotenv import load_dotenv

load_dotenv()

class MissingSettings(RuntimeError):
    """A required setting is absent. Raised on import; caught and reported by main.py."""


def _require(*names: str) -> list[str]:
    """Read required settings, naming EVERY missing one at once.

    These were `os.environ["..."]`, which fails on the FIRST missing name, at import time —
    before logging is configured. So a fresh deployment missing a setting produced a bare
    KeyError traceback, the process exited, `start.sh` restarted it 60 seconds later, and it
    did that forever. Nothing said which setting, and nothing said it twice was the same fault:
    the only outward symptom was the copy engine's heartbeat quietly going stale.

    Collecting all of them matters more than it looks — one restart cycle is a minute, so
    fixing them one at a time is a minute per setting to discover the next.
    """
    missing = [n for n in names if not (os.environ.get(n) or "").strip()]
    if missing:
        raise MissingSettings(
            "the copy engine cannot start — these settings are not set: "
            + ", ".join(missing)
            + ". Set them in the deployment environment and restart."
        )
    return [os.environ[n] for n in names]


DATABASE_URL, ENCRYPTION_KEY, CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET = _require(
    "DATABASE_URL", "COPY_ENCRYPTION_KEY", "CTRADER_CLIENT_ID", "CTRADER_CLIENT_SECRET",
)
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
def _flag(name: str, default: bool) -> bool:
    """A boolean env var, tolerant of how the value actually arrives.

    QUOTES ARE STRIPPED, and that is not cosmetic. Coolify stored COPY_DRY_RUN as the six
    characters 'true' — WITH the single quotes — and the naive parse then read it as neither true
    nor false and fell through to the default. For a kill switch that means the safety silently
    reads OFF while the dashboard shows it ON: the worst possible failure for a flag whose entire
    job is to stop trading. Verified on the live Coolify instance, not hypothesised.

    Also accepts on/off/yes/no, and anything unrecognised falls back to `default` with a WARNING
    rather than being quietly coerced — a typo in a safety flag should be loud.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    val = raw.strip().strip('"').strip("'").strip().lower()
    if val in ("true", "1", "yes", "on"):
        return True
    if val in ("false", "0", "no", "off"):
        return False
    print(f"[config] WARNING: {name}={raw!r} is not a recognised boolean — using {default}")
    return default


COPY_ENABLED = _flag("COPY_ENABLED", True)
COPY_DRY_RUN = _flag("COPY_DRY_RUN", False)

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
