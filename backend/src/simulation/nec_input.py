"""Build NEC2 card deck from simulation request models."""

from src.models.simulation import SimulationRequest
from src.models.ground import GroundType


def build_card_deck(request: SimulationRequest) -> str:
    """Generate a complete NEC2 input card deck from a SimulationRequest.

    Supports V1 cards: CM, CE, GW, GE, GN, EX, FR, RP, EN
    Supports V2 cards: LD (loads), TL (transmission lines), PT (current output)

    Returns the full .nec file content as a string.
    """
    lines: list[str] = []

    # Comment cards
    lines.append(f"CM {request.comment}")
    lines.append("CE")

    # ---- Geometry Section ----

    # GW cards for each wire
    for wire in request.wires:
        lines.append(
            f"GW {wire.tag} {wire.segments} "
            f"{wire.x1:.6f} {wire.y1:.6f} {wire.z1:.6f} "
            f"{wire.x2:.6f} {wire.y2:.6f} {wire.z2:.6f} "
            f"{wire.radius:.6f}"
        )

    # GA cards for wire arcs
    for arc in request.arcs:
        lines.append(
            f"GA {arc.tag} {arc.segments} "
            f"{arc.arc_radius:.6f} {arc.start_angle:.2f} {arc.end_angle:.2f} "
            f"{arc.wire_radius:.6f}"
        )

    # GM cards for geometry transforms
    for gm in request.transforms:
        lines.append(
            f"GM {gm.tag_increment} {gm.n_new_structures} "
            f"{gm.rot_x:.4f} {gm.rot_y:.4f} {gm.rot_z:.4f} "
            f"{gm.trans_x:.6f} {gm.trans_y:.6f} {gm.trans_z:.6f} "
            f"{gm.start_tag}"
        )

    # GR card for cylindrical symmetry
    if request.symmetry:
        lines.append(
            f"GR {request.symmetry.tag_increment} {request.symmetry.n_copies}"
        )

    # Geometry end
    # GE 1 if ground-connected vertical (wire touches z=0), GE 0 otherwise
    ground_type = request.ground.ground_type
    if ground_type == GroundType.FREE_SPACE:
        lines.append("GE -1")
    else:
        lines.append("GE 0")

    # ---- Program Control Section ----

    # Ground card
    if ground_type == GroundType.FREE_SPACE:
        lines.append("GN -1")
    elif ground_type == GroundType.PERFECT:
        lines.append("GN 1 0 0 0 0 0")
    else:
        eps_r, sigma = request.ground.get_nec_params()
        lines.append(f"GN 2 0 0 0 {eps_r:.4f} {sigma:.6f}")

    # V2: Loading cards (LD)
    for ld in request.loads:
        # LD TYPE TAG SEG_START SEG_END PARAM1 PARAM2 PARAM3
        lines.append(
            f"LD {ld.load_type.value} {ld.wire_tag} {ld.segment_start} {ld.segment_end} "
            f"{ld.param1:.6g} {ld.param2:.6g} {ld.param3:.6g}"
        )

    # V2: Transmission line cards (TL)
    for tl in request.transmission_lines:
        # TL TAG1 SEG1 TAG2 SEG2 Z0 LENGTH SHUNT_Y1_R SHUNT_Y1_I SHUNT_Y2_R SHUNT_Y2_I
        lines.append(
            f"TL {tl.wire_tag1} {tl.segment1} {tl.wire_tag2} {tl.segment2} "
            f"{tl.impedance:.4f} {tl.length:.6f} "
            f"{tl.shunt_admittance_real1:.6g} {tl.shunt_admittance_imag1:.6g} "
            f"{tl.shunt_admittance_real2:.6g} {tl.shunt_admittance_imag2:.6g}"
        )

    # V2: Current output control
    if request.compute_currents:
        lines.append("PT 0 0 0 0")  # Print currents normally
    else:
        lines.append("PT -1 0 0 0")  # Suppress current printout

    # Excitation cards
    for ex in request.excitations:
        lines.append(
            f"EX 0 {ex.wire_tag} {ex.segment} 0 "
            f"{ex.voltage_real:.4f} {ex.voltage_imag:.4f}"
        )

    # Frequency card
    freq = request.frequency
    lines.append(
        f"FR 0 {freq.steps} 0 0 "
        f"{freq.start_mhz:.6f} {freq.step_mhz:.6f}"
    )

    # Radiation pattern card
    pat = request.pattern
    lines.append(
        f"RP 0 {pat.n_theta} {pat.n_phi} 1000 "
        f"{pat.theta_start:.1f} {pat.phi_start:.1f} "
        f"{pat.theta_step:.1f} {pat.phi_step:.1f}"
    )

    # End card
    lines.append("EN")

    return "\n".join(lines) + "\n"
