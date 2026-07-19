"""Logging setup for the backend. Call setup_logging() once, at import time
in app/main.py -- every module below just does
`logger = logging.getLogger(__name__)` and logs normally."""

import logging

from app.config import settings


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # SQLAlchemy's engine logger at INFO prints every SQL statement -- useful
    # while debugging a query, way too noisy for normal request traffic.
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
