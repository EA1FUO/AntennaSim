"""Antenna geometry models: Wire, Excitation."""

import math
from pydantic import BaseModel, Field, model_validator


class Wire(BaseModel):
    """A single wire element in the antenna geometry."""

    tag: int = Field(ge=1, le=9999, description="Wire tag number")
    segments: int = Field(ge=1, le=200, description="Number of segments")
    x1: float = Field(ge=-1000.0, le=1000.0, description="Start X coordinate (m)")
    y1: float = Field(ge=-1000.0, le=1000.0, description="Start Y coordinate (m)")
    z1: float = Field(ge=-1000.0, le=1000.0, description="Start Z coordinate (m)")
    x2: float = Field(ge=-1000.0, le=1000.0, description="End X coordinate (m)")
    y2: float = Field(ge=-1000.0, le=1000.0, description="End Y coordinate (m)")
    z2: float = Field(ge=-1000.0, le=1000.0, description="End Z coordinate (m)")
    radius: float = Field(ge=0.0001, le=0.1, description="Wire radius (m)")

    @model_validator(mode="after")
    def validate_not_zero_length(self) -> "Wire":
        """Ensure the wire has non-zero length."""
        dx = self.x2 - self.x1
        dy = self.y2 - self.y1
        dz = self.z2 - self.z1
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        if length < 1e-6:
            raise ValueError("Wire endpoints are coincident (zero-length wire)")
        return self

    @property
    def length(self) -> float:
        dx = self.x2 - self.x1
        dy = self.y2 - self.y1
        dz = self.z2 - self.z1
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    @model_validator(mode="after")
    def validate_all_finite(self) -> "Wire":
        """Ensure no NaN or Infinity values."""
        for field_name in ["x1", "y1", "z1", "x2", "y2", "z2", "radius"]:
            val = getattr(self, field_name)
            if not math.isfinite(val):
                raise ValueError(f"{field_name} must be finite, got {val}")
        return self


class Excitation(BaseModel):
    """Voltage source excitation on a wire segment."""

    wire_tag: int = Field(ge=1, le=9999, description="Wire tag number")
    segment: int = Field(ge=1, le=200, description="Segment number on the wire")
    voltage_real: float = Field(default=1.0, description="Real part of voltage (V)")
    voltage_imag: float = Field(default=0.0, description="Imaginary part of voltage (V)")
