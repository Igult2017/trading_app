from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved once at import time — CWD-independent regardless of where python is invoked from
_PLATFORM_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    # Must point at the same PostgreSQL as the Node.js app so signals appear
    # in AssetPage via /api/trading-signals.
    # Set DATABASE_URL in signal_platform/.env — e.g.:
    #   DATABASE_URL=postgresql://user:pass@localhost/trading_app
    database_url: str

    # ── Scanner ───────────────────────────────────────────────────────────────
    scan_enabled: bool = True
    min_rr: float = 2.0
    min_confidence: float = 0.70

    # Runtime pause: create .scan_paused in the signal_platform/ directory to
    # stop scanning without restarting. Delete the file to resume.
    # Path is absolute so it works regardless of CWD at launch.
    scan_pause_file: str = str(_PLATFORM_ROOT / ".scan_paused")

    # ── News filter ───────────────────────────────────────────────────────────
    news_pre_window_mins: int = 15
    news_post_window_mins: int = 15
    news_calendar_api_key: str = ""

    # ── Notifications ─────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # ── AI validation ─────────────────────────────────────────────────────────
    # Optional. When absent: signals pass AI validation automatically.
    # Failure policy: Gemini errors → signal approved (non-blocking).
    gemini_api_key: str = ""

    # ── Data source 1: cTrader Open API (primary, run auth_setup.py once) ────
    # Credentials: https://ctrader.com/your-app-portal → Applications
    # Account ID: cTrader platform → Settings → Account Info
    ctrader_client_id:     str = ""
    ctrader_client_secret: str = ""
    ctrader_account_id:    int = 0      # numeric ID — MUST be set
    ctrader_env:           str = "demo" # "demo" or "live"

    # OAuth tokens — set in Coolify env vars instead of running auth_setup.py.
    # auth_setup.py prints these values after the one-time local OAuth flow.
    # If the refresh token rotates the platform logs a WARNING with the new value.
    ctrader_access_token:  str = ""
    ctrader_refresh_token: str = ""

    # ── Node.js token bridge ───────────────────────────────────────────────────
    # When both are set, tokens are fetched from broker_accounts (always current)
    # instead of relying on potentially-stale env vars.
    # In Docker the default URL is correct (same container, port 5000).
    admin_secret:   str = ""
    node_api_url:   str = "http://localhost:5000"



settings = Settings()
