"""Export AntSim antenna data to MMANA-GAL .maa format.

Generates a .maa file that can be opened in MMANA-GAL, MMANA-GAL basic, etc.
"""

import math
from src.models.antenna import Wire, Excitation, LumpedLoad, LoadType


def export_maa(
    title: str,
    wires: list[Wire],
    excitations: list[Excitation],
    loads: list[LumpedLoad] | None = None,
    frequency_mhz: float = 14.0,
) -> str:
    """Export antenna geometry to MMANA-GAL .maa format.

    Args:
        title: Antenna description/title.
        wires: List of Wire models.
        excitations: List of Excitation models.
        loads: Optional list of LumpedLoad models.
        frequency_mhz: Design frequency in MHz.

    Returns:
        String content of the .maa file.
    """
    lines: list[str] = []
    loads = loads or []

    # Line 0: Title
    lines.append(title or "AntSim export")

    # Line 1: Frequency info
    lines.append(f"{frequency_mhz:.6f}")

    # Line 2: Counts: N_wires N_loads N_sources
    lines.append(f"{len(wires)} {len(loads)} {len(excitations)}")

    # Wire geometry lines
    # Format: X1 Y1 Z1 X2 Y2 Z2 Radius N_segments
    for wire in wires:
        lines.append(
            f"{wire.x1:.6f}, {wire.y1:.6f}, {wire.z1:.6f}, "
            f"{wire.x2:.6f}, {wire.y2:.6f}, {wire.z2:.6f}, "
            f"{wire.radius:.6f}, {wire.segments}"
        )

    # Load lines
    # Format: Wire_num Seg_num R X L C
    for load in loads:
        if load.load_type == LoadType.SERIES_RLC:
            lines.append(
                f"{load.wire_tag}, {load.segment_start}, "
                f"{load.param1:.6g}, 0, {load.param2:.6g}, {load.param3:.6g}"
            )
        elif load.load_type == LoadType.FIXED_IMPEDANCE:
            lines.append(
                f"{load.wire_tag}, {load.segment_start}, "
                f"{load.param1:.6g}, {load.param2:.6g}, 0, 0"
            )
        else:
            # Wire conductivity and parallel RLC don't map cleanly to .maa
            lines.append(
                f"{load.wire_tag}, {load.segment_start}, "
                f"{load.param1:.6g}, {load.param2:.6g}, {load.param3:.6g}, 0"
            )

    # Source lines
    # Format: Wire_num Seg_num Voltage_mag Voltage_phase
    for ex in excitations:
        v_mag = math.sqrt(ex.voltage_real ** 2 + ex.voltage_imag ** 2)
        v_phase = math.degrees(math.atan2(ex.voltage_imag, ex.voltage_real))
        lines.append(
            f"{ex.wire_tag}, {ex.segment}, {v_mag:.6f}, {v_phase:.2f}"
        )

    # Ground section (simplified — MMANA format varies)
    lines.append("1")  # Ground type: 1 = real ground
    lines.append("13.0, 0.005")  # Average ground parameters

    # End marker
    lines.append("")

    return "\n".join(lines) + "\n"
