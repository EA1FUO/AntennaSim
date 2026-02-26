"""Dependency injection for API endpoints."""

from src.config import settings


def get_settings() -> settings.__class__:
    """Return the application settings."""
    return settings
