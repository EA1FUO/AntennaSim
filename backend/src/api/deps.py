"""Dependency injection for API endpoints."""

from typing import Annotated

from fastapi import Depends

from src.config import Settings, settings


def get_settings() -> Settings:
    """Return the application settings (for use with Depends)."""
    return settings


# Typed aliases for use with Annotated[..., Depends(...)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
