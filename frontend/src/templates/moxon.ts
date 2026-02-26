/**
 * Moxon Rectangle antenna template.
 *
 * A compact 2-element beam with a driven element and reflector connected
 * by closely-spaced tail sections. Excellent F/B ratio in a very compact
 * footprint (~70% of a 2-element Yagi boom length).
 *
 * Geometry (top view, looking down Z axis):
 *
 *   Reflector:  A -------- B
 *                |          |   gap
 *   Driven:     D -------- C
 *                    ^feed
 *
 * Elements along X, boom along Y. Tails along Y connect the tips.
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

/**
 * Moxon dimension ratios from L.B. Cebik's work.
 * All dimensions as fractions of wavelength.
 */
function moxonDimensions(wireDiameterWavelengths: number) {
  // Empirical formulas from Cebik (QST, ARRL) for Moxon rectangle
  const d = Math.log10(wireDiameterWavelengths);

  // A = driven element half-width
  const A = 0.4834 - 0.0117 * d - 0.0006 * d * d;
  // B = tail length (driven side)
  const B = 0.0502 - 0.0192 * d - 0.0020 * d * d;
  // C = gap between tail tips
  const C = 0.0365 + 0.0143 * d + 0.0014 * d * d;
  // D = tail length (reflector side)
  const D = 0.0516 + 0.0085 * d + 0.0007 * d * d;
  // E = reflector half-width
  const E = A; // Same as driven half-width for standard Moxon

  return { A, B, C, D, E };
}

export const moxonTemplate: AntennaTemplate = {
  id: "moxon",
  name: "Moxon Rectangle",
  nameShort: "Moxon",
  description:
    "Compact 2-element beam with excellent front-to-back ratio.",
  longDescription:
    "The Moxon Rectangle is a compact directional antenna invented by Les Moxon (G6XN). " +
    "It achieves excellent front-to-back ratio (often >30 dB) with only two elements " +
    "by using closely-spaced folded-back tips that provide additional coupling. " +
    "The turning radius is about 70% of a 2-element Yagi, making it ideal for " +
    "space-constrained installations. Gain is typically 5.5-6 dBi — slightly less " +
    "than a 2-element Yagi, but with far superior F/B performance.",
  icon: "[=]",
  category: "directional",
  difficulty: "intermediate",
  bands: ["20m", "17m", "15m", "12m", "10m", "6m", "2m"],
  defaultGround: { type: "average" },
  tips: [
    "The gap between tail tips is critical — small changes significantly affect F/B ratio.",
    "Turning radius is ~70% of a 2-element Yagi — great for small lots.",
    "F/B can exceed 30 dB when properly tuned — far better than a standard Yagi.",
    "Wire diameter affects dimensions — use the Cebik formulas for best results.",
    "Can be built with wire for lower bands or tubing for VHF/UHF.",
  ],
  relatedTemplates: ["yagi", "quad", "hex-beam"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the Moxon design",
      unit: "MHz",
      min: 1,
      max: 450,
      step: 0.1,
      defaultValue: 14.15,
      decimals: 3,
    },
    {
      key: "height",
      label: "Height",
      description: "Height above ground",
      unit: "m",
      min: 2,
      max: 50,
      step: 0.5,
      defaultValue: 12,
      decimals: 1,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter",
      unit: "mm",
      min: 0.5,
      max: 25,
      step: 0.5,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const wireDiamWL = (wireDiamMm / 1000) / wavelength;
    const maxFreq = freq * 1.1;

    const dim = moxonDimensions(wireDiamWL);

    const halfA = dim.A * wavelength; // driven half-width
    const tailB = dim.B * wavelength; // driven tail length
    const gapC = dim.C * wavelength; // gap
    const tailD = dim.D * wavelength; // reflector tail length
    const halfE = dim.A * wavelength; // reflector half-width (same as driven)

    // Total boom depth = tailB + gapC + tailD
    // Driven element at y=0, reflector behind at y = -(tailB + gapC + tailD)
    const boomDepth = tailB + gapC + tailD;

    // Wire 1: Driven element (horizontal, along X)
    const segsH = autoSegment(halfA * 2, maxFreq, 21);
    // Wire 2: Reflector element (horizontal, along X)
    const segsR = autoSegment(halfE * 2, maxFreq, 21);
    // Wire 3: Left tail (driven tip down to gap), vertical along Y
    const segsTailB = autoSegment(tailB, maxFreq, 5);
    // Wire 4: Left tail (reflector tip up to gap), vertical along Y
    const segsTailD = autoSegment(tailD, maxFreq, 5);
    // Wire 5: Right tail (driven tip down to gap)
    // Wire 6: Right tail (reflector tip up to gap)

    const yDriven = 0;
    const yDrivenTail = -tailB;
    const yReflectorTail = -(tailB + gapC);
    const yReflector = -boomDepth;

    return [
      // Wire 1: Driven element
      {
        tag: 1,
        segments: segsH,
        x1: -halfA,
        y1: yDriven,
        z1: height,
        x2: halfA,
        y2: yDriven,
        z2: height,
        radius,
      },
      // Wire 2: Reflector element
      {
        tag: 2,
        segments: segsR,
        x1: -halfE,
        y1: yReflector,
        z1: height,
        x2: halfE,
        y2: yReflector,
        z2: height,
        radius,
      },
      // Wire 3: Left tail — driven tip to gap
      {
        tag: 3,
        segments: segsTailB,
        x1: -halfA,
        y1: yDriven,
        z1: height,
        x2: -halfA,
        y2: yDrivenTail,
        z2: height,
        radius,
      },
      // Wire 4: Left tail — reflector tip to gap
      {
        tag: 4,
        segments: segsTailD,
        x1: -halfE,
        y1: yReflector,
        z1: height,
        x2: -halfE,
        y2: yReflectorTail,
        z2: height,
        radius,
      },
      // Wire 5: Right tail — driven tip to gap
      {
        tag: 5,
        segments: segsTailB,
        x1: halfA,
        y1: yDriven,
        z1: height,
        x2: halfA,
        y2: yDrivenTail,
        z2: height,
        radius,
      },
      // Wire 6: Right tail — reflector tip to gap
      {
        tag: 6,
        segments: segsTailD,
        x1: halfE,
        y1: yReflector,
        z1: height,
        x2: halfE,
        y2: yReflectorTail,
        z2: height,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    const driven = wires[0]!;
    return {
      wire_tag: driven.tag,
      segment: centerSegment(driven.segments),
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.08;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
