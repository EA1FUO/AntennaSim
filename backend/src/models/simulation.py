"""Simulation request/response Pydantic models."""

from pydantic import BaseModel, Field, model_validator

from src.models.antenna import Wire, Excitation, LumpedLoad, TransmissionLine, WireArc, GeometryTransform, CylindricalSymmetry
from src.models.ground import GroundConfig


class NearFieldConfig(BaseModel):
    """Near-field calculation configuration."""

    enabled: bool = Field(default=False, description="Enable near-field calculation")
    plane: str = Field(default="horizontal", description="horizontal or vertical")
    height_m: float = Field(default=1.8, ge=0.0, le=100.0,
                             description="Height of horizontal plane (m)")
    extent_m: float = Field(default=20.0, ge=1.0, le=200.0,
                             description="Half-extent of calculation grid (m)")
    resolution_m: float = Field(default=0.5, ge=0.1, le=10.0,
                                 description="Grid resolution (m)")


class FrequencyConfig(BaseModel):
    """Frequency sweep configuration."""

    start_mhz: float = Field(ge=0.1, le=2000.0, description="Start frequency (MHz)")
    stop_mhz: float = Field(ge=0.1, le=2000.0, description="Stop frequency (MHz)")
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
    """Request body for POST /api/v1/simulate.

    V1 fields: wires, excitations, ground, frequency, pattern, comment
    V2 fields: loads, transmission_lines, compute_currents
    """

    wires: list[Wire] = Field(min_length=1, max_length=500)
    excitations: list[Excitation] = Field(min_length=1, max_length=50)
    ground: GroundConfig = Field(default_factory=GroundConfig)
    frequency: FrequencyConfig
    pattern: PatternConfig = Field(default_factory=PatternConfig)
    comment: str = Field(default="AntSim simulation", max_length=200)

    # V2 optional advanced fields
    loads: list[LumpedLoad] = Field(default_factory=list, max_length=100,
                                    description="Lumped loads (LD cards)")
    transmission_lines: list[TransmissionLine] = Field(default_factory=list, max_length=50,
                                                       description="Transmission lines (TL cards)")
    compute_currents: bool = Field(default=False,
                                   description="If true, request current distribution data (PT 0)")

    # V2: Advanced geometry cards
    arcs: list[WireArc] = Field(default_factory=list, max_length=100,
                                 description="Wire arcs (GA cards)")
    transforms: list[GeometryTransform] = Field(default_factory=list, max_length=50,
                                                  description="Geometry transforms (GM cards)")
    symmetry: CylindricalSymmetry | None = Field(default=None,
                                                   description="Cylindrical symmetry (GR card)")

    # V2: Near-field calculation
    near_field: "NearFieldConfig | None" = Field(default=None,
                                                   description="Near-field calculation parameters")

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
        wire_map = {w.tag: w for w in self.wires}
        wire_tags = set(wire_map.keys())
        for ex in self.excitations:
            if ex.wire_tag not in wire_tags:
                raise ValueError(
                    f"Excitation references wire tag {ex.wire_tag} "
                    f"which doesn't exist. Valid tags: {wire_tags}"
                )
            wire = wire_map[ex.wire_tag]
            if ex.segment < 1 or ex.segment > wire.segments:
                raise ValueError(
                    f"Excitation on wire {ex.wire_tag} references segment {ex.segment}, "
                    f"but wire only has {wire.segments} segments (valid: 1-{wire.segments})"
                )
        # Validate load wire references
        for ld in self.loads:
            if ld.wire_tag != 0 and ld.wire_tag not in wire_tags:
                raise ValueError(
                    f"Load references wire tag {ld.wire_tag} which doesn't exist"
                )
        # Validate transmission line wire references
        for tl in self.transmission_lines:
            if tl.wire_tag1 not in wire_tags:
                raise ValueError(
                    f"Transmission line references wire tag {tl.wire_tag1} which doesn't exist"
                )
            if tl.wire_tag2 not in wire_tags:
                raise ValueError(
                    f"Transmission line references wire tag {tl.wire_tag2} which doesn't exist"
                )
        return self
