"""Build NEC2 card deck from simulation request models."""

from src.models.simulation import SimulationRequest
from src.models.ground import GroundType


def build_card_deck(request: SimulationRequest) -> str:
    """Generate a complete NEC2 input card deck from a SimulationRequest.

    Returns the full .nec file content as a string.
    """
    lines: list[str] = []

    # Comment cards
    lines.append(f"CM {request.comment}")
    lines.append("CE")

    # Geometry: GW cards for each wire
    for wire in request.wires:
        lines.append(
            f"GW {wire.tag} {wire.segments} "
            f"{wire.x1:.6f} {wire.y1:.6f} {wire.z1:.6f} "
            f"{wire.x2:.6f} {wire.y2:.6f} {wire.z2:.6f} "
            f"{wire.radius:.6f}"
        )

    # Geometry end
    # GE 1 if ground-connected vertical (wire touches z=0), GE 0 otherwise
    ground_type = request.ground.ground_type
    if ground_type == GroundType.FREE_SPACE:
        lines.append("GE -1")
    else:
        lines.append("GE 0")

    # Ground card
    if ground_type == GroundType.FREE_SPACE:
        lines.append("GN -1")
    elif ground_type == GroundType.PERFECT:
        lines.append("GN 1 0 0 0 0 0")
    else:
        eps_r, sigma = request.ground.get_nec_params()
        lines.append(f"GN 2 0 0 0 {eps_r:.4f} {sigma:.6f}")

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
