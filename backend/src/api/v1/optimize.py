"""POST /api/v1/optimize — Run antenna parameter optimization."""

import logging

from fastapi import APIRouter, HTTPException, Request

from src.models.optimization import OptimizationRequest, OptimizationResult
from src.simulation.optimizer import run_optimization
from src.core.rate_limiter import check_rate_limit, release_concurrent

logger = logging.getLogger("antsim.api.optimize")

router = APIRouter()


@router.post("/optimize", response_model=OptimizationResult)
async def optimize(request_body: OptimizationRequest, request: Request) -> OptimizationResult:
    """Run antenna parameter optimization.

    Uses Nelder-Mead optimization where each iteration runs a full NEC2 simulation.
    Supports min SWR, max gain, max F/B, and weighted combined objectives.

    Note: This is a synchronous endpoint. For real-time progress updates,
    use the WebSocket endpoint /api/v1/ws/optimize (V2 future).
    """
    # Rate limit (optimization uses many sim cycles)
    await check_rate_limit(request)

    try:
        logger.info(
            "Optimization request: %d variables, %s objective, max %d iterations",
            len(request_body.variables),
            request_body.objective,
            request_body.max_iterations,
        )

        result = run_optimization(request_body)

        logger.info(
            "Optimization complete: status=%s, iterations=%d, cost=%.4f",
            result.status, result.iterations_used, result.final_cost,
        )

        return result

    except Exception as e:
        logger.error("Optimization failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "optimization_failed",
                "message": str(e),
            },
        )
    finally:
        await release_concurrent(request)
