"""
SQLAlchemy engine + session factory — PostgreSQL only.
DATABASE_URL must be set in signal_platform/.env.
"""

from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config.settings import settings

engine = create_engine(settings.database_url, echo=False)

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
    Base.metadata.create_all(bind=engine)
