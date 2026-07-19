"""
App-wide settings, loaded once from .env (see .env.example). Every module
that needs DATABASE_URL / ANTHROPIC_API_KEY imports `settings` from here
instead of reading os.environ directly -- keeps env access in one place.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://transit:transit_dev_local@localhost:5432/transit"
    anthropic_api_key: str = ""

    # Federal Capital Territory bounding box (west, south, east, north) -- used
    # to bias Nominatim geocoding and scope the OSM/Overpass bbox pull. Matches
    # OSM relation 3717259 ("Federal Capital Territory", admin_level=4) bounds
    # exactly, not a guessed rectangle -- was a small pilot-corridor bbox
    # around central Abuja; widened once field data + OSM contributions covered
    # more of the FCT than that corridor.
    bbox_west: float = 6.7785225
    bbox_south: float = 8.45755
    bbox_east: float = 7.7240805
    bbox_north: float = 9.408685

    log_level: str = "INFO"


settings = Settings()
