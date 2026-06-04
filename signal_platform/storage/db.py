"""
SQLAlchemy engine + session factory.
Default: SQLite for local dev.
Set DATABASE_URL=postgresql://... to write into the existing app DB
that the AssetPage already queries.
"""

from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config.settings import settings

engine = create_engine(
    settings.database_url,
    # SQLite needs check_same_thread=False; ignored for other dialects
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite") else {},
    echo=False,
)

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
