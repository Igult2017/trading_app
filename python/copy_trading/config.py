"""
Centralised configuration for the copy trading bridge.
All values are read from environment variables so secrets never live in code.
"""
import os

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_HOST: str = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB:   int = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD: str | None = os.getenv("REDIS_PASSWORD")

TRADE_QUEUE_KEY   = "copy_trade:queue"
TRADE_QUEUE_DLQ   = "copy_trade:dlq"          # dead-letter queue for failed trades

# ── FastAPI ───────────────────────────────────────────────────────────────────
API_HOST: str = os.getenv("COPY_API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("COPY_API_PORT", "8001"))
API_SECRET: str = os.getenv("COPY_API_SECRET", "changeme")

# ── Encryption ────────────────────────────────────────────────────────────────
ENCRYPTION_KEY: str = os.getenv("COPY_ENCRYPTION_KEY", "")   # 32-byte hex string

# ── MT5 ───────────────────────────────────────────────────────────────────────
MT5_POLL_INTERVAL_SEC:  float = float(os.getenv("MT5_POLL_INTERVAL", "1.0"))
MT5_RECONNECT_ATTEMPTS: int   = int(os.getenv("MT5_RECONNECT_ATTEMPTS", "5"))
MT5_RECONNECT_DELAY_SEC: float = float(os.getenv("MT5_RECONNECT_DELAY", "5.0"))

# ── Worker ────────────────────────────────────────────────────────────────────
WORKER_CONCURRENCY:    int   = int(os.getenv("WORKER_CONCURRENCY", "4"))
WORKER_MAX_RETRIES:    int   = int(os.getenv("WORKER_MAX_RETRIES", "3"))
WORKER_RETRY_DELAY_SEC: float = float(os.getenv("WORKER_RETRY_DELAY", "2.0"))

# ── Telegram ──────────────────────────────────────────────────────────────────
TELEGRAM_SESSION_DIR: str = os.getenv("TELEGRAM_SESSION_DIR", "/tmp/tg_sessions")

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("COPY_LOG_LEVEL", "INFO")
