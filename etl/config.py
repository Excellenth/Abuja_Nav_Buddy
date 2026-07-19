"""
etl/'s own settings -- deliberately not imported from backend/app/config.py.
ETL is a standalone tool that happens to write to the same Postgres
database the backend reads from; it does not depend on the backend's
package at all, so the two can be deployed, run, and change independently
(see etl/README.md)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://transit:transit_dev_local@localhost:5432/transit"

    # Federal Capital Territory bounding box (west, south, east, north) -- must
    # match backend/app/config.py's bbox in spirit (both describe the same
    # area), but each package keeps its own copy rather than importing the
    # other's config module. Matches OSM relation 3717259 ("Federal Capital
    # Territory", admin_level=4) bounds exactly -- was a small pilot-corridor
    # bbox around central Abuja; widened once field data + OSM contributions
    # covered more of the FCT than that corridor.
    bbox_west: float = 6.7785225
    bbox_south: float = 8.45755
    bbox_east: float = 7.7240805
    bbox_north: float = 9.408685

    log_level: str = "INFO"


settings = Settings()
