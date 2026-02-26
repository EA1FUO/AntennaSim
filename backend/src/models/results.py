"""Simulation result models."""

from pydantic import BaseModel, Field


class Impedance(BaseModel):
    """Complex impedance at the feed point."""

    real: float = Field(description="Resistance (Ohms)")
    imag: float = Field(description="Reactance (Ohms)")


class PatternData(BaseModel):
    """3D radiation pattern data for a single frequency."""

    theta_start: float = Field(description="Starting theta angle (degrees)")
    theta_step: float = Field(description="Theta step size (degrees)")
    theta_count: int = Field(description="Number of theta points")
    phi_start: float = Field(description="Starting phi angle (degrees)")
    phi_step: float = Field(description="Phi step size (degrees)")
    phi_count: int = Field(description="Number of phi points")
    gain_dbi: list[list[float]] = Field(
        description="2D array of gain values [theta_idx][phi_idx] in dBi"
    )


class SegmentCurrent(BaseModel):
    """Current data for a single wire segment (V2)."""

    tag: int = Field(description="Wire tag number")
    segment: int = Field(description="Segment index (1-based)")
    x: float = Field(description="Segment center X coordinate (m)")
    y: float = Field(description="Segment center Y coordinate (m)")
    z: float = Field(description="Segment center Z coordinate (m)")
    current_real: float = Field(description="Current real part (A)")
    current_imag: float = Field(description="Current imaginary part (A)")
    current_magnitude: float = Field(description="Current magnitude (A)")
    current_phase_deg: float = Field(description="Current phase (degrees)")


class FrequencyResult(BaseModel):
    """Simulation results for a single frequency point."""

    frequency_mhz: float
    impedance: Impedance
    swr_50: float = Field(description="SWR relative to 50 ohms")
    gain_max_dbi: float = Field(description="Maximum gain in dBi")
    gain_max_theta: float = Field(description="Theta of maximum gain (degrees)")
    gain_max_phi: float = Field(description="Phi of maximum gain (degrees)")
    front_to_back_db: float | None = Field(
        default=None, description="Front-to-back ratio (dB)"
    )
    beamwidth_e_deg: float | None = Field(
        default=None, description="E-plane -3dB beamwidth (degrees)"
    )
    beamwidth_h_deg: float | None = Field(
        default=None, description="H-plane -3dB beamwidth (degrees)"
    )
    efficiency_percent: float | None = Field(
        default=None, description="Radiation efficiency (%)"
    )
    pattern: PatternData | None = Field(
        default=None, description="Full 3D pattern data"
    )
    currents: list[SegmentCurrent] | None = Field(
        default=None, description="V2: Per-segment current distribution"
    )


class SimulationResult(BaseModel):
    """Complete simulation response."""

    simulation_id: str
    engine: str = "nec2c"
    computed_in_ms: float
    total_segments: int
    cached: bool = False
    frequency_data: list[FrequencyResult]
    warnings: list[str] = Field(default_factory=list)
