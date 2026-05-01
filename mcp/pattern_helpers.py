"""Pure-math radiation pattern analysis helpers.

This module is intentionally free of any dependency on the installed ``mcp``
library (FastMCP) so that unit tests can import these functions without
triggering the package-name collision between our local ``mcp/`` directory
and the installed ``mcp`` package.

``server.py`` re-exports these helpers under the same ``_`` names so the
rest of the server code is unchanged.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

# Import constants — constants.py has NO FastMCP dependency
from constants import (  # type: ignore[import-not-found]
    BIDIR_ANGLE_TOL_DEG,
    BIDIR_GAIN_DIFF_DB,
    LOBE_HALF_POWER_DB,
    LOBE_MIN_SEPARATION_DEG,
    PATTERN_HIGHLY_DIR_DB,
    PATTERN_NEAR_OMNI_DB,
    PATTERN_OMNI_DB,
)


def _circular_diff(a: float, b: float) -> float:
    """Return the shortest angular distance between two bearings (degrees)."""
    d = abs((a - b) % 360.0)
    return min(d, 360.0 - d)


def _nearest_cut_gain(
    cut: Sequence[tuple[float, float]], target: float, *, circular: bool
) -> float | None:
    """Return the gain at the cut point nearest to target angle."""
    if not cut:
        return None
    if circular:
        return float(min(cut, key=lambda p: _circular_diff(p[0], target % 360.0))[1])
    return float(min(cut, key=lambda p: abs(p[0] - target))[1])


def _compute_cut_beamwidth(
    cut: Sequence[tuple[float, float]],
    peak_angle: float,
    peak_gain: float,
    *,
    circular: bool,
) -> float | None:
    """Compute -3 dB half-power beamwidth from a sorted 1-D gain cut.

    Uses the standard half-power (-3 dB) criterion as defined in
    IEEE Std 149-1979 and IEC 60050-712.  Searches left and right of
    peak_angle for the first crossing of the (peak_gain - 3 dB) threshold
    and returns their angular separation.

    Returns ``None`` if fewer than 3 points are available or if the
    threshold is not crossed on both sides of the peak.
    """
    if len(cut) < 3:
        return None
    threshold = peak_gain - 3.0
    ordered = sorted(cut, key=lambda p: p[0])
    if circular:
        extended = (
            [(a - 360.0, g) for a, g in ordered]
            + list(ordered)
            + [(a + 360.0, g) for a, g in ordered]
        )
        n = len(ordered)
        peak_idx = min(
            range(n, 2 * n),
            key=lambda i: _circular_diff(extended[i][0], peak_angle),
        )
    else:
        extended = list(ordered)
        peak_idx = min(
            range(len(extended)),
            key=lambda i: abs(extended[i][0] - peak_angle),
        )

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


def _classify_pattern_shape(
    azimuth_gains: Sequence[tuple[float, float]],
) -> dict[str, Any]:
    """Classify azimuth pattern shape using azimuth variation criteria.

    Classification thresholds follow the ARRL Antenna Book (24th ed., Ch. 2)
    and IEC 60050-712 antenna pattern terminology:

    * azimuth variation < PATTERN_OMNI_DB (3 dB) → omnidirectional
    * azimuth variation < PATTERN_NEAR_OMNI_DB (6 dB) → nearly omnidirectional
    * two lobes ≈180° apart, gain diff ≤ BIDIR_GAIN_DIFF_DB (3 dB) → bidirectional
    * azimuth variation > PATTERN_HIGHLY_DIR_DB (15 dB) → highly directional
    * otherwise → directional

    Lobe detection: a peak must have gain within LOBE_HALF_POWER_DB (3 dB)
    of the maximum; lobes closer than LOBE_MIN_SEPARATION_DEG (20°) are merged.

    Bidirectional test: the two highest lobes must be separated by ≈180°
    (tolerance BIDIR_ANGLE_TOL_DEG = 40°) with gain difference ≤ BIDIR_GAIN_DIFF_DB.
    """
    if not azimuth_gains:
        return {
            "shape": "unknown",
            "azimuth_variation_db": 0.0,
            "azimuth_stddev_db": 0.0,
            "max_gain": None,
            "min_gain": None,
            "num_lobes": 0,
        }

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

    return {
        "shape": shape,
        "azimuth_variation_db": round(variation, 2),
        "azimuth_stddev_db": round(stddev, 2),
        "max_gain": round(mx, 2),
        "min_gain": round(mn, 2),
        "num_lobes": num_lobes,
    }


__all__ = [
    "_circular_diff",
    "_classify_pattern_shape",
    "_compute_cut_beamwidth",
    "_nearest_cut_gain",
]