"""The single SQLAlchemy declarative base every model in db/models/
inherits from. Both backend/ and etl/ import models from here rather than
defining their own -- see db/README.md for why this package exists.

This file does NOT create an engine or a session -- each of backend/ and
etl/ makes its own (backend/app/database.py, etl/db.py), since each is an
independent process with its own DATABASE_URL and connection pool. Only
the *shape* of the data (this Base + db/models/) is shared."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
