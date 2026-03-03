/**
 * Build NEC2 card deck from a SimulateAdvancedRequest.
 *
 * TypeScript port of backend/src/simulation/nec_input.py.
 * Used by the WASM engine to generate .nec input locally in the browser.
 */

import type { SimulateAdvancedRequest } from "../types";
import { GROUND_PARAMS } from "../ground";

/**
 * Format a number with Python's :.6g equivalent (6 significant digits,
 * trimming trailing zeros, using exponential notation when needed).
 */
function fmt6g(n: number): string {
  return Number(n.toPrecision(6)).toString();
}

/**
 * Generate a complete NEC2 input card deck from a SimulateAdvancedRequest.
 *
 * Card order: CM, CE, GW, GA, GM, GR, GE, GN, LD, TL, PT, EX, FR, NE, RP, EN
 */
export function buildCardDeck(request: SimulateAdvancedRequest): string {
  const lines: string[] = [];

  // ---- Comment cards ----
  const comment = request.comment ?? "AntennaSim simulation";
  lines.push(`CM ${comment}`);
  lines.push("CE");

  // ---- Geometry Section ----

  // GW cards for each wire
  for (const wire of request.wires) {
    lines.push(
      `GW ${wire.tag} ${wire.segments} ` +
        `${wire.x1.toFixed(6)} ${wire.y1.toFixed(6)} ${wire.z1.toFixed(6)} ` +
        `${wire.x2.toFixed(6)} ${wire.y2.toFixed(6)} ${wire.z2.toFixed(6)} ` +
        `${wire.radius.toFixed(6)}`
    );
  }

  // GA cards for wire arcs
  for (const arc of request.arcs ?? []) {
    lines.push(
      `GA ${arc.tag} ${arc.segments} ` +
        `${arc.arc_radius.toFixed(6)} ${arc.start_angle.toFixed(2)} ${arc.end_angle.toFixed(2)} ` +
        `${arc.wire_radius.toFixed(6)}`
    );
  }

  // GM cards for geometry transforms
  for (const gm of request.transforms ?? []) {
    lines.push(
      `GM ${gm.tag_increment} ${gm.n_new_structures} ` +
        `${(gm.rot_x ?? 0).toFixed(4)} ${(gm.rot_y ?? 0).toFixed(4)} ${(gm.rot_z ?? 0).toFixed(4)} ` +
        `${(gm.trans_x ?? 0).toFixed(6)} ${(gm.trans_y ?? 0).toFixed(6)} ${(gm.trans_z ?? 0).toFixed(6)} ` +
        `${gm.start_tag ?? 0}`
    );
  }

  // GR card for cylindrical symmetry
  if (request.symmetry) {
    lines.push(
      `GR ${request.symmetry.tag_increment} ${request.symmetry.n_copies}`
    );
  }

  // ---- Geometry end ----
  const groundType = request.ground.type;
  if (groundType === "free_space") {
    lines.push("GE -1");
  } else {
    lines.push("GE 0");
  }

  // ---- Program Control Section ----

  // Ground card
  if (groundType === "free_space") {
    lines.push("GN -1");
  } else if (groundType === "perfect") {
    lines.push("GN 1 0 0 0 0 0");
  } else {
    let epsR: number;
    let sigma: number;

    if (groundType === "custom") {
      epsR = request.ground.custom_permittivity ?? 13;
      sigma = request.ground.custom_conductivity ?? 0.005;
    } else {
      const params = GROUND_PARAMS[groundType] ?? GROUND_PARAMS.average!;
      epsR = params.permittivity;
      sigma = params.conductivity;
    }

    lines.push(`GN 2 0 0 0 ${epsR.toFixed(4)} ${sigma.toFixed(6)}`);
  }

  // LD cards (lumped loads)
  for (const ld of request.loads ?? []) {
    lines.push(
      `LD ${ld.load_type} ${ld.wire_tag} ${ld.segment_start} ${ld.segment_end} ` +
        `${fmt6g(ld.param1)} ${fmt6g(ld.param2)} ${fmt6g(ld.param3)}`
    );
  }

  // TL cards (transmission lines)
  for (const tl of request.transmission_lines ?? []) {
    lines.push(
      `TL ${tl.wire_tag1} ${tl.segment1} ${tl.wire_tag2} ${tl.segment2} ` +
        `${tl.impedance.toFixed(4)} ${tl.length.toFixed(6)} ` +
        `${fmt6g(tl.shunt_admittance_real1 ?? 0)} ${fmt6g(tl.shunt_admittance_imag1 ?? 0)} ` +
        `${fmt6g(tl.shunt_admittance_real2 ?? 0)} ${fmt6g(tl.shunt_admittance_imag2 ?? 0)}`
    );
  }

  // PT card (current output control)
  if (request.compute_currents ?? true) {
    lines.push("PT 0 0 0 0"); // Print currents normally
  } else {
    lines.push("PT -1 0 0 0"); // Suppress current printout
  }

  // EX cards (excitations)
  for (const ex of request.excitations) {
    lines.push(
      `EX 0 ${ex.wire_tag} ${ex.segment} 0 ` +
        `${ex.voltage_real.toFixed(4)} ${ex.voltage_imag.toFixed(4)}`
    );
  }

  // FR card (frequency)
  const freq = request.frequency;
  const stepMhz =
    freq.steps > 1
      ? (freq.stop_mhz - freq.start_mhz) / (freq.steps - 1)
      : 0;
  lines.push(
    `FR 0 ${freq.steps} 0 0 ` +
      `${freq.start_mhz.toFixed(6)} ${stepMhz.toFixed(6)}`
  );

  // NE card (near-field) — not included in advanced request type,
  // but placeholder kept for card ordering if the type is extended.

  // RP card (radiation pattern)
  const patternStep = request.pattern_step ?? 5;
  const nTheta = Math.floor(180 / patternStep) + 1;
  const nPhi = Math.floor(360 / patternStep);
  lines.push(
    `RP 0 ${nTheta} ${nPhi} 1000 ` +
      `${(-90.0).toFixed(1)} ${(0.0).toFixed(1)} ` +
      `${patternStep.toFixed(1)} ${patternStep.toFixed(1)}`
  );

  // EN card
  lines.push("EN");

  return lines.join("\n") + "\n";
}
