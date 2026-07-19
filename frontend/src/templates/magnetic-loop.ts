/**
 * Small Magnetic Loop antenna template.
 *
 * A small transmitting loop (STL): a circle of conductor far smaller than a
 * wavelength, brought to resonance by a series tuning capacitor at the top.
 * Because the radiation resistance of a small loop is a fraction of an ohm,
 * the antenna is NOT fed directly — a small Faraday "coupling loop" near the
 * bottom is fed instead and transforms the impedance up to ~50 ohms.
 *
 * Geometry (looking along Y, the loop lies in the X-Z plane):
 *
 *            _____            ← tuning capacitor (series load) at the top
 *           /     \
 *          |       |          ← main loop, radius R
 *           \ ( ) /           ← coupling loop near the bottom (fed)
 *            \___/
 *
 * Two controls match a real magnetic loop:
 *   - Coupling Loop Size sets the feed resistance (match depth).
 *   - Capacitor Tuning peaks resonance exactly at the design frequency.
 *
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import type { LumpedLoad } from "../api/nec";
import { MAX_FREQUENCY_MHZ, MIN_FREQUENCY_MHZ } from "../engine/limits";

// Free-space permeability (H/m), used for the loop inductance.
const MU0 = 4 * Math.PI * 1e-7;
// Number of straight segments approximating the main and coupling circles.
// Each segment is its own single-segment wire with a unique tag — NEC connects
// them into a loop by coordinate coincidence, and unique tags let the feed and
// capacitor address one specific point on the ring.
const MAIN_SEGS = 36;
const COUPLING_SEGS = 12;
const MAIN_BASE_TAG = 1;
const COUPLING_BASE_TAG = MAIN_BASE_TAG + MAIN_SEGS; // 37
// Empirical capacitance correction. The segmented loop has slightly more
// inductance than the smooth-circle formula and the coupling loop adds a
// little loading; together they place resonance ~9% off if uncorrected.
// Calibrated against nec2c so the default design resonates on frequency.
const CAP_K = 0.916;

/** Derived loop dimensions shared by all template methods. */
function loopDims(params: Record<string, number>) {
  const radius = params.radius ?? 0.5; // main loop radius (m)
  const tubeDia = params.tube_dia ?? 12; // conductor diameter (mm)
  const height = params.height ?? 3; // height of the main loop centre (m)
  const couplingPct = params.coupling_size ?? 12; // coupling loop, % of main diameter
  const wireRadius = tubeDia / 1000 / 2;

  // Coupling loop radius is couplingPct% of the MAIN diameter.
  const couplingRadius = (couplingPct / 100) * radius;
  // Place the coupling loop just inside the bottom of the main loop, offset
  // slightly in Y so it couples magnetically without touching the main loop.
  const yOffset = 0.05 * radius;
  const gap = 0.1 * radius;
  const couplingCenterZ = height - radius + couplingRadius + gap;

  return { radius, wireRadius, height, couplingRadius, yOffset, couplingCenterZ };
}

/**
 * Build a circular loop (in the X-Z plane at Y=cy) as straight segments, each a
 * single-segment wire with a unique tag starting at baseTag.
 */
function buildRing(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  segments: number,
  baseTag: number,
  wireRadius: number
): WireGeometry[] {
  const wires: WireGeometry[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * 2 * Math.PI;
    const a2 = ((i + 1) / segments) * 2 * Math.PI;
    wires.push({
      tag: baseTag + i,
      segments: 1,
      x1: cx + radius * Math.cos(a1),
      y1: cy,
      z1: cz + radius * Math.sin(a1),
      x2: cx + radius * Math.cos(a2),
      y2: cy,
      z2: cz + radius * Math.sin(a2),
      radius: wireRadius,
    });
  }
  return wires;
}

/** Tag of the ring segment covering a given angle (0deg=+X, 90deg=top, 270deg=bottom). */
function ringTagAtAngle(baseTag: number, segments: number, degrees: number): number {
  return baseTag + Math.floor((degrees / 360) * segments);
}

export const magneticLoopTemplate: AntennaTemplate = {
  id: "magnetic-loop",
  name: "Small Magnetic Loop",
  nameShort: "Mag Loop",
  description: "Small transmitting loop with tuning capacitor and coupling loop — HF in tight spaces.",
  longDescription:
    "A small magnetic loop antenna (small transmitting loop / STL) is a full circle of " +
    "conductor tuned to resonance by a high-voltage series capacitor at the top. Its " +
    "radiation resistance is only a fraction of an ohm, so it is fed through a small " +
    "Faraday coupling loop near the bottom that transforms the impedance up to ~50 ohms. " +
    "Despite its small size (typically 1-3 ft for HF) it can be surprisingly efficient on " +
    "40m-10m. The pattern is broadside to the plane of the loop. Tuning is extremely sharp " +
    "(a few kHz of bandwidth), so use a narrow frequency sweep. Adjust the coupling loop " +
    "size for best SWR depth, then the capacitor tuning to peak resonance on frequency.",
  icon: "O",
  category: "loop",
  difficulty: "intermediate",
  bands: ["40m", "30m", "20m", "17m", "15m", "12m", "10m"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the loop",
      unit: "MHz",
      min: 3.5,
      max: 30,
      step: 0.1,
      defaultValue: 14.1,
      decimals: 3,
    },
    {
      key: "radius",
      label: "Loop Radius",
      description: "Radius of the main circular loop",
      unit: "m",
      min: 0.2,
      max: 2.0,
      step: 0.05,
      defaultValue: 0.5,
      decimals: 2,
    },
    {
      key: "tube_dia",
      label: "Tube Diameter",
      description: "Diameter of the conductor tube/wire (thicker = more efficient)",
      unit: "mm",
      min: 3,
      max: 25,
      step: 1,
      defaultValue: 12,
      decimals: 0,
    },
    {
      key: "coupling_size",
      label: "Coupling Loop Size",
      description: "Faraday coupling loop diameter as % of the main loop — adjust for lowest SWR",
      unit: "%",
      min: 4,
      max: 30,
      step: 1,
      defaultValue: 12,
      decimals: 0,
    },
    {
      key: "cap_tune",
      label: "Capacitor Tuning",
      description: "Fine-tune the series capacitor to peak resonance on the design frequency",
      unit: "×",
      min: 0.9,
      max: 1.1,
      step: 0.002,
      defaultValue: 1.0,
      decimals: 3,
    },
    {
      key: "height",
      label: "Center Height",
      description: "Height of the loop center above ground",
      unit: "m",
      min: 0.5,
      max: 15,
      step: 0.5,
      defaultValue: 3,
      decimals: 1,
    },
  ],

  defaultGround: { type: "average" },

  generateGeometry: (params: Record<string, number>): WireGeometry[] => {
    const { radius, wireRadius, height, couplingRadius, yOffset, couplingCenterZ } =
      loopDims(params);
    // Main loop (closed, carries the tuning capacitor, not fed directly).
    const mainLoop = buildRing(0, 0, height, radius, MAIN_SEGS, MAIN_BASE_TAG, wireRadius);
    // Coupling loop near the bottom — this is what the feedline drives.
    const couplingLoop = buildRing(
      0,
      yOffset,
      couplingCenterZ,
      couplingRadius,
      COUPLING_SEGS,
      COUPLING_BASE_TAG,
      wireRadius
    );
    return [...mainLoop, ...couplingLoop];
  },

  generateExcitation: (
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation => {
    // Feed the coupling loop at its lowest point.
    return {
      wire_tag: ringTagAtAngle(COUPLING_BASE_TAG, COUPLING_SEGS, 270),
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateLoads: (
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): LumpedLoad[] => {
    const { radius, wireRadius } = loopDims(params);
    const freq = params.frequency ?? 14.1;
    const capTune = params.cap_tune ?? 1.0;

    // Small-circular-loop inductance, then the capacitance that resonates it.
    const inductance = MU0 * radius * (Math.log((8 * radius) / wireRadius) - 2);
    const omega = 2 * Math.PI * freq * 1e6;
    const capacitance = (CAP_K * capTune) / (omega * omega * inductance);

    // Series capacitor (RLC type 0, R=0, L=0) at the top of the main loop.
    const capTag = ringTagAtAngle(MAIN_BASE_TAG, MAIN_SEGS, 90);
    return [
      {
        load_type: 0,
        wire_tag: capTag,
        segment_start: 1,
        segment_end: 1,
        param1: 0,
        param2: 0,
        param3: capacitance,
      },
    ];
  },

  generateFeedpoints: (
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] => {
    const { couplingRadius, yOffset, couplingCenterZ } = loopDims(params);
    // Bottom of the coupling loop, in NEC coords [necX, necY, necZ] — the
    // viewport applies the NEC->Three.js swap itself.
    return [
      {
        position: [0, yOffset, couplingCenterZ - couplingRadius],
        wireTag: ringTagAtAngle(COUPLING_BASE_TAG, COUPLING_SEGS, 270),
      },
    ];
  },

  defaultFrequencyRange: (params: Record<string, number>): FrequencyRange => {
    const freq = params.frequency ?? 14.1;
    // Magnetic loops are razor-narrow (a few kHz), so sweep tightly around the
    // design frequency — a wide sweep steps right over the SWR dip. The step
    // count is set adaptively downstream; a ±0.3% window keeps the null
    // resolved. Re-tune Capacitor Tuning to slide the dip into the window.
    const bw = freq * 0.003;
    return {
      start_mhz: Math.max(MIN_FREQUENCY_MHZ, freq - bw),
      stop_mhz: Math.min(MAX_FREQUENCY_MHZ, freq + bw),
      steps: 81,
    };
  },

  tips: [
    "Tuning is extremely sharp (a few kHz). Use a narrow sweep — the default spans only ±0.5%.",
    "Adjust 'Coupling Loop Size' for the deepest SWR null (it sets the feed resistance).",
    "Then nudge 'Capacitor Tuning' to slide resonance onto your exact frequency.",
    "The capacitor sees very high voltage (several kV at 100W) — use a vacuum or wide-spaced air variable.",
    "Use the largest diameter conductor you can — efficiency improves sharply with tube size.",
    "The pattern is broadside (figure-8) to the plane of the loop — rotate to aim it.",
  ],

  relatedTemplates: ["delta-loop", "quad"],
};
