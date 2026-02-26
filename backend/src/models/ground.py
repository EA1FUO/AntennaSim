"""Ground model types for NEC2 simulation."""

from enum import Enum
from pydantic import BaseModel, Field


class GroundType(str, Enum):
    """Predefined ground types with dielectric constant and conductivity."""

    FREE_SPACE = "free_space"
    PERFECT = "perfect"
    SALT_WATER = "salt_water"
    FRESH_WATER = "fresh_water"
    PASTORAL = "pastoral"
    AVERAGE = "average"
    ROCKY = "rocky"
    CITY = "city"
    DRY_SANDY = "dry_sandy"
    CUSTOM = "custom"


# Ground parameters: (dielectric_constant, conductivity_s_per_m)
GROUND_PARAMS: dict[str, tuple[float, float]] = {
    GroundType.SALT_WATER: (80.0, 5.0),
    GroundType.FRESH_WATER: (80.0, 0.001),
    GroundType.PASTORAL: (14.0, 0.01),
    GroundType.AVERAGE: (13.0, 0.005),
    GroundType.ROCKY: (12.0, 0.002),
    GroundType.CITY: (5.0, 0.001),
    GroundType.DRY_SANDY: (3.0, 0.0001),
}


class GroundConfig(BaseModel):
    """Ground configuration for NEC2 simulation."""

    ground_type: GroundType = Field(
        default=GroundType.AVERAGE,
        description="Ground type preset",
    )
    dielectric_constant: float = Field(
        default=13.0,
        ge=1.0,
        le=100.0,
        description="Relative dielectric constant (epsilon_r)",
    )
    conductivity: float = Field(
        default=0.005,
        ge=0.0,
        le=10.0,
        description="Ground conductivity (S/m)",
    )

    def get_nec_params(self) -> tuple[float, float]:
        """Get the (dielectric_constant, conductivity) for NEC2 GN card."""
        if self.ground_type == GroundType.FREE_SPACE:
            return (0.0, 0.0)
        if self.ground_type == GroundType.PERFECT:
            return (0.0, 0.0)
        if self.ground_type == GroundType.CUSTOM:
            return (self.dielectric_constant, self.conductivity)
        return GROUND_PARAMS.get(
            self.ground_type, (self.dielectric_constant, self.conductivity)
        )
