"""Import and export raw NEC2 .nec card deck files.

Import: Parse .nec card deck -> Wire, Excitation, Load, Ground models
Export: Generate .nec card deck from models (uses nec_input.build_card_deck)
"""

import logging
import re

from src.models.antenna import Wire, Excitation, LumpedLoad, LoadType, TransmissionLine
from src.models.ground import GroundConfig, GroundType

logger = logging.getLogger("antsim.converters.nec_file")


class NECParseError(Exception):
    """Error parsing .nec file."""
    pass


class NECFileData:
    """Parsed data from a .nec card deck file."""

    def __init__(self) -> None:
        self.comment: str = ""
        self.wires: list[Wire] = []
        self.excitations: list[Excitation] = []
        self.loads: list[LumpedLoad] = []
        self.transmission_lines: list[TransmissionLine] = []
        self.ground: GroundConfig = GroundConfig(ground_type=GroundType.FREE_SPACE)
        self.frequency_start_mhz: float = 14.0
        self.frequency_stop_mhz: float = 14.5
        self.frequency_steps: int = 11


def _parse_floats(parts: list[str], start: int, count: int) -> list[float]:
    """Parse `count` floats from `parts` starting at index `start`."""
    result: list[float] = []
    for i in range(start, start + count):
        if i < len(parts):
            try:
                result.append(float(parts[i]))
            except ValueError:
                result.append(0.0)
        else:
            result.append(0.0)
    return result


def parse_nec_file(content: str) -> NECFileData:
    """Parse a NEC2 .nec card deck file into structured data.

    Supports cards: CM, CE, GW, GE, GN, EX, LD, TL, FR, EN
    Ignores: RP, PT, XQ, NE, NH, GA, GH, GM, GR, GC, NT

    Args:
        content: The raw text content of the .nec file.

    Returns:
        NECFileData with parsed wires, excitations, loads, ground, frequency.

    Raises:
        NECParseError: If the file format is fundamentally invalid.
    """
    data = NECFileData()
    lines = content.strip().replace("\r\n", "\n").replace("\r", "\n").split("\n")

    comments: list[str] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Split into card type and fields
        # NEC2 cards: first 2 chars are the card type, rest are space-separated values
        # But many files use free-format spacing
        parts = line.split()
        if not parts:
            continue

        card = parts[0].upper()

        if card == "CM":
            # Comment
            comments.append(line[2:].strip() if len(line) > 2 else "")

        elif card == "CE":
            # Comment end
            data.comment = " ".join(comments).strip()

        elif card == "GW":
            # Wire: GW TAG SEGMENTS X1 Y1 Z1 X2 Y2 Z2 RADIUS
            if len(parts) < 10:
                logger.warning("GW card too short: %s", line)
                continue
            try:
                tag = int(parts[1])
                segments = int(parts[2])
                vals = _parse_floats(parts, 3, 7)

                wire = Wire(
                    tag=tag,
                    segments=max(1, min(200, segments)),
                    x1=vals[0], y1=vals[1], z1=vals[2],
                    x2=vals[3], y2=vals[4], z2=vals[5],
                    radius=max(0.0001, min(0.1, vals[6])),
                )
                data.wires.append(wire)
            except (ValueError, IndexError) as e:
                logger.warning("Failed to parse GW: %s — %s", line, e)

        elif card == "GN":
            # Ground: GN TYPE ...
            if len(parts) < 2:
                continue
            try:
                gn_type = int(parts[1])
                if gn_type == -1:
                    data.ground = GroundConfig(ground_type=GroundType.FREE_SPACE)
                elif gn_type == 1:
                    data.ground = GroundConfig(ground_type=GroundType.PERFECT)
                elif gn_type == 2:
                    eps_r = float(parts[5]) if len(parts) > 5 else 13.0
                    sigma = float(parts[6]) if len(parts) > 6 else 0.005
                    data.ground = GroundConfig(
                        ground_type=GroundType.CUSTOM,
                        dielectric_constant=eps_r,
                        conductivity=sigma,
                    )
            except (ValueError, IndexError):
                pass

        elif card == "EX":
            # Excitation: EX TYPE TAG SEGMENT 0 V_REAL V_IMAG
            if len(parts) < 4:
                continue
            try:
                ex_type = int(parts[1])
                if ex_type != 0:
                    continue  # Only voltage sources for now
                tag = int(parts[2])
                segment = int(parts[3])
                v_real = float(parts[5]) if len(parts) > 5 else 1.0
                v_imag = float(parts[6]) if len(parts) > 6 else 0.0
                data.excitations.append(
                    Excitation(
                        wire_tag=tag,
                        segment=segment,
                        voltage_real=v_real,
                        voltage_imag=v_imag,
                    )
                )
            except (ValueError, IndexError):
                pass

        elif card == "LD":
            # Load: LD TYPE TAG SEG_START SEG_END P1 P2 P3
            if len(parts) < 5:
                continue
            try:
                ld_type = int(parts[1])
                tag = int(parts[2])
                seg_s = int(parts[3])
                seg_e = int(parts[4])
                p1 = float(parts[5]) if len(parts) > 5 else 0.0
                p2 = float(parts[6]) if len(parts) > 6 else 0.0
                p3 = float(parts[7]) if len(parts) > 7 else 0.0

                # Map NEC2 LD types to our enum
                if ld_type in (0, 1, 4, 5):
                    data.loads.append(
                        LumpedLoad(
                            load_type=LoadType(ld_type),
                            wire_tag=tag,
                            segment_start=seg_s,
                            segment_end=seg_e,
                            param1=p1,
                            param2=p2,
                            param3=p3,
                        )
                    )
            except (ValueError, IndexError):
                pass

        elif card == "TL":
            # Transmission Line: TL TAG1 SEG1 TAG2 SEG2 Z0 LENGTH ...
            if len(parts) < 7:
                continue
            try:
                tag1 = int(parts[1])
                seg1 = int(parts[2])
                tag2 = int(parts[3])
                seg2 = int(parts[4])
                z0 = float(parts[5])
                length = float(parts[6])
                ya_r1 = float(parts[7]) if len(parts) > 7 else 0.0
                ya_i1 = float(parts[8]) if len(parts) > 8 else 0.0
                ya_r2 = float(parts[9]) if len(parts) > 9 else 0.0
                ya_i2 = float(parts[10]) if len(parts) > 10 else 0.0

                data.transmission_lines.append(
                    TransmissionLine(
                        wire_tag1=tag1,
                        segment1=seg1,
                        wire_tag2=tag2,
                        segment2=seg2,
                        impedance=max(1.0, min(1000.0, z0)),
                        length=max(0.0, min(1000.0, length)),
                        shunt_admittance_real1=ya_r1,
                        shunt_admittance_imag1=ya_i1,
                        shunt_admittance_real2=ya_r2,
                        shunt_admittance_imag2=ya_i2,
                    )
                )
            except (ValueError, IndexError):
                pass

        elif card == "FR":
            # Frequency: FR TYPE NFREQ 0 0 START_MHZ STEP_MHZ
            if len(parts) < 6:
                continue
            try:
                n_freq = int(parts[2])
                start = float(parts[5])
                step = float(parts[6]) if len(parts) > 6 else 0.0

                data.frequency_start_mhz = max(0.1, min(2000.0, start))
                data.frequency_steps = max(1, min(201, n_freq))
                if n_freq > 1 and step > 0:
                    data.frequency_stop_mhz = max(
                        data.frequency_start_mhz,
                        min(2000.0, start + step * (n_freq - 1)),
                    )
                else:
                    data.frequency_stop_mhz = data.frequency_start_mhz
            except (ValueError, IndexError):
                pass

        elif card == "EN":
            break  # End of input

    # Validate: at least one wire and one excitation
    if not data.wires:
        raise NECParseError("No GW (wire) cards found in .nec file")

    if not data.excitations and data.wires:
        # Add default excitation at center of first wire
        center_seg = (data.wires[0].segments + 1) // 2
        data.excitations.append(
            Excitation(wire_tag=data.wires[0].tag, segment=center_seg)
        )

    return data
