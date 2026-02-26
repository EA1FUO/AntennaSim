/**
 * J-Pole antenna template.
 *
 * A half-wave vertical antenna fed at the bottom through a quarter-wave
 * matching stub. Provides omnidirectional coverage with slight gain.
 * The "J" shape comes from the matching section folded back at the bottom.
 *
 * Geometry (side view):
 *
 *     |  ← radiating element (3/4 λ total from bottom)
 *     |
 *     |  |  ← shorter stub (1/4 λ)
 *     |  |
 *     |__|  ← bottom connection
 *        ^feed (at bottom of short side)
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
import { autoSegment } from "../engine/segmentation";

export const jPoleTemplate: AntennaTemplate = {
  id: "j-pole",
  name: "J-Pole",
  nameShort: "J-Pole",
  description: "End-fed half-wave vertical with quarter-wave matching stub.",
  longDescription:
    "The J-Pole is a half-wave vertical antenna with an integrated quarter-wave " +
    "matching section (J-matching stub). It provides omnidirectional radiation with " +
    "approximately 2-3 dBi gain and a low-angle pattern ideal for VHF/UHF. " +
    "The matching stub transforms the high impedance at the end of the half-wave " +
    "element to approximately 50 ohms. Popular for 2m and 70cm FM, and also works " +
    "well on HF bands. No radials required.",
  icon: "J|",
  category: "vertical",
  difficulty: "beginner",
  bands: ["10m", "6m", "2m", "70cm"],
  defaultGround: { type: "average" },
  tips: [
    "Feed point height on the short stub affects impedance — adjust for best SWR.",
    "The spacing between the two vertical sections is typically 1-2 inches (25-50mm).",
    "No ground radials needed — the J-match provides the current return path.",
    "Can be made from ladder line, copper pipe, or aluminum tubing.",
    "Excellent choice for a portable or emergency VHF/UHF antenna.",
  ],
  relatedTemplates: ["slim-jim", "vertical", "efhw"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency",
      unit: "MHz",
      min: 1,
      max: 450,
      step: 0.1,
      defaultValue: 145.0,
      decimals: 3,
    },
    {
      key: "base_height",
      label: "Base Height",
      description: "Height of the bottom of the J above ground",
      unit: "m",
      min: 0.1,
      max: 30,
      step: 0.1,
      defaultValue: 1.5,
      decimals: 1,
    },
    {
      key: "spacing",
      label: "Element Spacing",
      description: "Gap between the two vertical sections",
      unit: "mm",
      min: 10,
      max: 200,
      step: 5,
      defaultValue: 50,
      decimals: 0,
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
    const freq = params.frequency ?? 145.0;
    const baseH = params.base_height ?? 1.5;
    const spacingMm = params.spacing ?? 50;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const spacing = spacingMm / 1000;
    const maxFreq = freq * 1.1;

    // Quarter-wave stub length (with velocity factor ~0.95 for open wire)
    const quarterWave = wavelength * 0.25 * 0.95;
    // Half-wave radiator length (with end effect shortening ~0.95)
    const halfWave = wavelength * 0.5 * 0.95;

    // Long side: total height = quarterWave + halfWave (3/4 wave total)
    const longTotal = quarterWave + halfWave;
    // Short side: quarterWave only
    const shortTotal = quarterWave;

    const segsLong = autoSegment(longTotal, maxFreq, 21);
    const segsShort = autoSegment(shortTotal, maxFreq, 11);
    const segsBottom = autoSegment(spacing, maxFreq, 3);

    return [
      // Wire 1: Long vertical (radiating element + stub)
      {
        tag: 1,
        segments: segsLong,
        x1: 0,
        y1: 0,
        z1: baseH,
        x2: 0,
        y2: 0,
        z2: baseH + longTotal,
        radius,
      },
      // Wire 2: Short vertical (matching stub)
      {
        tag: 2,
        segments: segsShort,
        x1: spacing,
        y1: 0,
        z1: baseH,
        x2: spacing,
        y2: 0,
        z2: baseH + shortTotal,
        radius,
      },
      // Wire 3: Bottom connection (horizontal)
      {
        tag: 3,
        segments: segsBottom,
        x1: 0,
        y1: 0,
        z1: baseH,
        x2: spacing,
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
    // Feed at the bottom of the short stub (segment 1)
    const shortStub = wires[1]!;
    return {
      wire_tag: shortStub.tag,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const baseH = params.base_height ?? 1.5;
    const spacingMm = params.spacing ?? 50;
    const spacing = spacingMm / 1000;
    return [{ position: [spacing, 0, baseH], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 145.0;
    const bw = freq * 0.08;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
