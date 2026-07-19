"""
Single CLI entry point for every ETL pipeline in this package.

Usage (from etl/, venv active):
  python run.py osm
  python run.py field-data data/your_survey.csv

Each subcommand is a thin wrapper: extract() pulls raw rows from the
source (Overpass/CSV), load() writes them into Postgres inside a single
transaction (commit on success, rollback on any error -- see
etl/db.py and db/README.md).
"""

import argparse
import logging
import os
import sys

if sys.platform == "win32":
    # Windows console defaults (cp1252) can't print the naira sign. logging's
    # default StreamHandler writes to stderr, not stdout -- both need reconfiguring,
    # or unencodable characters get silently backslash-escaped instead of printed.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Run directly as a script (`python run.py` from etl/, or `python etl/run.py`
# from Transportation/), sys.path[0] is set to the directory *containing*
# this file -- never the etl package's own parent. That means the `etl`
# package itself isn't resolvable yet, so etl/__init__.py's sys.path fix
# never gets a chance to run (Python would need to already find `etl` as a
# package to import it and trigger that file). Fix it here, first, before
# any `from etl.xxx import ...` below.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from etl.config import settings  # noqa: E402
from etl.db import SessionLocal  # noqa: E402
from etl.field_data import extract as field_data_extract  # noqa: E402
from etl.field_data import load as field_data_load  # noqa: E402
from etl.logging_config import setup_logging  # noqa: E402
from etl.osm import extract as osm_extract  # noqa: E402
from etl.osm import load as osm_load  # noqa: E402

setup_logging()
logger = logging.getLogger(__name__)

BBOX = (settings.bbox_west, settings.bbox_south, settings.bbox_east, settings.bbox_north)


def run_osm() -> None:
    logger.info("querying Overpass for transit-tagged points in bbox %s ...", BBOX)
    points = osm_extract.fetch_transit_points(BBOX)
    logger.info("%d transit points found -- upserting into destinations cache", len(points))
    db = SessionLocal()
    try:
        inserted, skipped = osm_load.load_transit_points(db, points)
        db.commit()
        logger.info("osm pipeline done: %d inserted, %d already cached (skipped).", inserted, skipped)
    except Exception:
        db.rollback()
        logger.exception("osm pipeline failed, rolled back")
        raise
    finally:
        db.close()


def run_field_data(csv_path: str) -> None:
    logger.info("reading %s ...", csv_path)
    rows = field_data_extract.read_csv(csv_path)
    logger.info("%d rows -- upserting into nodes/edges", len(rows))
    db = SessionLocal()
    try:
        for line in field_data_load.load_rows(db, rows):
            logger.info("  %s", line)
        db.commit()
        logger.info("field-data pipeline done.")
    except Exception:
        db.rollback()
        logger.exception("field-data pipeline failed, rolled back")
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="pipeline", required=True)

    sub.add_parser(
        "osm",
        help="Query OSM (Overpass API) for transit-tagged points (bus stops, taxi ranks) and seed the destinations cache",
    )

    p_field = sub.add_parser("field-data", help="Import a field-survey CSV into nodes/edges")
    p_field.add_argument("csv_path")

    args = parser.parse_args()

    if args.pipeline == "osm":
        run_osm()
    elif args.pipeline == "field-data":
        run_field_data(args.csv_path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
