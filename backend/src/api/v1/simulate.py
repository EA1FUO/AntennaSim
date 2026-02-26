"""POST /api/v1/simulate — Run NEC2 simulation."""

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException

from src.models.simulation import SimulationRequest
from src.models.results import SimulationResult
from src.simulation.nec_input import build_card_deck
from src.simulation.nec_runner import run_nec2c, NecExecutionError
from src.simulation.nec_output import parse_nec_output

logger = logging.getLogger("antsim.simulate")

router = APIRouter()


@router.post("/simulate", response_model=SimulationResult)
async def simulate(request: SimulationRequest) -> SimulationResult:
    """Run an NEC2 simulation with the given antenna geometry.

    Takes wire geometry, excitation, ground config, and frequency sweep.
    Returns impedance, SWR, gain, and radiation pattern data.
    """
    sim_id = uuid.uuid4().hex[:12]
    total_segments = sum(w.segments for w in request.wires)

    logger.info(
        "Simulation %s: %d wires, %d segments, %.1f-%.1f MHz (%d steps)",
        sim_id,
        len(request.wires),
        total_segments,
        request.frequency.start_mhz,
        request.frequency.stop_mhz,
        request.frequency.steps,
    )

    # Build NEC2 card deck
    card_deck = build_card_deck(request)
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
            n_theta=request.pattern.n_theta,
            n_phi=request.pattern.n_phi,
            theta_start=request.pattern.theta_start,
            theta_step=request.pattern.theta_step,
            phi_start=request.pattern.phi_start,
            phi_step=request.pattern.phi_step,
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
                f"Very low feed resistance ({fd.impedance.real:.1f} Ω) at {fd.frequency_mhz:.3f} MHz"
            )

    logger.info(
        "Simulation %s complete: %.0fms, %d freq points, max gain=%.1f dBi",
        sim_id,
        elapsed_ms,
        len(frequency_data),
        max(fd.gain_max_dbi for fd in frequency_data),
    )

    return SimulationResult(
        simulation_id=sim_id,
        engine="nec2c",
        computed_in_ms=round(elapsed_ms, 1),
        total_segments=total_segments,
        cached=False,
        frequency_data=frequency_data,
        warnings=warnings,
    )
