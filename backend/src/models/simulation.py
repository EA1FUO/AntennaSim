"""Simulation request/response Pydantic models."""

from pydantic import BaseModel, Field, model_validator

from src.models.antenna import Wire, Excitation
from src.models.ground import GroundConfig


class FrequencyConfig(BaseModel):
    """Frequency sweep configuration."""

    start_mhz: float = Field(ge=0.1, le=500.0, description="Start frequency (MHz)")
    stop_mhz: float = Field(ge=0.1, le=500.0, description="Stop frequency (MHz)")
    steps: int = Field(ge=1, le=201, description="Number of frequency steps")

    @model_validator(mode="after")
    def validate_range(self) -> "FrequencyConfig":
        if self.stop_mhz < self.start_mhz:
            raise ValueError("stop_mhz must be >= start_mhz")
        return self

    @property
    def step_mhz(self) -> float:
        if self.steps <= 1:
            return 0.0
        return (self.stop_mhz - self.start_mhz) / (self.steps - 1)


class PatternConfig(BaseModel):
    """Radiation pattern calculation configuration."""

    theta_start: float = Field(default=-90.0, ge=-90.0, le=90.0)
    theta_stop: float = Field(default=90.0, ge=-90.0, le=90.0)
    theta_step: float = Field(default=5.0, ge=1.0, le=30.0)
    phi_start: float = Field(default=0.0, ge=0.0, le=360.0)
    phi_stop: float = Field(default=355.0, ge=0.0, le=360.0)
    phi_step: float = Field(default=5.0, ge=1.0, le=30.0)

    @property
    def n_theta(self) -> int:
        return int((self.theta_stop - self.theta_start) / self.theta_step) + 1

    @property
    def n_phi(self) -> int:
        return int((self.phi_stop - self.phi_start) / self.phi_step) + 1


class SimulationRequest(BaseModel):
    """Request body for POST /api/v1/simulate."""

    wires: list[Wire] = Field(min_length=1, max_length=500)
    excitations: list[Excitation] = Field(min_length=1, max_length=50)
    ground: GroundConfig = Field(default_factory=GroundConfig)
    frequency: FrequencyConfig
    pattern: PatternConfig = Field(default_factory=PatternConfig)
    comment: str = Field(default="AntSim simulation", max_length=200)

    @model_validator(mode="after")
    def validate_total_segments(self) -> "SimulationRequest":
        total = sum(w.segments for w in self.wires)
        if total > 5000:
            raise ValueError(
                f"Total segments ({total}) exceeds maximum of 5000"
            )
        return self

    @model_validator(mode="after")
    def validate_excitations_reference_valid_wires(self) -> "SimulationRequest":
        wire_tags = {w.tag for w in self.wires}
        for ex in self.excitations:
            if ex.wire_tag not in wire_tags:
                raise ValueError(
                    f"Excitation references wire tag {ex.wire_tag} "
                    f"which doesn't exist. Valid tags: {wire_tags}"
                )
        return self
