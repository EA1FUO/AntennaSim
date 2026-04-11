"""Amateur radio band definitions and analysis helpers.

Ported from frontend/src/utils/ham-bands.ts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Sequence

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


HAM_BANDS: list[HamBand] = [
    HamBand("160m", "160 meters", 1.800, 2.000, 1.900, "all"),
    HamBand("80m", "80 meters", 3.500, 3.800, 3.650, "r1"),
    HamBand("80m", "80 meters", 3.500, 4.000, 3.750, "r2"),
    HamBand("60m", "60 meters", 5.3515, 5.3665, 5.359, "all"),
    HamBand("40m", "40 meters", 7.000, 7.200, 7.100, "r1"),
    HamBand("40m", "40 meters", 7.000, 7.300, 7.150, "r2"),
    HamBand("30m", "30 meters", 10.100, 10.150, 10.125, "all"),
    HamBand("20m", "20 meters", 14.000, 14.350, 14.175, "all"),
    HamBand("17m", "17 meters", 18.068, 18.168, 18.118, "all"),
    HamBand("15m", "15 meters", 21.000, 21.450, 21.225, "all"),
    HamBand("12m", "12 meters", 24.890, 24.990, 24.940, "all"),
    HamBand("10m", "10 meters", 28.000, 29.700, 28.850, "all"),
    HamBand("6m", "6 meters", 50.000, 54.000, 52.000, "all"),
    HamBand("2m", "2 meters", 144.000, 148.000, 146.000, "all"),
    HamBand("70cm", "70 cm", 420.000, 450.000, 435.000, "all"),
]


def _js_round(value: float, digits: int = 0) -> float:
    """Round like JavaScript's Math.round, including midpoint behavior."""
    factor = 10**digits
    scaled = value * factor
    if scaled >= 0:
        return math.floor(scaled + 0.5) / factor
    return math.ceil(scaled - 0.5) / factor


def compute_steps(start_mhz: float, stop_mhz: float) -> int:
    """Compute sweep points exactly like the TypeScript helper."""
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


def _result_value(result: Any, key: str) -> Any:
    """Read a field from either a mapping or an object with attributes."""
    if isinstance(result, Mapping):
        return result[key]
    return getattr(result, key)


def analyze_band_performance(
    results: Sequence[Any],
    region: Literal["r1", "r2", "r3"] = "r1",
    swr_threshold: float = 2.0,
) -> list[BandPerformance]:
    """Analyze simulation results across all defined bands for one region.

    This matches the frontend logic:
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
            if band.start_mhz <= float(_result_value(result, "frequency_mhz")) <= band.stop_mhz
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
            swr = float(_result_value(result, "swr_50"))
            if swr < min_swr:
                min_swr = swr
                min_swr_freq = float(_result_value(result, "frequency_mhz"))

        usable = [result for result in in_band if float(_result_value(result, "swr_50")) <= swr_threshold]
        usable_bandwidth_khz: int | None = None
        if usable:
            min_freq = min(float(_result_value(result, "frequency_mhz")) for result in usable)
            max_freq = max(float(_result_value(result, "frequency_mhz")) for result in usable)
            usable_bandwidth_khz = int(_js_round((max_freq - min_freq) * 1000))

        gains = [
            float(_result_value(result, "gain_max_dbi"))
            for result in in_band
            if float(_result_value(result, "gain_max_dbi")) > -999.0
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