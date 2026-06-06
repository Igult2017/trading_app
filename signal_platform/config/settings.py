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

    # ── Broker / data source — Pepperstone cTrader ───────────────────────────
    # Credentials from: https://ctrader.com/your-app-portal → Applications
    # Account ID: open cTrader platform → Settings → Account Info
    ctrader_client_id:     str = ""
    ctrader_client_secret: str = ""
    ctrader_account_id:    int = 0      # numeric ID — MUST be set
    ctrader_env:           str = "demo" # "demo" or "live"


settings = Settings()
