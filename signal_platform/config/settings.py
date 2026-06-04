from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "sqlite:///./signals.db"

    # Scanner
    scan_enabled: bool = True
    min_rr: float = 2.0
    min_confidence: float = 0.70

    # News filter windows (minutes)
    news_pre_window_mins: int = 15
    news_post_window_mins: int = 15
    news_calendar_api_key: str = ""

    # Notifications
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # AI validation (optional — skipped when key absent)
    gemini_api_key: str = ""

    # Broker (OANDA — wired in later)
    broker_api_key: str = ""
    broker_api_secret: str = ""


settings = Settings()
