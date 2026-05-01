"""Amateur radio band definitions and analysis helpers.

Band data is loaded from shared/ham-bands.json which is consumed by both
this Python module and the TypeScript frontend — eliminating duplication.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Sequence

if __package__:
    from .utils import get_field
else:
    from utils import get_field  # type: ignore[no-redef]

Region = Literal["all", "r1", "r2", "r3"]
BandQuality = Literal["excellent", "good", "marginal", "poor", "not_simulated"]


@dataclass(frozen=True, slots=True)
class HamBand:
    """A standard amateur radio band allocation."""

    label: str
    name: str
    start_mhz: float
    stop_mhz: float
    center_mhz: float
    region: Region


@dataclass(frozen=True, slots=True)
class BandPerformance:
    """Performance summary for one band."""

    band: HamBand
    simulated: bool
    point_count: int
    min_swr: float | None
    min_swr_freq_mhz: float | None
    usable_bandwidth_khz: int | None
    avg_gain_dbi: float | None
    peak_gain_dbi: float | None
    quality: BandQuality


def _find_shared_path() -> Path:
    """Locate the shared/ data directory.

    Checks two locations to support both Docker (shared/ copied alongside
    the server files) and development (shared/ at the repository root).
    """
    here = Path(__file__).parent
    # Docker layout: shared/ is copied to /opt/antsim_mcp/shared/
    docker_path = here / "shared"
    if docker_path.is_dir():
        return docker_path
    # Dev layout: shared/ is at the repo root (one level above mcp/)
    dev_path = here.parent / "shared"
    if dev_path.is_dir():
        return dev_path
    raise FileNotFoundError(
        "Could not find shared/ directory.\n"
        f"Searched:\n  {docker_path}\n  {dev_path}\n"
        "Ensure the shared/ directory exists alongside or above the mcp/ directory."
    )


def _load_ham_bands() -> list[HamBand]:
    """Load ham band definitions from shared/ham-bands.json."""
    bands_file = _find_shared_path() / "ham-bands.json"
    with open(bands_file, encoding="utf-8") as f:
        raw = json.load(f)
    return [
        HamBand(
            label=entry["label"],
            name=entry["name"],
            start_mhz=float(entry["start_mhz"]),
            stop_mhz=float(entry["stop_mhz"]),
            center_mhz=float(entry["center_mhz"]),
            region=entry["region"],
        )
        for entry in raw
    ]


# Loaded at module initialisation — replaces the hardcoded list.
HAM_BANDS: list[HamBand] = _load_ham_bands()


def _js_round(value: float, digits: int = 0) -> float:
    """Round like JavaScript's Math.round, including midpoint behaviour."""
    factor = 10 ** digits
    scaled = value * factor
    if scaled >= 0:
        return math.floor(scaled + 0.5) / factor
    return math.ceil(scaled - 0.5) / factor


def compute_steps(start_mhz: float, stop_mhz: float) -> int:
    """Compute sweep points exactly like the TypeScript computeSteps helper."""
    bw = abs(stop_mhz - start_mhz)
    return int(max(21, min(101, _js_round(bw * 25) + 1)))


def get_bands_for_region(region: Literal["r1", "r2", "r3"] = "r1") -> list[HamBand]:
    """Return bands matching the requested ITU region or 'all'."""
    if region not in {"r1", "r2", "r3"}:
        raise ValueError("region must be one of: r1, r2, r3")
    return [band for band in HAM_BANDS if band.region == "all" or band.region == region]


def get_band_by_label(label: str, region: Literal["r1", "r2", "r3"] = "r1") -> HamBand:
    """Look up a band by short label or full name.

    Region-specific matches are preferred for the requested region.
    """
    normalized = label.strip().casefold()
    for band in get_bands_for_region(region):
        if band.label.casefold() == normalized or band.name.casefold() == normalized:
            return band
    for band in HAM_BANDS:
        if band.label.casefold() == normalized or band.name.casefold() == normalized:
            return band
    raise ValueError(f"Unknown ham band: {label!r}")


def band_to_frequency_range(band: HamBand) -> dict[str, float | int]:
    """Convert a band definition to a default sweep range."""
    return {
        "start_mhz": band.start_mhz,
        "stop_mhz": band.stop_mhz,
        "steps": compute_steps(band.start_mhz, band.stop_mhz),
    }


def analyze_band_performance(
    results: Sequence[Any],
    region: Literal["r1", "r2", "r3"] = "r1",
    swr_threshold: float = 2.0,
) -> list[BandPerformance]:
    """Analyse simulation results across all defined bands for one region.

    Mirrors the TypeScript analyzeBandPerformance logic:
    - find all frequency points that fall inside each band
    - determine min SWR and where it occurs
    - estimate usable bandwidth where SWR <= threshold
    - compute average and peak gain across the band
    - assign a quality rating based on minimum SWR
    """
    performances: list[BandPerformance] = []

    for band in get_bands_for_region(region):
        in_band = [
            result
            for result in results
            if band.start_mhz <= float(get_field(result, "frequency_mhz")) <= band.stop_mhz
        ]

        if not in_band:
            performances.append(
                BandPerformance(
                    band=band,
                    simulated=False,
                    point_count=0,
                    min_swr=None,
                    min_swr_freq_mhz=None,
                    usable_bandwidth_khz=None,
                    avg_gain_dbi=None,
                    peak_gain_dbi=None,
                    quality="not_simulated",
                )
            )
            continue

        min_swr = math.inf
        min_swr_freq = 0.0
        for result in in_band:
            swr = float(get_field(result, "swr_50"))
            if swr < min_swr:
                min_swr = swr
                min_swr_freq = float(get_field(result, "frequency_mhz"))

        usable = [
            result
            for result in in_band
            if float(get_field(result, "swr_50")) <= swr_threshold
        ]
        usable_bandwidth_khz: int | None = None
        if usable:
            min_freq = min(float(get_field(r, "frequency_mhz")) for r in usable)
            max_freq = max(float(get_field(r, "frequency_mhz")) for r in usable)
            usable_bandwidth_khz = int(_js_round((max_freq - min_freq) * 1000))

        gains = [
            float(get_field(result, "gain_max_dbi"))
            for result in in_band
            if float(get_field(result, "gain_max_dbi")) > -999.0
        ]
        avg_gain = sum(gains) / len(gains) if gains else None
        peak_gain = max(gains) if gains else None

        if min_swr <= 1.5:
            quality: BandQuality = "excellent"
        elif min_swr <= 2.0:
            quality = "good"
        elif min_swr <= 3.0:
            quality = "marginal"
        else:
            quality = "poor"

        performances.append(
            BandPerformance(
                band=band,
                simulated=True,
                point_count=len(in_band),
                min_swr=_js_round(min_swr, 2),
                min_swr_freq_mhz=_js_round(min_swr_freq, 3),
                usable_bandwidth_khz=usable_bandwidth_khz,
                avg_gain_dbi=_js_round(avg_gain, 2) if avg_gain is not None else None,
                peak_gain_dbi=_js_round(peak_gain, 2) if peak_gain is not None else None,
                quality=quality,
            )
        )

    return performances


__all__ = [
    "BandPerformance",
    "HAM_BANDS",
    "HamBand",
    "analyze_band_performance",
    "band_to_frequency_range",
    "compute_steps",
    "get_band_by_label",
    "get_bands_for_region",
]