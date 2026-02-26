import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.api.router import api_router

logger = logging.getLogger("antsim")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown events."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    logger.info("AntSim backend starting — env=%s", settings.environment)
    logger.info("CORS origins: %s", settings.cors_origins)

    # Verify nec2c is available
    import shutil

    nec2c_path = shutil.which("nec2c")
    if nec2c_path:
        logger.info("nec2c found at: %s", nec2c_path)
    else:
        logger.warning("nec2c NOT found in PATH — simulations will fail")

    yield

    logger.info("AntSim backend shutting down")


app = FastAPI(
    title="AntSim API",
    description="Web Antenna Simulator — NEC2 Engine",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_dev else None,
    redoc_url="/redoc" if settings.is_dev else None,
)

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
