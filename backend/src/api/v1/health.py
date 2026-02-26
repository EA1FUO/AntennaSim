"""GET /api/v1/health — Service health check."""

import shutil
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from src.simulation.cache import get_redis

logger = logging.getLogger("antsim.health")

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    nec2c_available: bool
    redis_connected: bool
    environment: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check service health, nec2c availability, and Redis status."""
    from src.config import settings

    nec2c_path = shutil.which("nec2c")

    # Check Redis
    redis_connected = False
    try:
        r = await get_redis()
        if r is not None:
            await r.ping()
            redis_connected = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        version="0.1.0",
        nec2c_available=nec2c_path is not None,
        redis_connected=redis_connected,
        environment=settings.environment,
    )
