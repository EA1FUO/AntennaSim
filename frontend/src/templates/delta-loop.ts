/**
 * Delta Loop antenna template.
 *
 * A full-wavelength triangular loop antenna. When the apex is at the top,
 * it produces a horizontally polarized pattern with low-angle radiation.
 * About 1 dB more gain than a dipole at the same height.
 *
 * Geometry (front view):
 *
 *         /\
 *        /  \     ← apex at top
 *       /    \
 *      /      \
 *     /________\  ← base wire (horizontal)
 *         ^feed
 *
 * The triangle lies in the XZ plane (broadside to Y).
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

export const deltaLoopTemplate: AntennaTemplate = {
  id: "delta-loop",
  name: "Delta Loop",
  nameShort: "Delta",
  description: "Full-wavelength triangular loop — ~1 dB more gain than a dipole.",
  longDescription:
    "The Delta Loop is a full-wavelength (1λ) wire loop in a triangular shape. " +
    "It provides approximately 1 dB more gain than a half-wave dipole at the same height, " +
    "with slightly lower noise pickup. When mounted with the apex up and fed at the bottom " +
    "center, the polarization is horizontal. The feed impedance is approximately 100-120 ohms, " +
    "which can be matched with a 4:1 balun or a quarter-wave 75-ohm coax transformer. " +
    "Delta loops are popular on 40m and 80m where their triangular shape fits between " +
    "trees or on a single tall support.",
  icon: "/\\",
  category: "loop",
  difficulty: "intermediate",
  bands: ["80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Feed impedance is ~100-120 ohms — use a 4:1 balun or 75-ohm quarter-wave match.",
    "Apex-up with bottom feed gives horizontal polarization (good for DX).",
    "Base-down with top feed gives vertical polarization (good for local comms).",
    "Perimeter = 1 wavelength; each side = λ/3 for equilateral triangle.",
    "About 1 dB more gain and lower noise than a dipole at the same height.",
  ],
  relatedTemplates: ["horizontal-delta-loop", "quad", "dipole", "magnetic-loop"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Resonant frequency of the loop",
      unit: "MHz",
      min: 0.5,
      max: 450,
      step: 0.1,
      defaultValue: 14.15,
      decimals: 3,
    },
    {
      key: "base_height",
      label: "Base Height",
      description: "Height of the bottom wire above ground",
      unit: "m",
      min: 0.5,
      max: 50,
      step: 0.5,
      defaultValue: 5,
      decimals: 1,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter",
      unit: "mm",
      min: 0.5,
      max: 10,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const baseH = params.base_height ?? 5;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;

    // Perimeter ~= 1.02 * wavelength (slightly longer for reactance tuning)
    const perimeter = wavelength * 1.02;
    // Equilateral triangle: each side = perimeter / 3
    const side = perimeter / 3;
    // Base half-width
    const halfBase = side / 2;
    // Triangle height (equilateral: h = side * sqrt(3)/2)
    const triHeight = side * Math.sqrt(3) / 2;

    const apexZ = baseH + triHeight;

    const segsBase = autoSegment(side, maxFreq, 21);
    const segsSide = autoSegment(side, maxFreq, 21);

    return [
      // Wire 1: Base (horizontal)
      {
        tag: 1,
        segments: segsBase,
        x1: -halfBase,
        y1: 0,
        z1: baseH,
        x2: halfBase,
        y2: 0,
        z2: baseH,
        radius,
      },
      // Wire 2: Right side (base right corner to apex)
      {
        tag: 2,
        segments: segsSide,
        x1: halfBase,
        y1: 0,
        z1: baseH,
        x2: 0,
        y2: 0,
        z2: apexZ,
        radius,
      },
      // Wire 3: Left side (apex to base left corner)
      {
        tag: 3,
        segments: segsSide,
        x1: 0,
        y1: 0,
        z1: apexZ,
        x2: -halfBase,
        y2: 0,
        z2: baseH,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at center of the base wire
    const base = wires[0]!;
    return {
      wire_tag: base.tag,
      segment: centerSegment(base.segments),
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const baseH = params.base_height ?? 5;
    return [{ position: [0, 0, baseH], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
