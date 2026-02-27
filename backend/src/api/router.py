from fastapi import APIRouter

from src.api.v1.health import router as health_router
from src.api.v1.simulate import router as simulate_router
from src.api.v1.convert import router as convert_router
from src.api.v1.optimize import router as optimize_router
from src.api.v1.ws import router as ws_router

api_router = APIRouter()

# V1 routes
api_router.include_router(health_router, prefix="/v1", tags=["health"])
api_router.include_router(simulate_router, prefix="/v1", tags=["simulation"])

# V2 routes
api_router.include_router(convert_router, prefix="/v1", tags=["convert"])
api_router.include_router(optimize_router, prefix="/v1", tags=["optimizer"])
api_router.include_router(ws_router, prefix="/v1", tags=["websocket"])
