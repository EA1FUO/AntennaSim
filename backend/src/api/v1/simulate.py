"""POST /api/v1/simulate — Run NEC2 simulation with caching and rate limiting."""

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request

from src.models.simulation import SimulationRequest
from src.models.results import SimulationResult
from src.simulation.nec_input import build_card_deck
from src.simulation.nec_runner import run_nec2c, NecExecutionError
from src.simulation.nec_output import parse_nec_output, parse_near_field_output
from src.simulation.cache import compute_cache_key, get_cached_result, set_cached_result
from src.core.rate_limiter import check_rate_limit, release_concurrent

logger = logging.getLogger("antsim.simulate")

router = APIRouter()


@router.post("/simulate", response_model=SimulationResult)
async def simulate(request_body: SimulationRequest, request: Request) -> SimulationResult:
    """Run an NEC2 simulation with the given antenna geometry.

    Takes wire geometry, excitation, ground config, and frequency sweep.
    Returns impedance, SWR, gain, and radiation pattern data.

    Features:
    - Redis cache: identical requests return cached results in <5ms
    - Rate limiting: 30 sims/hour, 5 concurrent per IP
    - Structured error responses (never exposes stack traces)
    """
    sim_id = uuid.uuid4().hex[:12]
    total_segments = sum(w.segments for w in request_body.wires)

    logger.info(
        "Simulation %s: %d wires, %d segments, %.1f-%.1f MHz (%d steps)",
        sim_id,
        len(request_body.wires),
        total_segments,
        request_body.frequency.start_mhz,
        request_body.frequency.stop_mhz,
        request_body.frequency.steps,
    )

    # Check rate limits (raises 429 if exceeded)
    await check_rate_limit(request)

    try:
        # Check cache first
        request_dict = request_body.model_dump(mode="json")
        cache_key = compute_cache_key(request_dict)
        cached = await get_cached_result(cache_key)

        if cached is not None:
            logger.info("Simulation %s: cache HIT", sim_id)
            # Override metadata for this request
            cached["simulation_id"] = sim_id
            cached["cached"] = True
            cached["computed_in_ms"] = 0.0
            return SimulationResult.model_validate(cached)

        # Build NEC2 card deck
        card_deck = build_card_deck(request_body)
        logger.debug("Card deck for %s:\n%s", sim_id, card_deck)

        # Run nec2c
        start_time = time.perf_counter()
        try:
            output = run_nec2c(card_deck)
        except NecExecutionError as e:
            logger.error("Simulation %s failed: %s", sim_id, e.message)
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "simulation_failed",
                    "message": e.message,
                    "simulation_id": sim_id,
                },
            )
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        # Parse output
        try:
            frequency_data = parse_nec_output(
                output,
                n_theta=request_body.pattern.n_theta,
                n_phi=request_body.pattern.n_phi,
                theta_start=request_body.pattern.theta_start,
                theta_step=request_body.pattern.theta_step,
                phi_start=request_body.pattern.phi_start,
                phi_step=request_body.pattern.phi_step,
                compute_currents=request_body.compute_currents,
            )
        except Exception as e:
            logger.error("Output parsing failed for %s: %s", sim_id, e)
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "parse_failed",
                    "message": "Failed to parse NEC2 output",
                    "simulation_id": sim_id,
                },
            )

        # Parse near-field data if requested
        near_field_result = None
        if request_body.near_field and request_body.near_field.enabled:
            try:
                near_field_result = parse_near_field_output(
                    output,
                    plane=request_body.near_field.plane,
                    height_m=request_body.near_field.height_m,
                    extent_m=request_body.near_field.extent_m,
                    resolution_m=request_body.near_field.resolution_m,
                )
            except Exception as e:
                logger.warning("Near-field parsing failed for %s: %s", sim_id, e)
                # Non-fatal — continue without near-field data

        if not frequency_data:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "no_results",
                    "message": "NEC2 produced no usable results — check geometry",
                    "simulation_id": sim_id,
                },
            )

        # Collect warnings
        warnings: list[str] = []
        for fd in frequency_data:
            if fd.swr_50 > 10.0:
                warnings.append(
                    f"Very high SWR ({fd.swr_50:.1f}) at {fd.frequency_mhz:.3f} MHz"
                )
            if fd.impedance.real < 1.0:
                warnings.append(
                    f"Very low feed resistance ({fd.impedance.real:.1f} \u03A9) at {fd.frequency_mhz:.3f} MHz"
                )

        logger.info(
            "Simulation %s complete: %.0fms, %d freq points, max gain=%.1f dBi",
            sim_id,
            elapsed_ms,
            len(frequency_data),
            max(fd.gain_max_dbi for fd in frequency_data),
        )

        result = SimulationResult(
            simulation_id=sim_id,
            engine="nec2c",
            computed_in_ms=round(elapsed_ms, 1),
            total_segments=total_segments,
            cached=False,
            frequency_data=frequency_data,
            near_field=near_field_result,
            warnings=warnings,
        )

        # Cache the result
        await set_cached_result(cache_key, result.model_dump(mode="json"))

        return result

    finally:
        # Always release the concurrent counter
        await release_concurrent(request)
