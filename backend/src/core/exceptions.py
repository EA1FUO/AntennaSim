"""Custom exception handlers for the API."""

import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("antsim.exceptions")


class SimulationError(Exception):
    """Raised when NEC2 simulation fails."""

    def __init__(self, message: str, details: str | None = None):
        self.message = message
        self.details = details
        super().__init__(message)


class ValidationError(Exception):
    """Raised when input geometry validation fails."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers."""

    @app.exception_handler(SimulationError)
    async def simulation_error_handler(
        request: Request, exc: SimulationError
    ) -> JSONResponse:
        logger.error("Simulation error: %s", exc.message)
        return JSONResponse(
            status_code=422,
            content={"error": "simulation_failed", "message": exc.message},
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        logger.warning("Validation error: %s", exc.message)
        return JSONResponse(
            status_code=400,
            content={"error": "validation_failed", "message": exc.message},
        )
