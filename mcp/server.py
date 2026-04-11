"""FastMCP server exposing AntennaSim antenna simulation tools."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp import FastMCP

try:
    from .ham_bands import analyze_band_performance, band_to_frequency_range, get_band_by_label, get_bands_for_region
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
except ImportError:
    from ham_bands import analyze_band_performance, band_to_frequency_range, get_band_by_label, get_bands_for_region
    from simulator import (
        BackendImportError,
        GROUND_TYPE_VALUES,
        NecNotFoundError,
        SimulationArtifacts,
        SimulationError,
        parse_ground_spec,
        simulate,
    )
    from templates import (
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


mcp = FastMCP("AntennaSim MCP")


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
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, Mapping))


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
        raise ValueError("wires_json must be a JSON array, or an object containing a 'wires' array.")
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
            return [dict(item) if isinstance(item, Mapping) else item for item in nested]
        if "excitation" in data:
            nested = data["excitation"]
            if isinstance(nested, list):
                return [dict(item) if isinstance(item, Mapping) else item for item in nested]
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
        return " | ".join(str(cell).ljust(widths[index]) for index, cell in enumerate(row))

    separator = "-+-".join("-" * width for width in widths)
    lines = [render(headers), separator]
    lines.extend(render(row) for row in rows)
    return "\n".join(lines)


def _truncate_rows(rows: list[list[str]], max_rows: int) -> tuple[list[list[str]], bool]:
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


def _format_ground_display(ground_spec: str, default_ground_type: str = "average") -> str:
    ground_name, epsilon_r, conductivity = parse_ground_spec(ground_spec, default_ground_type)
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

    entries = [entry.strip() for entry in stripped.replace("\n", ";").split(";") if entry.strip()]
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
            raise ValueError(f"Wire {index} contains non-numeric values: {entry!r}.") from exc

        if not tag_value.is_integer() or tag_value <= 0:
            raise ValueError(f"Wire {index} tag must be a positive integer; got {parts[0]!r}.")
        if not segments_value.is_integer() or segments_value <= 0:
            raise ValueError(f"Wire {index} segments must be a positive integer; got {parts[1]!r}.")
        if int(segments_value) > 200:
            raise ValueError(f"Wire {index} segments must be between 1 and 200; got {int(segments_value)}.")
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
        raise ValueError("freq_stop_mhz must be greater than or equal to freq_start_mhz.")
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
    ground_name, epsilon_r, conductivity = parse_ground_spec(ground_spec, default_ground_type)

    if ground_name == "free_space":
        return "GN -1"
    if ground_name == "perfect":
        return "GN 1"

    if epsilon_r is None or conductivity is None:
        raw_ground_value = GROUND_TYPE_VALUES.get(ground_name) if isinstance(GROUND_TYPE_VALUES, Mapping) else None
        epsilon_r, conductivity = _extract_ground_constants(raw_ground_value)

    if epsilon_r is None or conductivity is None:
        epsilon_r, conductivity = 13.0, 0.005

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
        frequency_step = (
            (frequency_range.stop_mhz - frequency_range.start_mhz) / (frequency_range.steps - 1)
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
    steps = default_range.steps if freq_steps is None or freq_steps <= 0 else int(freq_steps)

    if start < 0.1 or stop < 0.1 or start > 2000.0 or stop > 2000.0:
        raise ValueError("Frequency limits must be between 0.1 and 2000 MHz.")
    if stop < start:
        raise ValueError("freq_stop_mhz must be greater than or equal to freq_start_mhz.")
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

    start = min(default1.start_mhz, default2.start_mhz) if freq_start_mhz is None else float(freq_start_mhz)
    stop = max(default1.stop_mhz, default2.stop_mhz) if freq_stop_mhz is None else float(freq_stop_mhz)
    steps = max(default1.steps, default2.steps) if freq_steps is None or freq_steps <= 0 else int(freq_steps)

    if start < 0.1 or stop < 0.1 or start > 2000.0 or stop > 2000.0:
        raise ValueError("Frequency limits must be between 0.1 and 2000 MHz.")
    if stop < start:
        raise ValueError("freq_stop_mhz must be greater than or equal to freq_start_mhz.")
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
    values = [float(item.efficiency_percent) for item in frequency_data if item.efficiency_percent is not None]
    if not values:
        return None
    return sum(values) / len(values)


def _nearest_frequency_result(frequency_data: Sequence[Any], target_mhz: float) -> Any:
    return min(frequency_data, key=lambda item: abs(float(item.frequency_mhz) - target_mhz))


def _beamwidth_summary(result: Any) -> str:
    parts: list[str] = []
    if result.beamwidth_e_deg is not None:
        parts.append(f"E-plane {float(result.beamwidth_e_deg):.1f}°")
    if result.beamwidth_h_deg is not None:
        parts.append(f"H-plane {float(result.beamwidth_h_deg):.1f}°")
    return ", ".join(parts) if parts else "—"


def _count_usable_points(frequency_data: Sequence[Any], swr_threshold: float = 2.0) -> int:
    return sum(1 for item in frequency_data if float(item.swr_50) <= swr_threshold)


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
            "—" if item.front_to_back_db is None else f"{float(item.front_to_back_db):.2f}",
            "—" if item.efficiency_percent is None else f"{float(item.efficiency_percent):.1f}",
        ]
        for item in frequency_data
    ]
    rows, truncated = _truncate_rows(rows, max_rows)
    table = _format_table(
        ["Freq MHz", "SWR", "R Ω", "X Ω", "Gain dBi", "Theta°", "Phi°", "F/B dB", "Eff %"],
        rows,
    )
    if truncated:
        return f"{table}\n\nNote: sweep table truncated for readability."
    return table


def _format_band_analysis_table(frequency_data: Sequence[Any], region: str = "r1") -> str:
    analysis = [item for item in analyze_band_performance(frequency_data, region=region) if item.simulated]
    if not analysis:
        return ""

    rows = [
        [
            item.band.label,
            str(item.point_count),
            "—" if item.min_swr is None else f"{item.min_swr:.2f}",
            "—" if item.min_swr_freq_mhz is None else f"{item.min_swr_freq_mhz:.3f}",
            "—" if item.usable_bandwidth_khz is None else str(item.usable_bandwidth_khz),
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
    frequency_range = _resolve_frequency_range(template, params, freq_start_mhz, freq_stop_mhz, freq_steps)
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
    center_target = (float(frequency_data[0].frequency_mhz) + float(frequency_data[-1].frequency_mhz)) / 2.0
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
    center_target = (run1.frequency_range.start_mhz + run1.frequency_range.stop_mhz) / 2.0
    center1 = _nearest_frequency_result(data1, center_target)
    center2 = _nearest_frequency_result(data2, center_target)
    usable1 = _count_usable_points(data1)
    usable2 = _count_usable_points(data2)

    summary_rows = [
        ["Geometry", f"{len(run1.wires)} wires / {run1.artifacts.result.total_segments} segs", f"{len(run2.wires)} wires / {run2.artifacts.result.total_segments} segs", "—"],
        ["Best SWR", f"{float(best1.swr_50):.2f} @ {float(best1.frequency_mhz):.3f} MHz", f"{float(best2.swr_50):.2f} @ {float(best2.frequency_mhz):.3f} MHz", _winner_lower(float(best1.swr_50), float(best2.swr_50))],
        ["Impedance @ best SWR", _format_impedance(best1), _format_impedance(best2), "—"],
        ["Sweep points SWR <= 2.0", f"{usable1} of {len(data1)}", f"{usable2} of {len(data2)}", _winner_higher(float(usable1), float(usable2))],
        ["Peak gain", f"{float(peak1.gain_max_dbi):.2f} dBi @ {float(peak1.frequency_mhz):.3f} MHz", f"{float(peak2.gain_max_dbi):.2f} dBi @ {float(peak2.frequency_mhz):.3f} MHz", _winner_higher(float(peak1.gain_max_dbi), float(peak2.gain_max_dbi))],
        ["Peak F/B", "—" if ftb1 is None else f"{float(ftb1.front_to_back_db):.2f} dB", "—" if ftb2 is None else f"{float(ftb2.front_to_back_db):.2f} dB", _winner_higher(None if ftb1 is None else float(ftb1.front_to_back_db), None if ftb2 is None else float(ftb2.front_to_back_db))],
        ["Beamwidth @ peak gain", _beamwidth_summary(peak1), _beamwidth_summary(peak2), "—"],
        ["Average efficiency", "—" if eff1 is None else f"{eff1:.1f}%", "—" if eff2 is None else f"{eff2:.1f}%", _winner_higher(eff1, eff2)],
        ["Center-of-sweep SWR", f"{float(center1.swr_50):.2f}", f"{float(center2.swr_50):.2f}", _winner_lower(float(center1.swr_50), float(center2.swr_50))],
        ["Center-of-sweep impedance", _format_impedance(center1), _format_impedance(center2), "—"],
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
        math.isclose(float(item1.frequency_mhz), float(item2.frequency_mhz), abs_tol=1e-9)
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
                    ["Freq MHz", "SWR 1", "SWR 2", "Gain 1", "Gain 2", "Lower SWR", "Higher Gain"],
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
            group = [template for template in TEMPLATES if template.category == category]
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
        sections.append("Use get_template_info(template_id) for full parameter details.")
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

        lines.extend(["", f"Related templates: {', '.join(template.related_templates)}"])
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
        params1 = resolve_params(template1, _parse_json_object(antenna1_params, "antenna1_params"))
        params2 = resolve_params(template2, _parse_json_object(antenna2_params, "antenna2_params"))

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

        run1 = TemplateRun(template1, params1, wires1, excitation1, frequency_range, ground_spec1, artifacts1)
        run2 = TemplateRun(template2, params2, wires2, excitation2, frequency_range, ground_spec2, artifacts2)
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
            raise ValueError("Custom simulation frequency limits must be between 0.1 and 2000 MHz.")
        if frequency_range.stop_mhz < frequency_range.start_mhz:
            raise ValueError("freq_stop_mhz must be greater than or equal to freq_start_mhz.")
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
            raise ValueError(f"feed_wire_tag {feed_wire_tag} does not match any wire tag in the design.")
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

        frequency_range = _resolve_explicit_frequency_range(freq_start_mhz, freq_stop_mhz, freq_steps)
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


def main() -> None:
    """Run the MCP server using stdio transport."""
    mcp.run()


if __name__ == "__main__":
    main()