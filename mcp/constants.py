"""Constants for the MCP server."""

# Frequency limits (MHz)
FREQ_MIN_MHZ = 0.1
FREQ_MAX_MHZ = 2000.0

# Frequency sweep steps
FREQ_STEPS_MIN = 1
FREQ_STEPS_MAX = 201

# End effect shortening for half-wave elements (velocity factor)
WAVELENGTH_SHORTENING_FACTOR = 0.95

# SWR thresholds
SWR_USABLE_THRESHOLD = 2.0  # SWR below which a frequency is considered "usable"

# Sentinel value for undefined/infinite VSWR
VSWR_UNDEFINED = 999.0

# Pattern classification thresholds (from ARRL Antenna Book, azimuth variation criteria)
# IEC 60050-712 defines antenna pattern characteristics
PATTERN_OMNI_DB = 3.0  # Azimuth variation < 3 dB → omnidirectional
PATTERN_NEAR_OMNI_DB = 6.0  # Azimuth variation < 6 dB → nearly omnidirectional
PATTERN_HIGHLY_DIR_DB = 15.0  # Azimuth variation > 15 dB → highly directional

# Lobe detection thresholds
LOBE_HALF_POWER_DB = 3.0  # -3 dB half-power beamwidth threshold
LOBE_MIN_SEPARATION_DEG = 20.0  # Minimum angular separation between distinct lobes

# Bidirectional pattern criteria
BIDIR_ANGLE_TOL_DEG = 40.0  # Max deviation from 180° between main lobes for bidirectional
BIDIR_GAIN_DIFF_DB = 3.0  # Max gain difference between two main lobes for bidirectional