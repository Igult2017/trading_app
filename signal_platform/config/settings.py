from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    # MUST point at the same PostgreSQL as the Node.js app so signals appear
    # in the AssetPage via /api/trading-signals.
    # Example: postgresql://user:pass@localhost/mydb
    # Default falls back to local SQLite for offline dev only.
    database_url: str = "sqlite:///./signals.db"

    # ── Scanner ───────────────────────────────────────────────────────────────
    scan_enabled: bool = True
    min_rr: float = 2.0
    min_confidence: float = 0.70

    # Runtime pause: create a file named ".scan_paused" in the
    # signal_platform/ directory to stop scanning without restarting.
    # Delete the file to resume. Checked at the start of every scan tick.
    scan_pause_file: str = ".scan_paused"

    # ── News filter ───────────────────────────────────────────────────────────
    news_pre_window_mins: int = 15
    news_post_window_mins: int = 15
    # NEWS_CALENDAR_API_KEY is unused — fetcher pulls from Forex Factory
    # public JSON feed which requires no key.
    news_calendar_api_key: str = ""

    # ── Notifications ─────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""   # single channel; subscriber management TBD

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
    # Connects to the gmag11/metatrader5_vnc container via mt5linux (RPyC).
    # MT5_HOST = Docker service name ("mt5") or IP; MT5_PORT = RPyC port (8812).
    # Login: your Pepperstone MT5 account number + trading password + server name.
    # First time only: log in once via VNC at http://localhost:3010
    mt5_host:     str = "mt5"               # Docker service hostname
    mt5_port:     int = 8812                # RPyC server port
    mt5_login:    int = 0                   # MT5 account number
    mt5_password: str = ""                  # MT5 trading password
    mt5_server:   str = "Pepperstone-Demo"  # MT5 server name

    # ── Data source 3: ejtraderCT FIX (live price overlay on yfinance history) ─
    # FIX server + credentials: cTrader platform → Settings → FIX API
    # Password is a numeric PIN set there — NOT your trading password.
    ctrader_fix_server:   str = ""          # e.g. h21.p.ctrader.com:5211
    ctrader_fix_login:    str = ""          # account number
    ctrader_fix_password: str = ""          # numeric FIX API PIN
    ctrader_fix_broker:   str = "pepperstone"
    ctrader_fix_currency: str = "USD"


settings = Settings()
