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
