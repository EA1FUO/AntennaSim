"""Optimizer configuration and result models."""

from enum import Enum
from pydantic import BaseModel, Field


class OptimizationObjective(str, Enum):
    """What to optimize for."""
    MIN_SWR = "min_swr"              # Minimize SWR at a specific frequency
    MIN_SWR_BAND = "min_swr_band"    # Minimize average SWR across a band
    MAX_GAIN = "max_gain"            # Maximize gain at a specific frequency
    MAX_FB = "max_fb"                # Maximize front-to-back ratio
    COMBINED = "combined"            # Weighted combination


class OptimizationMethod(str, Enum):
    """Optimization algorithm."""
    NELDER_MEAD = "nelder_mead"
    # Future: DIFFERENTIAL_EVOLUTION, GENETIC


class OptimizationVariable(BaseModel):
    """A parameter to optimize.

    Specifies which wire coordinate to vary and its bounds.
    Variables are specified as: wire_tag, field_name (x1, y1, z1, x2, y2, z2, radius)
    with min/max bounds.
    """
    wire_tag: int = Field(ge=1, le=9999)
    field: str = Field(description="Wire field to optimize: x1, y1, z1, x2, y2, z2, radius")
    min_value: float = Field(description="Lower bound")
    max_value: float = Field(description="Upper bound")
    initial_value: float | None = Field(default=None, description="Starting value (default: use current)")

    # Optional: link this variable to another (symmetry constraint)
    linked_wire_tag: int | None = Field(default=None, ge=1, le=9999)
    linked_field: str | None = Field(default=None)
    link_factor: float = Field(default=1.0, description="1.0 = same, -1.0 = mirror")


class OptimizationWeights(BaseModel):
    """Weights for combined objective."""
    swr_weight: float = Field(default=1.0, ge=0, le=10)
    gain_weight: float = Field(default=0.0, ge=0, le=10)
    fb_weight: float = Field(default=0.0, ge=0, le=10)


class OptimizationRequest(BaseModel):
    """Request body for POST /api/v1/optimize."""
    # Base antenna config (same as SimulationRequest)
    wires: list = Field(min_length=1, max_length=500)
    excitations: list = Field(min_length=1)
    ground: dict = Field(default_factory=dict)
    frequency_start_mhz: float = Field(ge=0.1, le=2000)
    frequency_stop_mhz: float = Field(ge=0.1, le=2000)
    frequency_steps: int = Field(default=1, ge=1, le=51)
    loads: list = Field(default_factory=list)
    transmission_lines: list = Field(default_factory=list)

    # Optimizer config
    variables: list[OptimizationVariable] = Field(min_length=1, max_length=10)
    objective: OptimizationObjective = Field(default=OptimizationObjective.MIN_SWR)
    method: OptimizationMethod = Field(default=OptimizationMethod.NELDER_MEAD)
    max_iterations: int = Field(default=100, ge=1, le=500)
    target_frequency_mhz: float | None = Field(default=None, ge=0.1, le=2000,
                                                 description="Target freq for single-freq objectives")
    weights: OptimizationWeights = Field(default_factory=OptimizationWeights)


class OptimizationProgress(BaseModel):
    """Progress update during optimization (sent via response or WebSocket)."""
    iteration: int
    total_iterations: int
    current_cost: float
    best_cost: float
    best_values: dict[str, float]
    status: str  # "running", "converged", "max_iter", "error"


class OptimizationResult(BaseModel):
    """Final optimization result."""
    status: str  # "success", "max_iterations", "error"
    iterations_used: int
    final_cost: float
    optimized_values: dict[str, float]  # "wire_tag.field" -> value
    optimized_wires: list[dict]         # Updated wire list with optimized values
    history: list[dict]                 # [{iteration, cost, values}]
    message: str = ""
