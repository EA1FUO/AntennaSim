"""Parse MMANA-GAL .maa files into AntennaSim models.

MMANA-GAL .maa file format:
  Line 1: Comment/title
  Line 2: N_wires N_loads N_sources (space separated)
  Then N_wires lines: X1 Y1 Z1 X2 Y2 Z2 Radius N_segments
  Then N_loads lines: Wire_num Seg_num R X L C
  Then N_sources lines: Wire_num Seg_num Voltage_mag Voltage_phase
  Then ground info lines...
  Then frequency info...

Note: MMANA uses coordinates in different axis convention than NEC2.
MMANA: X=forward, Y=right, Z=up  (same as NEC2: X=east, Y=north, Z=up)
The .maa format actually stores coordinates in meters.
"""

import logging
import math

from src.models.antenna import Wire, Excitation, LumpedLoad, LoadType
from src.models.ground import GroundConfig, GroundType

logger = logging.getLogger("antsim.converters.maa_import")


class MAAParseError(Exception):
    """Error parsing .maa file."""
    pass


class MAAData:
    """Parsed data from a .maa file."""

    def __init__(self) -> None:
        self.title: str = ""
        self.wires: list[Wire] = []
        self.excitations: list[Excitation] = []
        self.loads: list[LumpedLoad] = []
        self.ground: GroundConfig = GroundConfig()
        self.frequency_mhz: float = 14.0


def parse_maa(content: str) -> MAAData:
    """Parse a MMANA-GAL .maa file and return structured data.

    Args:
        content: The raw text content of the .maa file.

    Returns:
        MAAData with wires, excitations, loads, ground, frequency.

    Raises:
        MAAParseError: If the file format is invalid.
    """
    data = MAAData()
    lines = content.strip().replace("\r\n", "\n").replace("\r", "\n").split("\n")

    if len(lines) < 3:
        raise MAAParseError("File too short — expected at least title, counts, and geometry")

    # Line 0: Title / comment
    data.title = lines[0].strip()

    # Line 1: "free text frequency line" - sometimes has frequency
    # Line 2: Can be frequency info or directly counts
    # The .maa format varies by version. Let's handle the common variants.

    # Find the counts line (N_wires N_loads N_sources)
    # It's typically line 1 or after some header lines
    idx = 1
    n_wires = 0
    n_loads = 0
    n_sources = 0

    # Try to parse counts from various positions
    while idx < len(lines):
        line = lines[idx].strip()
        parts = line.split()

        # Counts line has exactly 3 integers or "*" delimited sections
        if len(parts) >= 3:
            try:
                # Handle MMANA format: "n_wires, n_loads, n_sources" or "n_wires n_loads n_sources"
                cleaned = [p.strip(",").strip("*") for p in parts[:3]]
                n_wires = int(cleaned[0])
                n_loads = int(cleaned[1])
                n_sources = int(cleaned[2])
                idx += 1
                break
            except (ValueError, IndexError):
                pass
        idx += 1

    if n_wires == 0:
        raise MAAParseError("Could not find wire count line in .maa file")

    # Parse wire geometry
    # Each wire line: X1 Y1 Z1 X2 Y2 Z2 Radius N_segments
    for i in range(n_wires):
        if idx >= len(lines):
            raise MAAParseError(f"Unexpected end of file at wire {i + 1}")

        line = lines[idx].strip()
        idx += 1

        parts = line.replace(",", " ").split()
        if len(parts) < 8:
            raise MAAParseError(f"Wire {i + 1}: expected 8 values, got {len(parts)}: {line}")

        try:
            x1 = float(parts[0])
            y1 = float(parts[1])
            z1 = float(parts[2])
            x2 = float(parts[3])
            y2 = float(parts[4])
            z2 = float(parts[5])
            radius = float(parts[6])
            segments = int(float(parts[7]))  # sometimes float in file

            # Clamp segments
            segments = max(1, min(200, segments))

            # Clamp radius
            radius = max(0.0001, min(0.1, radius))

            wire = Wire(
                tag=i + 1,
                segments=segments,
                x1=x1, y1=y1, z1=z1,
                x2=x2, y2=y2, z2=z2,
                radius=radius,
            )
            data.wires.append(wire)
        except (ValueError, IndexError) as e:
            raise MAAParseError(f"Wire {i + 1}: invalid data: {e}") from e

    # Parse loads
    for i in range(n_loads):
        if idx >= len(lines):
            break

        line = lines[idx].strip()
        idx += 1

        parts = line.replace(",", " ").split()
        if len(parts) < 4:
            continue

        try:
            wire_num = int(float(parts[0]))
            seg_num = int(float(parts[1]))

            # MMANA load format: wire seg R X L C
            r = float(parts[2]) if len(parts) > 2 else 0.0
            x = float(parts[3]) if len(parts) > 3 else 0.0
            inductance = float(parts[4]) if len(parts) > 4 else 0.0
            capacitance = float(parts[5]) if len(parts) > 5 else 0.0

            if inductance != 0 or capacitance != 0:
                # Series RLC load
                load = LumpedLoad(
                    load_type=LoadType.SERIES_RLC,
                    wire_tag=wire_num,
                    segment_start=seg_num,
                    segment_end=seg_num,
                    param1=r,
                    param2=inductance,
                    param3=capacitance,
                )
            else:
                # Fixed impedance
                load = LumpedLoad(
                    load_type=LoadType.FIXED_IMPEDANCE,
                    wire_tag=wire_num,
                    segment_start=seg_num,
                    segment_end=seg_num,
                    param1=r,
                    param2=x,
                    param3=0.0,
                )
            data.loads.append(load)
        except (ValueError, IndexError):
            continue

    # Parse sources (excitations)
    for i in range(n_sources):
        if idx >= len(lines):
            break

        line = lines[idx].strip()
        idx += 1

        parts = line.replace(",", " ").split()
        if len(parts) < 2:
            continue

        try:
            wire_num = int(float(parts[0]))
            seg_num = int(float(parts[1]))
            v_mag = float(parts[2]) if len(parts) > 2 else 1.0
            v_phase_deg = float(parts[3]) if len(parts) > 3 else 0.0

            # Convert magnitude/phase to real/imag
            v_phase_rad = math.radians(v_phase_deg)
            v_real = v_mag * math.cos(v_phase_rad)
            v_imag = v_mag * math.sin(v_phase_rad)

            excitation = Excitation(
                wire_tag=wire_num,
                segment=seg_num,
                voltage_real=v_real,
                voltage_imag=v_imag,
            )
            data.excitations.append(excitation)
        except (ValueError, IndexError):
            continue

    # If no excitations found, add default at wire 1 center
    if not data.excitations and data.wires:
        center_seg = (data.wires[0].segments + 1) // 2
        data.excitations.append(
            Excitation(wire_tag=1, segment=center_seg, voltage_real=1.0, voltage_imag=0.0)
        )

    # Try to parse ground and frequency from remaining lines
    while idx < len(lines):
        line = lines[idx].strip().lower()
        idx += 1

        # Look for frequency info
        if "mhz" in line or line.replace(".", "").replace("-", "").isdigit():
            try:
                freq = float(line.split()[0].replace(",", ""))
                if 0.1 <= freq <= 500:
                    data.frequency_mhz = freq
            except (ValueError, IndexError):
                pass

        # Look for ground type hints
        if "free" in line and "space" in line:
            data.ground = GroundConfig(ground_type=GroundType.FREE_SPACE)
        elif "perfect" in line:
            data.ground = GroundConfig(ground_type=GroundType.PERFECT)
        elif "real" in line or "average" in line:
            data.ground = GroundConfig(ground_type=GroundType.AVERAGE)

    return data
