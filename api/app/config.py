"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://dukecook:dukecook_dev@localhost:5433/dukecook"
    database_url_sync: str = "postgresql://dukecook:dukecook_dev@localhost:5433/dukecook"

    # Anthropic
    anthropic_api_key: str = ""

    # Home Assistant Calendar Integration
    ha_url: str = ""  # e.g. https://6g4hp0yxylk47d9p85gxoala2lvs1w8l.ui.nabu.casa
    ha_token: str = ""  # Long-lived access token
    ha_calendars: str = "calendar.28582_house_calendar,calendar.trevor_28582famcal"  # Comma-separated entity IDs read for busy-night detection

    # Meal -> family calendar sync (write path).
    # When a dinner is planned, DukeCook creates a matching event on this HA calendar
    # (Google-backed "28582 house calendar" -> syncs to everyone's phones).
    ha_write_calendar: str = "calendar.28582_house_calendar"
    meal_calendar_sync: bool = True                 # master on/off switch
    meal_calendar_meal_types: str = "dinner"        # comma-separated meal_types that get an event
    meal_event_start: str = "17:30"                 # local HH:MM for the dinner block start
    meal_event_end: str = "18:30"                   # local HH:MM for the dinner block end

    # Logging
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Kroger API
    kroger_client_id: str = ""
    kroger_client_secret: str = ""
    kroger_store_id: str = "01800661"  # Kroger Middlebelt, Farmington Hills MI

    # Images
    image_dir: str = "./data/images"

    # App
    app_name: str = "DukeCook"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
