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

    # ── Data source 2: MT5 via Wine/Docker (Pepperstone-accurate, no GUI needed) ─
    mt5_host:     str = "mt5"
    mt5_port:     int = 8812
    mt5_login:    int = 0
    mt5_password: str = ""
    mt5_server:   str = "Pepperstone-Demo"

    # ── Data source 3: ejtraderCT FIX (live price overlay on yfinance history) ─
    ctrader_fix_server:   str = ""
    ctrader_fix_login:    str = ""
    ctrader_fix_password: str = ""
    ctrader_fix_broker:   str = "pepperstone"
    ctrader_fix_currency: str = "USD"


settings = Settings()
