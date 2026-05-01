"""FastMCP server exposing AntennaSim antenna simulation tools."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp import FastMCP

if __package__:
    from .constants import (
        BIDIR_ANGLE_TOL_DEG, BIDIR_GAIN_DIFF_DB,
        FREQ_MAX_MHZ, FREQ_MIN_MHZ, FREQ_STEPS_MAX, FREQ_STEPS_MIN,
        LOBE_HALF_POWER_DB, LOBE_MIN_SEPARATION_DEG,
        PATTERN_HIGHLY_DIR_DB, PATTERN_NEAR_OMNI_DB, PATTERN_OMNI_DB,
        SWR_USABLE_THRESHOLD, VSWR_UNDEFINED,
    )
    from .ham_bands import (
        analyze_band_performance,
        band_to_frequency_range,
        get_band_by_label,
        get_bands_for_region,
    )
    from .simulator import (
        BackendImportError,
        GROUND_TYPE_VALUES,
        NecNotFoundError,
        SimulationArtifacts,
        SimulationError,
        parse_ground_spec,
        simulate,
    )
    from .templates import (
        AntennaTemplate,
        Excitation,
        FrequencyRange,
        TEMPLATES,
        TemplateNotFoundError,
        TemplateParameterError,
        WireGeometry,
        get_template,
        resolve_params,
    )
    from .utils import get_field, is_non_string_sequence
else:
    from constants import (  # type: ignore[no-redef]
        BIDIR_ANGLE_TOL_DEG, BIDIR_GAIN_DIFF_DB,
        FREQ_MAX_MHZ, FREQ_MIN_MHZ, FREQ_STEPS_MAX, FREQ_STEPS_MIN,
        LOBE_HALF_POWER_DB, LOBE_MIN_SEPARATION_DEG,
        PATTERN_HIGHLY_DIR_DB, PATTERN_NEAR_OMNI_DB, PATTERN_OMNI_DB,
        SWR_USABLE_THRESHOLD, VSWR_UNDEFINED,
    )
    from ham_bands import (  # type: ignore[no-redef]
        analyze_band_performance,
        band_to_frequency_range,
        get_band_by_label,
        get_bands_for_region,
    )
    from simulator import (  # type: ignore[no-redef]
        BackendImportError,
        GROUND_TYPE_VALUES,
        NecNotFoundError,
        SimulationArtifacts,
        SimulationError,
        parse_ground_spec,
        simulate,
    )
    from templates import (  # type: ignore[no-redef]
        AntennaTemplate,
        Excitation,
        FrequencyRange,
        TEMPLATES,
        TemplateNotFoundError,
        TemplateParameterError,
        WireGeometry,
        get_template,
        resolve_params,
    )
    from utils import get_field, is_non_string_sequence  # type: ignore[no-redef]


mcp = FastMCP("AntennaSim MCP")

# Ground parameters for the NEC2 card-deck export tool (_build_nec2_card_deck).
# These mirror the backend's GROUND_PARAMS dict.  The backend's build_card_deck()
# is the authoritative card builder for actual simulation runs; this local table
# exists only so get_nec2_card_deck can produce a correct GN card without
# loading the full backend.
_GROUND_PARAMS_FOR_EXPORT: dict[str, tuple[float, float]] = {
    "salt_water":  (80.0, 5.0),
    "fresh_water": (80.0, 0.001),
    "pastoral":    (14.0, 0.01),
    "average":     (13.0, 0.005),
    "rocky":       (12.0, 0.002),
    "city":        (5.0,  0.001),
    "dry_sandy":   (3.0,  0.0001),
}


@dataclass(slots=True)
class TemplateRun:
    """Resolved template run information."""

    template: AntennaTemplate
    params: dict[str, float]
    wires: list[WireGeometry]
    excitation: Excitation
    frequency_range: FrequencyRange
    ground_spec: str
    artifacts: SimulationArtifacts


def _format_exception(exc: Exception) -> str:
    if isinstance(exc, TemplateNotFoundError):
        return f"Error: unknown template.\n{exc}"
    if isinstance(exc, TemplateParameterError):
        return f"Error: invalid template parameters.\n{exc}"
    if isinstance(exc, NecNotFoundError):
        return (
            "Error: nec2c is not installed or is not on PATH.\n"
            "Install nec2c first, then restart the MCP client.\n"
            f"Details: {exc}"
        )
    if isinstance(exc, BackendImportError):
        return (
            "Error: could not locate or import the AntennaSim backend.\n"
            "Ensure this MCP server sits beside AntennaSim/backend, or set "
            "ANTENNASIM_BACKEND_DIR to the backend directory.\n"
            f"Details: {exc}"
        )
    if isinstance(exc, SimulationError):
        return f"Error: NEC2 simulation failed.\n{exc}"
    return f"Error: {type(exc).__name__}: {exc}"


def _is_non_string_sequence(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(
        value, (str, bytes, bytearray, Mapping)
    )


def _value(item: Any, key: str) -> Any:
    if isinstance(item, Mapping):
        return item[key]
    return getattr(item, key)


def _parse_json_object(text: str, label: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        return {}
    data = json.loads(stripped)
    if not isinstance(data, dict):
        raise ValueError(f"{label} must be a JSON object.")
    return data


def _parse_wires_json(text: str) -> list[dict[str, Any]]:
    stripped = text.strip()
    if not stripped:
        raise ValueError("wires_json must be a JSON array of wire objects.")
    data = json.loads(stripped)
    if isinstance(data, dict) and "wires" in data:
        data = data["wires"]
    if not isinstance(data, list):
        raise ValueError(
            "wires_json must be a JSON array, or an object containing a 'wires' array."
        )
    return [dict(item) if isinstance(item, Mapping) else item for item in data]


def _parse_excitations_json(text: str) -> dict[str, Any] | list[dict[str, Any]]:
    stripped = text.strip()
    if not stripped:
        raise ValueError("excitation_json must be a JSON object or JSON array.")
    data = json.loads(stripped)
    if isinstance(data, dict):
        if "excitations" in data:
            nested = data["excitations"]
            if not isinstance(nested, list):
                raise ValueError("'excitations' must be a JSON array.")
            return [
                dict(item) if isinstance(item, Mapping) else item for item in nested
            ]
        if "excitation" in data:
            nested = data["excitation"]
            if isinstance(nested, list):
                return [
                    dict(item) if isinstance(item, Mapping) else item for item in nested
                ]
            if isinstance(nested, Mapping):
                return dict(nested)
            raise ValueError("'excitation' must be a JSON object or array.")
        return dict(data)
    if isinstance(data, list):
        return [dict(item) if isinstance(item, Mapping) else item for item in data]
    raise ValueError("excitation_json must be a JSON object or JSON array.")


def _format_number(value: float, decimals: int | None = None) -> str:
    if decimals is not None:
        return f"{value:.{decimals}f}"
    if math.isclose(value, round(value), abs_tol=1e-9):
        return str(int(round(value)))
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _format_impedance(result: Any) -> str:
    real = float(result.impedance.real)
    imag = float(result.impedance.imag)
    sign = "+" if imag >= 0 else "-"
    return f"{real:.2f} {sign} j{abs(imag):.2f} Ω"


def _format_frequency_range(frequency_range: FrequencyRange) -> str:
    return (
        f"{frequency_range.start_mhz:.3f} to {frequency_range.stop_mhz:.3f} MHz "
        f"({frequency_range.steps} points)"
    )


def _format_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(str(cell)))

    def render(row: Sequence[str]) -> str:
        return " | ".join(
            str(cell).ljust(widths[index]) for index, cell in enumerate(row)
        )

    separator = "-+-".join("-" * width for width in widths)
    lines = [render(headers), separator]
    lines.extend(render(row) for row in rows)
    return "\n".join(lines)


def _truncate_rows(
    rows: list[list[str]], max_rows: int
) -> tuple[list[list[str]], bool]:
    if len(rows) <= max_rows:
        return rows, False
    head_count = max_rows // 2
    tail_count = max_rows - head_count - 1
    ellipsis_row = ["..."] * len(rows[0])
    return rows[:head_count] + [ellipsis_row] + rows[-tail_count:], True


def _resolve_ground_spec(ground_type: str, default_ground_type: str) -> str:
    normalized = (ground_type or "").strip()
    if not normalized or normalized.lower() == "default":
        return default_ground_type
    return normalized


def _format_ground_display(
    ground_spec: str, default_ground_type: str = "average"
) -> str:
    ground_name, epsilon_r, conductivity = parse_ground_spec(
        ground_spec, default_ground_type
    )
    if ground_name == "custom" and epsilon_r is not None and conductivity is not None:
        return f"custom (εr={epsilon_r:g}, σ={conductivity:g} S/m)"
    if ground_name == "custom":
        return "custom (backend defaults εr=13, σ=0.005 S/m)"
    return ground_name


def _parse_wire_design_string(text: str) -> list[WireGeometry]:
    stripped = text.strip()
    if not stripped:
        raise ValueError(
            "wires must be a semicolon-separated list of wire definitions in the form "
            "'tag,segments,x1,y1,z1,x2,y2,z2,radius'."
        )

    entries = [
        entry.strip()
        for entry in stripped.replace("\n", ";").split(";")
        if entry.strip()
    ]
    if not entries:
        raise ValueError("No wire definitions were provided.")

    wires: list[WireGeometry] = []
    for index, entry in enumerate(entries, start=1):
        parts = [part.strip() for part in entry.split(",")]
        if len(parts) != 9:
            raise ValueError(
                f"Wire {index} must have 9 comma-separated fields "
                f"(tag,segments,x1,y1,z1,x2,y2,z2,radius); got {len(parts)} in {entry!r}."
            )

        try:
            tag_value = float(parts[0])
            segments_value = float(parts[1])
            x1, y1, z1, x2, y2, z2, radius = (float(part) for part in parts[2:])
        except ValueError as exc:
            raise ValueError(
                f"Wire {index} contains non-numeric values: {entry!r}."
            ) from exc

        if not tag_value.is_integer() or tag_value <= 0:
            raise ValueError(
                f"Wire {index} tag must be a positive integer; got {parts[0]!r}."
            )
        if not segments_value.is_integer() or segments_value <= 0:
            raise ValueError(
                f"Wire {index} segments must be a positive integer; got {parts[1]!r}."
            )
        if int(segments_value) > 200:
            raise ValueError(
                f"Wire {index} segments must be between 1 and 200; got {int(segments_value)}."
            )
        if radius <= 0.0:
            raise ValueError(f"Wire {index} radius must be greater than zero.")

        numeric_values = (x1, y1, z1, x2, y2, z2, radius)
        if not all(math.isfinite(value) for value in numeric_values):
            raise ValueError(f"Wire {index} contains non-finite values.")

        wires.append(
            WireGeometry(
                tag=int(tag_value),
                segments=int(segments_value),
                x1=x1,
                y1=y1,
                z1=z1,
                x2=x2,
                y2=y2,
                z2=z2,
                radius=radius,
            )
        )

    return wires


def _resolve_explicit_frequency_range(
    freq_start_mhz: float,
    freq_stop_mhz: float,
    freq_steps: int,
) -> FrequencyRange:
    frequency_range = FrequencyRange(
        start_mhz=float(freq_start_mhz),
        stop_mhz=float(freq_stop_mhz),
        steps=int(freq_steps),
    )

    if frequency_range.start_mhz < 0.1 or frequency_range.stop_mhz > 2000.0:
        raise ValueError("Frequency limits must be between 0.1 and 2000 MHz.")
    if frequency_range.stop_mhz < frequency_range.start_mhz:
        raise ValueError(
            "freq_stop_mhz must be greater than or equal to freq_start_mhz."
        )
    if frequency_range.steps < 1 or frequency_range.steps > 201:
        raise ValueError("freq_steps must be between 1 and 201.")

    return frequency_range


def _format_nec_value(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError(f"NEC card values must be finite; got {value!r}.")
    if math.isclose(value, 0.0, abs_tol=1e-12):
        return "0"
    text = f"{value:.9f}".rstrip("0").rstrip(".")
    return "0" if text in {"-0", "+0"} else text


def _extract_ground_constants(raw_value: Any) -> tuple[float | None, float | None]:
    epsilon_r: Any = None
    conductivity: Any = None

    if isinstance(raw_value, Mapping):
        for key in (
            "epsilon_r",
            "relative_permittivity",
            "permittivity",
            "dielectric_constant",
            "dielectricConstant",
            "epsr",
            "er",
        ):
            if key in raw_value:
                epsilon_r = raw_value[key]
                break
        for key in ("conductivity", "sigma", "conductivity_s_per_m", "cond"):
            if key in raw_value:
                conductivity = raw_value[key]
                break
    elif _is_non_string_sequence(raw_value):
        items = list(raw_value)
        if len(items) >= 2:
            epsilon_r, conductivity = items[0], items[1]
    else:
        for attr in (
            "epsilon_r",
            "relative_permittivity",
            "permittivity",
            "dielectric_constant",
            "dielectricConstant",
            "epsr",
            "er",
        ):
            if hasattr(raw_value, attr):
                epsilon_r = getattr(raw_value, attr)
                break
        for attr in ("conductivity", "sigma", "conductivity_s_per_m", "cond"):
            if hasattr(raw_value, attr):
                conductivity = getattr(raw_value, attr)
                break

    if epsilon_r is None or conductivity is None:
        return None, None

    try:
        epsilon_value = float(epsilon_r)
        conductivity_value = float(conductivity)
    except (TypeError, ValueError):
        return None, None

    if not math.isfinite(epsilon_value) or not math.isfinite(conductivity_value):
        return None, None

    return epsilon_value, conductivity_value


def _ground_card(ground_spec: str, default_ground_type: str = "average") -> str:
    ground_name, epsilon_r, conductivity = parse_ground_spec(
        ground_spec, default_ground_type
    )

    if ground_name == "free_space":
        return "GN -1"
    if ground_name == "perfect":
        return "GN 1"

    if epsilon_r is None or conductivity is None:
        preset = _GROUND_PARAMS_FOR_EXPORT.get(ground_name, (13.0, 0.005))
        epsilon_r, conductivity = preset[0], preset[1]

    return (
        "GN 2 0 0 0 "
        f"{_format_nec_value(float(epsilon_r))} {_format_nec_value(float(conductivity))}"
    )


def _build_nec2_card_deck(
    wires: Sequence[Any],
    excitation: Any | Sequence[Any],
    frequency_range: FrequencyRange,
    ground_spec: str,
    comment_lines: Sequence[str] = (),
    default_ground_type: str = "average",
) -> str:
    frequency_step = 0.0
    if frequency_range.steps > 1:
        frequency_step = (frequency_range.stop_mhz - frequency_range.start_mhz) / (
            frequency_range.steps - 1
        )

    lines: list[str] = []
    for comment in comment_lines:
        text = str(comment).strip()
        if text:
            lines.append(f"CM {text}")

    lines.append("CE")

    for wire in wires:
        lines.append(
            "GW "
            f"{int(_value(wire, 'tag'))} {int(_value(wire, 'segments'))} "
            f"{_format_nec_value(float(_value(wire, 'x1')))} "
            f"{_format_nec_value(float(_value(wire, 'y1')))} "
            f"{_format_nec_value(float(_value(wire, 'z1')))} "
            f"{_format_nec_value(float(_value(wire, 'x2')))} "
            f"{_format_nec_value(float(_value(wire, 'y2')))} "
            f"{_format_nec_value(float(_value(wire, 'z2')))} "
            f"{_format_nec_value(float(_value(wire, 'radius')))}"
        )

    lines.append("GE 0")
    lines.append(_ground_card(ground_spec, default_ground_type))

    for item in _normalize_excitations(excitation):
        lines.append(
            "EX 0 "
            f"{int(_value(item, 'wire_tag'))} {int(_value(item, 'segment'))} 0 "
            f"{_format_nec_value(float(_value(item, 'voltage_real')))} "
            f"{_format_nec_value(float(_value(item, 'voltage_imag')))}"
        )

    lines.append(
        "FR 0 "
        f"{int(frequency_range.steps)} 0 0 "
        f"{_format_nec_value(float(frequency_range.start_mhz))} "
        f"{_format_nec_value(float(frequency_step))}"
    )
    lines.append("RP 0 91 361 1000 0 0 1 1")
    lines.append("EN")

    return "\n".join(lines)


def _resolve_frequency_range(
    template: AntennaTemplate,
    params: Mapping[str, float],
    freq_start_mhz: float | None,
    freq_stop_mhz: float | None,
    freq_steps: int | None,
) -> FrequencyRange:
    default_range = template.default_frequency_range(params)
    start = default_range.start_mhz if freq_start_mhz is None else float(freq_start_mhz)
    stop = default_range.stop_mhz if freq_stop_mhz is None else float(freq_stop_mhz)
    steps = (
        default_range.steps
        if freq_steps is None or freq_steps <= 0
        else int(freq_steps)
    )

    if start < 0.1 or stop < 0.1 or start > 2000.0 or stop > 2000.0:
        raise ValueError("Frequency limits must be between 0.1 and 2000 MHz.")
    if stop < start:
        raise ValueError(
            "freq_stop_mhz must be greater than or equal to freq_start_mhz."
        )
    if steps < 1 or steps > 201:
        raise ValueError("freq_steps must be between 1 and 201.")

    return FrequencyRange(start_mhz=start, stop_mhz=stop, steps=steps)


def _resolve_comparison_frequency_range(
    template1: AntennaTemplate,
    params1: Mapping[str, float],
    template2: AntennaTemplate,
    params2: Mapping[str, float],
    freq_start_mhz: float | None,
    freq_stop_mhz: float | None,
    freq_steps: int | None,
) -> FrequencyRange:
    default1 = template1.default_frequency_range(params1)
    default2 = template2.default_frequency_range(params2)

    start = (
        min(default1.start_mhz, default2.start_mhz)
        if freq_start_mhz is None
        else float(freq_start_mhz)
    )
    stop = (
        max(default1.stop_mhz, default2.stop_mhz)
        if freq_stop_mhz is None
        else float(freq_stop_mhz)
    )
    steps = (
        max(default1.steps, default2.steps)
        if freq_steps is None or freq_steps <= 0
        else int(freq_steps)
    )

    if start < 0.1 or stop < 0.1 or start > 2000.0 or stop > 2000.0:
        raise ValueError("Frequency limits must be between 0.1 and 2000 MHz.")
    if stop < start:
        raise ValueError(
            "freq_stop_mhz must be greater than or equal to freq_start_mhz."
        )
    if steps < 1 or steps > 201:
        raise ValueError("freq_steps must be between 1 and 201.")

    return FrequencyRange(start_mhz=start, stop_mhz=stop, steps=steps)


def _geometry_summary(wires: Sequence[Any]) -> str:
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    total_segments = 0

    for wire in wires:
        total_segments += int(_value(wire, "segments"))
        xs.extend([float(_value(wire, "x1")), float(_value(wire, "x2"))])
        ys.extend([float(_value(wire, "y1")), float(_value(wire, "y2"))])
        zs.extend([float(_value(wire, "z1")), float(_value(wire, "z2"))])

    span_x = max(xs) - min(xs) if xs else 0.0
    span_y = max(ys) - min(ys) if ys else 0.0
    span_z = max(zs) - min(zs) if zs else 0.0

    return (
        f"{len(wires)} wires, {total_segments} total segments, "
        f"span X={span_x:.3f} m, Y={span_y:.3f} m, Z={span_z:.3f} m"
    )


def _normalize_excitations(excitation: Any | Sequence[Any]) -> list[Any]:
    if _is_non_string_sequence(excitation):
        return list(excitation)
    return [excitation]


def _format_excitation_summary(excitation: Any | Sequence[Any]) -> str:
    excitations = _normalize_excitations(excitation)
    if len(excitations) == 1:
        item = excitations[0]
        return (
            f"wire {_value(item, 'wire_tag')} segment {_value(item, 'segment')}, "
            f"{float(_value(item, 'voltage_real')):.4f} + j{float(_value(item, 'voltage_imag')):.4f} V"
        )

    lines = []
    for item in excitations:
        lines.append(
            f"- wire {_value(item, 'wire_tag')} segment {_value(item, 'segment')}, "
            f"{float(_value(item, 'voltage_real')):.4f} + j{float(_value(item, 'voltage_imag')):.4f} V"
        )
    return "\n".join(lines)


def _best_swr_result(frequency_data: Sequence[Any]) -> Any:
    return min(frequency_data, key=lambda item: float(item.swr_50))


def _peak_gain_result(frequency_data: Sequence[Any]) -> Any:
    return max(frequency_data, key=lambda item: float(item.gain_max_dbi))


def _best_front_to_back_result(frequency_data: Sequence[Any]) -> Any | None:
    candidates = [item for item in frequency_data if item.front_to_back_db is not None]
    if not candidates:
        return None
    return max(candidates, key=lambda item: float(item.front_to_back_db))


def _average_efficiency(frequency_data: Sequence[Any]) -> float | None:
    values = [
        float(item.efficiency_percent)
        for item in frequency_data
        if item.efficiency_percent is not None
    ]
    if not values:
        return None
    return sum(values) / len(values)


def _nearest_frequency_result(frequency_data: Sequence[Any], target_mhz: float) -> Any:
    return min(
        frequency_data, key=lambda item: abs(float(item.frequency_mhz) - target_mhz)
    )


def _beamwidth_summary(result: Any) -> str:
    parts: list[str] = []
    if result.beamwidth_e_deg is not None:
        parts.append(f"E-plane {float(result.beamwidth_e_deg):.1f}°")
    if result.beamwidth_h_deg is not None:
        parts.append(f"H-plane {float(result.beamwidth_h_deg):.1f}°")
    return ", ".join(parts) if parts else "—"


def _count_usable_points(
    frequency_data: Sequence[Any], swr_threshold: float = 2.0
) -> int:
    return sum(1 for item in frequency_data if float(item.swr_50) <= swr_threshold)


# ---------------------------------------------------------------------------
# Radiation pattern helpers
# ---------------------------------------------------------------------------

def _compute_reflection_coefficient(r: float, x: float, z0: float = 50.0) -> tuple[float, float]:
    """Compute reflection coefficient magnitude and phase for R + jX relative to Z0."""
    z = complex(float(r), float(x))
    denom = z + complex(float(z0), 0.0)
    if abs(denom) < 1e-30:
        return 1.0, 180.0
    gamma = (z - complex(float(z0), 0.0)) / denom
    return round(min(abs(gamma), 1.0), 6), round(math.degrees(math.atan2(gamma.imag, gamma.real)), 2)


def _nearest_pattern_index(start: float, step: float, count: int, target: float) -> int:
    if count <= 1 or abs(step) < 1e-12:
        return 0
    return max(0, min(count - 1, int(round((target - start) / step))))


def _extract_azimuth_cut(pattern: Any, theta_index: int) -> list[tuple[float, float]]:
    """Extract gain vs phi at a fixed theta index."""
    theta_index = max(0, min(int(pattern.theta_count) - 1, theta_index))
    cut: list[tuple[float, float]] = []
    for pi in range(int(pattern.phi_count)):
        g = float(pattern.gain_dbi[theta_index][pi])
        if g <= -900.0:
            continue
        phi = float(pattern.phi_start) + pi * float(pattern.phi_step)
        cut.append((phi % 360.0, g))
    cut.sort(key=lambda p: p[0])
    return cut


def _extract_elevation_cut(pattern: Any, phi_index: int) -> list[tuple[float, float]]:
    """Extract gain vs theta at a fixed phi index."""
    phi_index = max(0, min(int(pattern.phi_count) - 1, phi_index))
    cut: list[tuple[float, float]] = []
    for ti in range(int(pattern.theta_count)):
        g = float(pattern.gain_dbi[ti][phi_index])
        if g <= -900.0:
            continue
        theta = float(pattern.theta_start) + ti * float(pattern.theta_step)
        cut.append((theta, g))
    cut.sort(key=lambda p: p[0])
    return cut


def _circular_diff(a: float, b: float) -> float:
    d = abs((a - b) % 360.0)
    return min(d, 360.0 - d)


def _nearest_cut_gain(cut: Sequence[tuple[float, float]], target: float, *, circular: bool) -> float | None:
    if not cut:
        return None
    if circular:
        return float(min(cut, key=lambda p: _circular_diff(p[0], target % 360.0))[1])
    return float(min(cut, key=lambda p: abs(p[0] - target))[1])


def _compute_cut_beamwidth(
    cut: Sequence[tuple[float, float]], peak_angle: float, peak_gain: float, *, circular: bool
) -> float | None:
    """Compute -3 dB half-power beamwidth from a sorted 1-D gain cut.

    Uses the standard half-power (-3 dB) criterion as defined in
    IEEE Std 149-1979 and IEC 60050-712.  The function searches left and
    right of peak_angle for the first crossing of the peak_gain - 3 dB
    threshold, then returns their angular separation.

    Returns None if fewer than 3 points are available or if the threshold
    is not crossed on both sides of the peak.
    """
    if len(cut) < 3:
        return None
    threshold = peak_gain - 3.0
    ordered = sorted(cut, key=lambda p: p[0])
    if circular:
        extended = [(a - 360.0, g) for a, g in ordered] + list(ordered) + [(a + 360.0, g) for a, g in ordered]
        n = len(ordered)
        peak_idx = min(range(n, 2 * n), key=lambda i: _circular_diff(extended[i][0], peak_angle))
    else:
        extended = list(ordered)
        peak_idx = min(range(len(extended)), key=lambda i: abs(extended[i][0] - peak_angle))

    left = None
    for i in range(peak_idx, 0, -1):
        a0, g0 = extended[i - 1]
        a1, g1 = extended[i]
        if (g0 - threshold) * (g1 - threshold) < 0.0:
            frac = (threshold - g0) / (g1 - g0) if abs(g1 - g0) > 1e-9 else 0.5
            left = a0 + frac * (a1 - a0)
            break

    right = None
    for i in range(peak_idx, len(extended) - 1):
        a0, g0 = extended[i]
        a1, g1 = extended[i + 1]
        if (g0 - threshold) * (g1 - threshold) < 0.0:
            frac = (threshold - g0) / (g1 - g0) if abs(g1 - g0) > 1e-9 else 0.5
            right = a0 + frac * (a1 - a0)
            break

    if left is None or right is None:
        return None
    bw = abs(right - left)
    return round(min(bw, 360.0) if circular else bw, 1)


def _classify_pattern_shape(azimuth_gains: Sequence[tuple[float, float]]) -> dict[str, Any]:
    """Classify azimuth pattern shape using azimuth variation criteria.

    Classification thresholds follow the ARRL Antenna Book (24th ed., Chapter 2)
    and IEC 60050-712 antenna pattern terminology:
    - azimuth variation < PATTERN_OMNI_DB (3 dB) → omnidirectional
    - azimuth variation < PATTERN_NEAR_OMNI_DB (6 dB) → nearly omnidirectional
    - two lobes ≈180° apart with gain diff < BIDIR_GAIN_DIFF_DB (3 dB) → bidirectional
    - azimuth variation > PATTERN_HIGHLY_DIR_DB (15 dB) → highly directional
    - otherwise → directional

    Lobe detection: a point is a lobe peak when its gain is within LOBE_HALF_POWER_DB
    (3 dB) of the maximum and lobes closer than LOBE_MIN_SEPARATION_DEG (20°) are merged.

    Bidirectional test: the two highest lobes are checked for ≈180° separation
    (tolerance BIDIR_ANGLE_TOL_DEG = 40°) and similar gain (≤ BIDIR_GAIN_DIFF_DB = 3 dB).
    """
    if not azimuth_gains:
        return {"shape": "unknown", "azimuth_variation_db": 0.0, "azimuth_stddev_db": 0.0,
                "max_gain": None, "min_gain": None, "num_lobes": 0}
    gains = [g for _, g in azimuth_gains]
    mx, mn = max(gains), min(gains)
    variation = mx - mn
    mean = sum(gains) / len(gains)
    stddev = math.sqrt(sum((g - mean) ** 2 for g in gains) / len(gains))

    thresh = mx - LOBE_HALF_POWER_DB
    n = len(azimuth_gains)
    lobes: list[tuple[float, float]] = []
    for i in range(n):
        _, gp = azimuth_gains[(i - 1) % n]
        a, g = azimuth_gains[i]
        _, gn = azimuth_gains[(i + 1) % n]
        if g >= thresh and g + 1e-9 >= gp and g + 1e-9 >= gn:
            if not lobes or _circular_diff(a, lobes[-1][0]) > LOBE_MIN_SEPARATION_DEG:
                lobes.append((a, g))
    num_lobes = max(1, len(lobes))

    bidirectional = False
    if len(lobes) >= 2:
        s = sorted(lobes, key=lambda p: p[1], reverse=True)[:2]
        if (
            abs(_circular_diff(s[0][0], s[1][0]) - 180.0) <= BIDIR_ANGLE_TOL_DEG
            and abs(s[0][1] - s[1][1]) <= BIDIR_GAIN_DIFF_DB
        ):
            bidirectional = True

    if variation < PATTERN_OMNI_DB:
        shape = "omnidirectional"
    elif variation < PATTERN_NEAR_OMNI_DB:
        shape = "nearly omnidirectional"
    elif bidirectional:
        shape = "bidirectional"
    elif variation > PATTERN_HIGHLY_DIR_DB:
        shape = "highly directional"
    else:
        shape = "directional"

    return {"shape": shape, "azimuth_variation_db": round(variation, 2),
            "azimuth_stddev_db": round(stddev, 2), "max_gain": round(mx, 2),
            "min_gain": round(mn, 2), "num_lobes": num_lobes}


def _extract_pattern_analysis(freq_result: Any) -> dict[str, Any]:
    """Extract structured pattern metrics and principal-plane cuts."""
    pattern = getattr(freq_result, "pattern", None)
    if pattern is None:
        return {"available": False, "reason": "Pattern data not available for this frequency point."}

    ti = _nearest_pattern_index(float(pattern.theta_start), float(pattern.theta_step),
                                 int(pattern.theta_count), float(freq_result.gain_max_theta))
    pi = _nearest_pattern_index(float(pattern.phi_start), float(pattern.phi_step),
                                 int(pattern.phi_count), float(freq_result.gain_max_phi))
    theta_deg = float(pattern.theta_start) + ti * float(pattern.theta_step)
    phi_deg = (float(pattern.phi_start) + pi * float(pattern.phi_step)) % 360.0

    az_cut = _extract_azimuth_cut(pattern, ti)
    el_cut = _extract_elevation_cut(pattern, pi)
    if not az_cut or not el_cut:
        return {"available": False, "reason": "Pattern grid did not contain usable data."}

    front = float(pattern.gain_dbi[ti][pi])
    if front <= -900.0:
        front = float(freq_result.gain_max_dbi)
    back = _nearest_cut_gain(az_cut, phi_deg + 180.0, circular=True)
    side_p = _nearest_cut_gain(az_cut, phi_deg + 90.0, circular=True)
    side_n = _nearest_cut_gain(az_cut, phi_deg - 90.0, circular=True)
    side = max(v for v in (side_p, side_n) if v is not None) if any(v is not None for v in (side_p, side_n)) else None
    ftb = None if back is None else round(front - back, 2)
    fts = None if side is None else round(front - side, 2)

    bw_h = getattr(freq_result, "beamwidth_h_deg", None)
    if bw_h is None:
        bw_h = _compute_cut_beamwidth(az_cut, phi_deg, front, circular=True)
    else:
        bw_h = float(bw_h)
    bw_e = getattr(freq_result, "beamwidth_e_deg", None)
    if bw_e is None:
        bw_e = _compute_cut_beamwidth(el_cut, theta_deg, front, circular=False)
    else:
        bw_e = float(bw_e)

    classification = _classify_pattern_shape(az_cut)
    directivity_char = classification["shape"]
    if classification["shape"] in {"directional", "highly directional"} and ftb is not None and ftb >= 6.0:
        directivity_char = "unidirectional"

    return {
        "available": True, "theta_deg": round(theta_deg, 2), "phi_deg": round(phi_deg, 2),
        "max_gain_dbi": round(front, 2), "beamwidth_h_deg": bw_h, "beamwidth_e_deg": bw_e,
        "front_to_back_db": ftb, "front_to_side_db": fts,
        "back_gain_dbi": None if back is None else round(back, 2),
        "side_gain_dbi": None if side is None else round(side, 2),
        "classification": classification, "shape": classification["shape"],
        "directivity_character": directivity_char,
        "azimuth_cut": az_cut, "elevation_cut": el_cut,
    }


def _analysis_beamwidth_summary(analysis: dict[str, Any]) -> str:
    """Format beamwidth from analysis dict (uses fallback-computed values)."""
    parts: list[str] = []
    bw_e = analysis.get("beamwidth_e_deg")
    bw_h = analysis.get("beamwidth_h_deg")
    if bw_e is not None:
        parts.append(f"E-plane {float(bw_e):.1f}°")
    if bw_h is not None:
        parts.append(f"H-plane {float(bw_h):.1f}°")
    return ", ".join(parts) if parts else "—"


def _sample_cut(cut: Sequence[tuple[float, float]], step: float | None) -> list[tuple[float, float]]:
    if not cut or step is None or step <= 0 or len(cut) < 2:
        return list(cut)
    src_step = abs(cut[1][0] - cut[0][0])
    if src_step < 1e-9:
        return list(cut)
    stride = max(1, int(round(step / src_step)))
    return list(cut[::stride])


def _format_plane_cut(cut: Sequence[tuple[float, float]], label: str, step: float | None = None) -> str:
    if not cut:
        return "No data."
    sampled = _sample_cut(cut, step)
    peak = max(g for _, g in cut)
    rows = [[f"{a:.1f}", f"{g:.2f}", f"{g - peak:+.2f}"] for a, g in sampled]
    rows, trunc = _truncate_rows(rows, 37)
    t = _format_table([label, "Gain dBi", "Rel dB"], rows)
    return f"{t}\n\nNote: table truncated." if trunc else t


def _format_cut_comparison(
    cut1: Sequence[tuple[float, float]], cut2: Sequence[tuple[float, float]],
    label: str, step: float | None, *, circular: bool,
) -> str:
    if not cut1 or not cut2:
        return "No comparable data."
    sampled = _sample_cut(cut1, step)
    rows: list[list[str]] = []
    for a, g1 in sampled:
        g2 = _nearest_cut_gain(cut2, a, circular=circular)
        if g2 is None:
            continue
        rows.append([f"{a:.1f}", f"{g1:.2f}", f"{g2:.2f}", f"{g1 - g2:+.2f}"])
    if not rows:
        return "No comparable data."
    rows, trunc = _truncate_rows(rows, 37)
    t = _format_table([label, "Gain 1 dBi", "Gain 2 dBi", "Δ1-2 dB"], rows)
    return f"{t}\n\nNote: table truncated." if trunc else t


def _fmt_opt(v: float | None, d: int = 2, s: str = "") -> str:
    return "—" if v is None else f"{float(v):.{d}f}{s}"


def _format_pattern_report(freq_result: Any, template_name: str, params_summary: str) -> str:
    """Format a complete radiation pattern analysis report."""
    analysis = _extract_pattern_analysis(freq_result)
    title = f"Radiation pattern: {template_name}"
    lines = [title, "=" * len(title),
             f"Frequency: {float(freq_result.frequency_mhz):.3f} MHz",
             f"Setup: {params_summary}",
             f"Feed impedance: {_format_impedance(freq_result)}",
             f"SWR(50Ω): {float(freq_result.swr_50):.2f}"]
    if freq_result.efficiency_percent is not None:
        lines.append(f"Efficiency: {float(freq_result.efficiency_percent):.1f}%")

    if not analysis["available"]:
        lines.extend(["", "Pattern data", f"- {analysis['reason']}"])
        return "\n".join(lines).strip()

    cl = analysis["classification"]
    lines.extend([
        "", "Pattern summary",
        f"- Maximum gain: {analysis['max_gain_dbi']:.2f} dBi at theta {analysis['theta_deg']:.1f}°, phi {analysis['phi_deg']:.1f}°",
        f"- Shape classification: {cl['shape']} ({cl['num_lobes']} lobe(s), "
        f"azimuth variation {cl['azimuth_variation_db']:.2f} dB, std dev {cl['azimuth_stddev_db']:.2f} dB)",
        f"- Directivity character: {analysis['directivity_character']}",
        f"- Beamwidth: {_analysis_beamwidth_summary(analysis)}",
        f"- Front-to-back: {_fmt_opt(analysis['front_to_back_db'], 2, ' dB')}",
        f"- Front-to-side: {_fmt_opt(analysis['front_to_side_db'], 2, ' dB')}",
        "",
        f"H-plane cut (phi sweep at theta = {analysis['theta_deg']:.1f}°)",
        _format_plane_cut(analysis["azimuth_cut"], "Phi°", 15.0),
        "",
        f"E-plane cut (theta sweep at phi = {analysis['phi_deg']:.1f}°)",
        _format_plane_cut(analysis["elevation_cut"], "Theta°", 10.0),
    ])
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Smith chart helpers
# ---------------------------------------------------------------------------

def _compute_smith_data(frequency_data: Sequence[Any], z0: float = 50.0) -> dict[str, Any]:
    """Compute normalized impedance, reflection coefficient, and resonance data."""
    points: list[dict[str, Any]] = []
    for item in frequency_data:
        r = float(item.impedance.real)
        x = float(item.impedance.imag)
        gm, gp = _compute_reflection_coefficient(r, x, z0)
        vswr = 999.0 if gm >= 1.0 else (1.0 + gm) / (1.0 - gm)
        region = "resonant" if abs(x) < 1e-6 else ("inductive" if x > 0 else "capacitive")
        points.append({
            "frequency_mhz": float(item.frequency_mhz), "r_ohm": r, "x_ohm": x,
            "z_mag_ohm": math.hypot(r, x), "z_real": r / z0, "z_imag": x / z0,
            "gamma_mag": gm, "gamma_phase_deg": gp, "vswr": vswr, "region": region,
        })
    points.sort(key=lambda p: p["frequency_mhz"])

    resonances: list[dict[str, Any]] = []
    for i in range(1, len(points)):
        px, cx = points[i - 1]["x_ohm"], points[i]["x_ohm"]
        if abs(px) < 1e-6 or abs(cx) < 1e-6 or px * cx >= 0:
            continue
        frac = -px / (cx - px)
        freq = points[i - 1]["frequency_mhz"] + frac * (points[i]["frequency_mhz"] - points[i - 1]["frequency_mhz"])
        r_res = points[i - 1]["r_ohm"] + frac * (points[i]["r_ohm"] - points[i - 1]["r_ohm"])
        gm, gp = _compute_reflection_coefficient(r_res, 0.0, z0)
        resonances.append({"frequency_mhz": freq, "r_ohm": r_res, "gamma_mag": gm,
                           "vswr": 999.0 if gm >= 1.0 else (1.0 + gm) / (1.0 - gm)})

    intervals: list[dict[str, Any]] = []
    if points:
        cur_region, start_f = points[0]["region"], points[0]["frequency_mhz"]
        for p in points[1:]:
            if p["region"] != cur_region:
                intervals.append({"region": cur_region, "start_mhz": start_f, "stop_mhz": points[points.index(p) - 1]["frequency_mhz"] if p != points[0] else start_f})
                cur_region, start_f = p["region"], p["frequency_mhz"]
        intervals.append({"region": cur_region, "start_mhz": start_f, "stop_mhz": points[-1]["frequency_mhz"]})

    best = min(points, key=lambda p: p["gamma_mag"]) if points else None
    return {"points": points, "resonances": resonances, "trajectory_intervals": intervals, "best_match": best}


def _format_smith_report(frequency_data: Sequence[Any], z0: float = 50.0) -> str:
    """Format Smith chart impedance data across a sweep."""
    sd = _compute_smith_data(frequency_data, z0)
    pts = sd["points"]
    if not pts:
        return "Smith chart report\n==================\nNo frequency data available."

    def vt(v: float) -> str:
        return ">999" if v >= 999.0 else f"{v:.2f}"

    best = sd["best_match"]
    rows = [[f"{p['frequency_mhz']:.3f}", f"{p['r_ohm']:.2f}", f"{p['x_ohm']:+.2f}",
             f"{p['z_mag_ohm']:.2f}", f"{p['z_real']:.3f}", f"{p['z_imag']:+.3f}",
             f"{p['gamma_mag']:.3f}", f"{p['gamma_phase_deg']:+.1f}", vt(p["vswr"])]
            for p in pts]
    rows, trunc = _truncate_rows(rows, 61)

    cap = sum(1 for p in pts if p["region"] == "capacitive")
    ind = sum(1 for p in pts if p["region"] == "inductive")
    res = sum(1 for p in pts if p["region"] == "resonant")

    lines = [
        "Smith chart report", "==================",
        f"Reference impedance Z0: {z0:.2f} Ω",
        f"Closest to center: {best['frequency_mhz']:.3f} MHz, "
        f"Z = {best['r_ohm']:.2f} {'+' if best['x_ohm'] >= 0 else '-'} j{abs(best['x_ohm']):.2f} Ω, "
        f"|Γ| = {best['gamma_mag']:.3f}, VSWR = {vt(best['vswr'])}",
        "",
        "Impedance sweep",
        _format_table(["Freq MHz", "R Ω", "X Ω", "|Z| Ω", "z_r", "z_i", "|Γ|", "Γ°", "VSWR"], rows),
    ]
    if trunc:
        lines.append("\nNote: table truncated.")

    lines.extend(["", "Resonance identification"])
    if sd["resonances"]:
        for r in sd["resonances"]:
            lines.append(f"- X≈0 near {r['frequency_mhz']:.3f} MHz, R≈{r['r_ohm']:.2f} Ω, "
                         f"|Γ|≈{r['gamma_mag']:.3f}, VSWR≈{vt(r['vswr'])}")
    else:
        lines.append("- No zero-reactance crossing found in sweep.")

    lines.extend(["", "Impedance trajectory",
                   f"- Points: {cap} capacitive, {ind} inductive, {res} near-resonant"])
    for iv in sd["trajectory_intervals"]:
        region = iv["region"].capitalize()
        if math.isclose(iv["start_mhz"], iv["stop_mhz"], abs_tol=1e-9):
            lines.append(f"- {region} at {iv['start_mhz']:.3f} MHz")
        else:
            lines.append(f"- {region}: {iv['start_mhz']:.3f} to {iv['stop_mhz']:.3f} MHz")

    return "\n".join(lines).strip()


def _format_sweep_table(frequency_data: Sequence[Any], max_rows: int = 61) -> str:
    rows = [
        [
            f"{float(item.frequency_mhz):.3f}",
            f"{float(item.swr_50):.2f}",
            f"{float(item.impedance.real):.2f}",
            f"{float(item.impedance.imag):+.2f}",
            f"{float(item.gain_max_dbi):.2f}",
            f"{float(item.gain_max_theta):.1f}",
            f"{float(item.gain_max_phi):.1f}",
            "—"
            if item.front_to_back_db is None
            else f"{float(item.front_to_back_db):.2f}",
            "—"
            if item.efficiency_percent is None
            else f"{float(item.efficiency_percent):.1f}",
        ]
        for item in frequency_data
    ]
    rows, truncated = _truncate_rows(rows, max_rows)
    table = _format_table(
        [
            "Freq MHz",
            "SWR",
            "R Ω",
            "X Ω",
            "Gain dBi",
            "Theta°",
            "Phi°",
            "F/B dB",
            "Eff %",
        ],
        rows,
    )
    if truncated:
        return f"{table}\n\nNote: sweep table truncated for readability."
    return table


def _format_band_analysis_table(
    frequency_data: Sequence[Any], region: str = "r1"
) -> str:
    analysis = [
        item
        for item in analyze_band_performance(frequency_data, region=region)
        if item.simulated
    ]
    if not analysis:
        return ""

    rows = [
        [
            item.band.label,
            str(item.point_count),
            "—" if item.min_swr is None else f"{item.min_swr:.2f}",
            "—" if item.min_swr_freq_mhz is None else f"{item.min_swr_freq_mhz:.3f}",
            "—"
            if item.usable_bandwidth_khz is None
            else str(item.usable_bandwidth_khz),
            "—" if item.avg_gain_dbi is None else f"{item.avg_gain_dbi:.2f}",
            "—" if item.peak_gain_dbi is None else f"{item.peak_gain_dbi:.2f}",
            item.quality,
        ]
        for item in analysis
    ]
    return (
        f"Band analysis (ITU {region.upper()})\n"
        f"{_format_table(['Band', 'Points', 'Min SWR', 'At MHz', 'Usable kHz', 'Avg Gain', 'Peak Gain', 'Quality'], rows)}"
    )


def _run_template_simulation(
    template_id: str,
    params_json: str,
    ground_type: str,
    freq_start_mhz: float | None,
    freq_stop_mhz: float | None,
    freq_steps: int | None,
) -> TemplateRun:
    template = get_template(template_id)
    params_data = _parse_json_object(params_json, "params")
    params = resolve_params(template, params_data)
    frequency_range = _resolve_frequency_range(
        template, params, freq_start_mhz, freq_stop_mhz, freq_steps
    )
    ground_spec = _resolve_ground_spec(ground_type, template.default_ground.type)

    wires = template.generate_geometry(params)
    excitation = template.generate_excitation(params, wires)
    artifacts = simulate(
        wires=wires,
        excitation=excitation,
        frequency_range=frequency_range,
        ground_type=ground_spec,
        comment=f"{template.name} ({template.id}) via AntennaSim MCP",
    )

    return TemplateRun(
        template=template,
        params=params,
        wires=wires,
        excitation=excitation,
        frequency_range=frequency_range,
        ground_spec=ground_spec,
        artifacts=artifacts,
    )


def _format_simulation_report(
    title: str,
    detail_lines: Sequence[str],
    wires: Sequence[Any],
    excitation: Any | Sequence[Any],
    frequency_range: FrequencyRange,
    ground_spec: str,
    artifacts: SimulationArtifacts,
) -> str:
    frequency_data = artifacts.result.frequency_data
    best_swr = _best_swr_result(frequency_data)
    peak_gain = _peak_gain_result(frequency_data)
    best_ftb = _best_front_to_back_result(frequency_data)
    center_target = (
        float(frequency_data[0].frequency_mhz) + float(frequency_data[-1].frequency_mhz)
    ) / 2.0
    center_point = _nearest_frequency_result(frequency_data, center_target)
    usable_points = _count_usable_points(frequency_data)
    avg_eff = _average_efficiency(frequency_data)

    lines: list[str] = [title, "=" * len(title), *detail_lines, ""]
    lines.extend(
        [
            f"Ground: {_format_ground_display(ground_spec)}",
            f"Sweep: {_format_frequency_range(frequency_range)}",
            f"Geometry: {_geometry_summary(wires)}",
            f"Excitation: {_format_excitation_summary(excitation)}",
            f"Engine: {artifacts.result.engine}",
            f"Simulation ID: {artifacts.result.simulation_id}",
            f"Computed in: {float(artifacts.result.computed_in_ms):.1f} ms",
            "",
            "Key metrics",
            f"- Best SWR(50Ω): {float(best_swr.swr_50):.2f} at {float(best_swr.frequency_mhz):.3f} MHz, Z = {_format_impedance(best_swr)}",
            f"- Sweep points with SWR <= 2.0: {usable_points} of {len(frequency_data)}",
            f"- Peak gain: {float(peak_gain.gain_max_dbi):.2f} dBi at {float(peak_gain.frequency_mhz):.3f} MHz "
            f"(theta {float(peak_gain.gain_max_theta):.1f}°, phi {float(peak_gain.gain_max_phi):.1f}°, "
            f"beamwidth {_beamwidth_summary(peak_gain)})",
        ]
    )

    if best_ftb is not None:
        lines.append(
            f"- Best front-to-back: {float(best_ftb.front_to_back_db):.2f} dB at {float(best_ftb.frequency_mhz):.3f} MHz"
        )
    if avg_eff is not None:
        lines.append(f"- Average efficiency: {avg_eff:.1f}%")
    lines.append(
        f"- Center-of-sweep point: {float(center_point.frequency_mhz):.3f} MHz, "
        f"SWR {float(center_point.swr_50):.2f}, Z = {_format_impedance(center_point)}"
    )

    lines.extend(
        [
            "",
            "Frequency sweep",
            _format_sweep_table(frequency_data),
        ]
    )

    band_section = _format_band_analysis_table(frequency_data, region="r1")
    if band_section:
        lines.extend(["", band_section])

    if artifacts.result.warnings:
        lines.extend(["", "Warnings"])
        lines.extend(f"- {warning}" for warning in artifacts.result.warnings)

    return "\n".join(lines).strip()


def _winner_lower(value1: float | None, value2: float | None) -> str:
    if value1 is None or value2 is None:
        return "—"
    if math.isclose(value1, value2, abs_tol=1e-9):
        return "Tie"
    return "Antenna 1" if value1 < value2 else "Antenna 2"


def _winner_higher(value1: float | None, value2: float | None) -> str:
    if value1 is None or value2 is None:
        return "—"
    if math.isclose(value1, value2, abs_tol=1e-9):
        return "Tie"
    return "Antenna 1" if value1 > value2 else "Antenna 2"


def _format_comparison_report(run1: TemplateRun, run2: TemplateRun) -> str:
    data1 = run1.artifacts.result.frequency_data
    data2 = run2.artifacts.result.frequency_data

    best1 = _best_swr_result(data1)
    best2 = _best_swr_result(data2)
    peak1 = _peak_gain_result(data1)
    peak2 = _peak_gain_result(data2)
    ftb1 = _best_front_to_back_result(data1)
    ftb2 = _best_front_to_back_result(data2)
    eff1 = _average_efficiency(data1)
    eff2 = _average_efficiency(data2)
    center_target = (
        run1.frequency_range.start_mhz + run1.frequency_range.stop_mhz
    ) / 2.0
    center1 = _nearest_frequency_result(data1, center_target)
    center2 = _nearest_frequency_result(data2, center_target)
    usable1 = _count_usable_points(data1)
    usable2 = _count_usable_points(data2)

    summary_rows = [
        [
            "Geometry",
            f"{len(run1.wires)} wires / {run1.artifacts.result.total_segments} segs",
            f"{len(run2.wires)} wires / {run2.artifacts.result.total_segments} segs",
            "—",
        ],
        [
            "Best SWR",
            f"{float(best1.swr_50):.2f} @ {float(best1.frequency_mhz):.3f} MHz",
            f"{float(best2.swr_50):.2f} @ {float(best2.frequency_mhz):.3f} MHz",
            _winner_lower(float(best1.swr_50), float(best2.swr_50)),
        ],
        [
            "Impedance @ best SWR",
            _format_impedance(best1),
            _format_impedance(best2),
            "—",
        ],
        [
            "Sweep points SWR <= 2.0",
            f"{usable1} of {len(data1)}",
            f"{usable2} of {len(data2)}",
            _winner_higher(float(usable1), float(usable2)),
        ],
        [
            "Peak gain",
            f"{float(peak1.gain_max_dbi):.2f} dBi @ {float(peak1.frequency_mhz):.3f} MHz",
            f"{float(peak2.gain_max_dbi):.2f} dBi @ {float(peak2.frequency_mhz):.3f} MHz",
            _winner_higher(float(peak1.gain_max_dbi), float(peak2.gain_max_dbi)),
        ],
        [
            "Peak F/B",
            "—" if ftb1 is None else f"{float(ftb1.front_to_back_db):.2f} dB",
            "—" if ftb2 is None else f"{float(ftb2.front_to_back_db):.2f} dB",
            _winner_higher(
                None if ftb1 is None else float(ftb1.front_to_back_db),
                None if ftb2 is None else float(ftb2.front_to_back_db),
            ),
        ],
        [
            "Beamwidth @ peak gain",
            _beamwidth_summary(peak1),
            _beamwidth_summary(peak2),
            "—",
        ],
        [
            "Average efficiency",
            "—" if eff1 is None else f"{eff1:.1f}%",
            "—" if eff2 is None else f"{eff2:.1f}%",
            _winner_higher(eff1, eff2),
        ],
        [
            "Center-of-sweep SWR",
            f"{float(center1.swr_50):.2f}",
            f"{float(center2.swr_50):.2f}",
            _winner_lower(float(center1.swr_50), float(center2.swr_50)),
        ],
        [
            "Center-of-sweep impedance",
            _format_impedance(center1),
            _format_impedance(center2),
            "—",
        ],
    ]

    lines = [
        f"Comparison: {run1.template.name} vs {run2.template.name}",
        "=" * (12 + len(run1.template.name) + len(run2.template.name)),
        f"Antenna 1: {run1.template.name} ({run1.template.id})",
        f"Antenna 1 params JSON: {json.dumps(run1.params)}",
        f"Antenna 2: {run2.template.name} ({run2.template.id})",
        f"Antenna 2 params JSON: {json.dumps(run2.params)}",
        "",
        f"Ground: {_format_ground_display(run1.ground_spec)}",
        f"Sweep: {_format_frequency_range(run1.frequency_range)}",
        "",
        "Summary",
        _format_table(["Metric", "Antenna 1", "Antenna 2", "Better"], summary_rows),
    ]

    same_grid = len(data1) == len(data2) and all(
        math.isclose(
            float(item1.frequency_mhz), float(item2.frequency_mhz), abs_tol=1e-9
        )
        for item1, item2 in zip(data1, data2)
    )
    if same_grid:
        comparison_rows = [
            [
                f"{float(item1.frequency_mhz):.3f}",
                f"{float(item1.swr_50):.2f}",
                f"{float(item2.swr_50):.2f}",
                f"{float(item1.gain_max_dbi):.2f}",
                f"{float(item2.gain_max_dbi):.2f}",
                _winner_lower(float(item1.swr_50), float(item2.swr_50)),
                _winner_higher(float(item1.gain_max_dbi), float(item2.gain_max_dbi)),
            ]
            for item1, item2 in zip(data1, data2)
        ]
        comparison_rows, truncated = _truncate_rows(comparison_rows, 61)
        lines.extend(
            [
                "",
                "Per-frequency comparison",
                _format_table(
                    [
                        "Freq MHz",
                        "SWR 1",
                        "SWR 2",
                        "Gain 1",
                        "Gain 2",
                        "Lower SWR",
                        "Higher Gain",
                    ],
                    comparison_rows,
                ),
            ]
        )
        if truncated:
            lines.append("\nNote: per-frequency comparison truncated for readability.")

    if run1.artifacts.result.warnings:
        lines.extend(["", "Warnings from Antenna 1"])
        lines.extend(f"- {warning}" for warning in run1.artifacts.result.warnings)

    if run2.artifacts.result.warnings:
        lines.extend(["", "Warnings from Antenna 2"])
        lines.extend(f"- {warning}" for warning in run2.artifacts.result.warnings)

    return "\n".join(lines).strip()


@mcp.tool()
def list_antenna_templates() -> str:
    """List all available antenna templates with IDs, categories, difficulty, and bands."""
    try:
        sections = [f"Available antenna templates ({len(TEMPLATES)} total)"]
        category_order = ("wire", "vertical", "multiband", "loop", "directional")

        for category in category_order:
            group = [
                template for template in TEMPLATES if template.category == category
            ]
            if not group:
                continue
            sections.append("")
            sections.append(f"[{category}]")
            for template in group:
                sections.append(
                    f"- {template.id}: {template.name} | difficulty={template.difficulty} | bands={', '.join(template.bands)}"
                )
                sections.append(f"  {template.description}")

        sections.append("")
        sections.append(
            "Use get_template_info(template_id) for full parameter details."
        )
        return "\n".join(sections)
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def get_template_info(template_id: str) -> str:
    """Return detailed information for one template, including parameters and defaults."""
    try:
        template = get_template(template_id)
        default_params = template.get_default_params()
        default_range = template.default_frequency_range(default_params)

        lines = [
            f"Template: {template.name} ({template.id})",
            "=" * (11 + len(template.name) + len(template.id)),
            f"Short name: {template.short_name}",
            f"Category: {template.category}",
            f"Difficulty: {template.difficulty}",
            f"Typical bands: {', '.join(template.bands)}",
            f"Default ground: {template.default_ground.type}",
            f"Description: {template.description}",
            "",
            "Long description",
            template.long_description,
            "",
            f"Default params JSON: {json.dumps(default_params)}",
            f"Default sweep: {_format_frequency_range(default_range)}",
            "",
            "Parameters",
        ]

        for parameter in template.parameters:
            default_text = _format_number(parameter.default_value, parameter.decimals)
            range_min = _format_number(parameter.min, parameter.decimals)
            range_max = _format_number(parameter.max, parameter.decimals)
            step_text = _format_number(parameter.step, parameter.decimals)
            unit_text = f" {parameter.unit}" if parameter.unit else ""
            lines.append(
                f"- {parameter.key}: {parameter.label}\n"
                f"  Range: {range_min} to {range_max}{unit_text} | Step: {step_text}{unit_text} | "
                f"Default: {default_text}{unit_text}\n"
                f"  {parameter.description}"
            )

        lines.extend(["", "Tips"])
        lines.extend(f"- {tip}" for tip in template.tips)

        lines.extend(
            ["", f"Related templates: {', '.join(template.related_templates)}"]
        )
        return "\n".join(lines)
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def list_ham_bands(region: str = "r1") -> str:
    """List the ham bands defined for ITU region r1, r2, or r3."""
    try:
        normalized_region = region.strip().lower() or "r1"
        bands = get_bands_for_region(normalized_region)  # type: ignore[arg-type]
        rows = []
        for band in bands:
            freq_range = band_to_frequency_range(band)
            rows.append(
                [
                    band.label,
                    band.name,
                    f"{band.start_mhz:.4f}",
                    f"{band.stop_mhz:.4f}",
                    f"{band.center_mhz:.4f}",
                    str(freq_range["steps"]),
                ]
            )

        return (
            f"Ham bands for ITU {normalized_region.upper()}\n"
            f"{_format_table(['Label', 'Name', 'Start MHz', 'Stop MHz', 'Center MHz', 'Suggested Sweep Points'], rows)}"
        )
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def create_and_simulate_antenna(
    template_id: str,
    params: str = "",
    ground_type: str = "average",
    freq_start_mhz: float | None = None,
    freq_stop_mhz: float | None = None,
    freq_steps: int | None = None,
) -> str:
    """Create an antenna from a template and simulate it.

    `params` must be a JSON object string, for example:
    {"frequency": 14.1, "height": 10, "wire_diameter": 2.0}

    `ground_type` may be a preset like "average" or a custom string like
    "custom:13,0.005".
    """
    try:
        run = _run_template_simulation(
            template_id=template_id,
            params_json=params,
            ground_type=ground_type,
            freq_start_mhz=freq_start_mhz,
            freq_stop_mhz=freq_stop_mhz,
            freq_steps=freq_steps,
        )
        return _format_simulation_report(
            title=f"Simulation: {run.template.name}",
            detail_lines=[
                f"Template ID: {run.template.id}",
                f"Description: {run.template.description}",
                f"Resolved params JSON: {json.dumps(run.params)}",
            ],
            wires=run.wires,
            excitation=run.excitation,
            frequency_range=run.frequency_range,
            ground_spec=run.ground_spec,
            artifacts=run.artifacts,
        )
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def compare_antennas(
    antenna1_template: str,
    antenna2_template: str,
    antenna1_params: str = "",
    antenna2_params: str = "",
    freq_start_mhz: float | None = None,
    freq_stop_mhz: float | None = None,
    freq_steps: int | None = None,
    ground_type: str = "average",
) -> str:
    """Simulate two template-based antennas on the same sweep and compare them."""
    try:
        template1 = get_template(antenna1_template)
        template2 = get_template(antenna2_template)
        params1 = resolve_params(
            template1, _parse_json_object(antenna1_params, "antenna1_params")
        )
        params2 = resolve_params(
            template2, _parse_json_object(antenna2_params, "antenna2_params")
        )

        frequency_range = _resolve_comparison_frequency_range(
            template1,
            params1,
            template2,
            params2,
            freq_start_mhz,
            freq_stop_mhz,
            freq_steps,
        )

        ground_spec1 = _resolve_ground_spec(ground_type, template1.default_ground.type)
        ground_spec2 = _resolve_ground_spec(ground_type, template2.default_ground.type)

        wires1 = template1.generate_geometry(params1)
        excitation1 = template1.generate_excitation(params1, wires1)
        artifacts1 = simulate(
            wires=wires1,
            excitation=excitation1,
            frequency_range=frequency_range,
            ground_type=ground_spec1,
            comment=f"{template1.name} comparison run via AntennaSim MCP",
        )

        wires2 = template2.generate_geometry(params2)
        excitation2 = template2.generate_excitation(params2, wires2)
        artifacts2 = simulate(
            wires=wires2,
            excitation=excitation2,
            frequency_range=frequency_range,
            ground_type=ground_spec2,
            comment=f"{template2.name} comparison run via AntennaSim MCP",
        )

        run1 = TemplateRun(
            template1,
            params1,
            wires1,
            excitation1,
            frequency_range,
            ground_spec1,
            artifacts1,
        )
        run2 = TemplateRun(
            template2,
            params2,
            wires2,
            excitation2,
            frequency_range,
            ground_spec2,
            artifacts2,
        )
        return _format_comparison_report(run1, run2)
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def analyze_antenna_for_band(
    template_id: str,
    band: str,
    params: str = "",
    ground_type: str = "average",
) -> str:
    """Simulate one template specifically across a named ham band such as '20m'."""
    try:
        template = get_template(template_id)
        band_spec = get_band_by_label(band, region="r1")
        frequency_range = FrequencyRange(**band_to_frequency_range(band_spec))
        resolved_params = resolve_params(template, _parse_json_object(params, "params"))
        ground_spec = _resolve_ground_spec(ground_type, template.default_ground.type)

        wires = template.generate_geometry(resolved_params)
        excitation = template.generate_excitation(resolved_params, wires)
        artifacts = simulate(
            wires=wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_type=ground_spec,
            comment=f"{template.name} band analysis for {band_spec.label}",
        )

        frequency_data = artifacts.result.frequency_data
        center_result = _nearest_frequency_result(frequency_data, band_spec.center_mhz)
        best_swr = _best_swr_result(frequency_data)
        peak_gain = _peak_gain_result(frequency_data)
        analyses = analyze_band_performance(frequency_data, region="r1")
        performance = next(
            (
                item
                for item in analyses
                if item.band.label == band_spec.label
                and math.isclose(item.band.start_mhz, band_spec.start_mhz, abs_tol=1e-9)
                and math.isclose(item.band.stop_mhz, band_spec.stop_mhz, abs_tol=1e-9)
            ),
            None,
        )

        lines = [
            f"Band analysis: {template.name} on {band_spec.label}",
            "=" * (15 + len(template.name) + len(band_spec.label)),
            f"Template ID: {template.id}",
            f"Band definition (ITU R1): {band_spec.label} = {band_spec.start_mhz:.4f} to {band_spec.stop_mhz:.4f} MHz "
            f"(center {band_spec.center_mhz:.4f} MHz)",
            f"Resolved params JSON: {json.dumps(resolved_params)}",
            f"Ground: {_format_ground_display(ground_spec)}",
            f"Geometry: {_geometry_summary(wires)}",
            f"Excitation: {_format_excitation_summary(excitation)}",
            "",
            "Band-specific metrics",
            f"- Best SWR(50Ω): {float(best_swr.swr_50):.2f} at {float(best_swr.frequency_mhz):.3f} MHz, Z = {_format_impedance(best_swr)}",
            f"- Center-of-band point: {float(center_result.frequency_mhz):.3f} MHz, SWR {float(center_result.swr_50):.2f}, Z = {_format_impedance(center_result)}",
            f"- Peak gain in band: {float(peak_gain.gain_max_dbi):.2f} dBi at {float(peak_gain.frequency_mhz):.3f} MHz "
            f"(theta {float(peak_gain.gain_max_theta):.1f}°, phi {float(peak_gain.gain_max_phi):.1f}°)",
        ]

        if performance is not None:
            lines.extend(
                [
                    f"- Quality rating: {performance.quality}",
                    f"- Simulated points in band: {performance.point_count}",
                    f"- Average gain across band: {'—' if performance.avg_gain_dbi is None else f'{performance.avg_gain_dbi:.2f} dBi'}",
                    f"- Usable bandwidth with SWR <= 2.0: "
                    f"{'—' if performance.usable_bandwidth_khz is None else f'{performance.usable_bandwidth_khz} kHz'}",
                ]
            )

        lines.extend(["", "Frequency sweep", _format_sweep_table(frequency_data)])

        if artifacts.result.warnings:
            lines.extend(["", "Warnings"])
            lines.extend(f"- {warning}" for warning in artifacts.result.warnings)

        return "\n".join(lines).strip()
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def simulate_custom_antenna(
    wires_json: str,
    excitation_json: str,
    freq_start_mhz: float,
    freq_stop_mhz: float,
    freq_steps: int,
    ground_type: str = "average",
) -> str:
    """Simulate arbitrary raw wire geometry.

    `wires_json` must be a JSON array of wire objects matching the backend Wire model.
    `excitation_json` may be a single excitation object or a list of excitations.
    """
    try:
        wires = _parse_wires_json(wires_json)
        excitation = _parse_excitations_json(excitation_json)
        frequency_range = FrequencyRange(
            start_mhz=float(freq_start_mhz),
            stop_mhz=float(freq_stop_mhz),
            steps=int(freq_steps),
        )
        if frequency_range.start_mhz < 0.1 or frequency_range.stop_mhz > 2000.0:
            raise ValueError(
                "Custom simulation frequency limits must be between 0.1 and 2000 MHz."
            )
        if frequency_range.stop_mhz < frequency_range.start_mhz:
            raise ValueError(
                "freq_stop_mhz must be greater than or equal to freq_start_mhz."
            )
        if frequency_range.steps < 1 or frequency_range.steps > 201:
            raise ValueError("freq_steps must be between 1 and 201.")

        artifacts = simulate(
            wires=wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_type=ground_type,
            comment="Custom antenna geometry via AntennaSim MCP",
        )

        return _format_simulation_report(
            title="Simulation: Custom Antenna",
            detail_lines=[
                "Source: raw wires_json / excitation_json input",
                f"Ground type input: {ground_type}",
            ],
            wires=wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_spec=ground_type,
            artifacts=artifacts,
        )
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def design_wire_antenna(
    wires: str,
    feed_wire_tag: int,
    feed_segment: int,
    freq_start_mhz: float,
    freq_stop_mhz: float,
    freq_steps: int = 31,
    ground_type: str = "average",
    antenna_name: str = "Custom design",
) -> str:
    """Simulate a custom wire antenna from a compact semicolon-separated wire list.

    Each wire must be:
    "tag,segments,x1,y1,z1,x2,y2,z2,radius"

    Coordinates and radius are in meters.
    Example:
    "1,21,0,0,10,-5,0,10,0.001;2,21,0,0,10,5,0,10,0.001"
    """
    try:
        if feed_wire_tag <= 0:
            raise ValueError("feed_wire_tag must be a positive integer.")
        if feed_segment <= 0:
            raise ValueError("feed_segment must be a positive integer.")

        parsed_wires = _parse_wire_design_string(wires)
        feed_matches = [wire for wire in parsed_wires if wire.tag == feed_wire_tag]
        if not feed_matches:
            raise ValueError(
                f"feed_wire_tag {feed_wire_tag} does not match any wire tag in the design."
            )
        if len(feed_matches) > 1:
            raise ValueError(
                f"feed_wire_tag {feed_wire_tag} matches multiple wires. "
                "Use unique wire tags with design_wire_antenna."
            )

        feed_wire = feed_matches[0]
        if feed_segment > feed_wire.segments:
            raise ValueError(
                f"feed_segment {feed_segment} is out of range for wire {feed_wire_tag}; "
                f"that wire has {feed_wire.segments} segments."
            )

        frequency_range = _resolve_explicit_frequency_range(
            freq_start_mhz, freq_stop_mhz, freq_steps
        )
        ground_spec = _resolve_ground_spec(ground_type, "average")
        title = (antenna_name or "").strip() or "Custom design"
        excitation = Excitation(
            wire_tag=feed_wire_tag,
            segment=feed_segment,
            voltage_real=1.0,
            voltage_imag=0.0,
        )

        artifacts = simulate(
            wires=parsed_wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_type=ground_spec,
            comment=f"{title} via AntennaSim MCP",
        )

        return _format_simulation_report(
            title=f"Simulation: {title}",
            detail_lines=[
                "Source: design_wire_antenna wire list input",
                f"Feed: wire {feed_wire_tag}, segment {feed_segment}",
                f"Parsed wires: {len(parsed_wires)}",
            ],
            wires=parsed_wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_spec=ground_spec,
            artifacts=artifacts,
        )
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def get_nec2_card_deck(
    template_id: str,
    params: str = "",
    ground_type: str = "average",
    freq_start_mhz: float | None = None,
    freq_stop_mhz: float | None = None,
    freq_steps: int | None = None,
) -> str:
    """Return the raw NEC2 card deck for a template configuration without running nec2c."""
    try:
        template = get_template(template_id)
        resolved_params = resolve_params(template, _parse_json_object(params, "params"))
        frequency_range = _resolve_frequency_range(
            template,
            resolved_params,
            freq_start_mhz,
            freq_stop_mhz,
            freq_steps,
        )
        ground_spec = _resolve_ground_spec(ground_type, template.default_ground.type)

        wires = template.generate_geometry(resolved_params)
        excitation = template.generate_excitation(resolved_params, wires)

        return _build_nec2_card_deck(
            wires=wires,
            excitation=excitation,
            frequency_range=frequency_range,
            ground_spec=ground_spec,
            comment_lines=(
                f"{template.name} ({template.id}) via AntennaSim MCP",
                f"params={json.dumps(resolved_params, sort_keys=True, separators=(',', ':'))}",
                f"ground={ground_spec} sweep={frequency_range.start_mhz:.3f}-{frequency_range.stop_mhz:.3f}MHz steps={frequency_range.steps}",
            ),
            default_ground_type=template.default_ground.type,
        )
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def get_radiation_pattern(
    template_id: str,
    params: str = "",
    frequency_mhz: float | None = None,
    ground_type: str = "average",
) -> str:
    """Simulate one antenna at a single frequency and return a detailed radiation pattern report.

    Shows pattern shape classification (omnidirectional, bidirectional, directional),
    H-plane and E-plane cuts with gain at each angle, beamwidth, front-to-back ratio,
    and front-to-side ratio. Useful for understanding if an antenna pattern is
    omnidirectional or directional.
    """
    try:
        template = get_template(template_id)
        resolved_params = resolve_params(template, _parse_json_object(params, "params"))
        default_range = template.default_frequency_range(resolved_params)
        target = (
            float(frequency_mhz)
            if frequency_mhz is not None
            else (default_range.start_mhz + default_range.stop_mhz) / 2.0
        )
        run = _run_template_simulation(
            template_id=template_id, params_json=params, ground_type=ground_type,
            freq_start_mhz=target, freq_stop_mhz=target, freq_steps=1,
        )
        if not run.artifacts.result.frequency_data:
            raise ValueError("Simulation did not return any frequency data.")
        report = _format_pattern_report(
            run.artifacts.result.frequency_data[0], run.template.name,
            f"template_id={run.template.id}, params={json.dumps(run.params, sort_keys=True)}, "
            f"ground={_format_ground_display(run.ground_spec)}",
        )
        if run.artifacts.result.warnings:
            report += "\n\nWarnings\n" + "\n".join(f"- {w}" for w in run.artifacts.result.warnings)
        return report
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def get_smith_chart(
    template_id: str,
    params: str = "",
    ground_type: str = "average",
    freq_start_mhz: float | None = None,
    freq_stop_mhz: float | None = None,
    freq_steps: int | None = None,
    z0: float = 50.0,
) -> str:
    """Simulate one antenna across a frequency sweep and return Smith chart impedance data.

    Shows normalized impedance (z = Z/Z0), reflection coefficient magnitude and phase,
    VSWR at each frequency, resonance identification where reactance crosses zero,
    and impedance trajectory (capacitive/inductive regions).
    """
    try:
        if z0 <= 0.0:
            raise ValueError("z0 must be greater than zero.")
        run = _run_template_simulation(
            template_id=template_id, params_json=params, ground_type=ground_type,
            freq_start_mhz=freq_start_mhz, freq_stop_mhz=freq_stop_mhz, freq_steps=freq_steps,
        )
        if not run.artifacts.result.frequency_data:
            raise ValueError("Simulation did not return any frequency data.")
        lines = [
            f"Template: {run.template.name} ({run.template.id})",
            f"Params: {json.dumps(run.params, sort_keys=True)}",
            f"Ground: {_format_ground_display(run.ground_spec)}",
            f"Sweep: {_format_frequency_range(run.frequency_range)}",
            "",
            _format_smith_report(run.artifacts.result.frequency_data, z0),
        ]
        if run.artifacts.result.warnings:
            lines.extend(["", "Warnings"] + [f"- {w}" for w in run.artifacts.result.warnings])
        return "\n".join(lines).strip()
    except Exception as exc:
        return _format_exception(exc)


@mcp.tool()
def compare_radiation_patterns(
    antenna1_template: str,
    antenna2_template: str,
    antenna1_params: str = "",
    antenna2_params: str = "",
    frequency_mhz: float | None = None,
    ground_type: str = "average",
) -> str:
    """Simulate two antennas at one frequency and compare their radiation patterns.

    Shows side-by-side pattern shape classification, beamwidth, front-to-back,
    front-to-side, directivity assessment, and gain-at-each-angle comparison tables
    for both H-plane and E-plane cuts. Useful for determining which antenna is more
    omnidirectional vs more directional.
    """
    try:
        template1 = get_template(antenna1_template)
        template2 = get_template(antenna2_template)
        params1 = resolve_params(template1, _parse_json_object(antenna1_params, "antenna1_params"))
        params2 = resolve_params(template2, _parse_json_object(antenna2_params, "antenna2_params"))

        if frequency_mhz is not None:
            target = float(frequency_mhz)
            freq_note = "user-specified"
        else:
            d1 = template1.default_frequency_range(params1)
            d2 = template2.default_frequency_range(params2)
            lo = max(d1.start_mhz, d2.start_mhz)
            hi = min(d1.stop_mhz, d2.stop_mhz)
            if lo <= hi:
                target = (lo + hi) / 2.0
                freq_note = "center of default-sweep overlap"
            else:
                target = ((d1.start_mhz + d1.stop_mhz) / 2.0 + (d2.start_mhz + d2.stop_mhz) / 2.0) / 2.0
                freq_note = "midpoint of default-sweep centers (no overlap)"

        run1 = _run_template_simulation(antenna1_template, antenna1_params, ground_type, target, target, 1)
        run2 = _run_template_simulation(antenna2_template, antenna2_params, ground_type, target, target, 1)

        if not run1.artifacts.result.frequency_data or not run2.artifacts.result.frequency_data:
            raise ValueError("One or both simulations returned no data.")

        r1 = run1.artifacts.result.frequency_data[0]
        r2 = run2.artifacts.result.frequency_data[0]
        a1 = _extract_pattern_analysis(r1)
        a2 = _extract_pattern_analysis(r2)

        if not a1["available"] or not a2["available"]:
            raise ValueError("Pattern data not available for one or both antennas.")

        v1 = float(a1["classification"]["azimuth_variation_db"])
        v2 = float(a2["classification"]["azimuth_variation_db"])
        unif = _winner_lower(v1, v2)
        unif_text = "—" if unif in {"—", "Tie"} else f"{unif} more uniform"

        summary_rows = [
            ["Impedance", _format_impedance(r1), _format_impedance(r2), "—"],
            ["SWR(50Ω)", f"{r1.swr_50:.2f}", f"{r2.swr_50:.2f}", _winner_lower(r1.swr_50, r2.swr_50)],
            ["Max gain", f"{a1['max_gain_dbi']:.2f} dBi", f"{a2['max_gain_dbi']:.2f} dBi",
             _winner_higher(a1["max_gain_dbi"], a2["max_gain_dbi"])],
            ["Peak dir", f"θ{a1['theta_deg']:.1f}° φ{a1['phi_deg']:.1f}°",
             f"θ{a2['theta_deg']:.1f}° φ{a2['phi_deg']:.1f}°", "—"],
            ["Shape", a1["shape"], a2["shape"], "—"],
            ["Directivity", a1["directivity_character"], a2["directivity_character"], "—"],
            ["Az variation", f"{v1:.2f} dB", f"{v2:.2f} dB", unif_text],
            ["Lobes", str(a1["classification"]["num_lobes"]), str(a2["classification"]["num_lobes"]), "—"],
            ["Beamwidth", _analysis_beamwidth_summary(a1), _analysis_beamwidth_summary(a2), "—"],
            ["F/B", _fmt_opt(a1["front_to_back_db"], 2, " dB"), _fmt_opt(a2["front_to_back_db"], 2, " dB"),
             _winner_higher(a1["front_to_back_db"], a2["front_to_back_db"])],
            ["F/S", _fmt_opt(a1["front_to_side_db"], 2, " dB"), _fmt_opt(a2["front_to_side_db"], 2, " dB"),
             _winner_higher(a1["front_to_side_db"], a2["front_to_side_db"])],
            ["Efficiency", _fmt_opt(r1.efficiency_percent, 1, "%"), _fmt_opt(r2.efficiency_percent, 1, "%"),
             _winner_higher(r1.efficiency_percent, r2.efficiency_percent)],
        ]

        title = f"Pattern comparison: {run1.template.name} vs {run2.template.name}"
        lines = [
            title, "=" * len(title),
            f"Antenna 1: {run1.template.name} ({run1.template.id})",
            f"Antenna 1 params: {json.dumps(run1.params, sort_keys=True)}",
            f"Antenna 2: {run2.template.name} ({run2.template.id})",
            f"Antenna 2 params: {json.dumps(run2.params, sort_keys=True)}",
            f"Frequency: {r1.frequency_mhz:.3f} MHz ({freq_note})",
            f"Ground: {_format_ground_display(run1.ground_spec)}",
            "", "Summary",
            _format_table(["Metric", "Antenna 1", "Antenna 2", "Assessment"], summary_rows),
            "", "Directivity assessment",
            f"- Ant 1: {a1['directivity_character']} ({a1['shape']}, {a1['classification']['num_lobes']} lobe(s), az var {v1:.2f} dB)",
            f"- Ant 2: {a2['directivity_character']} ({a2['shape']}, {a2['classification']['num_lobes']} lobe(s), az var {v2:.2f} dB)",
        ]
        if v1 + 1.0 < v2:
            lines.append(f"- {run1.template.name} is more omnidirectional in azimuth.")
        elif v2 + 1.0 < v1:
            lines.append(f"- {run2.template.name} is more omnidirectional in azimuth.")
        else:
            lines.append("- Similar azimuth uniformity.")

        gd = a1["max_gain_dbi"] - a2["max_gain_dbi"]
        if abs(gd) < 0.1:
            lines.append("- Peak gain effectively the same.")
        elif gd > 0:
            lines.append(f"- {run1.template.name} has {gd:.2f} dB more peak gain.")
        else:
            lines.append(f"- {run2.template.name} has {abs(gd):.2f} dB more peak gain.")

        lines.extend([
            "", "H-plane comparison (phi sweep)",
            _format_cut_comparison(a1["azimuth_cut"], a2["azimuth_cut"], "Phi°", 15.0, circular=True),
            "", "E-plane comparison (theta sweep)",
            _format_cut_comparison(a1["elevation_cut"], a2["elevation_cut"], "Theta°", 10.0, circular=False),
        ])

        for label, run in [("Antenna 1", run1), ("Antenna 2", run2)]:
            if run.artifacts.result.warnings:
                lines.extend([f"", f"Warnings from {label}"] + [f"- {w}" for w in run.artifacts.result.warnings])

        return "\n".join(lines).strip()
    except Exception as exc:
        return _format_exception(exc)


def main() -> None:
    """Run the MCP server.

    Transport is selected via the MCP_TRANSPORT environment variable:
    - "stdio" (default): standard I/O, for local CLI / Claude Desktop / Cursor
    - "sse": HTTP + Server-Sent Events, for legacy remote access
    - "streamable-http": MCP over a single HTTP endpoint, for modern remote clients

    When using SSE transport, the server listens on:
    - MCP_HOST (default "0.0.0.0")
    - MCP_PORT (default 8080)
    """
    import os

    transport = os.environ.get("MCP_TRANSPORT", "stdio").strip().lower()
    if transport in {"sse", "streamable-http"}:
        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("MCP_PORT", "8080"))
        mcp.settings.host = host
        mcp.settings.port = port
        if mcp.settings.transport_security is not None:
            mcp.settings.transport_security.enable_dns_rebinding_protection = False
        mcp.run(transport=transport)
    else:
        mcp.run()


if __name__ == "__main__":
    main()
