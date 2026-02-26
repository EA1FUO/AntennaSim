"""Antenna parameter optimizer using Nelder-Mead.

Each iteration runs a full NEC2 simulation and evaluates the objective function.
Supports optimization of wire coordinates, lengths, spacings, and heights.
"""

import copy
import logging
import time

from scipy.optimize import minimize

from src.models.optimization import (
    OptimizationRequest,
    OptimizationVariable,
    OptimizationObjective,
    OptimizationResult,
)
from src.simulation.nec_input import build_card_deck
from src.simulation.nec_runner import run_nec2c, NecExecutionError
from src.simulation.nec_output import parse_nec_output
from src.models.simulation import SimulationRequest, FrequencyConfig
from src.models.antenna import Wire, Excitation
from src.models.ground import GroundConfig

logger = logging.getLogger("antsim.optimizer")


def _apply_variables(
    wires: list[dict],
    variables: list[OptimizationVariable],
    values: list[float],
) -> list[dict]:
    """Apply optimization variable values to wire list."""
    wires = copy.deepcopy(wires)

    for var, val in zip(variables, values):
        # Find the wire by tag
        for w in wires:
            if w["tag"] == var.wire_tag:
                w[var.field] = val
                break

        # Apply linked variables (symmetry)
        if var.linked_wire_tag is not None and var.linked_field is not None:
            for w in wires:
                if w["tag"] == var.linked_wire_tag:
                    w[var.linked_field] = val * var.link_factor
                    break

    return wires


def _evaluate_objective(
    request: OptimizationRequest,
    wires: list[dict],
) -> float:
    """Run a NEC2 simulation and compute the objective function value.

    Returns a scalar cost that the optimizer tries to minimize.
    """
    # Build a SimulationRequest
    try:
        wire_models = [Wire(**w) for w in wires]
    except Exception as e:
        logger.warning("Invalid wire geometry during optimization: %s", e)
        return 1e6  # Penalty for invalid geometry

    excitation_models = [Excitation(**e) for e in request.excitations]

    ground_config = GroundConfig(**request.ground) if request.ground else GroundConfig()

    freq_config = FrequencyConfig(
        start_mhz=request.frequency_start_mhz,
        stop_mhz=request.frequency_stop_mhz,
        steps=request.frequency_steps,
    )

    sim_request = SimulationRequest(
        wires=wire_models,
        excitations=excitation_models,
        ground=ground_config,
        frequency=freq_config,
        comment="optimizer iteration",
    )

    card_deck = build_card_deck(sim_request)

    try:
        output = run_nec2c(card_deck)
    except NecExecutionError:
        return 1e6  # Penalty for failed sim

    try:
        freq_data = parse_nec_output(
            output,
            n_theta=37, n_phi=73,
            theta_start=-90, theta_step=5,
            phi_start=0, phi_step=5,
            compute_currents=False,
        )
    except Exception:
        return 1e6

    if not freq_data:
        return 1e6

    # Compute cost based on objective
    objective = request.objective

    if objective == OptimizationObjective.MIN_SWR:
        # Minimize SWR at target frequency (or center frequency)
        target = request.target_frequency_mhz or (
            (request.frequency_start_mhz + request.frequency_stop_mhz) / 2
        )
        # Find closest frequency point
        closest = min(freq_data, key=lambda d: abs(d.frequency_mhz - target))
        return closest.swr_50

    elif objective == OptimizationObjective.MIN_SWR_BAND:
        # Minimize average SWR across all frequencies
        avg_swr = sum(d.swr_50 for d in freq_data) / len(freq_data)
        return avg_swr

    elif objective == OptimizationObjective.MAX_GAIN:
        # Maximize gain (minimize negative gain)
        target = request.target_frequency_mhz or (
            (request.frequency_start_mhz + request.frequency_stop_mhz) / 2
        )
        closest = min(freq_data, key=lambda d: abs(d.frequency_mhz - target))
        return -closest.gain_max_dbi  # Negate because we're minimizing

    elif objective == OptimizationObjective.MAX_FB:
        # Maximize front-to-back ratio
        target = request.target_frequency_mhz or (
            (request.frequency_start_mhz + request.frequency_stop_mhz) / 2
        )
        closest = min(freq_data, key=lambda d: abs(d.frequency_mhz - target))
        fb = closest.front_to_back_db if closest.front_to_back_db else 0
        return -fb  # Negate

    elif objective == OptimizationObjective.COMBINED:
        # Weighted combination
        w = request.weights
        target = request.target_frequency_mhz or (
            (request.frequency_start_mhz + request.frequency_stop_mhz) / 2
        )
        closest = min(freq_data, key=lambda d: abs(d.frequency_mhz - target))
        cost = 0.0
        if w.swr_weight > 0:
            cost += w.swr_weight * closest.swr_50
        if w.gain_weight > 0:
            cost -= w.gain_weight * closest.gain_max_dbi
        if w.fb_weight > 0:
            fb = closest.front_to_back_db if closest.front_to_back_db else 0
            cost -= w.fb_weight * fb
        return cost

    return 1e6


def run_optimization(request: OptimizationRequest) -> OptimizationResult:
    """Run the optimizer.

    Uses scipy.optimize.minimize with Nelder-Mead method.
    Each function evaluation runs a full NEC2 simulation.

    Args:
        request: Optimization configuration.

    Returns:
        OptimizationResult with optimized wire values and history.
    """
    variables = request.variables
    history: list[dict] = []
    best_cost = float("inf")
    iteration_count = 0

    # Initial values
    x0: list[float] = []
    bounds: list[tuple[float, float]] = []
    var_names: list[str] = []

    for var in variables:
        if var.initial_value is not None:
            x0.append(var.initial_value)
        else:
            # Use current value from wire list
            for w in request.wires:
                if w["tag"] == var.wire_tag:
                    x0.append(w.get(var.field, (var.min_value + var.max_value) / 2))
                    break
            else:
                x0.append((var.min_value + var.max_value) / 2)

        bounds.append((var.min_value, var.max_value))
        var_names.append(f"{var.wire_tag}.{var.field}")

    logger.info(
        "Starting optimization: %d variables, %s objective, max %d iterations",
        len(variables), request.objective, request.max_iterations,
    )

    def objective_fn(x: list[float]) -> float:
        nonlocal best_cost, iteration_count
        iteration_count += 1

        # Clamp to bounds
        x_clamped = [
            max(b[0], min(b[1], v)) for v, b in zip(x, bounds)
        ]

        # Apply variables to wires
        modified_wires = _apply_variables(request.wires, variables, x_clamped)

        # Evaluate
        cost = _evaluate_objective(request, modified_wires)

        # Track history
        if cost < best_cost:
            best_cost = cost

        history.append({
            "iteration": iteration_count,
            "cost": round(cost, 4),
            "values": {name: round(val, 6) for name, val in zip(var_names, x_clamped)},
        })

        if iteration_count % 10 == 0:
            logger.info(
                "Optimizer iteration %d: cost=%.4f, best=%.4f",
                iteration_count, cost, best_cost,
            )

        return cost

    start_time = time.perf_counter()

    try:
        result = minimize(
            objective_fn,
            x0=x0,
            method="Nelder-Mead",
            options={
                "maxiter": request.max_iterations,
                "xatol": 0.001,
                "fatol": 0.001,
                "adaptive": True,
            },
        )

        elapsed = time.perf_counter() - start_time

        # Apply final values
        final_values = [
            max(b[0], min(b[1], v)) for v, b in zip(result.x, bounds)
        ]
        optimized_wires = _apply_variables(request.wires, variables, final_values)

        status = "success" if result.success else "max_iterations"
        message = result.message if hasattr(result, "message") else ""

        logger.info(
            "Optimization complete: status=%s, iterations=%d, cost=%.4f, time=%.1fs",
            status, iteration_count, result.fun, elapsed,
        )

        return OptimizationResult(
            status=status,
            iterations_used=iteration_count,
            final_cost=round(float(result.fun), 4),
            optimized_values={
                name: round(val, 6) for name, val in zip(var_names, final_values)
            },
            optimized_wires=optimized_wires,
            history=history,
            message=str(message),
        )

    except Exception as e:
        logger.error("Optimization error: %s", e)
        return OptimizationResult(
            status="error",
            iterations_used=iteration_count,
            final_cost=best_cost if best_cost < 1e6 else 0,
            optimized_values={name: round(val, 6) for name, val in zip(var_names, x0)},
            optimized_wires=request.wires,
            history=history,
            message=str(e),
        )
