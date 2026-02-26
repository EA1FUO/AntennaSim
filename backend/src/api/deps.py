"""Dependency injection for API endpoints."""

from typing import Annotated

from fastapi import Depends, Request

from src.config import Settings, settings
from src.core.rate_limiter import check_rate_limit, release_concurrent


def get_settings() -> Settings:
    """Return the application settings (for use with Depends)."""
    return settings


async def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency that checks rate limits.

    Usage: add to endpoint signature as
        _rl: Annotated[None, Depends(enforce_rate_limit)]
    """
    await check_rate_limit(request)


async def release_rate_limit(request: Request) -> None:
    """Release the concurrent simulation slot for this IP.

    Call in a finally block or as cleanup.
    """
    await release_concurrent(request)


# Typed aliases for use with Annotated[..., Depends(...)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
