"""Antenna template registry and geometry generators.

Ported from the frontend TypeScript template system with matching formulas.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable, Literal, Mapping

TemplateCategory = Literal["wire", "vertical", "directional", "loop", "multiband"]
TemplateDifficulty = Literal["beginner", "intermediate", "advanced"]
GroundTypeName = Literal[
    "free_space",
    "perfect",
    "salt_water",
    "fresh_water",
    "pastoral",
    "average",
    "rocky",
    "city",
    "dry_sandy",
    "custom",
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
        return {parameter.key: parameter.default_value for parameter in self.parameters}


class TemplateNotFoundError(ValueError):
    """Raised when a template ID cannot be resolved."""


class TemplateParameterError(ValueError):
    """Raised when template parameters are invalid."""


def _parameter(
    key: str,
    label: str,
    description: str,
    unit: str,
    minimum: float,
    maximum: float,
    step: float,
    default_value: float,
    decimals: int | None = None,
) -> ParameterDef:
    return ParameterDef(
        key=key,
        label=label,
        description=description,
        unit=unit,
        min=minimum,
        max=maximum,
        step=step,
        default_value=default_value,
        decimals=decimals,
    )


def _param(params: Mapping[str, float], key: str, default: float) -> float:
    value = params.get(key, default)
    if value is None:
        return default
    return float(value)


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
    num_segs = arc.segments
    angle_step = total_angle / num_segs

    for i in range(num_segs):
        a1 = start_rad + i * angle_step
        a2 = start_rad + (i + 1) * angle_step
        wires.append(
            WireGeometry(
                tag=arc.tag,
                segments=1,
                x1=arc.arc_radius * math.cos(a1),
                y1=0.0,
                z1=arc.arc_radius * math.sin(a1) + center_height,
                x2=arc.arc_radius * math.cos(a2),
                y2=0.0,
                z2=arc.arc_radius * math.sin(a2) + center_height,
                radius=arc.wire_radius,
            )
        )
    return wires


def _centered_frequency_range(
    frequency_mhz: float,
    total_bandwidth_fraction: float,
    steps: int,
) -> FrequencyRange:
    bandwidth = frequency_mhz * total_bandwidth_fraction
    return FrequencyRange(
        start_mhz=max(0.1, frequency_mhz - bandwidth / 2.0),
        stop_mhz=min(2000.0, frequency_mhz + bandwidth / 2.0),
        steps=steps,
    )


AVERAGE_GROUND = GroundPreset(type="average")


# ---------------------------------------------------------------------------
# Dipole
# ---------------------------------------------------------------------------

def _dipole_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 14.1)
    height = _param(params, "height", 10.0)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)

    wavelength = 300.0 / freq
    half_length = (wavelength / 2.0) * 0.95 / 2.0
    radius = (wire_diam_mm / 1000.0) / 2.0

    max_freq = freq * 1.15
    segs_per_arm = auto_segment(half_length, max_freq, 11)

    return [
        WireGeometry(1, segs_per_arm, -half_length, 0.0, height, 0.0, 0.0, height, radius),
        WireGeometry(2, segs_per_arm, 0.0, 0.0, height, half_length, 0.0, height, radius),
    ]


def _dipole_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    wire1 = wires[0]
    return Excitation(wire_tag=wire1.tag, segment=wire1.segments, voltage_real=1.0, voltage_imag=0.0)


def _dipole_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.1)
    return _centered_frequency_range(freq, 0.1, 31)


dipole_template = AntennaTemplate(
    id="dipole",
    name="Half-Wave Dipole",
    short_name="Dipole",
    description="Classic half-wave dipole — the fundamental antenna for any band.",
    long_description=(
        "A half-wave dipole consists of two equal-length wires fed at the center. "
        "Total length is approximately one-half wavelength at the design frequency. "
        "It produces a figure-8 pattern in the horizontal plane with ~2.15 dBi gain. "
        "The feed impedance at resonance is approximately 73 ohms in free space, "
        "varying with height above ground. This is the reference antenna for all other designs."
    ),
    icon="—|—",
    category="wire",
    difficulty="beginner",
    bands=("160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for half-wave resonance", "MHz", 0.5, 2000.0, 0.1, 14.1, 3),
        _parameter("height", "Height", "Height above ground at the feed point", "m", 0.5, 100.0, 0.5, 10.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_dipole_geometry,
    generate_excitation=_dipole_excitation,
    default_frequency_range=_dipole_frequency_range,
    tips=(
        "Height above ground significantly affects impedance and pattern.",
        "At λ/2 height, gain maximizes at low angles — ideal for DX.",
        "At λ/4 height, the pattern tilts upward — better for NVIS.",
        "Use thicker wire (larger diameter) for broader SWR bandwidth.",
        "Resonant frequency is slightly lower than the formula λ/2 due to end effects.",
    ),
    related_templates=("inverted-v", "fan-dipole", "off-center-fed"),
)


# ---------------------------------------------------------------------------
# Inverted V
# ---------------------------------------------------------------------------

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

    max_freq = freq * 1.15
    segs_per_arm = auto_segment(arm_length, max_freq, 11)

    return [
        WireGeometry(1, segs_per_arm, -horiz_extent, 0.0, end_height, 0.0, 0.0, apex_height, radius),
        WireGeometry(2, segs_per_arm, 0.0, 0.0, apex_height, horiz_extent, 0.0, end_height, radius),
    ]


def _inverted_v_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    wire1 = wires[0]
    return Excitation(wire_tag=wire1.tag, segment=wire1.segments, voltage_real=1.0, voltage_imag=0.0)


def _inverted_v_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.1, 31)


inverted_v_template = AntennaTemplate(
    id="inverted-v",
    name="Inverted V",
    short_name="Inv V",
    description="Dipole with drooping arms — needs only one support point.",
    long_description=(
        "An Inverted V is a half-wave dipole with its arms sloping downward from a single "
        "center support. The included angle between arms affects performance: "
        "90-120 degrees is optimal. Feed impedance is lower than a flat dipole (typically 50-60 ohms) "
        "which can be advantageous for direct coax feed. The radiation pattern is slightly more omnidirectional "
        "than a flat dipole, with ~1 dB less maximum gain."
    ),
    icon="/|\\",
    category="wire",
    difficulty="beginner",
    bands=("160m", "80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for half-wave resonance", "MHz", 0.5, 2000.0, 0.1, 7.1, 3),
        _parameter("apex_height", "Apex Height", "Height of the center feed point (top of mast)", "m", 2.0, 100.0, 0.5, 12.0, 1),
        _parameter("included_angle", "Included Angle", "Angle between the two arms (90-180 deg, 180=flat dipole)", "deg", 60.0, 180.0, 5.0, 120.0, 0),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_inverted_v_geometry,
    generate_excitation=_inverted_v_excitation,
    default_frequency_range=_inverted_v_frequency_range,
    tips=(
        "90-120 degree included angle gives best compromise of gain vs. impedance.",
        "At 90 degrees, feed impedance drops to ~50 ohms — perfect for direct coax feed.",
        "Wire ends should be at least 2-3m above ground for safety and performance.",
        "Broader horizontal pattern than flat dipole — less directional.",
        "Popular for portable and field day operation (one mast + two stakes).",
    ),
    related_templates=("dipole", "efhw", "delta-loop"),
)


# ---------------------------------------------------------------------------
# EFHW
# ---------------------------------------------------------------------------

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
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.1, 31)


efhw_template = AntennaTemplate(
    id="efhw",
    name="End-Fed Half-Wave",
    short_name="EFHW",
    description="End-fed half-wave with transformer — easy single-support antenna.",
    long_description=(
        "An End-Fed Half-Wave (EFHW) is a half-wave wire fed at one end through a high-impedance "
        "matching transformer (typically 49:1 unun). The antenna presents roughly 2400-5000 ohms "
        "at the feed point, which the transformer steps down to ~50 ohms. It can be strung as a "
        "sloper from a single support, making it ideal for portable, stealth, and field day use. "
        "Multi-band operation is possible since harmonics (2nd, 4th) maintain high impedance at the feed."
    ),
    icon="—~",
    category="wire",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Fundamental frequency for half-wave resonance", "MHz", 0.5, 2000.0, 0.1, 7.1, 3),
        _parameter("feed_height", "Feed Height", "Height of the feed point (typically at mast top)", "m", 1.0, 50.0, 0.5, 10.0, 1),
        _parameter("far_end_height", "Far End Height", "Height of the far end of the wire", "m", 0.5, 50.0, 0.5, 3.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_efhw_geometry,
    generate_excitation=_efhw_excitation,
    default_frequency_range=_efhw_frequency_range,
    tips=(
        "The 49:1 transformer is critical — without it, SWR will be extremely high.",
        "Works well as a sloper: feed point at top of mast, far end near ground.",
        "Resonant on even harmonics too (40m EFHW also works on 20m and 10m).",
        "Keep the feed point coax away from the wire to minimize common-mode currents.",
        "A short counterpoise wire (0.05λ) at the feed helps stabilize impedance.",
    ),
    related_templates=("dipole", "inverted-v"),
)


# ---------------------------------------------------------------------------
# Vertical
# ---------------------------------------------------------------------------

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
        wires.append(
            WireGeometry(i + 2, radial_segs, 0.0, 0.0, base_height, end_x, end_y, end_z, radius)
        )

    return wires


def _vertical_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _vertical_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.2)
    return _centered_frequency_range(freq, 0.15, 31)


vertical_template = AntennaTemplate(
    id="vertical",
    name="Ground Plane Vertical",
    short_name="Vertical",
    description="Quarter-wave vertical with radials — omnidirectional, low-angle radiation.",
    long_description=(
        "A ground plane vertical consists of a quarter-wave vertical radiator with horizontal or "
        "slightly drooping radial wires at its base. It produces an omnidirectional pattern in the "
        "horizontal plane with peak radiation at low elevation angles — excellent for DX. "
        "Feed impedance is approximately 36 ohms with horizontal radials (use a 4:1 or adjust radial droop). "
        "With drooping radials at 45 degrees, impedance rises to ~50 ohms for direct coax feed."
    ),
    icon="⊥",
    category="vertical",
    difficulty="beginner",
    bands=("40m", "20m", "15m", "10m", "6m", "2m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for quarter-wave resonance", "MHz", 1.0, 2000.0, 0.1, 14.2, 3),
        _parameter("radial_count", "Radials", "Number of radial wires (2-8)", "", 2.0, 8.0, 1.0, 4.0, 0),
        _parameter("radial_droop", "Radial Droop", "Droop angle below horizontal (0=flat, 45=drooping)", "deg", 0.0, 60.0, 5.0, 0.0, 0),
        _parameter("base_height", "Base Height", "Height of the radial junction above ground", "m", 0.3, 30.0, 0.1, 0.5, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 25.0, 0.5, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_vertical_geometry,
    generate_excitation=_vertical_excitation,
    default_frequency_range=_vertical_frequency_range,
    tips=(
        "4 radials is the minimum; more radials improve ground plane but with diminishing returns.",
        "Droop radials at 45 degrees to raise impedance toward 50 ohms.",
        "Elevated radials (not on ground) are more efficient than buried radials.",
        "Height of the radial junction above ground affects low-angle performance.",
        "For 20m band: vertical ~5.1m, radials ~5.1m each.",
    ),
    related_templates=("j-pole", "slim-jim", "efhw"),
)


# ---------------------------------------------------------------------------
# Yagi
# ---------------------------------------------------------------------------

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
        wires.append(
            WireGeometry(i + 1, segs, -half_len, boom_pos, height, half_len, boom_pos, height, radius)
        )

    return wires


def _yagi_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    driven = wires[1]
    return Excitation(
        wire_tag=driven.tag,
        segment=center_segment(driven.segments),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _yagi_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.15)
    return _centered_frequency_range(freq, 0.07, 31)


yagi_template = AntennaTemplate(
    id="yagi",
    name="Yagi-Uda",
    short_name="Yagi",
    description="High-gain directional beam with 2-6 elements.",
    long_description=(
        "The Yagi-Uda is the most popular directional antenna for amateur radio. It consists of "
        "a driven element (fed dipole), a reflector behind it, and one or more directors in front. "
        "Parasitic coupling between elements creates a directional pattern with high forward gain "
        "and good front-to-back ratio. More elements = more gain and narrower beamwidth, but also "
        "a longer boom and more critical tuning. A 3-element Yagi provides about 7-8 dBi gain."
    ),
    icon=">>|",
    category="directional",
    difficulty="intermediate",
    bands=("20m", "15m", "10m", "6m", "2m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for the Yagi design", "MHz", 1.0, 2000.0, 0.1, 14.15, 3),
        _parameter("num_elements", "Elements", "Number of elements (2=reflector+driven, 3+=with directors)", "", 2.0, 6.0, 1.0, 3.0, 0),
        _parameter("height", "Height", "Height above ground", "m", 2.0, 50.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Element Diameter", "Element tube/wire diameter", "mm", 1.0, 50.0, 1.0, 12.0, 0),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_yagi_geometry,
    generate_excitation=_yagi_excitation,
    default_frequency_range=_yagi_frequency_range,
    tips=(
        "The reflector is slightly longer than λ/2, directors slightly shorter.",
        "More elements add gain but with diminishing returns above 5-6 elements.",
        "Element spacing affects gain vs. bandwidth tradeoff.",
        "Height above ground should be at least λ/2 for good low-angle radiation.",
        "Boom length (not element count) is the primary determinant of gain.",
    ),
    related_templates=("quad", "moxon", "hex-beam"),
)


# ---------------------------------------------------------------------------
# Moxon
# ---------------------------------------------------------------------------

def _moxon_dimensions(wire_diameter_wavelengths: float) -> dict[str, float]:
    d = math.log10(wire_diameter_wavelengths)
    a = 0.4834 - 0.0117 * d - 0.0006 * d * d
    b = 0.0502 - 0.0192 * d - 0.0020 * d * d
    c = 0.0365 + 0.0143 * d + 0.0014 * d * d
    d_dim = 0.0516 + 0.0085 * d + 0.0007 * d * d
    e = a
    return {"A": a, "B": b, "C": c, "D": d_dim, "E": e}


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
    return Excitation(
        wire_tag=driven.tag,
        segment=center_segment(driven.segments),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _moxon_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.15)
    return _centered_frequency_range(freq, 0.08, 31)


moxon_template = AntennaTemplate(
    id="moxon",
    name="Moxon Rectangle",
    short_name="Moxon",
    description="Compact 2-element beam with excellent front-to-back ratio.",
    long_description=(
        "The Moxon Rectangle is a compact directional antenna invented by Les Moxon (G6XN). "
        "It achieves excellent front-to-back ratio (often >30 dB) with only two elements "
        "by using closely-spaced folded-back tips that provide additional coupling. "
        "The turning radius is about 70% of a 2-element Yagi, making it ideal for "
        "space-constrained installations. Gain is typically 5.5-6 dBi — slightly less "
        "than a 2-element Yagi, but with far superior F/B performance."
    ),
    icon="[=]",
    category="directional",
    difficulty="intermediate",
    bands=("20m", "17m", "15m", "12m", "10m", "6m", "2m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for the Moxon design", "MHz", 1.0, 2000.0, 0.1, 14.15, 3),
        _parameter("height", "Height", "Height above ground", "m", 2.0, 50.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 25.0, 0.5, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_moxon_geometry,
    generate_excitation=_moxon_excitation,
    default_frequency_range=_moxon_frequency_range,
    tips=(
        "The gap between tail tips is critical — small changes significantly affect F/B ratio.",
        "Turning radius is ~70% of a 2-element Yagi — great for small lots.",
        "F/B can exceed 30 dB when properly tuned — far better than a standard Yagi.",
        "Wire diameter affects dimensions — use the Cebik formulas for best results.",
        "Can be built with wire for lower bands or tubing for VHF/UHF.",
    ),
    related_templates=("yagi", "quad", "hex-beam"),
)


# ---------------------------------------------------------------------------
# J-Pole
# ---------------------------------------------------------------------------

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
    freq = _param(params, "frequency", 145.0)
    return _centered_frequency_range(freq, 0.08, 31)


j_pole_template = AntennaTemplate(
    id="j-pole",
    name="J-Pole",
    short_name="J-Pole",
    description="End-fed half-wave vertical with quarter-wave matching stub.",
    long_description=(
        "The J-Pole is a half-wave vertical antenna with an integrated quarter-wave "
        "matching section (J-matching stub). It provides omnidirectional radiation with "
        "approximately 2-3 dBi gain and a low-angle pattern ideal for VHF/UHF. "
        "The matching stub transforms the high impedance at the end of the half-wave "
        "element to approximately 50 ohms. Popular for 2m and 70cm FM, and also works "
        "well on HF bands. No radials required."
    ),
    icon="J|",
    category="vertical",
    difficulty="beginner",
    bands=("10m", "6m", "2m", "70cm"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency", "MHz", 1.0, 2000.0, 0.1, 145.0, 3),
        _parameter("base_height", "Base Height", "Height of the bottom of the J above ground", "m", 0.1, 30.0, 0.1, 1.5, 1),
        _parameter("spacing", "Element Spacing", "Gap between the two vertical sections", "mm", 10.0, 200.0, 5.0, 50.0, 0),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 25.0, 0.5, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_j_pole_geometry,
    generate_excitation=_j_pole_excitation,
    default_frequency_range=_j_pole_frequency_range,
    tips=(
        "Feed point height on the short stub affects impedance — adjust for best SWR.",
        "The spacing between the two vertical sections is typically 1-2 inches (25-50mm).",
        "No ground radials needed — the J-match provides the current return path.",
        "Can be made from ladder line, copper pipe, or aluminum tubing.",
        "Excellent choice for a portable or emergency VHF/UHF antenna.",
    ),
    related_templates=("slim-jim", "vertical", "efhw"),
)


# ---------------------------------------------------------------------------
# Slim Jim
# ---------------------------------------------------------------------------

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
        WireGeometry(
            3,
            segs_folded,
            spacing,
            0.0,
            base_h + quarter_wave + gap_height,
            spacing,
            0.0,
            base_h + total_height,
            radius,
        ),
        WireGeometry(4, segs_horiz, 0.0, 0.0, base_h, spacing, 0.0, base_h, radius),
        WireGeometry(5, segs_horiz, 0.0, 0.0, base_h + total_height, spacing, 0.0, base_h + total_height, radius),
    ]


def _slim_jim_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    stub = wires[1]
    return Excitation(wire_tag=stub.tag, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _slim_jim_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 145.0)
    return _centered_frequency_range(freq, 0.08, 31)


slim_jim_template = AntennaTemplate(
    id="slim-jim",
    name="Slim Jim",
    short_name="Slim Jim",
    description="Full-wave folded vertical with J-match — more gain than a standard J-Pole.",
    long_description=(
        "The Slim Jim is an end-fed folded dipole with a J-matching stub. It combines "
        "a full-wavelength radiating section with a quarter-wave matching section, all in "
        "a slim, vertical package. The folded design provides slightly higher gain (~3 dBi) "
        "than a standard J-Pole due to the full-wave current distribution. The open gap at "
        "the bottom of one side creates the necessary impedance transformation. Very popular "
        "for portable VHF/UHF operation — can be made from 300-ohm TV twin-lead."
    ),
    icon="||",
    category="vertical",
    difficulty="beginner",
    bands=("10m", "6m", "2m", "70cm"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency", "MHz", 1.0, 2000.0, 0.1, 145.0, 3),
        _parameter("base_height", "Base Height", "Height of the bottom above ground", "m", 0.1, 30.0, 0.1, 1.5, 1),
        _parameter("spacing", "Element Spacing", "Gap between the two vertical conductors", "mm", 10.0, 200.0, 5.0, 25.0, 0),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 25.0, 0.5, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_slim_jim_geometry,
    generate_excitation=_slim_jim_excitation,
    default_frequency_range=_slim_jim_frequency_range,
    tips=(
        "Can be made from 300-ohm TV twin-lead for an ultra-lightweight portable antenna.",
        "Slightly more gain than a J-Pole due to full-wave current distribution.",
        "The gap in one side is critical — it creates the matching impedance step.",
        "Feed point tap position on the short side adjusts impedance (aim for 50 ohms).",
        "Roll up and carry in your pocket for field/emergency use (twin-lead version).",
    ),
    related_templates=("j-pole", "vertical", "efhw"),
)


# ---------------------------------------------------------------------------
# Delta Loop
# ---------------------------------------------------------------------------

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
    return Excitation(
        wire_tag=base.tag,
        segment=center_segment(base.segments),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _delta_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.15)
    return _centered_frequency_range(freq, 0.1, 31)


delta_loop_template = AntennaTemplate(
    id="delta-loop",
    name="Delta Loop",
    short_name="Delta",
    description="Full-wavelength triangular loop — ~1 dB more gain than a dipole.",
    long_description=(
        "The Delta Loop is a full-wavelength (1λ) wire loop in a triangular shape. "
        "It provides approximately 1 dB more gain than a half-wave dipole at the same height, "
        "with slightly lower noise pickup. When mounted with the apex up and fed at the bottom "
        "center, the polarization is horizontal. The feed impedance is approximately 100-120 ohms, "
        "which can be matched with a 4:1 balun or a quarter-wave 75-ohm coax transformer. "
        "Delta loops are popular on 40m and 80m where their triangular shape fits between "
        "trees or on a single tall support."
    ),
    icon="/\\",
    category="loop",
    difficulty="intermediate",
    bands=("80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Resonant frequency of the loop", "MHz", 0.5, 2000.0, 0.1, 14.15, 3),
        _parameter("base_height", "Base Height", "Height of the bottom wire above ground", "m", 0.5, 50.0, 0.5, 5.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_delta_loop_geometry,
    generate_excitation=_delta_loop_excitation,
    default_frequency_range=_delta_loop_frequency_range,
    tips=(
        "Feed impedance is ~100-120 ohms — use a 4:1 balun or 75-ohm quarter-wave match.",
        "Apex-up with bottom feed gives horizontal polarization (good for DX).",
        "Base-down with top feed gives vertical polarization (good for local comms).",
        "Perimeter = 1 wavelength; each side = λ/3 for equilateral triangle.",
        "About 1 dB more gain and lower noise than a dipole at the same height.",
    ),
    related_templates=("horizontal-delta-loop", "quad", "dipole", "magnetic-loop"),
)


# ---------------------------------------------------------------------------
# Horizontal Delta Loop
# ---------------------------------------------------------------------------

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


def _horizontal_delta_loop_excitation(
    _params: Mapping[str, float],
    wires: list[WireGeometry],
) -> Excitation:
    base = wires[0]
    return Excitation(
        wire_tag=base.tag,
        segment=center_segment(base.segments),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _horizontal_delta_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 7.15)
    return _centered_frequency_range(freq, 0.1, 31)


horizontal_delta_loop_template = AntennaTemplate(
    id="horizontal-delta-loop",
    name="Horizontal Delta Loop",
    short_name="H-Delta",
    description="Full-wavelength horizontal triangular loop (skyloop) for multi-band HF operation.",
    long_description=(
        "A Horizontal Delta Loop (often called a skyloop) is a full-wavelength triangular "
        "wire loop mounted parallel to the ground. It offers broad HF coverage with low noise "
        "pickup and can be effective for both regional and DX operation depending on height "
        "above ground. At lower heights it favors higher takeoff angles (NVIS/regional), and "
        "at greater heights it supports lower-angle radiation. As with other full-wave loops, "
        "feed impedance varies with installation details and may require matching."
    ),
    icon="/_\\",
    category="loop",
    difficulty="intermediate",
    bands=("160m", "80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Resonant frequency of the loop", "MHz", 0.5, 2000.0, 0.1, 7.15, 3),
        _parameter("height", "Loop Height", "Height of the horizontal loop above ground", "m", 0.5, 50.0, 0.5, 10.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_horizontal_delta_loop_geometry,
    generate_excitation=_horizontal_delta_loop_excitation,
    default_frequency_range=_horizontal_delta_loop_frequency_range,
    tips=(
        "Keep loop height as uniform as possible for predictable pattern behavior.",
        "At lower heights, expect stronger high-angle radiation (regional/NVIS).",
        "Higher installation heights improve lower-angle radiation for longer paths.",
        "Use a tuner or matching network as feed impedance can vary with installation.",
        "Perimeter is set near one wavelength at the design frequency.",
    ),
    related_templates=("delta-loop", "quad", "magnetic-loop"),
)


# ---------------------------------------------------------------------------
# Quad
# ---------------------------------------------------------------------------

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
    wire = next((candidate for candidate in wires if candidate.tag == driven_bottom_tag), None)
    segs = wire.segments if wire is not None else 7
    return Excitation(
        wire_tag=driven_bottom_tag,
        segment=center_segment(segs),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _quad_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.15)
    return _centered_frequency_range(freq, 0.08, 31)


quad_template = AntennaTemplate(
    id="quad",
    name="Cubical Quad",
    short_name="Quad",
    description="Full-wave loop beam — higher gain per element than a Yagi.",
    long_description=(
        "The Cubical Quad uses full-wave square loop elements instead of linear dipoles. "
        "Each loop has a perimeter of approximately one wavelength. The quad provides about "
        "1-2 dB more gain than a Yagi with the same number of elements and has lower radiation "
        "angle. A 2-element quad (reflector + driven) gives about 7 dBi gain. The feed impedance "
        "is approximately 100-125 ohms, requiring a matching section or 75-ohm feed with a 1.5:1 SWR."
    ),
    icon="[]",
    category="directional",
    difficulty="intermediate",
    bands=("20m", "15m", "10m", "6m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for the quad design", "MHz", 1.0, 2000.0, 0.1, 14.15, 3),
        _parameter("num_elements", "Elements", "Number of loop elements (1-3)", "", 1.0, 3.0, 1.0, 2.0, 0),
        _parameter("height", "Center Height", "Height of the loop centers above ground", "m", 3.0, 50.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_quad_geometry,
    generate_excitation=_quad_excitation,
    default_frequency_range=_quad_frequency_range,
    tips=(
        "Feed at the bottom center of the driven loop for horizontal polarization.",
        "Feed at the side center for vertical polarization.",
        "Quad loops are less affected by nearby metallic objects than Yagi elements.",
        "A 2-element quad roughly equals a 3-element Yagi in gain.",
        "The bamboo/fiberglass spreader arms make this lighter than it looks.",
    ),
    related_templates=("yagi", "delta-loop", "hex-beam"),
)


# ---------------------------------------------------------------------------
# Hex Beam
# ---------------------------------------------------------------------------

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
    freq = _param(params, "frequency", 14.15)
    return _centered_frequency_range(freq, 0.1, 31)


hex_beam_template = AntennaTemplate(
    id="hex-beam",
    name="Hex Beam",
    short_name="Hex",
    description="Compact broadband beam on a hex frame — Yagi performance, smaller footprint.",
    long_description=(
        "The Hex Beam (or Hexagonal Beam) is a lightweight directional antenna that uses "
        "wire elements bent into a W shape on a hexagonal frame. It provides performance "
        "similar to a 2-element Yagi (5-6 dBi gain, 15-20 dB F/B) but with a significantly "
        "smaller turning radius — about 60% of a full-size Yagi. The W-shaped elements "
        "create broadband performance through capacitive end-loading. Hex beams are very "
        "popular for multi-band HF operations, often covering 20m through 6m on a single "
        "frame. Wind loading is very low due to the wire construction."
    ),
    icon="W",
    category="directional",
    difficulty="intermediate",
    bands=("20m", "17m", "15m", "12m", "10m", "6m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for the hex beam design", "MHz", 5.0, 2000.0, 0.1, 14.15, 3),
        _parameter("height", "Height", "Height above ground", "m", 3.0, 50.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_hex_beam_geometry,
    generate_excitation=_hex_beam_excitation,
    default_frequency_range=_hex_beam_frequency_range,
    tips=(
        "Turning radius is ~60% of an equivalent Yagi — great for small towers.",
        "Very low wind loading compared to aluminum Yagis.",
        "The W shape provides natural broadbanding through end loading.",
        "Can easily be multiband with multiple wire sets on the same frame.",
        "Element sag affects performance — keep the frame level.",
        "Typical gain 5-6 dBi with 15-20 dB F/B ratio.",
    ),
    related_templates=("moxon", "yagi", "quad"),
)


# ---------------------------------------------------------------------------
# Log Periodic
# ---------------------------------------------------------------------------

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
        d = 4.0 * sigma * half_lengths[i]
        spacings.append(d)

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
        wires.append(
            WireGeometry(i + 1, segs, -half_len, boom_pos, height, half_len, boom_pos, height, radius)
        )

    return wires


def _log_periodic_excitation(_params: Mapping[str, float], wires: list[WireGeometry]) -> Excitation:
    front_element = wires[-1]
    return Excitation(
        wire_tag=front_element.tag,
        segment=center_segment(front_element.segments),
        voltage_real=1.0,
        voltage_imag=0.0,
    )


def _log_periodic_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq_low = _param(params, "freq_low", 14.0)
    freq_high = _param(params, "freq_high", 30.0)
    return FrequencyRange(
        start_mhz=max(0.1, freq_low * 0.9),
        stop_mhz=min(2000.0, freq_high * 1.1),
        steps=51,
    )


log_periodic_template = AntennaTemplate(
    id="log-periodic",
    name="Log-Periodic Dipole Array",
    short_name="LPDA",
    description="Broadband directional antenna covering a wide frequency range with consistent gain.",
    long_description=(
        "The Log-Periodic Dipole Array (LPDA) is a broadband directional antenna that maintains "
        "relatively constant gain and impedance across a wide frequency range. It consists of "
        "multiple dipole elements of varying length connected to a common transposed feeder. "
        "The element lengths and spacings are related by a constant ratio (tau), and the spacing "
        "angle (sigma) determines the bandwidth-to-gain tradeoff. Typical gain is 6-8 dBi with "
        "moderate F/B ratio. LPDAs are used extensively for TV reception, EMC testing, and "
        "amateur radio where broadband coverage is needed without retuning."
    ),
    icon=">>>",
    category="directional",
    difficulty="advanced",
    bands=("20m", "17m", "15m", "12m", "10m", "6m"),
    parameters=(
        _parameter("freq_low", "Low Frequency", "Lower edge of the operating range", "MHz", 1.0, 1000.0, 0.1, 14.0, 3),
        _parameter("freq_high", "High Frequency", "Upper edge of the operating range", "MHz", 2.0, 2000.0, 0.1, 30.0, 3),
        _parameter("tau", "Tau (τ)", "Design ratio — higher = more gain, more elements", "", 0.8, 0.98, 0.005, 0.9, 3),
        _parameter("sigma", "Sigma (σ)", "Relative spacing factor", "", 0.03, 0.12, 0.002, 0.06, 3),
        _parameter("height", "Height", "Height above ground", "m", 3.0, 50.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Element Diameter", "Element tube/wire diameter", "mm", 1.0, 25.0, 0.5, 6.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_log_periodic_geometry,
    generate_excitation=_log_periodic_excitation,
    default_frequency_range=_log_periodic_frequency_range,
    tips=(
        "Tau (τ) controls the bandwidth/gain tradeoff — higher τ = more gain but more elements.",
        "Sigma (σ) controls the spacing — typical values 0.04 to 0.08.",
        "Feed at the shortest element (front) for correct phasing.",
        "The transposed feeder provides 180° phase shift between adjacent elements.",
        "Add 1-2 extra elements beyond the design range for clean pattern at band edges.",
        "Typical gain is 6-8 dBi — less than a Yagi but over much wider bandwidth.",
    ),
    related_templates=("yagi", "moxon", "hex-beam"),
)


# ---------------------------------------------------------------------------
# Fan Dipole
# ---------------------------------------------------------------------------

BAND_FREQS: dict[str, float] = {
    "80m": 3.6,
    "40m": 7.1,
    "20m": 14.15,
    "15m": 21.2,
    "10m": 28.5,
}


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


def _fan_dipole_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    num_bands = round(_param(params, "num_bands", 3.0))
    if num_bands <= 3:
        return FrequencyRange(start_mhz=13.5, stop_mhz=14.5, steps=31)
    return FrequencyRange(start_mhz=13.5, stop_mhz=14.5, steps=31)


fan_dipole_template = AntennaTemplate(
    id="fan-dipole",
    name="Fan Dipole",
    short_name="Fan",
    description="Multiband dipole with separate resonant elements for each band.",
    long_description=(
        "The Fan Dipole is a multiband antenna using multiple dipole pairs of different "
        "lengths, all connected at a common center feed point. Each pair is cut to be resonant "
        "on a different band, and the elements are spread apart vertically (like a fan) to "
        "minimize interaction. This simple approach provides multiband coverage with a single "
        "coax feed and no tuner required on the design bands. Performance on each band is "
        "similar to a single-band dipole. Common configurations cover 3-5 HF bands."
    ),
    icon="=|=",
    category="multiband",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("num_bands", "Number of Bands", "How many band pairs (2-5)", "", 2.0, 5.0, 1.0, 3.0, 0),
        _parameter("height", "Height", "Height of the center feed point above ground", "m", 3.0, 30.0, 0.5, 10.0, 1),
        _parameter("fan_spread", "Fan Spread", "Vertical separation between longest and shortest elements", "m", 0.1, 3.0, 0.1, 1.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 5.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_fan_dipole_geometry,
    generate_excitation=_fan_dipole_excitation,
    default_frequency_range=_fan_dipole_frequency_range,
    tips=(
        "Spread elements vertically by 0.3-0.5m to reduce interaction between bands.",
        "Start by cutting each pair for single-band resonance, then trim in place.",
        "The 15m element may need significant trimming due to interaction with the 20m element.",
        "A common feed point means only one coax run is needed.",
        "Use spreader bars (PVC, fiberglass) to maintain element spacing.",
        "Harmonically related bands (40m/15m) may interact — check SWR on both.",
    ),
    related_templates=("dipole", "g5rv", "off-center-fed"),
)


# ---------------------------------------------------------------------------
# G5RV
# ---------------------------------------------------------------------------

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


g5rv_template = AntennaTemplate(
    id="g5rv",
    name="G5RV",
    short_name="G5RV",
    description="Classic multiband dipole with open-wire matching section — 80m to 10m.",
    long_description=(
        "The G5RV is one of the most popular multiband wire antennas in amateur radio. "
        "Designed by Louis Varney (G5RV), it consists of a 102-foot (31.1m) center-fed dipole "
        "with a 34-foot (10.36m) open-wire (450-ohm ladder line) matching section dropping "
        "vertically from the center. The open-wire section transforms the impedance on "
        "multiple bands. It works well on 20m (where it's close to resonant) and provides "
        "acceptable performance on 80m through 10m with an antenna tuner. The G5RV is "
        "easy to build, inexpensive, and fits in most suburban lots."
    ),
    icon="T",
    category="multiband",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "17m", "15m", "12m", "10m"),
    parameters=(
        _parameter("height", "Dipole Height", "Height of the horizontal dipole wire", "m", 5.0, 30.0, 0.5, 12.0, 1),
        _parameter("feeder_length", "Feeder Length", "Length of the open-wire matching section", "m", 5.0, 20.0, 0.5, 10.36, 2),
        _parameter("dipole_length", "Dipole Length", "Total horizontal wire length (full-size = 31.1m)", "m", 10.0, 50.0, 0.5, 31.1, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 5.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_g5rv_geometry,
    generate_excitation=_g5rv_excitation,
    default_frequency_range=_g5rv_frequency_range,
    tips=(
        "Works best on 20m — close to resonant, ~60 ohm feedpoint impedance.",
        "An antenna tuner is needed for most other bands.",
        "Keep the open-wire section as vertical as possible for best performance.",
        "Use real 450-ohm ladder line, not 300-ohm TV twin-lead (too lossy).",
        "A 'G5RV Junior' (half-size) covers 40m through 10m in smaller spaces.",
        "Total horizontal span is 31.1m (102 ft) — needs good supports at both ends.",
    ),
    related_templates=("dipole", "fan-dipole", "off-center-fed"),
)


# ---------------------------------------------------------------------------
# Off-Center-Fed
# ---------------------------------------------------------------------------

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
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.1, 31)


off_center_fed_template = AntennaTemplate(
    id="off-center-fed",
    name="Off-Center Fed Dipole",
    short_name="OCF",
    description="Windom/OCF dipole — multiband operation from a single wire with off-center feed.",
    long_description=(
        "The Off-Center Fed (OCF) Dipole, also known as the Windom, is a half-wave dipole "
        "fed at a point approximately 1/3 from one end. This feed point location presents "
        "a feed impedance of approximately 200-300 ohms (matched with a 4:1 balun to 50 ohms). "
        "The key advantage is that the off-center feed point maintains a reasonable impedance "
        "on even harmonics, giving multiband operation on the fundamental and approximately "
        "every even multiple (e.g., 80m fundamental → works on 40m, 20m, 10m). "
        "Simple construction — just one wire, a 4:1 balun, and coax."
    ),
    icon="--|----",
    category="multiband",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Fundamental resonant frequency", "MHz", 0.5, 2000.0, 0.1, 7.1, 3),
        _parameter("feed_offset", "Feed Offset", "Feed point position as fraction from one end (0.33 = classic Windom)", "", 0.2, 0.45, 0.01, 0.36, 2),
        _parameter("height", "Height", "Height above ground", "m", 2.0, 30.0, 0.5, 12.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 5.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_off_center_fed_geometry,
    generate_excitation=_off_center_fed_excitation,
    default_frequency_range=_off_center_fed_frequency_range,
    tips=(
        "Feed at ~36% from one end (not exactly 1/3) for best multiband impedance.",
        "A 4:1 current balun is essential — do NOT use a voltage balun.",
        "Works on fundamental + even harmonics: e.g., 80/40/20/10m.",
        "May not work well on odd harmonics (e.g., 15m for an 80m OCF).",
        "Total wire length for 80m: ~40.5m (133 ft), for 40m: ~20.25m.",
        "Keep the wire as straight and horizontal as possible.",
    ),
    related_templates=("dipole", "efhw", "g5rv", "fan-dipole"),
)


# ---------------------------------------------------------------------------
# Magnetic Loop
# ---------------------------------------------------------------------------

def _magnetic_loop_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    radius = _param(params, "radius", 0.5)
    tube_dia = _param(params, "tube_dia", 12.0)
    height = _param(params, "height", 3.0)
    wire_radius = (tube_dia / 1000.0) / 2.0

    arc = ArcGeometry(
        tag=1,
        segments=36,
        arc_radius=radius,
        start_angle=0.0,
        end_angle=360.0,
        wire_radius=wire_radius,
    )
    return arc_to_wire_segments(arc, height)


def _magnetic_loop_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _magnetic_loop_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 14.1)
    return _centered_frequency_range(freq, 0.1, 21)


magnetic_loop_template = AntennaTemplate(
    id="magnetic-loop",
    name="Small Magnetic Loop",
    short_name="Mag Loop",
    description="Small transmitting loop with tuning capacitor, excellent for HF in limited space.",
    long_description=(
        "A small magnetic loop antenna (also called a small transmitting loop or STL) "
        "is a full circle of conductor tuned to resonance by a high-voltage variable capacitor. "
        "Despite its small size (typically 1-3 ft diameter for HF), it can be surprisingly "
        "efficient on 40m-10m. The radiation pattern is broadside to the plane of the loop "
        "(figure-8 in the plane of the loop). Key advantages: very compact, low-noise receiving, "
        "sharp tuning rejects out-of-band interference. Key limitations: very narrow bandwidth "
        "(a few kHz on 40m), high voltages at the capacitor (several kV at 100W)."
    ),
    icon="O",
    category="loop",
    difficulty="intermediate",
    bands=("40m", "30m", "20m", "17m", "15m", "12m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for the loop", "MHz", 3.5, 30.0, 0.1, 14.1, 3),
        _parameter("radius", "Loop Radius", "Radius of the circular loop", "m", 0.2, 2.0, 0.05, 0.5, 2),
        _parameter("tube_dia", "Tube Diameter", "Diameter of the conductor tube/wire", "mm", 3.0, 25.0, 1.0, 12.0, 0),
        _parameter("height", "Center Height", "Height of the loop center above ground", "m", 0.5, 15.0, 0.5, 3.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_magnetic_loop_geometry,
    generate_excitation=_magnetic_loop_excitation,
    default_frequency_range=_magnetic_loop_frequency_range,
    tips=(
        "The tuning capacitor must handle very high voltages (several kV at 100W). Use a vacuum variable or high-voltage air variable.",
        "Bandwidth is extremely narrow (a few kHz on 40m). You will need to retune for every frequency change.",
        "Use the largest diameter conductor you can find (copper tube, 12-25mm). Efficiency improves dramatically with thicker conductors.",
        "Keep the loop at least 1/4 wavelength from any metal structures for best performance.",
        "The radiation pattern is broadside to the loop plane — orient the loop to point at your target direction.",
        "This simulation uses the wire-segment approximation of the frontend preview geometry.",
    ),
    related_templates=("delta-loop", "quad"),
)


# ---------------------------------------------------------------------------
# Inverted-L
# ---------------------------------------------------------------------------

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
    wires: list[WireGeometry] = [
        WireGeometry(1, vertical_segs, 0.0, 0.0, base_height, 0.0, 0.0, top_z, radius)
    ]

    next_tag = 2
    if horizontal_length > 1e-9:
        horizontal_segs = auto_segment(horizontal_length, max_freq, 7)
        wires.append(
            WireGeometry(next_tag, horizontal_segs, 0.0, 0.0, top_z, horizontal_length, 0.0, top_z, radius)
        )
        next_tag += 1

    droop_rad = (radial_droop_deg * math.pi) / 180.0
    radial_horiz_length = radial_length * math.cos(droop_rad)
    radial_vert_drop = radial_length * math.sin(droop_rad)

    for i in range(radial_count):
        angle = (2.0 * math.pi * i) / radial_count
        end_x = radial_horiz_length * math.cos(angle)
        end_y = radial_horiz_length * math.sin(angle)
        end_z = base_height - radial_vert_drop
        wires.append(
            WireGeometry(next_tag + i, radial_segs, 0.0, 0.0, base_height, end_x, end_y, end_z, radius)
        )

    return wires


def _inverted_l_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _inverted_l_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.15, 31)


inverted_l_template = AntennaTemplate(
    id="inverted-l",
    name="Inverted-L",
    short_name="Inv-L",
    description="Quarter-wave vertical bent over at the top — practical HF radiator when height is limited.",
    long_description=(
        "The Inverted-L combines a vertical quarter-wave section with a horizontal top wire so the "
        "overall radiator remains close to a quarter wavelength even when a full straight vertical "
        "is impractical. The vertical section helps produce useful low-angle radiation, while the "
        "horizontal section provides top loading and makes the antenna easier to fit on lower HF bands. "
        "Like other base-fed verticals, it benefits from a good radial or counterpoise system. "
        "Compared with a straight quarter-wave vertical, the Inverted-L usually produces mixed "
        "polarization and somewhat different feed impedance, but it remains a classic choice for "
        "40m and 80m installations where support height is limited."
    ),
    icon="┐",
    category="vertical",
    difficulty="beginner",
    bands=("160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Center frequency for quarter-wave operation", "MHz", 1.0, 2000.0, 0.1, 7.1, 3),
        _parameter("vertical_height", "Vertical Height", "Height of the vertical section above the feed point", "m", 1.0, 30.0, 0.5, 6.0, 1),
        _parameter("base_height", "Base Height", "Height of the feed point and radial junction above ground", "m", 0.3, 10.0, 0.1, 0.5, 1),
        _parameter("radial_count", "Radials", "Number of radial wires (2-8)", "", 2.0, 8.0, 1.0, 4.0, 0),
        _parameter("radial_droop", "Radial Droop", "Droop angle below horizontal (0=flat, 45=drooping)", "deg", 0.0, 60.0, 5.0, 0.0, 0),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_inverted_l_geometry,
    generate_excitation=_inverted_l_excitation,
    default_frequency_range=_inverted_l_frequency_range,
    tips=(
        "Keep the horizontal section away from metal supports and nearby conductors if possible.",
        "A good radial or counterpoise system is still important for efficiency and impedance stability.",
        "If the requested vertical section exceeds the electrical quarter-wave length, the model caps it and omits the horizontal section.",
        "Drooping radials can move the feed impedance closer to 50 ohms, similar to other elevated verticals.",
        "Expect a mix of vertical and horizontal polarization because the radiator bends at the top.",
    ),
    related_templates=("vertical", "random-wire", "efhw"),
)


# ---------------------------------------------------------------------------
# EFHW Inverted-L
# ---------------------------------------------------------------------------

def _efhw_inverted_l_geometry(params: Mapping[str, float]) -> list[WireGeometry]:
    freq = _param(params, "frequency", 7.1)
    vertical_height = _param(params, "vertical_height", 8.0)
    feed_height = _param(params, "feed_height", 1.5)
    wire_diam_mm = _param(params, "wire_diameter", 2.0)

    wavelength = 300.0 / freq
    total_length = (wavelength / 2.0) * 0.97
    radius = (wire_diam_mm / 1000.0) / 2.0

    # Cap the vertical section to the total half-wave length
    actual_vertical = min(vertical_height, total_length)
    horizontal_length = max(0.0, total_length - actual_vertical)

    max_freq = freq * 1.15
    vertical_segs = auto_segment(actual_vertical, max_freq, 21)

    top_z = feed_height + actual_vertical
    wires: list[WireGeometry] = [
        WireGeometry(1, vertical_segs, 0.0, 0.0, feed_height, 0.0, 0.0, top_z, radius),
    ]

    if horizontal_length > 1e-6:
        horizontal_segs = auto_segment(horizontal_length, max_freq, 21)
        wires.append(
            WireGeometry(2, horizontal_segs, 0.0, 0.0, top_z, horizontal_length, 0.0, top_z, radius),
        )

    counterpoise_length = wavelength * 0.05
    counterpoise_segs = auto_segment(counterpoise_length, max_freq, 5)
    cp_tag = len(wires) + 1
    wires.append(
        WireGeometry(cp_tag, counterpoise_segs, 0.0, 0.0, feed_height, -counterpoise_length, 0.0, feed_height, radius),
    )

    return wires


def _efhw_inverted_l_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _efhw_inverted_l_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.1, 31)


efhw_inverted_l_template = AntennaTemplate(
    id="efhw-inverted-l",
    name="EFHW Inverted-L",
    short_name="EFHW-L",
    description="End-fed half-wave bent into an L shape — vertical section plus horizontal top wire.",
    long_description=(
        "An EFHW Inverted-L is an End-Fed Half-Wave antenna where the wire runs vertically from "
        "a low feed point up to the top of a mast, then continues horizontally. The total wire "
        "length remains approximately λ/2. This layout is very practical when only a single mast "
        "is available: the vertical section provides some low-angle radiation component, while the "
        "horizontal top section completes the half-wave resonance. Like all EFHW antennas, a 49:1 "
        "transformer and a short counterpoise are used at the feed point. Multiband operation on "
        "even harmonics is possible (e.g., a 40m EFHW-L also works on 20m and 10m)."
    ),
    icon="┐~",
    category="wire",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Fundamental frequency for half-wave resonance", "MHz", 0.5, 2000.0, 0.1, 7.1, 3),
        _parameter("vertical_height", "Vertical Section", "Height of the vertical wire section above the feed point", "m", 1.0, 30.0, 0.5, 8.0, 1),
        _parameter("feed_height", "Feed Height", "Height of the feed point above ground", "m", 0.5, 10.0, 0.5, 1.5, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_efhw_inverted_l_geometry,
    generate_excitation=_efhw_inverted_l_excitation,
    default_frequency_range=_efhw_inverted_l_frequency_range,
    tips=(
        "A 49:1 transformer at the feed point is essential — the end-fed impedance is several thousand ohms.",
        "The vertical section adds a useful vertical radiation component, helpful for medium-distance contacts.",
        "If the mast is taller than λ/2, the wire is entirely vertical and there is no horizontal section.",
        "Works on even harmonics: a 40m EFHW-L also covers 20m and 10m.",
        "Keep the counterpoise wire away from the vertical section to avoid coupling.",
        "This configuration needs only one support point (the mast top) plus a low anchor for the far end of the horizontal wire.",
    ),
    related_templates=("efhw", "efhw-inverted-v", "inverted-l"),
)


# ---------------------------------------------------------------------------
# EFHW Inverted-V
# ---------------------------------------------------------------------------

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
    wires.append(
        WireGeometry(3, counterpoise_segs, -feed_dx, 0.0, feed_z, -feed_dx - counterpoise_length, 0.0, feed_z, radius),
    )

    return wires


def _efhw_inverted_v_excitation(_params: Mapping[str, float], _wires: list[WireGeometry]) -> Excitation:
    return Excitation(wire_tag=1, segment=1, voltage_real=1.0, voltage_imag=0.0)


def _efhw_inverted_v_frequency_range(params: Mapping[str, float]) -> FrequencyRange:
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.1, 31)


efhw_inverted_v_template = AntennaTemplate(
    id="efhw-inverted-v",
    name="EFHW Inverted-V",
    short_name="EFHW-V",
    description="End-fed half-wave draped over an apex — both ends slope down from a single high point.",
    long_description=(
        "An EFHW Inverted-V is an End-Fed Half-Wave antenna where the wire is draped over "
        "a single high support (mast, tree branch) with both ends sloping downward. The total "
        "wire length is approximately λ/2 and the feed point with 49:1 transformer is at one "
        "of the low ends. This is one of the simplest antennas to deploy in the field: throw a "
        "line over a branch, hoist the wire up, stake both ends, and connect the transformer. "
        "The inverted-V shape gives a slightly broader azimuthal pattern than a flat wire and "
        "the sloping ends lower the overall height requirement. Like the standard EFHW, multiband "
        "operation on even harmonics is possible."
    ),
    icon="/\\~",
    category="wire",
    difficulty="beginner",
    bands=("80m", "40m", "20m", "15m", "10m"),
    parameters=(
        _parameter("frequency", "Design Frequency", "Fundamental frequency for half-wave resonance", "MHz", 0.5, 2000.0, 0.1, 7.1, 3),
        _parameter("apex_height", "Apex Height", "Height of the apex (support point) above ground", "m", 3.0, 50.0, 0.5, 12.0, 1),
        _parameter("feed_height", "Feed End Height", "Height of the fed end above ground", "m", 0.5, 30.0, 0.5, 2.0, 1),
        _parameter("far_end_height", "Far End Height", "Height of the non-fed end above ground", "m", 0.5, 30.0, 0.5, 2.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_efhw_inverted_v_geometry,
    generate_excitation=_efhw_inverted_v_excitation,
    default_frequency_range=_efhw_inverted_v_frequency_range,
    tips=(
        "The 49:1 transformer is at the low (fed) end — keep the coax run along the ground, away from the wire.",
        "Needs only one high support point (tree branch, mast, rope over a limb).",
        "A slightly broader horizontal pattern than a flat EFHW due to the sloping geometry.",
        "Works on even harmonics: a 40m EFHW-V also covers 20m and 10m.",
        "Lower both ends symmetrically for a balanced pattern, or lower one end more for directional preference.",
        "A short counterpoise wire (0.05λ) at the feed end stabilizes the impedance.",
    ),
    related_templates=("efhw", "efhw-inverted-l", "inverted-v"),
)


# ---------------------------------------------------------------------------
# Random Wire
# ---------------------------------------------------------------------------

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
    freq = _param(params, "frequency", 7.1)
    return _centered_frequency_range(freq, 0.2, 31)


random_wire_template = AntennaTemplate(
    id="random-wire",
    name="Random Wire",
    short_name="Rnd Wire",
    description="End-fed non-resonant long wire with a short counterpoise.",
    long_description=(
        "A random wire antenna is a non-resonant end-fed wire that is intentionally not cut to a "
        "specific half-wave multiple. It is commonly used with an antenna tuner and a matching "
        "transformer or unun. Because feedpoint impedance can vary widely with frequency, a "
        "counterpoise or other RF return path at the feed point is important for predictable "
        "operation. Random wires are popular for portable HF use because they are easy to deploy: "
        "raise one end, slope the far end down, add a tuner and counterpoise, and operate across "
        "multiple bands."
    ),
    icon="↗",
    category="wire",
    difficulty="beginner",
    bands=("160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"),
    parameters=(
        _parameter("frequency", "Center of Interest", "Frequency of interest for segmentation and default sweep", "MHz", 0.5, 30.0, 0.1, 7.1, 3),
        _parameter("wire_length", "Wire Length", "Total length of the radiating wire", "m", 5.0, 100.0, 0.5, 25.0, 1),
        _parameter("feed_height", "Feed Height", "Height of the feed end above ground", "m", 1.0, 30.0, 0.5, 8.0, 1),
        _parameter("far_end_height", "Far End Height", "Height of the far end above ground", "m", 0.5, 30.0, 0.5, 3.0, 1),
        _parameter("counterpoise_length", "Counterpoise Length", "Length of the short feedpoint counterpoise", "m", 1.0, 20.0, 0.5, 5.0, 1),
        _parameter("wire_diameter", "Wire Diameter", "Conductor diameter", "mm", 0.5, 10.0, 0.1, 2.0, 1),
    ),
    default_ground=AVERAGE_GROUND,
    generate_geometry=_random_wire_geometry,
    generate_excitation=_random_wire_excitation,
    default_frequency_range=_random_wire_frequency_range,
    tips=(
        "Random wires usually need an external tuner and often benefit from a 9:1 or similar matching transformer.",
        "A short counterpoise at the feed helps provide a more stable RF return path.",
        "Keep the feedline away from the radiating wire to reduce common-mode current on the outside of the coax.",
        "Avoid wire lengths that create extreme feedpoint impedances on the bands you use most.",
        "The model preserves the requested total wire length, so impossible height differences are rejected.",
    ),
    related_templates=("efhw", "inverted-l", "g5rv"),
)


# ---------------------------------------------------------------------------
# Template registry
# ---------------------------------------------------------------------------

TEMPLATES: list[AntennaTemplate] = [
    dipole_template,
    inverted_v_template,
    off_center_fed_template,
    vertical_template,
    inverted_l_template,
    j_pole_template,
    slim_jim_template,
    efhw_template,
    efhw_inverted_l_template,
    efhw_inverted_v_template,
    random_wire_template,
    g5rv_template,
    fan_dipole_template,
    delta_loop_template,
    horizontal_delta_loop_template,
    quad_template,
    magnetic_loop_template,
    yagi_template,
    moxon_template,
    hex_beam_template,
    log_periodic_template,
]

TEMPLATE_MAP: dict[str, AntennaTemplate] = {template.id: template for template in TEMPLATES}


def list_templates() -> list[AntennaTemplate]:
    """Return all templates in display order."""
    return list(TEMPLATES)


def get_template(template_id: str) -> AntennaTemplate:
    """Get a template by ID."""
    try:
        return TEMPLATE_MAP[template_id]
    except KeyError as exc:
        valid = ", ".join(template.id for template in TEMPLATES)
        raise TemplateNotFoundError(
            f"Unknown template: {template_id!r}. Valid template IDs: {valid}"
        ) from exc


def get_default_template() -> AntennaTemplate:
    """Return the default template."""
    return dipole_template


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
        valid = ", ".join(parameter.key for parameter in template.parameters)
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
            raise TemplateParameterError(
                f"Parameter {parameter.key!r} must be numeric, not boolean."
            )

        try:
            numeric_value = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise TemplateParameterError(
                f"Parameter {parameter.key!r} must be numeric; got {raw_value!r}."
            ) from exc

        if not math.isfinite(numeric_value):
            raise TemplateParameterError(
                f"Parameter {parameter.key!r} must be finite; got {numeric_value!r}."
            )

        if numeric_value < parameter.min or numeric_value > parameter.max:
            raise TemplateParameterError(
                f"Parameter {parameter.key!r} out of range for template {template.id!r}: "
                f"{numeric_value} not in [{parameter.min}, {parameter.max}]."
            )

        resolved[parameter.key] = numeric_value

    return resolved


__all__ = [
    "AntennaTemplate",
    "ArcGeometry",
    "Excitation",
    "FrequencyRange",
    "GroundPreset",
    "GroundTypeName",
    "ParameterDef",
    "TEMPLATES",
    "TEMPLATE_MAP",
    "TemplateCategory",
    "TemplateDifficulty",
    "TemplateNotFoundError",
    "TemplateParameterError",
    "WireGeometry",
    "arc_to_wire_segments",
    "auto_segment",
    "center_segment",
    "get_default_params",
    "get_default_template",
    "get_template",
    "list_templates",
    "resolve_params",
]