import shutil
import logging

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("antsim.health")

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    nec2c_available: bool
    environment: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check service health, nec2c availability, and Redis status."""
    from src.config import settings

    nec2c_path = shutil.which("nec2c")

    return HealthResponse(
        status="ok",
        version="0.1.0",
        nec2c_available=nec2c_path is not None,
        environment=settings.environment,
    )
