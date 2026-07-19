"""Logging setup for etl. Call setup_logging() once, at the top of
etl/run.py -- every module below just does `logger = logging.getLogger(__name__)`
and logs normally; nothing else needs to configure handlers/formatting."""

import logging

from etl.config import settings


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Third-party libraries at INFO level are noisy (S3/HTTP retries, SQL
    # compilation, etc.) and drown out the pipeline's own progress logs.
    for noisy in ("botocore", "urllib3", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
