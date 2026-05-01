"""Antenna template registry and geometry generators.

Template metadata (names, descriptions, parameters, tips, etc.) is loaded
from shared/antenna-templates.json which is consumed by both this Python
module and the TypeScript frontend — eliminating duplication.

Geometry generation logic (NEC2 wire math) remains Python-specific here.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Mapping

TemplateCategory = Literal["wire", "vertical", "directional", "loop", "multiband"]
TemplateDifficulty = Literal["beginner", "intermediate", "advanced"]
GroundTypeName = Literal[
    "free_space", "perfect", "salt_water", "fresh_water", "pastoral",
    "average", "rocky", "city", "dry_sandy", "custom",
]


@dataclass(frozen=True, slots=True)
class ParameterDef:
    """Template slider/input definition."""

    key: str
    label: str
    description: str
    unit: str
    min: float
    max: float
    step: float
    default_value: float
    decimals: int | None = None


@dataclass(frozen=True, slots=True)
class GroundPreset:
    """Default ground configuration for a template."""

    type: GroundTypeName
    custom_permittivity: float | None = None
    custom_conductivity: float | None = None


@dataclass(frozen=True, slots=True)
class WireGeometry:
    """A single NEC2 wire geometry record."""

    tag: int
    segments: int
    x1: float
    y1: float
    z1: float
    x2: float
    y2: float
    z2: float
    radius: float


@dataclass(frozen=True, slots=True)
class Excitation:
    """A voltage source excitation."""

    wire_tag: int
    segment: int
    voltage_real: float
    voltage_imag: float


@dataclass(frozen=True, slots=True)
class FrequencyRange:
    """Default sweep configuration."""

    start_mhz: float
    stop_mhz: float
    steps: int


@dataclass(frozen=True, slots=True)
class ArcGeometry:
    """Arc definition mirroring the frontend helper."""

    tag: int
    segments: int
    arc_radius: float
    start_angle: float
    end_angle: float
    wire_radius: float


@dataclass(frozen=True, slots=True)
class AntennaTemplate:
    """Complete antenna template definition."""

    id: str
    name: str
    short_name: str
    description: str
    long_description: str
    icon: str
    category: TemplateCategory
    difficulty: TemplateDifficulty
    bands: tuple[str, ...]
    parameters: tuple[ParameterDef, ...]
    default_ground: GroundPreset
    generate_geometry: Callable[[Mapping[str, float]], list[WireGeometry]]
    generate_excitation: Callable[[Mapping[str, float], list[WireGeometry]], Excitation]
    default_frequency_range: Callable[[Mapping[str, float]], FrequencyRange]
    tips: tuple[str, ...]
    related_templates: tuple[str, ...]

    def get_default_params(self) -> dict[str, float]:
        """Return the default parameter values for this template."""
        return {p.key: p.default_value for p in self.parameters}


class TemplateNotFoundError(ValueError):
    """Raised when a template ID cannot be resolved."""


class TemplateParameterError(ValueError):
    """Raised when template parameters are invalid."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _param(params: Mapping[str, float], key: str, default: float) -> float:
    value = params.get(key, default)
    return default if value is None else float(value)


def auto_segment(wire_length_m: float, max_freq_mhz: float, min_segs: int = 5) -> int:
    """Port of frontend/src/engine/segmentation.ts autoSegment()."""
    wavelength = 300.0 / max_freq_mhz
    seg_length = wavelength / 10.0
    n = max(min_segs, math.ceil(wire_length_m / seg_length))
    if n % 2 == 0:
        n += 1
    return min(n, 200)


def center_segment(total_segments: int) -> int:
    """Port of frontend/src/engine/segmentation.ts centerSegment()."""
    return math.ceil(total_segments / 2)


def arc_to_wire_segments(arc: ArcGeometry, center_height: float = 0.0) -> list[WireGeometry]:
    """Convert an arc to straight wire segments like the frontend helper."""
    wires: list[WireGeometry] = []
    start_rad = (arc.start_angle * math.pi) / 180.0
    end_rad = (arc.end_angle * math.pi) / 180.0
    total_angle = end_rad - start_rad
    angle_step = total_angle / arc.segments
    for i in range(arc.segments):
        a1 = start_rad + i * angle_step
        a2 = start_rad + (i + 1) * angle_step
        wires.append(
            WireGeometry(
                tag=arc.tag, segments=1,
                x1=arc.arc_radius * math.cos(a1), y1=0.0,
                z1=arc.arc_radius * math.sin(a1) + center_height,
                x2=arc.arc_radius * math.cos(a2), y2=0.0,
                z2=arc.arc_radius * math.sin(a2) + center_height,
                radius=arc.wire_radius,
            )
        )
    return wires


def _centered_frequency_range(frequency_mhz: float, total_bandwidth_fraction: float, steps: int) -> FrequencyRange:
    bandwidth = frequency_mhz * total_bandwidth_fraction
    return FrequencyRange(
        start_mhz=max(0.1, frequency_mhz - bandwidth / 2.0),
        stop_mhz=min(2000.0, frequency_mhz + bandwidth / 2.0),
        steps=steps,
    )


AVERAGE_GROUND = GroundPreset(type="average")


# ---------------------------------------------------------------------------
# Geometry functions — language-specific, not in JSON
# ---------------------------------------------------------------------------

def _dipole_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.1)
    height = _param(params, "height", 10.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    half_length = (wavelength / 2.0) * 0.95 / 2.0
    radius = (wire_diam_mm / 1000.0) / 2.0
    segs_per_arm = auto_segment(half_length, freq * 1.15, 11)
    return [
        WireGeometry(1, segs_per_arm, -half_length, 0.0, height, 0.0, 0.0, height, radius),
        WireGeometry(2, segs_per_arm, 0.0, 0.0, height, half_length, 0.0, height, radius),
    ]

def _dipole_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    wire1 = wires[0]
    return Excitation(wire_tag=wire1.tag, segment=wire1.segments, voltage_real=1.0, voltage_imag=0.0)

def _dipole_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.1), 0.1, 31)


def _inverted_v_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    apex_height = _param(params, "apex_height", 12.0)
    included_angle = _param(params, "included_angle", 120.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    arm_length = (wavelength / 2.0) * 0.95 / 2.0
    radius = (wire_diam_mm / 1000.0) / 2.0
    half_angle = (included_angle / 2.0) * (math.pi / 180.0)
    horiz_extent = arm_length * math.sin(half_angle)
    vert_drop = arm_length * math.cos(half_angle)
    end_height = apex_height - vert_drop
    segs_per_arm = auto_segment(arm_length, freq * 1.15, 11)
    return [
        WireGeometry(1, segs_per_arm, -horiz_extent, 0.0, end_height, 0.0, 0.0, apex_height, radius),
        WireGeometry(2, segs_per_arm, 0.0, 0.0, apex_height, horiz_extent, 0.0, end_height, radius),
    ]

def _inverted_v_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    wire1 = wires[0]
    return Excitation(wire_tag=wire1.tag, segment=wire1.segments, voltage_real=1.0, voltage_imag=0.0)

def _inverted_v_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.1, 31)


def _efhw_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    feed_height = _param(params, "feed_height", 10.0)
    far_end_height = _param(params, "far_end_height", 3.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    wire_length = (wavelength / 2.0) * 0.97
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    segs = auto_segment(wire_length, max_freq, 21)
    counterpoise_length = wavelength * 0.05
    counterpoise_segs = auto_segment(counterpoise_length, max_freq, 5)
    return [
        WireGeometry(1, segs, 0.0, 0.0, feed_height, wire_length, 0.0, far_end_height, radius),
        WireGeometry(2, counterpoise_segs, 0.0, 0.0, feed_height, -counterpoise_length, 0.0, feed_height, radius),
    ]

def _efhw_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _efhw_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.1, 31)


def _vertical_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.2)
    radial_count = round(_param(params, "radial_count", 4.0))
    radial_droop_deg = _param(params, "radial_droop", 0.0)
    base_height = _param(params, "base_height", 0.5)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    quarter_wave = (wavelength / 4.0) * 0.95
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    vertical_segs = auto_segment(quarter_wave, max_freq, 11)
    radial_length = quarter_wave
    radial_segs = auto_segment(radial_length, max_freq, 7)
    wires: list[WireGeometry] = [
        WireGeometry(1, vertical_segs, 0.0, 0.0, base_height, 0.0, 0.0, base_height + quarter_wave, radius)
    ]
    droop_rad = (radial_droop_deg * math.pi) / 180.0
    radial_horiz_length = radial_length * math.cos(droop_rad)
    radial_vert_drop = radial_length * math.sin(droop_rad)
    for i in range(radial_count):
        angle = (2.0 * math.pi * i) / radial_count
        end_x = radial_horiz_length * math.cos(angle)
        end_y = radial_horiz_length * math.sin(angle)
        end_z = base_height - radial_vert_drop
        wires.append(WireGeometry(i + 2, radial_segs, 0.0, 0.0, base_height, end_x, end_y, end_z, radius))
    return wires

def _vertical_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _vertical_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.2), 0.15, 31)


def _get_yagi_design(num_elements: int) -> dict[str, list[float]]:
    if num_elements == 2:
        return {"lengths": [0.252, 0.238], "positions": [0.0, 0.15]}
    if num_elements == 3:
        return {"lengths": [0.252, 0.238, 0.226], "positions": [0.0, 0.15, 0.35]}
    if num_elements == 4:
        return {"lengths": [0.252, 0.238, 0.224, 0.222], "positions": [0.0, 0.15, 0.35, 0.55]}
    if num_elements == 5:
        return {"lengths": [0.252, 0.238, 0.224, 0.222, 0.220], "positions": [0.0, 0.15, 0.35, 0.55, 0.75]}
    return {"lengths": [0.252, 0.238, 0.224, 0.222, 0.220, 0.218], "positions": [0.0, 0.15, 0.35, 0.55, 0.75, 0.95]}

def _yagi_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.15)
    num_elements = round(_param(params, "num_elements", 3.0))
    height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 12.0)
    wavelength = 300.0 / freq
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    design = _get_yagi_design(num_elements)
    boom_offset = design["positions"][1] * wavelength
    wires: list[WireGeometry] = []
    for i in range(num_elements):
        half_len = design["lengths"][i] * wavelength
        boom_pos = design["positions"][i] * wavelength - boom_offset
        segs = auto_segment(half_len * 2.0, max_freq, 11)
        wires.append(WireGeometry(i + 1, segs, -half_len, boom_pos, height, half_len, boom_pos, height, radius))
    return wires

def _yagi_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    driven = wires[1]
    return Excitation(wire_tag=driven.tag, segment=center_segment(driven.segments), voltage_real=1.0, voltage_imag=0.0)

def _yagi_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.15), 0.07, 31)


def _moxon_dimensions(wire_diameter_wavelengths: float) -> dict[str, float]:
    d = math.log10(wire_diameter_wavelengths)
    a = 0.4834 - 0.0117 * d - 0.0006 * d * d
    b = 0.0502 - 0.0192 * d - 0.0020 * d * d
    c = 0.0365 + 0.0143 * d + 0.0014 * d * d
    d_dim = 0.0516 + 0.0085 * d + 0.0007 * d * d
    return {"A": a, "B": b, "C": c, "D": d_dim, "E": a}

def _moxon_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.15)
    height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    wire_diam_wl = (wire_diam_mm / 1000.0) / wavelength
    max_freq = freq * 1.1
    dim = _moxon_dimensions(wire_diam_wl)
    half_a = dim["A"] * wavelength
    tail_b = dim["B"] * wavelength
    gap_c = dim["C"] * wavelength
    tail_d = dim["D"] * wavelength
    half_e = dim["A"] * wavelength
    boom_depth = tail_b + gap_c + tail_d
    segs_h = auto_segment(half_a * 2.0, max_freq, 21)
    segs_r = auto_segment(half_e * 2.0, max_freq, 21)
    segs_tail_b = auto_segment(tail_b, max_freq, 5)
    segs_tail_d = auto_segment(tail_d, max_freq, 5)
    y_driven = 0.0
    y_driven_tail = -tail_b
    y_reflector_tail = -(tail_b + gap_c)
    y_reflector = -boom_depth
    return [
        WireGeometry(1, segs_h, -half_a, y_driven, height, half_a, y_driven, height, radius),
        WireGeometry(2, segs_r, -half_e, y_reflector, height, half_e, y_reflector, height, radius),
        WireGeometry(3, segs_tail_b, -half_a, y_driven, height, -half_a, y_driven_tail, height, radius),
        WireGeometry(4, segs_tail_d, -half_e, y_reflector, height, -half_e, y_reflector_tail, height, radius),
        WireGeometry(5, segs_tail_b, half_a, y_driven, height, half_a, y_driven_tail, height, radius),
        WireGeometry(6, segs_tail_d, half_e, y_reflector, height, half_e, y_reflector_tail, height, radius),
    ]

def _moxon_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    driven = wires[0]
    return Excitation(wire_tag=driven.tag, segment=center_segment(driven.segments), voltage_real=1.0, voltage_imag=0.0)

def _moxon_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.15), 0.08, 31)


def _j_pole_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 145.0)
    base_h = _param(params, "base_height", 1.5)
    spacing_mm = _param(params, "spacing", 50.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    spacing = spacing_mm / 1000.0
    max_freq = freq * 1.1
    quarter_wave = wavelength * 0.25 * 0.95
    half_wave = wavelength * 0.5 * 0.95
    long_total = quarter_wave + half_wave
    short_total = quarter_wave
    segs_long = auto_segment(long_total, max_freq, 21)
    segs_short = auto_segment(short_total, max_freq, 11)
    segs_bottom = auto_segment(spacing, max_freq, 3)
    return [
        WireGeometry(1, segs_long, 0.0, 0.0, base_h, 0.0, 0.0, base_h + long_total, radius),
        WireGeometry(2, segs_short, spacing, 0.0, base_h, spacing, 0.0, base_h + short_total, radius),
        WireGeometry(3, segs_bottom, 0.0, 0.0, base_h, spacing, 0.0, base_h, radius),
    ]

def _j_pole_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    short_stub = wires[1]
    return Excitation(wire_tag=short_stub.tag, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _j_pole_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 145.0), 0.08, 31)


def _slim_jim_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 145.0)
    base_h = _param(params, "base_height", 1.5)
    spacing_mm = _param(params, "spacing", 25.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    spacing = spacing_mm / 1000.0
    max_freq = freq * 1.1
    quarter_wave = wavelength * 0.25 * 0.95
    half_wave = wavelength * 0.5 * 0.95
    folded_height = half_wave
    gap_height = wavelength * 0.01
    total_height = quarter_wave + gap_height + folded_height
    segs_long = auto_segment(total_height, max_freq, 31)
    segs_short = auto_segment(quarter_wave, max_freq, 11)
    segs_folded = auto_segment(folded_height, max_freq, 21)
    segs_horiz = auto_segment(spacing, max_freq, 3)
    return [
        WireGeometry(1, segs_long, 0.0, 0.0, base_h, 0.0, 0.0, base_h + total_height, radius),
        WireGeometry(2, segs_short, spacing, 0.0, base_h, spacing, 0.0, base_h + quarter_wave, radius),
        WireGeometry(3, segs_folded, spacing, 0.0, base_h + quarter_wave + gap_height, spacing, 0.0, base_h + total_height, radius),
        WireGeometry(4, segs_horiz, 0.0, 0.0, base_h, spacing, 0.0, base_h, radius),
        WireGeometry(5, segs_horiz, 0.0, 0.0, base_h + total_height, spacing, 0.0, base_h + total_height, radius),
    ]

def _slim_jim_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    stub = wires[1]
    return Excitation(wire_tag=stub.tag, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _slim_jim_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 145.0), 0.08, 31)


def _delta_loop_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.15)
    base_h = _param(params, "base_height", 5.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    max_freq = freq * 1.1
    perimeter = wavelength * 1.02
    side = perimeter / 3.0
    half_base = side / 2.0
    tri_height = side * math.sqrt(3.0) / 2.0
    apex_z = base_h + tri_height
    segs_base = auto_segment(side, max_freq, 21)
    segs_side = auto_segment(side, max_freq, 21)
    return [
        WireGeometry(1, segs_base, -half_base, 0.0, base_h, half_base, 0.0, base_h, radius),
        WireGeometry(2, segs_side, half_base, 0.0, base_h, 0.0, 0.0, apex_z, radius),
        WireGeometry(3, segs_side, 0.0, 0.0, apex_z, -half_base, 0.0, base_h, radius),
    ]

def _delta_loop_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    base = wires[0]
    return Excitation(wire_tag=base.tag, segment=center_segment(base.segments), voltage_real=1.0, voltage_imag=0.0)

def _delta_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.15), 0.1, 31)


def _horizontal_delta_loop_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.15)
    height = _param(params, "height", 10.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    max_freq = freq * 1.1
    perimeter = wavelength * 1.02
    side = perimeter / 3.0
    tri_height = side * math.sqrt(3.0) / 2.0
    apex_x = 0.0
    apex_y = (2.0 * tri_height) / 3.0
    left_x = -side / 2.0
    left_y = -tri_height / 3.0
    right_x = side / 2.0
    right_y = -tri_height / 3.0
    segs = auto_segment(side, max_freq, 21)
    return [
        WireGeometry(1, segs, left_x, left_y, height, right_x, right_y, height, radius),
        WireGeometry(2, segs, right_x, right_y, height, apex_x, apex_y, height, radius),
        WireGeometry(3, segs, apex_x, apex_y, height, left_x, left_y, height, radius),
    ]

def _horizontal_delta_loop_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    base = wires[0]
    return Excitation(wire_tag=base.tag, segment=center_segment(base.segments), voltage_real=1.0, voltage_imag=0.0)

def _horizontal_delta_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.15), 0.1, 31)


def _get_quad_design(num_elements: int) -> dict[str, list[float]]:
    if num_elements == 1:
        return {"perimeters": [1.02], "positions": [0.0]}
    if num_elements == 2:
        return {"perimeters": [1.05, 1.02], "positions": [0.0, 0.2]}
    return {"perimeters": [1.05, 1.02, 0.97], "positions": [0.0, 0.2, 0.4]}

def _quad_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.15)
    num_elements = round(_param(params, "num_elements", 2.0))
    center_height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    design = _get_quad_design(num_elements)
    wires: list[WireGeometry] = []
    tag_counter = 1
    driven_idx = 0 if num_elements == 1 else 1
    boom_offset = design["positions"][driven_idx] * wavelength
    for i in range(num_elements):
        perimeter = design["perimeters"][i] * wavelength
        side = perimeter / 4.0
        half_side = side / 2.0
        boom_pos = design["positions"][i] * wavelength - boom_offset
        side_segs = auto_segment(side, max_freq, 7)
        z_bot = center_height - half_side
        z_top = center_height + half_side
        wires.append(WireGeometry(tag_counter, side_segs, -half_side, boom_pos, z_bot, half_side, boom_pos, z_bot, radius))
        tag_counter += 1
        wires.append(WireGeometry(tag_counter, side_segs, half_side, boom_pos, z_bot, half_side, boom_pos, z_top, radius))
        tag_counter += 1
        wires.append(WireGeometry(tag_counter, side_segs, half_side, boom_pos, z_top, -half_side, boom_pos, z_top, radius))
        tag_counter += 1
        wires.append(WireGeometry(tag_counter, side_segs, -half_side, boom_pos, z_top, -half_side, boom_pos, z_bot, radius))
        tag_counter += 1
    return wires

def _quad_excitation(params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    num_elements = round(_param(params, "num_elements", 2.0))
    driven_bottom_tag = 1 if num_elements == 1 else 5
    wire = next((c for c in wires if c.tag == driven_bottom_tag), None)
    segs = wire.segments if wire is not None else 7
    return Excitation(wire_tag=driven_bottom_tag, segment=center_segment(segs), voltage_real=1.0, voltage_imag=0.0)

def _quad_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.15), 0.08, 31)


def _hex_beam_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.15)
    height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    radius = wire_diam_mm / 1000.0 / 2.0
    max_freq = freq * 1.1
    half_width = wavelength * 0.23
    driven_depth = wavelength * 0.07
    reflector_depth = wavelength * 0.07
    spacing = wavelength * 0.08
    d_left_tip_x = -half_width
    d_left_tip_y = 0.0
    d_left_bend_x = -half_width * 0.4
    d_left_bend_y = -driven_depth
    d_center_x = 0.0
    d_center_y = 0.0
    d_right_bend_x = half_width * 0.4
    d_right_bend_y = -driven_depth
    d_right_tip_x = half_width
    d_right_tip_y = 0.0
    r_y = -spacing
    r_left_tip_x = -half_width * 1.05
    r_left_tip_y = r_y
    r_left_bend_x = -half_width * 0.4
    r_left_bend_y = r_y - reflector_depth
    r_center_x = 0.0
    r_center_y = r_y
    r_right_bend_x = half_width * 0.4
    r_right_bend_y = r_y - reflector_depth
    r_right_tip_x = half_width * 1.05
    r_right_tip_y = r_y
    segs_arm = auto_segment(half_width * 0.6, max_freq, 11)
    segs_mid = auto_segment(half_width * 0.4, max_freq, 7)
    return [
        WireGeometry(1, segs_arm, d_left_tip_x, d_left_tip_y, height, d_left_bend_x, d_left_bend_y, height, radius),
        WireGeometry(2, segs_mid, d_left_bend_x, d_left_bend_y, height, d_center_x, d_center_y, height, radius),
        WireGeometry(3, segs_mid, d_center_x, d_center_y, height, d_right_bend_x, d_right_bend_y, height, radius),
        WireGeometry(4, segs_arm, d_right_bend_x, d_right_bend_y, height, d_right_tip_x, d_right_tip_y, height, radius),
        WireGeometry(5, segs_arm, r_left_tip_x, r_left_tip_y, height, r_left_bend_x, r_left_bend_y, height, radius),
        WireGeometry(6, segs_mid, r_left_bend_x, r_left_bend_y, height, r_center_x, r_center_y, height, radius),
        WireGeometry(7, segs_mid, r_center_x, r_center_y, height, r_right_bend_x, r_right_bend_y, height, radius),
        WireGeometry(8, segs_arm, r_right_bend_x, r_right_bend_y, height, r_right_tip_x, r_right_tip_y, height, radius),
    ]

def _hex_beam_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    wire2 = wires[1]
    return Excitation(wire_tag=wire2.tag, segment=wire2.segments, voltage_real=1.0, voltage_imag=0.0)

def _hex_beam_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.15), 0.1, 31)


def _log_periodic_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq_low = _param(params, "freq_low", 14.0)
    freq_high = _param(params, "freq_high", 30.0)
    tau = _param(params, "tau", 0.9)
    sigma = _param(params, "sigma", 0.06)
    height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 6.0)
    radius = wire_diam_mm / 1000.0 / 2.0
    lambda_max = 300.0 / freq_low
    lambda_min = 300.0 / freq_high
    half_lengths: list[float] = []
    current_half_len = (lambda_max / 2.0) * 0.95 / 2.0
    min_half_len = (lambda_min / 2.0) * 0.95 / 2.0 * tau
    while current_half_len >= min_half_len and len(half_lengths) < 20:
        half_lengths.append(current_half_len)
        current_half_len *= tau
    if len(half_lengths) < 2:
        half_lengths.append(current_half_len)
    spacings: list[float] = []
    for i in range(len(half_lengths) - 1):
        spacings.append(4.0 * sigma * half_lengths[i])
    positions: list[float] = [0.0]
    for spacing in spacings:
        positions.append(positions[-1] + spacing)
    total_boom = positions[-1]
    offset = total_boom / 2.0
    wires: list[WireGeometry] = []
    max_freq = freq_high * 1.1
    for i, half_len in enumerate(half_lengths):
        boom_pos = positions[i] - offset
        segs = auto_segment(half_len * 2.0, max_freq, 11)
        wires.append(WireGeometry(i + 1, segs, -half_len, boom_pos, height, half_len, boom_pos, height, radius))
    return wires

def _log_periodic_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    front_element = wires[-1]
    return Excitation(wire_tag=front_element.tag, segment=center_segment(front_element.segments), voltage_real=1.0, voltage_imag=0.0)

def _log_periodic_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq_low = _param(params, "freq_low", 14.0)
    freq_high = _param(params, "freq_high", 30.0)
    return FrequencyRange(start_mhz=max(0.1, freq_low * 0.9), stop_mhz=min(2000.0, freq_high * 1.1), steps=51)


BAND_FREQS: dict[str, float] = {"80m": 3.6, "40m": 7.1, "20m": 14.15, "15m": 21.2, "10m": 28.5}

def _fan_dipole_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    num_bands = round(_param(params, "num_bands", 3.0))
    height = _param(params, "height", 10.0)
    fan_spread = _param(params, "fan_spread", 1.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    radius = wire_diam_mm / 1000.0 / 2.0
    selected_bands: list[str] = []
    if num_bands >= 5:
        selected_bands.extend(["80m", "40m", "20m", "15m", "10m"])
    elif num_bands == 4:
        selected_bands.extend(["80m", "40m", "20m", "10m"])
    elif num_bands == 3:
        selected_bands.extend(["40m", "20m", "10m"])
    else:
        selected_bands.extend(["20m", "10m"])
    wires: list[WireGeometry] = []
    tag = 1
    for i, band_key in enumerate(selected_bands):
        freq = BAND_FREQS[band_key]
        wavelength = 300.0 / freq
        half_len = (wavelength / 2.0) * 0.95 / 2.0
        max_freq = freq * 1.15
        segs = auto_segment(half_len, max_freq, 11)
        vert_offset = -fan_spread * (i / (len(selected_bands) - 1)) if len(selected_bands) > 1 else 0.0
        wire_z = height + vert_offset
        wires.append(WireGeometry(tag, segs, -half_len, 0.0, wire_z, 0.0, 0.0, height, radius))
        tag += 1
        wires.append(WireGeometry(tag, segs, 0.0, 0.0, height, half_len, 0.0, wire_z, radius))
        tag += 1
    return wires

def _fan_dipole_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    first_arm = wires[0]
    return Excitation(wire_tag=first_arm.tag, segment=first_arm.segments, voltage_real=1.0, voltage_imag=0.0)

def _fan_dipole_frequency_range(_params: Mapping[str, float]) -> FrequencyRange:
    return FrequencyRange(start_mhz=13.5, stop_mhz=14.5, steps=31)


def _g5rv_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    height = _param(params, "height", 12.0)
    feeder_len = _param(params, "feeder_length", 10.36)
    dipole_len = _param(params, "dipole_length", 31.1)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    radius = wire_diam_mm / 1000.0 / 2.0
    half_dipole = dipole_len / 2.0
    max_freq = 30.0
    segs_dipole_arm = auto_segment(half_dipole, max_freq, 21)
    segs_feeder = auto_segment(feeder_len, max_freq, 11)
    feeder_bottom = height - feeder_len
    return [
        WireGeometry(1, segs_dipole_arm, -half_dipole, 0.0, height, 0.0, 0.0, height, radius),
        WireGeometry(2, segs_dipole_arm, 0.0, 0.0, height, half_dipole, 0.0, height, radius),
        WireGeometry(3, segs_feeder, 0.0, 0.0, height, 0.0, 0.0, max(feeder_bottom, 0.5), radius),
    ]

def _g5rv_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    feeder = wires[2]
    return Excitation(wire_tag=feeder.tag, segment=feeder.segments, voltage_real=1.0, voltage_imag=0.0)

def _g5rv_frequency_range(_params: Mapping[str, float]) -> FrequencyRange:
    return FrequencyRange(start_mhz=13.5, stop_mhz=14.5, steps=41)


def _off_center_fed_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    feed_offset = _param(params, "feed_offset", 0.36)
    height = _param(params, "height", 12.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    total_len = (wavelength / 2.0) * 0.95
    radius = wire_diam_mm / 1000.0 / 2.0
    max_freq = freq * 4.5
    short_len = feed_offset * total_len
    long_len = (1.0 - feed_offset) * total_len
    segs_short = auto_segment(short_len, max_freq, 11)
    segs_long = auto_segment(long_len, max_freq, 21)
    return [
        WireGeometry(1, segs_short, -short_len, 0.0, height, 0.0, 0.0, height, radius),
        WireGeometry(2, segs_long, 0.0, 0.0, height, long_len, 0.0, height, radius),
    ]

def _off_center_fed_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    short_arm = wires[0]
    return Excitation(wire_tag=short_arm.tag, segment=short_arm.segments, voltage_real=1.0, voltage_imag=0.0)

def _off_center_fed_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.1, 31)


def _magnetic_loop_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    radius = _param(params, "radius", 0.5)
    tube_dia = _param(params, "tube_dia", 12.0)
    height = _param(params, "height", 3.0)
    wire_radius = (tube_dia / 1000.0) / 2.0
    arc = ArcGeometry(tag=1, segments=36, arc_radius=radius, start_angle=0.0, end_angle=360.0, wire_radius=wire_radius)
    return arc_to_wire_segments(arc, height)

def _magnetic_loop_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _magnetic_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 14.1), 0.1, 21)


def _inverted_l_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    vertical_height = _param(params, "vertical_height", 6.0)
    base_height = _param(params, "base_height", 0.5)
    radial_count = round(_param(params, "radial_count", 4.0))
    radial_droop_deg = _param(params, "radial_droop", 0.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    quarter_wave = (wavelength / 4.0) * 0.95
    actual_vertical = min(vertical_height, quarter_wave)
    horizontal_length = max(0.0, quarter_wave - actual_vertical)
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    vertical_segs = auto_segment(actual_vertical, max_freq, 11)
    radial_length = quarter_wave
    radial_segs = auto_segment(radial_length, max_freq, 7)
    top_z = base_height + actual_vertical
    wires: list[WireGeometry] = [WireGeometry(1, vertical_segs, 0.0, 0.0, base_height, 0.0, 0.0, top_z, radius)]
    next_tag = 2
    if horizontal_length > 1e-9:
        horizontal_segs = auto_segment(horizontal_length, max_freq, 7)
        wires.append(WireGeometry(next_tag, horizontal_segs, 0.0, 0.0, top_z, horizontal_length, 0.0, top_z, radius))
        next_tag += 1
    droop_rad = (radial_droop_deg * math.pi) / 180.0
    radial_horiz_length = radial_length * math.cos(droop_rad)
    radial_vert_drop = radial_length * math.sin(droop_rad)
    for i in range(radial_count):
        angle = (2.0 * math.pi * i) / radial_count
        end_x = radial_horiz_length * math.cos(angle)
        end_y = radial_horiz_length * math.sin(angle)
        end_z = base_height - radial_vert_drop
        wires.append(WireGeometry(next_tag + i, radial_segs, 0.0, 0.0, base_height, end_x, end_y, end_z, radius))
    return wires

def _inverted_l_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _inverted_l_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.15, 31)


def _efhw_inverted_l_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    vertical_height = _param(params, "vertical_height", 8.0)
    feed_height = _param(params, "feed_height", 1.5)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    total_length = (wavelength / 2.0) * 0.97
    radius = (wire_diam_mm / 1000.0) / 2.0
    actual_vertical = min(vertical_height, total_length)
    horizontal_length = max(0.0, total_length - actual_vertical)
    max_freq = freq * 1.15
    vertical_segs = auto_segment(actual_vertical, max_freq, 21)
    top_z = feed_height + actual_vertical
    wires: list[WireGeometry] = [WireGeometry(1, vertical_segs, 0.0, 0.0, feed_height, 0.0, 0.0, top_z, radius)]
    if horizontal_length > 1e-6:
        horizontal_segs = auto_segment(horizontal_length, max_freq, 21)
        wires.append(WireGeometry(2, horizontal_segs, 0.0, 0.0, top_z, horizontal_length, 0.0, top_z, radius))
    counterpoise_length = wavelength * 0.05
    counterpoise_segs = auto_segment(counterpoise_length, max_freq, 5)
    cp_tag = len(wires) + 1
    wires.append(WireGeometry(cp_tag, counterpoise_segs, 0.0, 0.0, feed_height, -counterpoise_length, 0.0, feed_height, radius))
    return wires

def _efhw_inverted_l_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _efhw_inverted_l_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.1, 31)


def _efhw_inverted_v_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    apex_height = _param(params, "apex_height", 12.0)
    feed_height = _param(params, "feed_height", 2.0)
    far_end_height = _param(params, "far_end_height", 2.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    wavelength = 300.0 / freq
    total_length = (wavelength / 2.0) * 0.97
    radius = (wire_diam_mm / 1000.0) / 2.0
    leg_length = total_length / 2.0
    feed_dz = apex_height - feed_height
    if feed_dz > leg_length:
        feed_dx = 0.0
        feed_dz = leg_length
    else:
        feed_dx = math.sqrt(max(0.0, leg_length * leg_length - feed_dz * feed_dz))
    far_dz = apex_height - far_end_height
    if far_dz > leg_length:
        far_dx = 0.0
        far_dz = leg_length
    else:
        far_dx = math.sqrt(max(0.0, leg_length * leg_length - far_dz * far_dz))
    max_freq = freq * 1.15
    segs_feed_leg = auto_segment(leg_length, max_freq, 21)
    segs_far_leg = auto_segment(leg_length, max_freq, 21)
    feed_z = apex_height - feed_dz
    far_z = apex_height - far_dz
    wires: list[WireGeometry] = [
        WireGeometry(1, segs_feed_leg, -feed_dx, 0.0, feed_z, 0.0, 0.0, apex_height, radius),
        WireGeometry(2, segs_far_leg, 0.0, 0.0, apex_height, far_dx, 0.0, far_z, radius),
    ]
    counterpoise_length = wavelength * 0.05
    counterpoise_segs = auto_segment(counterpoise_length, max_freq, 5)
    wires.append(WireGeometry(3, counterpoise_segs, -feed_dx, 0.0, feed_z, -feed_dx - counterpoise_length, 0.0, feed_z, radius))
    return wires

def _efhw_inverted_v_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _efhw_inverted_v_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.1, 31)


def _random_wire_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    wire_length = _param(params, "wire_length", 25.0)
    feed_height = _param(params, "feed_height", 8.0)
    far_end_height = _param(params, "far_end_height", 3.0)
    counterpoise_length = _param(params, "counterpoise_length", 5.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)
    height_delta = far_end_height - feed_height
    if abs(height_delta) > wire_length:
        raise TemplateParameterError(
            "random-wire geometry is impossible because wire_length is shorter than the "
            "height difference between feed_height and far_end_height."
        )
    horizontal_run = math.sqrt(max(0.0, wire_length * wire_length - height_delta * height_delta))
    radius = (wire_diam_mm / 1000.0) / 2.0
    max_freq = freq * 1.15
    main_segs = auto_segment(wire_length, max_freq, 21)
    counterpoise_segs = auto_segment(counterpoise_length, max_freq, 5)
    return [
        WireGeometry(1, main_segs, 0.0, 0.0, feed_height, horizontal_run, 0.0, far_end_height, radius),
        WireGeometry(2, counterpoise_segs, 0.0, 0.0, feed_height, -counterpoise_length, 0.0, feed_height, radius),
    ]

def _random_wire_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)

def _random_wire_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    return _centered_frequency_range(_param(params, "frequency", 7.1), 0.2, 31)


# ---------------------------------------------------------------------------
# Geometry function registry — maps template ID to its callables
# ---------------------------------------------------------------------------

_GEOMETRY_FUNCTIONS: dict[str, dict[str, Any]] = {
    "dipole":                {"gen": _dipole_geometry,                "exc": _dipole_excitation,                "freq": _dipole_frequency_range},
    "inverted-v":            {"gen": _inverted_v_geometry,            "exc": _inverted_v_excitation,            "freq": _inverted_v_frequency_range},
    "off-center-fed":        {"gen": _off_center_fed_geometry,        "exc": _off_center_fed_excitation,        "freq": _off_center_fed_frequency_range},
    "vertical":              {"gen": _vertical_geometry,              "exc": _vertical_excitation,              "freq": _vertical_frequency_range},
    "inverted-l":            {"gen": _inverted_l_geometry,            "exc": _inverted_l_excitation,            "freq": _inverted_l_frequency_range},
    "j-pole":                {"gen": _j_pole_geometry,                "exc": _j_pole_excitation,                "freq": _j_pole_frequency_range},
    "slim-jim":              {"gen": _slim_jim_geometry,              "exc": _slim_jim_excitation,              "freq": _slim_jim_frequency_range},
    "efhw":                  {"gen": _efhw_geometry,                  "exc": _efhw_excitation,                  "freq": _efhw_frequency_range},
    "efhw-inverted-l":       {"gen": _efhw_inverted_l_geometry,       "exc": _efhw_inverted_l_excitation,       "freq": _efhw_inverted_l_frequency_range},
    "efhw-inverted-v":       {"gen": _efhw_inverted_v_geometry,       "exc": _efhw_inverted_v_excitation,       "freq": _efhw_inverted_v_frequency_range},
    "random-wire":           {"gen": _random_wire_geometry,           "exc": _random_wire_excitation,           "freq": _random_wire_frequency_range},
    "g5rv":                  {"gen": _g5rv_geometry,                  "exc": _g5rv_excitation,                  "freq": _g5rv_frequency_range},
    "fan-dipole":            {"gen": _fan_dipole_geometry,            "exc": _fan_dipole_excitation,            "freq": _fan_dipole_frequency_range},
    "delta-loop":            {"gen": _delta_loop_geometry,            "exc": _delta_loop_excitation,            "freq": _delta_loop_frequency_range},
    "horizontal-delta-loop": {"gen": _horizontal_delta_loop_geometry, "exc": _horizontal_delta_loop_excitation, "freq": _horizontal_delta_loop_frequency_range},
    "quad":                  {"gen": _quad_geometry,                  "exc": _quad_excitation,                  "freq": _quad_frequency_range},
    "magnetic-loop":         {"gen": _magnetic_loop_geometry,         "exc": _magnetic_loop_excitation,         "freq": _magnetic_loop_frequency_range},
    "yagi":                  {"gen": _yagi_geometry,                  "exc": _yagi_excitation,                  "freq": _yagi_frequency_range},
    "moxon":                 {"gen": _moxon_geometry,                 "exc": _moxon_excitation,                 "freq": _moxon_frequency_range},
    "hex-beam":              {"gen": _hex_beam_geometry,              "exc": _hex_beam_excitation,              "freq": _hex_beam_frequency_range},
    "log-periodic":          {"gen": _log_periodic_geometry,          "exc": _log_periodic_excitation,          "freq": _log_periodic_frequency_range},
}

# Display order matching the original Python TEMPLATES list
_DISPLAY_ORDER = [
    "dipole", "inverted-v", "off-center-fed", "vertical", "inverted-l",
    "j-pole", "slim-jim", "efhw", "efhw-inverted-l", "efhw-inverted-v",
    "random-wire", "g5rv", "fan-dipole", "delta-loop", "horizontal-delta-loop",
    "quad", "magnetic-loop", "yagi", "moxon", "hex-beam", "log-periodic",
]


# ---------------------------------------------------------------------------
# JSON loading
# ---------------------------------------------------------------------------

def _find_shared_path() -> Path:
    """Locate the shared/ data directory (Docker or dev layout)."""
    here = Path(__file__).parent
    docker_path = here / "shared"
    if docker_path.is_dir():
        return docker_path
    dev_path = here.parent / "shared"
    if dev_path.is_dir():
        return dev_path
    raise FileNotFoundError(
        "Could not find shared/ directory.\n"
        f"Searched:\n  {docker_path}\n  {dev_path}\n"
        "Ensure the shared/ directory exists alongside or above the mcp/ directory."
    )


def _load_templates() -> list[AntennaTemplate]:
    """Load template metadata from JSON and combine with geometry functions."""
    templates_file = _find_shared_path() / "antenna-templates.json"
    with open(templates_file, encoding="utf-8") as f:
        raw_data = json.load(f)

    templates_by_id: dict[str, AntennaTemplate] = {}
    for item in raw_data:
        tid = item["id"]
        if tid not in _GEOMETRY_FUNCTIONS:
            continue  # Skip any JSON entries without a geometry implementation

        funcs = _GEOMETRY_FUNCTIONS[tid]

        # Convert camelCase JSON fields to snake_case Python fields
        parameters = tuple(
            ParameterDef(
                key=p["key"],
                label=p["label"],
                description=p["description"],
                unit=p["unit"],
                min=float(p["min"]),
                max=float(p["max"]),
                step=float(p["step"]),
                default_value=float(p["defaultValue"]),
                decimals=int(p["decimals"]) if "decimals" in p and p["decimals"] is not None else None,
            )
            for p in item["parameters"]
        )

        dg = item["defaultGround"]
        default_ground = GroundPreset(
            type=dg["type"],
            custom_permittivity=float(dg["custom_permittivity"]) if "custom_permittivity" in dg and dg["custom_permittivity"] is not None else None,
            custom_conductivity=float(dg["custom_conductivity"]) if "custom_conductivity" in dg and dg["custom_conductivity"] is not None else None,
        )

        templates_by_id[tid] = AntennaTemplate(
            id=tid,
            name=item["name"],
            short_name=item["nameShort"],
            description=item["description"],
            long_description=item["longDescription"],
            icon=item["icon"],
            category=item["category"],
            difficulty=item["difficulty"],
            bands=tuple(item["bands"]),
            parameters=parameters,
            default_ground=default_ground,
            generate_geometry=funcs["gen"],
            generate_excitation=funcs["exc"],
            default_frequency_range=funcs["freq"],
            tips=tuple(item["tips"]),
            related_templates=tuple(item["relatedTemplates"]),
        )

    # Return in canonical display order; fill missing entries at the end
    ordered: list[AntennaTemplate] = []
    for tid in _DISPLAY_ORDER:
        if tid in templates_by_id:
            ordered.append(templates_by_id.pop(tid))
    ordered.extend(templates_by_id.values())
    return ordered


# ---------------------------------------------------------------------------
# Template registry
# ---------------------------------------------------------------------------

TEMPLATES: list[AntennaTemplate] = _load_templates()
TEMPLATE_MAP: dict[str, AntennaTemplate] = {t.id: t for t in TEMPLATES}


def _validate_related_templates() -> None:
    """Validate that all relatedTemplates references exist in TEMPLATE_MAP.

    Called at module load time so typos in JSON raise ValueError immediately.
    """
    for template in TEMPLATES:
        for ref_id in template.related_templates:
            if ref_id not in TEMPLATE_MAP:
                raise ValueError(
                    f"Template {template.id!r} references unknown related template {ref_id!r}. "
                    f"Valid IDs: {', '.join(sorted(TEMPLATE_MAP))}"
                )


_validate_related_templates()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_templates() -> list[AntennaTemplate]:
    """Return all templates in display order."""
    return list(TEMPLATES)


def get_template(template_id: str) -> AntennaTemplate:
    """Get a template by ID."""
    try:
        return TEMPLATE_MAP[template_id]
    except KeyError as exc:
        valid = ", ".join(t.id for t in TEMPLATES)
        raise TemplateNotFoundError(
            f"Unknown template: {template_id!r}. Valid template IDs: {valid}"
        ) from exc


def get_default_template() -> AntennaTemplate:
    """Return the default template (dipole)."""
    return TEMPLATE_MAP["dipole"]


def get_default_params(template_or_id: AntennaTemplate | str) -> dict[str, float]:
    """Return default params for a template."""
    template = get_template(template_or_id) if isinstance(template_or_id, str) else template_or_id
    return template.get_default_params()


def resolve_params(
    template_or_id: AntennaTemplate | str,
    params: Mapping[str, Any] | None = None,
) -> dict[str, float]:
    """Merge provided params with defaults and validate by parameter range."""
    template = get_template(template_or_id) if isinstance(template_or_id, str) else template_or_id
    resolved = template.get_default_params()
    provided = dict(params or {})

    unknown = sorted(key for key in provided if key not in resolved)
    if unknown:
        valid = ", ".join(p.key for p in template.parameters)
        raise TemplateParameterError(
            f"Unknown parameter(s) for template {template.id!r}: {', '.join(unknown)}. "
            f"Valid keys: {valid}"
        )

    for parameter in template.parameters:
        if parameter.key not in provided:
            continue
        raw_value = provided[parameter.key]
        if raw_value is None:
            continue
        if isinstance(raw_value, bool):
            raise TemplateParameterError(f"Parameter {parameter.key!r} must be numeric, not boolean.")
        try:
            numeric_value = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise TemplateParameterError(f"Parameter {parameter.key!r} must be numeric; got {raw_value!r}.") from exc
        if not math.isfinite(numeric_value):
            raise TemplateParameterError(f"Parameter {parameter.key!r} must be finite; got {numeric_value!r}.")
        if numeric_value < parameter.min or numeric_value > parameter.max:
            raise TemplateParameterError(
                f"Parameter {parameter.key!r} out of range for template {template.id!r}: "
                f"{numeric_value} not in [{parameter.min}, {parameter.max}]."
            )
        resolved[parameter.key] = numeric_value

    return resolved


__all__ = [
    "AntennaTemplate", "ArcGeometry", "Excitation", "FrequencyRange",
    "GroundPreset", "GroundTypeName", "ParameterDef",
    "TEMPLATES", "TEMPLATE_MAP",
    "TemplateCategory", "TemplateDifficulty",
    "TemplateNotFoundError", "TemplateParameterError",
    "WireGeometry",
    "arc_to_wire_segments", "auto_segment", "center_segment",
    "get_default_params", "get_default_template", "get_template",
    "list_templates", "resolve_params",
]