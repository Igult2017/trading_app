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
engine = create_engine(_db_url, echo=False)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


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
    from storage import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
