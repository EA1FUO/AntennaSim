"""Parse nec2c output into structured result data."""

import math
import re
import logging

from src.models.results import (
    Impedance,
    PatternData,
    FrequencyResult,
    SegmentCurrent,
)

logger = logging.getLogger("antsim.nec_output")

# Floating point in scientific notation: matches 1.4000E+01, -3.7469E+01, etc.
_SCI = r"[+-]?\d+\.\d+E[+-]\d+"
_NUM = r"[+-]?\d+\.?\d*(?:E[+-]?\d+)?"

# Frequency header: "FREQUENCY : 1.4000E+01 MHz"
_FREQUENCY_RE = re.compile(r"FREQUENCY\s*:\s*(" + _SCI + r")\s*MHZ", re.IGNORECASE)

# Antenna input parameters section header
_INPUT_PARAMS_RE = re.compile(r"ANTENNA INPUT PARAMETERS")

# Impedance data line (scientific notation):
# TAG  SEG  V_REAL  V_IMAG  I_REAL  I_IMAG  Z_REAL  Z_IMAG  Y_REAL  Y_IMAG  POWER
_IMPEDANCE_RE = re.compile(
    r"\s*(\d+)\s+(\d+)\s+"               # tag, segment
    r"(" + _SCI + r")\s+(" + _SCI + r")\s+"  # voltage real, imag
    r"(" + _SCI + r")\s+(" + _SCI + r")\s+"  # current real, imag
    r"(" + _SCI + r")\s+(" + _SCI + r")\s+"  # impedance real, imag
    r"(" + _SCI + r")\s+(" + _SCI + r")\s+"  # admittance real, imag
    r"(" + _SCI + r")"                        # power
)

# Radiation pattern section header
_PATTERN_HEADER_RE = re.compile(r"RADIATION PATTERNS")

# Pattern data line:
# THETA  PHI  VERTC_DB  HORIZ_DB  TOTAL_DB  AXIAL_RATIO  TILT  SENSE  MAG  PHASE  MAG  PHASE
_PATTERN_LINE_RE = re.compile(
    r"\s*(" + _NUM + r")\s+(" + _NUM + r")\s+"    # theta, phi
    r"(" + _NUM + r")\s+(" + _NUM + r")\s+"        # vert_db, horiz_db
    r"(" + _NUM + r")\s+"                           # total_db
    r"(" + _NUM + r")\s+(" + _NUM + r")\s+"        # axial_ratio, tilt
    r"(\w+)"                                        # sense (LINEAR, etc.)
)

# Power budget parsing:
# "POWER RADIATED"  and "POWER INPUT" lines from NEC2 output
_POWER_RADIATED_RE = re.compile(
    r"RADIATED\s+POWER\s*=\s*(" + _NUM + r")\s*WATTS", re.IGNORECASE
)
_POWER_INPUT_RE = re.compile(
    r"INPUT\s+POWER\s*=\s*(" + _NUM + r")\s*WATTS", re.IGNORECASE
)

# Current distribution section header
_CURRENT_HEADER_RE = re.compile(r"CURRENTS AND LOCATION")

# Current data line:
# SEG  TAG  X  Y  Z  LENGTH  REAL  IMAG  MAG  PHASE
_CURRENT_LINE_RE = re.compile(
    r"\s*(\d+)\s+(\d+)\s+"                            # seg, tag
    r"(" + _NUM + r")\s+(" + _NUM + r")\s+(" + _NUM + r")\s+"  # x, y, z
    r"(" + _NUM + r")\s+"                               # length
    r"(" + _NUM + r")\s+(" + _NUM + r")\s+"             # real, imag
    r"(" + _NUM + r")\s+(" + _NUM + r")"                # magnitude, phase
)


def _compute_beamwidth(
    pattern_data: list[tuple[float, float, float]],
    gain_max_dbi: float,
    gain_max_theta: float,
    gain_max_phi: float,
    theta_step: float,
    phi_step: float,
) -> tuple[float | None, float | None]:
    """Compute -3dB beamwidth in E-plane and H-plane.

    E-plane: cut at phi = gain_max_phi, sweep theta
    H-plane: cut at theta = gain_max_theta, sweep phi

    Returns (beamwidth_e_deg, beamwidth_h_deg).
    """
    if gain_max_dbi <= -999.0:
        return None, None

    threshold = gain_max_dbi - 3.0

    # Build lookup: (theta, phi) -> gain
    gain_map: dict[tuple[float, float], float] = {}
    for theta, phi, gain_db in pattern_data:
        gain_map[(round(theta, 2), round(phi, 2))] = gain_db

    # E-plane beamwidth: fixed phi = gain_max_phi, sweep theta
    e_plane_gains: list[tuple[float, float]] = []
    for (theta, phi), gain in gain_map.items():
        if abs(phi - gain_max_phi) < phi_step * 0.6:
            e_plane_gains.append((theta, gain))
    e_plane_gains.sort(key=lambda x: x[0])

    beamwidth_e = _find_beamwidth_from_cut(e_plane_gains, threshold)

    # H-plane beamwidth: fixed theta = gain_max_theta, sweep phi
    h_plane_gains: list[tuple[float, float]] = []
    for (theta, phi), gain in gain_map.items():
        if abs(theta - gain_max_theta) < theta_step * 0.6:
            h_plane_gains.append((phi, gain))
    h_plane_gains.sort(key=lambda x: x[0])

    beamwidth_h = _find_beamwidth_from_cut(h_plane_gains, threshold)

    return beamwidth_e, beamwidth_h


def _find_beamwidth_from_cut(
    sorted_gains: list[tuple[float, float]],
    threshold: float,
) -> float | None:
    """Find -3dB beamwidth from a sorted list of (angle, gain_dB) pairs.

    Finds the two angles where gain crosses the threshold on either side of
    the maximum, using linear interpolation for sub-step accuracy.
    """
    if len(sorted_gains) < 3:
        return None

    # Find the index of the peak
    peak_idx = max(range(len(sorted_gains)), key=lambda i: sorted_gains[i][1])
    peak_gain = sorted_gains[peak_idx][1]
    if peak_gain <= -999.0:
        return None

    # Search left from peak for -3dB crossing
    left_angle: float | None = None
    for i in range(peak_idx, 0, -1):
        if sorted_gains[i - 1][1] < threshold <= sorted_gains[i][1]:
            # Interpolate
            a0, g0 = sorted_gains[i - 1]
            a1, g1 = sorted_gains[i]
            dg = g1 - g0
            if abs(dg) > 1e-6:
                frac = (threshold - g0) / dg
                left_angle = a0 + frac * (a1 - a0)
            else:
                left_angle = a0
            break

    # Search right from peak for -3dB crossing
    right_angle: float | None = None
    for i in range(peak_idx, len(sorted_gains) - 1):
        if sorted_gains[i + 1][1] < threshold <= sorted_gains[i][1]:
            a0, g0 = sorted_gains[i]
            a1, g1 = sorted_gains[i + 1]
            dg = g1 - g0
            if abs(dg) > 1e-6:
                frac = (threshold - g0) / dg
                right_angle = a0 + frac * (a1 - a0)
            else:
                right_angle = a1
            break

    if left_angle is not None and right_angle is not None:
        bw = abs(right_angle - left_angle)
        return round(bw, 1)

    return None


def compute_swr(z_real: float, z_imag: float, z0: float = 50.0) -> float:
    """Compute SWR from complex impedance relative to Z0."""
    num_real = z_real - z0
    num_imag = z_imag
    den_real = z_real + z0
    den_imag = z_imag

    den_mag_sq = den_real * den_real + den_imag * den_imag
    if den_mag_sq < 1e-30:
        return 999.0

    gamma_real = (num_real * den_real + num_imag * den_imag) / den_mag_sq
    gamma_imag = (num_imag * den_real - num_real * den_imag) / den_mag_sq
    gamma_mag = math.sqrt(gamma_real * gamma_real + gamma_imag * gamma_imag)

    if gamma_mag >= 1.0:
        return 999.0

    swr = (1.0 + gamma_mag) / (1.0 - gamma_mag)
    return round(swr, 4)


def parse_nec_output(
    output: str,
    n_theta: int,
    n_phi: int,
    theta_start: float,
    theta_step: float,
    phi_start: float,
    phi_step: float,
    compute_currents: bool = False,
) -> list[FrequencyResult]:
    """Parse the complete nec2c stdout into a list of FrequencyResult."""
    results: list[FrequencyResult] = []
    lines = output.splitlines()

    current_freq: float | None = None
    current_impedance: Impedance | None = None
    current_pattern_data: list[tuple[float, float, float]] = []
    current_power_radiated: float | None = None
    current_power_input: float | None = None
    current_currents: list[SegmentCurrent] = []
    in_input_params = False
    in_pattern_section = False
    in_current_section = False
    skip_header_lines = 0

    for line in lines:
        # Check for frequency header
        freq_match = _FREQUENCY_RE.search(line)
        if freq_match:
            # Save previous frequency data
            if current_freq is not None and current_impedance is not None:
                result = _build_frequency_result(
                    current_freq, current_impedance, current_pattern_data,
                    n_theta, n_phi, theta_start, theta_step, phi_start, phi_step,
                    current_power_radiated, current_power_input,
                    current_currents if compute_currents else None,
                )
                results.append(result)

            current_freq = float(freq_match.group(1))
            current_impedance = None
            current_pattern_data = []
            current_power_radiated = None
            current_power_input = None
            current_currents = []
            in_input_params = False
            in_pattern_section = False
            in_current_section = False
            continue

        # Check for antenna input parameters section
        if _INPUT_PARAMS_RE.search(line):
            in_input_params = True
            in_pattern_section = False
            in_current_section = False
            skip_header_lines = 2  # Skip the 2 header lines after the section title
            continue

        # Parse impedance data
        if in_input_params:
            if skip_header_lines > 0:
                skip_header_lines -= 1
                continue
            imp_match = _IMPEDANCE_RE.search(line)
            if imp_match:
                z_real = float(imp_match.group(7))
                z_imag = float(imp_match.group(8))
                current_impedance = Impedance(real=round(z_real, 4), imag=round(z_imag, 4))
                in_input_params = False
                continue
            # If we hit a blank line or non-matching line, stop looking
            if line.strip() == "":
                continue

        # Check for current distribution section
        if compute_currents and _CURRENT_HEADER_RE.search(line):
            in_current_section = True
            in_pattern_section = False
            in_input_params = False
            skip_header_lines = 3  # Skip column header lines
            continue

        # Parse current data
        if in_current_section:
            if skip_header_lines > 0:
                skip_header_lines -= 1
                continue
            cur_match = _CURRENT_LINE_RE.search(line)
            if cur_match:
                seg_num = int(cur_match.group(1))
                tag_num = int(cur_match.group(2))
                cx = float(cur_match.group(3))
                cy = float(cur_match.group(4))
                cz = float(cur_match.group(5))
                # group(6) is segment length, skip
                c_real = float(cur_match.group(7))
                c_imag = float(cur_match.group(8))
                c_mag = float(cur_match.group(9))
                c_phase = float(cur_match.group(10))
                current_currents.append(SegmentCurrent(
                    tag=tag_num,
                    segment=seg_num,
                    x=round(cx, 6),
                    y=round(cy, 6),
                    z=round(cz, 6),
                    current_real=round(c_real, 8),
                    current_imag=round(c_imag, 8),
                    current_magnitude=round(c_mag, 8),
                    current_phase_deg=round(c_phase, 2),
                ))
                continue
            if line.strip() == "":
                in_current_section = False

        # Check for radiation pattern section
        if _PATTERN_HEADER_RE.search(line):
            in_pattern_section = True
            in_input_params = False
            in_current_section = False
            skip_header_lines = 3  # Skip header lines (column headers)
            continue

        # Parse pattern data
        if in_pattern_section:
            if skip_header_lines > 0:
                skip_header_lines -= 1
                continue
            pat_match = _PATTERN_LINE_RE.search(line)
            if pat_match:
                theta = float(pat_match.group(1))
                phi = float(pat_match.group(2))
                total_db = float(pat_match.group(5))
                current_pattern_data.append((theta, phi, total_db))
                continue
            # If the line is blank or doesn't match, end pattern section
            if line.strip() == "":
                in_pattern_section = False

        # Parse power budget lines (can appear anywhere in output)
        pwr_rad_match = _POWER_RADIATED_RE.search(line)
        if pwr_rad_match:
            current_power_radiated = float(pwr_rad_match.group(1))
            continue

        pwr_in_match = _POWER_INPUT_RE.search(line)
        if pwr_in_match:
            current_power_input = float(pwr_in_match.group(1))
            continue

    # Don't forget the last frequency
    if current_freq is not None and current_impedance is not None:
        result = _build_frequency_result(
            current_freq, current_impedance, current_pattern_data,
            n_theta, n_phi, theta_start, theta_step, phi_start, phi_step,
            current_power_radiated, current_power_input,
            current_currents if compute_currents else None,
        )
        results.append(result)

    return results


def _build_frequency_result(
    freq_mhz: float,
    impedance: Impedance,
    pattern_data: list[tuple[float, float, float]],
    n_theta: int,
    n_phi: int,
    theta_start: float,
    theta_step: float,
    phi_start: float,
    phi_step: float,
    power_radiated: float | None = None,
    power_input: float | None = None,
    currents: list[SegmentCurrent] | None = None,
) -> FrequencyResult:
    """Build a FrequencyResult from parsed data."""
    swr = compute_swr(impedance.real, impedance.imag)

    pattern: PatternData | None = None
    gain_max_dbi = -999.99
    gain_max_theta = 0.0
    gain_max_phi = 0.0

    if pattern_data:
        gain_grid: list[list[float]] = [
            [-999.99] * n_phi for _ in range(n_theta)
        ]

        for theta, phi, gain_db in pattern_data:
            ti = round((theta - theta_start) / theta_step)
            pi = round((phi - phi_start) / phi_step)
            if 0 <= ti < n_theta and 0 <= pi < n_phi:
                gain_grid[ti][pi] = gain_db
                if gain_db > gain_max_dbi:
                    gain_max_dbi = gain_db
                    gain_max_theta = theta
                    gain_max_phi = phi

        pattern = PatternData(
            theta_start=theta_start,
            theta_step=theta_step,
            theta_count=n_theta,
            phi_start=phi_start,
            phi_step=phi_step,
            phi_count=n_phi,
            gain_dbi=gain_grid,
        )

    # Front-to-back ratio
    front_to_back: float | None = None
    if pattern_data and gain_max_dbi > -999.0:
        back_phi = (gain_max_phi + 180.0) % 360.0
        back_gain = -999.99
        for theta, phi, gain_db in pattern_data:
            if (abs(theta - gain_max_theta) < theta_step * 0.6
                    and abs(phi - back_phi) < phi_step * 0.6):
                back_gain = max(back_gain, gain_db)
        if back_gain > -999.0:
            front_to_back = round(gain_max_dbi - back_gain, 2)

    # Beamwidth (E-plane and H-plane)
    beamwidth_e: float | None = None
    beamwidth_h: float | None = None
    if pattern_data and gain_max_dbi > -999.0:
        beamwidth_e, beamwidth_h = _compute_beamwidth(
            pattern_data, gain_max_dbi, gain_max_theta, gain_max_phi,
            theta_step, phi_step,
        )

    # Efficiency from power budget
    efficiency: float | None = None
    if (power_radiated is not None and power_input is not None
            and power_input > 1e-30):
        eff = (power_radiated / power_input) * 100.0
        efficiency = round(min(eff, 100.0), 1)

    return FrequencyResult(
        frequency_mhz=round(freq_mhz, 6),
        impedance=impedance,
        swr_50=swr,
        gain_max_dbi=round(gain_max_dbi, 2) if gain_max_dbi > -999.0 else -999.99,
        gain_max_theta=gain_max_theta,
        gain_max_phi=gain_max_phi,
        front_to_back_db=front_to_back,
        beamwidth_e_deg=beamwidth_e,
        beamwidth_h_deg=beamwidth_h,
        efficiency_percent=efficiency,
        pattern=pattern,
        currents=currents if currents else None,
    )
