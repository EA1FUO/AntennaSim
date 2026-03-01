"""AntennaSim Backend — FastAPI application factory with lifespan events."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.api.router import api_router
from src.core.exceptions import register_exception_handlers
from src.simulation.cache import get_redis, close_redis

logger = logging.getLogger("antsim")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown events."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    logger.info("AntennaSim backend starting — env=%s", settings.environment)
    logger.info("CORS origins: %s", settings.cors_origins)

    # Verify nec2c is available
    import shutil

    nec2c_path = shutil.which("nec2c")
    if nec2c_path:
        logger.info("nec2c found at: %s", nec2c_path)
    else:
        logger.warning("nec2c NOT found in PATH — simulations will fail")

    # Initialize Redis connection
    redis_conn = await get_redis()
    if redis_conn:
        logger.info("Redis cache enabled")
    else:
        logger.warning("Redis unavailable — caching and rate limiting disabled")

    yield

    # Shutdown: close Redis
    await close_redis()
    logger.info("AntennaSim backend shutting down")


app = FastAPI(
    title="AntennaSim API",
    description="Web Antenna Simulator — NEC2 Engine",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.is_dev else None,
    redoc_url="/redoc" if settings.is_dev else None,
)

# Register custom exception handlers
register_exception_handlers(app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router, prefix="/api")
