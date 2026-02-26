"""Parse nec2c output into structured result data."""

import math
import re
import logging

from src.models.results import (
    Impedance,
    PatternData,
    FrequencyResult,
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
) -> list[FrequencyResult]:
    """Parse the complete nec2c stdout into a list of FrequencyResult."""
    results: list[FrequencyResult] = []
    lines = output.splitlines()

    current_freq: float | None = None
    current_impedance: Impedance | None = None
    current_pattern_data: list[tuple[float, float, float]] = []
    in_input_params = False
    in_pattern_section = False
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
                )
                results.append(result)

            current_freq = float(freq_match.group(1))
            current_impedance = None
            current_pattern_data = []
            in_input_params = False
            in_pattern_section = False
            continue

        # Check for antenna input parameters section
        if _INPUT_PARAMS_RE.search(line):
            in_input_params = True
            in_pattern_section = False
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

        # Check for radiation pattern section
        if _PATTERN_HEADER_RE.search(line):
            in_pattern_section = True
            in_input_params = False
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

    # Don't forget the last frequency
    if current_freq is not None and current_impedance is not None:
        result = _build_frequency_result(
            current_freq, current_impedance, current_pattern_data,
            n_theta, n_phi, theta_start, theta_step, phi_start, phi_step,
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

    return FrequencyResult(
        frequency_mhz=round(freq_mhz, 6),
        impedance=impedance,
        swr_50=swr,
        gain_max_dbi=round(gain_max_dbi, 2) if gain_max_dbi > -999.0 else -999.99,
        gain_max_theta=gain_max_theta,
        gain_max_phi=gain_max_phi,
        front_to_back_db=front_to_back,
        pattern=pattern,
    )
