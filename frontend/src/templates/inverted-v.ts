/**
 * Inverted V antenna template.
 *
 * A dipole with arms drooping downward from a central apex.
 * Easier to erect than a horizontal dipole (needs only one support).
 * Slightly lower gain and broader pattern than a flat dipole.
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

export const invertedVTemplate: AntennaTemplate = {
  id: "inverted-v",
  name: "Inverted V",
  nameShort: "Inv V",
  description: "Dipole with drooping arms — needs only one support point.",
  longDescription:
    "An Inverted V is a half-wave dipole with its arms sloping downward from a single " +
    "center support. The included angle between arms affects performance: " +
    "90-120 degrees is optimal. Feed impedance is lower than a flat dipole (typically 50-60 ohms) " +
    "which can be advantageous for direct coax feed. The radiation pattern is slightly more omnidirectional " +
    "than a flat dipole, with ~1 dB less maximum gain.",
  icon: "/|\\",
  category: "wire",
  difficulty: "beginner",
  bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "90-120 degree included angle gives best compromise of gain vs. impedance.",
    "At 90 degrees, feed impedance drops to ~50 ohms — perfect for direct coax feed.",
    "Wire ends should be at least 2-3m above ground for safety and performance.",
    "Broader horizontal pattern than flat dipole — less directional.",
    "Popular for portable and field day operation (one mast + two stakes).",
  ],
  relatedTemplates: ["dipole", "efhw", "delta-loop"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for half-wave resonance",
      unit: "MHz",
      min: 0.5,
      max: 450,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "apex_height",
      label: "Apex Height",
      description: "Height of the center feed point (top of mast)",
      unit: "m",
      min: 2,
      max: 100,
      step: 0.5,
      defaultValue: 12,
      decimals: 1,
    },
    {
      key: "included_angle",
      label: "Included Angle",
      description: "Angle between the two arms (90-180 deg, 180=flat dipole)",
      unit: "deg",
      min: 60,
      max: 180,
      step: 5,
      defaultValue: 120,
      decimals: 0,
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
    const freq = params.frequency ?? 7.1;
    const apexHeight = params.apex_height ?? 12;
    const includedAngle = params.included_angle ?? 120;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const armLength = (wavelength / 2) * 0.95 / 2;
    const radius = (wireDiamMm / 1000) / 2;

    // Convert included angle to droop
    // included_angle is between the two arms, measured at the apex
    const halfAngle = (includedAngle / 2) * (Math.PI / 180);
    // Horizontal extent of each arm
    const horizExtent = armLength * Math.sin(halfAngle);
    // Vertical drop of each arm from apex
    const vertDrop = armLength * Math.cos(halfAngle);
    const endHeight = apexHeight - vertDrop;

    const maxFreq = freq * 1.15;
    const segsPerArm = autoSegment(armLength, maxFreq, 11);

    return [
      {
        tag: 1,
        segments: segsPerArm,
        x1: -horizExtent,
        y1: 0,
        z1: endHeight,
        x2: 0,
        y2: 0,
        z2: apexHeight,
        radius,
      },
      {
        tag: 2,
        segments: segsPerArm,
        x1: 0,
        y1: 0,
        z1: apexHeight,
        x2: horizExtent,
        y2: 0,
        z2: endHeight,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at the top of wire 1 (junction at apex)
    const wire1 = wires[0]!;
    return {
      wire_tag: wire1.tag,
      segment: wire1.segments, // last segment = apex junction
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const apexHeight = params.apex_height ?? 12;
    return [{ position: [0, 0, apexHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
