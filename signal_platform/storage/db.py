"""
SQLAlchemy engine + session factory — PostgreSQL only.
DATABASE_URL must be set in signal_platform/.env.
"""

from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config.settings import settings

# SQLAlchemy 2.0 dropped the legacy "postgres://" prefix — rewrite to "postgresql://"
_db_url = settings.database_url.replace("postgres://", "postgresql://", 1)
# pool_pre_ping recycles dead connections (managed Postgres drops idle ones after
# minutes; this is a long-lived process that queries only every 30-60s), and
# pool_recycle proactively refreshes connections before the server times them out.
engine = create_engine(_db_url, echo=False, pool_pre_ping=True, pool_recycle=300)

# expire_on_commit=False IS LOAD-BEARING — do not remove it.
#
# THE BUG IT KILLS (found 2026-07-27, and it had broken two separate subsystems in production).
# `get_session()` commits on exit and then closes. With SQLAlchemy's default expire_on_commit=True,
# that commit EXPIRES every instance the session loaded, and the close detaches them — so any
# function that returns ORM rows out of the context manager hands the caller objects that raise
# `DetachedInstanceError` on the FIRST attribute read. `signal_repo.get_active()` does exactly that,
# and its two callers both broke silently:
#
#   monitor/signal_monitor.py  `_check_signal(row)` died on `row.symbol`, inside an
#       `asyncio.gather(..., return_exceptions=True)` whose results were discarded. Production ran
#       158 consecutive polls that logged nothing and judged nothing; every signal of 27 Jul sat at
#       `triggered_at = NULL` while price traded straight through the entries.
#   validation/signal_validator.py  `_load_active_from_db()` raised on `row.strategy`, was caught by
#       its own `except Exception`, and left the duplicate guard PERMANENTLY EMPTY. That is how two
#       `vix1 EUR/USD sell` signals went active at once on 27 Jul — the guard could never be seeded.
#
# Both failures were invisible because the exception was swallowed in both places. The logging around
# them is now loud (see those files), but the actual defect is here: rows must survive the session
# that loaded them. `expire_stale()` was unaffected only because it returns plain tuples.
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def create_tables() -> None:
    """Create all tables that don't exist yet (idempotent)."""
    # Import models here so every ORM class is registered on Base.metadata
    # before create_all runs — otherwise metadata is empty and nothing is created.
    # observability_models must be imported for the same reason: a model module that is never
    # imported contributes nothing to metadata and its table is silently never created.
    from storage import models  # noqa: F401
    from storage import observability_models  # noqa: F401
    from storage import autotrade_models     # noqa: F401  — same reason: unimported = uncreated
    Base.metadata.create_all(bind=engine)
