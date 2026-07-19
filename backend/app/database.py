"""
Backend's own SQLAlchemy engine/session -- an independent connection pool
from etl's (etl/db.py), since each is a separate process. Both point the
same models (db/models/, sharing db/base.py's Base) at whatever
DATABASE_URL their own .env gives them -- see db/README.md. This file
never calls Base.metadata.create_all() against a real deployment; the .sql
files in db/ are the source of truth for schema.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session, commits on a clean request,
    rolls back on any exception, always closes. Route handlers that only
    read never need to think about this; handlers that write (crud
    functions only flush, never commit) get an all-or-nothing transaction
    for free."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
