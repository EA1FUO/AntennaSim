from fastapi import APIRouter

from src.api.v1.health import router as health_router
from src.api.v1.simulate import router as simulate_router

api_router = APIRouter()

# V1 routes
api_router.include_router(health_router, prefix="/v1", tags=["health"])
api_router.include_router(simulate_router, prefix="/v1", tags=["simulation"])
