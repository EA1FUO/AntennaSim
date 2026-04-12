"""High-level NEC2 simulation wrapper for the MCP server.

This module adds the AntennaSim backend to sys.path, imports the backend's
models and NEC helpers directly, and exposes a simple `simulate()` function.
"""

from __future__ import annotations

import dataclasses
import importlib
import os
import sys
import time
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

GROUND_TYPE_VALUES: tuple[str, ...] = (
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
)


class BackendImportError(RuntimeError):
    """Raised when the AntennaSim backend cannot be located or imported."""


class SimulationError(RuntimeError):
    """Raised when simulation setup, execution, or parsing fails."""


class NecNotFoundError(SimulationError):
    """Raised when nec2c is not available on PATH."""


@dataclass(slots=True)
class BackendAPI:
    """Lazy-imported backend API references."""

    Wire: Any
    Excitation: Any
    GroundConfig: Any
    GroundType: Any
    FrequencyConfig: Any
    PatternConfig: Any
    NearFieldConfig: Any
    SimulationRequest: Any
    SimulationResult: Any
    build_card_deck: Any
    run_nec2c: Any
    parse_nec_output: Any
    parse_near_field_output: Any
    NecExecutionError: type[Exception]
    backend_dir: Path


@dataclass(slots=True)
class SimulationArtifacts:
    """All useful outputs from a simulation run."""

    request: Any
    card_deck: str
    raw_output: str
    result: Any
    backend_dir: Path


_BACKEND_API: BackendAPI | None = None


def _candidate_backend_dirs() -> list[Path]:
    env_dir = os.environ.get("ANTENNASIM_BACKEND_DIR", "").strip()
    here = Path(__file__).resolve()
    candidates: list[Path] = []

    if env_dir:
        candidates.append(Path(env_dir))

    candidates.extend(
        [
            here.parents[1] / "backend",
            here.parents[2] / "backend",
            Path.cwd() / "backend",
            Path.cwd() / "AntennaSim" / "backend",
        ]
    )

    unique: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def _find_backend_dir() -> Path:
    for candidate in _candidate_backend_dirs():
        if (candidate / "src" / "models").is_dir():
            return candidate
    searched = "\n".join(f"- {path}" for path in _candidate_backend_dirs())
    raise BackendImportError(
        "Could not locate AntennaSim/backend.\n"
        "Expected a backend directory containing src/models.\n"
        "Searched:\n"
        f"{searched}\n"
        "Set ANTENNASIM_BACKEND_DIR to the AntennaSim/backend directory if needed."
    )


def load_backend_api() -> BackendAPI:
    """Locate and import the AntennaSim backend lazily."""
    global _BACKEND_API

    if _BACKEND_API is not None:
        return _BACKEND_API

    backend_dir = _find_backend_dir()
    backend_path = str(backend_dir)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    try:
        antenna_module = importlib.import_module("src.models.antenna")
        ground_module = importlib.import_module("src.models.ground")
        simulation_models = importlib.import_module("src.models.simulation")
        result_models = importlib.import_module("src.models.results")
        nec_input_module = importlib.import_module("src.simulation.nec_input")
        nec_runner_module = importlib.import_module("src.simulation.nec_runner")
        nec_output_module = importlib.import_module("src.simulation.nec_output")
    except ModuleNotFoundError as exc:
        raise BackendImportError(
            f"Failed to import backend modules from {backend_dir}. "
            "Ensure dependencies are installed and ANTENNASIM_BACKEND_DIR is correct."
        ) from exc

    _BACKEND_API = BackendAPI(
        Wire=antenna_module.Wire,
        Excitation=antenna_module.Excitation,
        GroundConfig=ground_module.GroundConfig,
        GroundType=ground_module.GroundType,
        FrequencyConfig=simulation_models.FrequencyConfig,
        PatternConfig=simulation_models.PatternConfig,
        NearFieldConfig=simulation_models.NearFieldConfig,
        SimulationRequest=simulation_models.SimulationRequest,
        SimulationResult=result_models.SimulationResult,
        build_card_deck=nec_input_module.build_card_deck,
        run_nec2c=nec_runner_module.run_nec2c,
        parse_nec_output=nec_output_module.parse_nec_output,
        parse_near_field_output=nec_output_module.parse_near_field_output,
        NecExecutionError=nec_runner_module.NecExecutionError,
        backend_dir=backend_dir,
    )
    return _BACKEND_API


def parse_ground_spec(
    ground_type: str | None,
    default_ground_type: str = "average",
) -> tuple[str, float | None, float | None]:
    """Parse a ground preset string.

    Accepted forms:
    - "average"
    - "salt_water"
    - "custom"
    - "custom:13,0.005"  -> epsilon_r=13, conductivity=0.005 S/m
    """
    raw = (ground_type or "").strip()
    if not raw or raw.lower() == "default":
        return default_ground_type, None, None

    lowered = raw.lower()

    if lowered.startswith("custom:"):
        body = raw.split(":", 1)[1]
        parts = [part.strip() for part in body.split(",")]
        if len(parts) != 2:
            raise ValueError(
                "Custom ground must be formatted as 'custom:epsilon_r,conductivity', "
                "for example 'custom:13,0.005'."
            )
        try:
            epsilon_r = float(parts[0])
            conductivity = float(parts[1])
        except ValueError as exc:
            raise ValueError(
                "Custom ground values must be numeric, e.g. 'custom:13,0.005'."
            ) from exc
        return "custom", epsilon_r, conductivity

    normalized = lowered.replace("-", "_").replace(" ", "_")
    if normalized not in GROUND_TYPE_VALUES:
        valid = ", ".join(GROUND_TYPE_VALUES)
        raise ValueError(
            f"Unknown ground type {ground_type!r}. Valid presets: {valid}. "
            "You may also use 'custom:epsilon_r,conductivity'."
        )
    return normalized, None, None


def _is_non_string_sequence(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, Mapping))


def _coerce_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if dataclasses.is_dataclass(value):
        return dataclasses.asdict(value)
    if hasattr(value, "model_dump"):
        return dict(value.model_dump())
    if hasattr(value, "__dict__"):
        return dict(vars(value))
    raise TypeError(f"Cannot convert {type(value).__name__} to a payload dictionary.")


def _coerce_mapping(value: Any, required_fields: Sequence[str]) -> dict[str, Any]:
    if isinstance(value, Mapping):
        payload = dict(value)
    elif dataclasses.is_dataclass(value):
        payload = dataclasses.asdict(value)
    elif hasattr(value, "model_dump"):
        payload = dict(value.model_dump())
    else:
        payload = {}
        missing_fields: list[str] = []
        for field_name in required_fields:
            if hasattr(value, field_name):
                payload[field_name] = getattr(value, field_name)
            else:
                missing_fields.append(field_name)
        if missing_fields:
            raise TypeError(
                f"Object of type {type(value).__name__} is missing fields: {', '.join(missing_fields)}"
            )

    missing = [field_name for field_name in required_fields if field_name not in payload]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")
    return payload


def _extract_warnings(output: str) -> list[str]:
    warnings: list[str] = []
    seen: set[str] = set()

    for line in output.splitlines():
        text = " ".join(line.split())
        if not text:
            continue
        upper = text.upper()
        if "WARNING" in upper or upper.startswith("NOTE"):
            if text not in seen:
                warnings.append(text)
                seen.add(text)
    return warnings


def _build_ground_config(
    api: BackendAPI,
    ground_type: str,
    dielectric_constant: float | None = None,
    conductivity: float | None = None,
) -> Any:
    parsed_ground_type, parsed_eps, parsed_sigma = parse_ground_spec(ground_type)

    if dielectric_constant is None:
        dielectric_constant = parsed_eps
    if conductivity is None:
        conductivity = parsed_sigma

    try:
        ground_enum = api.GroundType(parsed_ground_type)
    except ValueError as exc:
        valid = ", ".join(GROUND_TYPE_VALUES)
        raise ValueError(
            f"Unknown ground type {parsed_ground_type!r}. Valid presets: {valid}"
        ) from exc

    kwargs: dict[str, Any] = {"ground_type": ground_enum}
    if parsed_ground_type == "custom":
        if dielectric_constant is not None:
            kwargs["dielectric_constant"] = dielectric_constant
        if conductivity is not None:
            kwargs["conductivity"] = conductivity

    return api.GroundConfig(**kwargs)


def simulate(
    wires: Sequence[Any],
    excitation: Any | Sequence[Any],
    frequency_range: Any,
    ground_type: str = "average",
    pattern: Mapping[str, Any] | None = None,
    comment: str = "AntennaSim MCP simulation",
    compute_currents: bool = False,
    near_field: Mapping[str, Any] | None = None,
    loads: Sequence[Any] | None = None,
    transmission_lines: Sequence[Any] | None = None,
    dielectric_constant: float | None = None,
    conductivity: float | None = None,
) -> SimulationArtifacts:
    """Build a backend SimulationRequest, run nec2c, parse, and return artifacts."""
    api = load_backend_api()

    wire_fields = ("tag", "segments", "x1", "y1", "z1", "x2", "y2", "z2", "radius")
    excitation_fields = ("wire_tag", "segment", "voltage_real", "voltage_imag")
    frequency_fields = ("start_mhz", "stop_mhz", "steps")

    wire_objects = [api.Wire(**_coerce_mapping(wire, wire_fields)) for wire in wires]

    excitation_items = list(excitation) if _is_non_string_sequence(excitation) else [excitation]
    excitation_objects = [
        api.Excitation(**_coerce_mapping(item, excitation_fields))
        for item in excitation_items
    ]

    frequency_object = api.FrequencyConfig(**_coerce_mapping(frequency_range, frequency_fields))
    pattern_object = api.PatternConfig(**(_coerce_payload(pattern) if pattern is not None else {}))
    near_field_object = (
        api.NearFieldConfig(**_coerce_payload(near_field)) if near_field is not None else None
    )

    load_payloads = [_coerce_payload(item) for item in (loads or [])]
    transmission_payloads = [_coerce_payload(item) for item in (transmission_lines or [])]

    request = api.SimulationRequest(
        wires=wire_objects,
        excitations=excitation_objects,
        ground=_build_ground_config(
            api,
            ground_type=ground_type,
            dielectric_constant=dielectric_constant,
            conductivity=conductivity,
        ),
        frequency=frequency_object,
        pattern=pattern_object,
        comment=comment,
        loads=load_payloads,
        transmission_lines=transmission_payloads,
        compute_currents=compute_currents,
        near_field=near_field_object,
    )

    card_deck = api.build_card_deck(request)

    started = time.perf_counter()
    try:
        raw_output = api.run_nec2c(card_deck)
    except FileNotFoundError as exc:
        raise NecNotFoundError(
            "nec2c executable not found. Install nec2c and ensure it is on PATH."
        ) from exc
    except api.NecExecutionError as exc:
        raise SimulationError(f"nec2c execution failed: {exc}") from exc
    elapsed_ms = (time.perf_counter() - started) * 1000.0

    frequency_data = api.parse_nec_output(
        raw_output,
        request.pattern.n_theta,
        request.pattern.n_phi,
        request.pattern.theta_start,
        request.pattern.theta_step,
        request.pattern.phi_start,
        request.pattern.phi_step,
        compute_currents=compute_currents,
    )
    if not frequency_data:
        raise SimulationError("nec2c completed, but no frequency data could be parsed from the output.")

    near_field_result = None
    if request.near_field and request.near_field.enabled:
        near_field_result = api.parse_near_field_output(
            raw_output,
            plane=request.near_field.plane,
            height_m=request.near_field.height_m,
            extent_m=request.near_field.extent_m,
            resolution_m=request.near_field.resolution_m,
        )

    result = api.SimulationResult(
        simulation_id=uuid.uuid4().hex[:12],
        engine="nec2c",
        computed_in_ms=round(elapsed_ms, 3),
        total_segments=sum(wire.segments for wire in request.wires),
        cached=False,
        frequency_data=frequency_data,
        near_field=near_field_result,
        warnings=_extract_warnings(raw_output),
    )

    return SimulationArtifacts(
        request=request,
        card_deck=card_deck,
        raw_output=raw_output,
        result=result,
        backend_dir=api.backend_dir,
    )


__all__ = [
    "BackendImportError",
    "GROUND_TYPE_VALUES",
    "NecNotFoundError",
    "SimulationArtifacts",
    "SimulationError",
    "load_backend_api",
    "parse_ground_spec",
    "simulate",
]