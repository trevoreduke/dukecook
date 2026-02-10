"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://dukecook:dukecook_dev@localhost:5433/dukecook"
    database_url_sync: str = "postgresql://dukecook:dukecook_dev@localhost:5433/dukecook"

    # Anthropic
    anthropic_api_key: str = ""

    # Google Calendar
    google_calendar_credentials: str = ""
    google_calendar_id: str = "primary"

    # Logging
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Images
    image_dir: str = "./data/images"

    # App
    app_name: str = "DukeCook"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
