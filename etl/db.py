"""etl's own SQLAlchemy engine/session -- an independent connection pool
from the backend's (backend/app/database.py), since each is a separate
process. Both point the same models (db/models/, sharing db/base.py's
Base) at whatever DATABASE_URL their own .env gives them -- see
config.py's docstring and db/README.md."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from etl.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
