"""Antenna geometry models: Wire, Excitation, Load, TransmissionLine."""

import math
from enum import Enum
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


# ---- V2: Lumped Loads ----

class LoadType(int, Enum):
    """NEC2 LD card load types."""
    SERIES_RLC = 0       # Series RLC (R, L in Henrys, C in Farads)
    PARALLEL_RLC = 1     # Parallel RLC
    FIXED_IMPEDANCE = 4  # Fixed impedance (R + jX at all frequencies)
    WIRE_CONDUCTIVITY = 5  # Wire conductivity (S/m)


class LumpedLoad(BaseModel):
    """A lumped load on a wire segment (NEC2 LD card).

    - type=0: Series RLC. resistance (Ohms), inductance (H), capacitance (F)
    - type=1: Parallel RLC. resistance (Ohms), inductance (H), capacitance (F)
    - type=4: Fixed impedance. resistance (R, Ohms), reactance (X, Ohms)
    - type=5: Wire conductivity. resistance = conductivity (S/m), applies to entire wire
    """

    load_type: LoadType = Field(description="LD card type (0=series RLC, 1=parallel RLC, 4=fixed Z, 5=conductivity)")
    wire_tag: int = Field(ge=0, le=9999, description="Wire tag (0 = all wires, for type 5)")
    segment_start: int = Field(ge=0, le=200, description="First segment (0 = all segments on wire)")
    segment_end: int = Field(ge=0, le=200, description="Last segment (0 = all segments on wire)")
    param1: float = Field(default=0.0, description="R (Ohms) or conductivity (S/m)")
    param2: float = Field(default=0.0, description="L (Henrys) or X (Ohms)")
    param3: float = Field(default=0.0, description="C (Farads) or 0")


# ---- V2: Wire Arc (GA card) ----

class WireArc(BaseModel):
    """A wire arc element (NEC2 GA card).

    GA TAG SEGMENTS ARC_RADIUS START_ANGLE END_ANGLE WIRE_RADIUS

    Creates a wire arc in the XZ plane centered at the origin.
    The arc is defined by a radius and start/end angles.
    """

    tag: int = Field(ge=1, le=9999, description="Wire tag number")
    segments: int = Field(ge=1, le=200, description="Number of segments")
    arc_radius: float = Field(gt=0.0, le=100.0, description="Arc radius (m)")
    start_angle: float = Field(ge=-360.0, le=360.0, description="Start angle (degrees)")
    end_angle: float = Field(ge=-360.0, le=360.0, description="End angle (degrees)")
    wire_radius: float = Field(ge=0.0001, le=0.1, description="Wire radius (m)")

    @model_validator(mode="after")
    def validate_angles(self) -> "WireArc":
        if abs(self.end_angle - self.start_angle) < 0.1:
            raise ValueError("Arc must span at least 0.1 degrees")
        return self


# ---- V2: Coordinate Transformation (GM card) ----

class GeometryTransform(BaseModel):
    """Coordinate transformation (NEC2 GM card).

    GM TAG_INC N_NEW ROT_X ROT_Y ROT_Z TRANS_X TRANS_Y TRANS_Z START_TAG

    Duplicates and transforms geometry. Creates N_NEW copies with
    incremental tag numbering.
    """

    tag_increment: int = Field(ge=0, le=9999, default=0,
                                description="Tag number increment for new structures")
    n_new_structures: int = Field(ge=0, le=100, default=0,
                                   description="Number of new structures to create (0 = transform in place)")
    rot_x: float = Field(default=0.0, ge=-360.0, le=360.0, description="Rotation about X axis (degrees)")
    rot_y: float = Field(default=0.0, ge=-360.0, le=360.0, description="Rotation about Y axis (degrees)")
    rot_z: float = Field(default=0.0, ge=-360.0, le=360.0, description="Rotation about Z axis (degrees)")
    trans_x: float = Field(default=0.0, ge=-1000.0, le=1000.0, description="Translation in X (m)")
    trans_y: float = Field(default=0.0, ge=-1000.0, le=1000.0, description="Translation in Y (m)")
    trans_z: float = Field(default=0.0, ge=-1000.0, le=1000.0, description="Translation in Z (m)")
    start_tag: int = Field(default=0, ge=0, le=9999,
                           description="Starting tag of structures to transform (0 = all)")


# ---- V2: Cylindrical Symmetry (GR card) ----

class CylindricalSymmetry(BaseModel):
    """Cylindrical symmetry (NEC2 GR card).

    GR TAG_INCREMENT N_COPIES

    Creates rotational copies of the existing geometry around the Z axis.
    Each copy is rotated by 360/N_COPIES degrees.
    """

    tag_increment: int = Field(ge=1, le=9999, description="Tag increment for each copy")
    n_copies: int = Field(ge=1, le=360, description="Number of rotational copies")


# Common wire conductivities for convenience
WIRE_CONDUCTIVITY: dict[str, float] = {
    "copper": 5.8e7,
    "aluminum": 3.54e7,
    "steel": 1.03e7,
    "stainless_steel": 1.1e6,
}


# ---- V2: Transmission Lines ----

class TransmissionLine(BaseModel):
    """Transmission line between two wire segments (NEC2 TL card).

    Connects segment on wire_tag1 to segment on wire_tag2.
    """

    wire_tag1: int = Field(ge=1, le=9999, description="First wire tag")
    segment1: int = Field(ge=1, le=200, description="Segment on first wire")
    wire_tag2: int = Field(ge=1, le=9999, description="Second wire tag")
    segment2: int = Field(ge=1, le=200, description="Segment on second wire")
    impedance: float = Field(ge=1.0, le=1000.0, description="Characteristic impedance Z0 (Ohms)")
    length: float = Field(ge=0.0, le=1000.0, default=0.0,
                          description="Physical length (m). 0 = calculate from wire geometry")
    shunt_admittance_real1: float = Field(default=0.0, description="Shunt admittance at end 1, real part")
    shunt_admittance_imag1: float = Field(default=0.0, description="Shunt admittance at end 1, imag part")
    shunt_admittance_real2: float = Field(default=0.0, description="Shunt admittance at end 2, real part")
    shunt_admittance_imag2: float = Field(default=0.0, description="Shunt admittance at end 2, imag part")
