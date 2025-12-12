"""
Configuration for the signal scanner.
Contains all adjustable parameters, timeouts, and thresholds.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class ScannerConfig:
    """Main scanner configuration."""
    min_confidence: int = 60
    watchlist_min_confidence: int = 40
    signal_cooldown_hours: float = 2.0
    signal_expiry_hours: float = 4.0
    max_concurrent_fetches: int = 10
    price_fetch_timeout: float = 10.0
    price_fetch_retries: int = 3
    cache_ttl_seconds: int = 60
    

@dataclass
class DatabaseConfig:
    """Database configuration."""
    database_url: str = os.environ.get("DATABASE_URL", "")
    pool_size: int = 5
    max_overflow: int = 10


@dataclass
class TelegramConfig:
    """Telegram notification configuration."""
    bot_token: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id: str = os.environ.get("TELEGRAM_CHAT_ID", "")
    enabled: bool = bool(os.environ.get("TELEGRAM_BOT_TOKEN"))


@dataclass
class GeminiConfig:
    """Gemini AI validation configuration."""
    api_key: str = os.environ.get("GOOGLE_API_KEY", "")
    enabled: bool = bool(os.environ.get("GOOGLE_API_KEY"))
    model: str = "gemini-2.0-flash"
    timeout: float = 30.0


scanner_config = ScannerConfig()
database_config = DatabaseConfig()
telegram_config = TelegramConfig()
gemini_config = GeminiConfig()
