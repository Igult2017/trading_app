import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL      = os.environ["DATABASE_URL"]
ENCRYPTION_KEY    = os.environ["COPY_ENCRYPTION_KEY"]
CTRADER_CLIENT_ID = os.environ["CTRADER_CLIENT_ID"]
CTRADER_CLIENT_SECRET = os.environ["CTRADER_CLIENT_SECRET"]

# cTrader Open API endpoints
CT_LIVE_HOST  = "trade.ctrader.com"
CT_DEMO_HOST  = "demo.ctraderapi.com"
CT_PORT       = 5035

# OAuth token refresh
CT_TOKEN_URL  = "https://connect.ctrader.com/oauth2/token"

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
