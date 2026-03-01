/**
 * Slim Jim antenna template.
 *
 * A variation of the J-Pole where the radiating half-wave section is also
 * folded back, creating a full-wavelength element with an open end at the
 * bottom. This gives slightly more gain than a standard J-Pole (~3 dBi)
 * due to the full-wave current distribution.
 *
 * Geometry (side view):
 *
 *     |    |  ← top connection (closed)
 *     |    |  ← full-wave folded section
 *     |    |
 *     |    |  ← half-wave point
 *     |    |
 *     |(gap)|  ← open at bottom with small gap on one side
 *     |    |  ← quarter-wave matching stub
 *     |____|  ← bottom connection
 *          ^feed
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

export const slimJimTemplate: AntennaTemplate = {
  id: "slim-jim",
  name: "Slim Jim",
  nameShort: "Slim Jim",
  description:
    "Full-wave folded vertical with J-match — more gain than a standard J-Pole.",
  longDescription:
    "The Slim Jim is an end-fed folded dipole with a J-matching stub. It combines " +
    "a full-wavelength radiating section with a quarter-wave matching section, all in " +
    "a slim, vertical package. The folded design provides slightly higher gain (~3 dBi) " +
    "than a standard J-Pole due to the full-wave current distribution. The open gap at " +
    "the bottom of one side creates the necessary impedance transformation. Very popular " +
    "for portable VHF/UHF operation — can be made from 300-ohm TV twin-lead.",
  icon: "||",
  category: "vertical",
  difficulty: "beginner",
  bands: ["10m", "6m", "2m", "70cm"],
  defaultGround: { type: "average" },
  tips: [
    "Can be made from 300-ohm TV twin-lead for an ultra-lightweight portable antenna.",
    "Slightly more gain than a J-Pole due to full-wave current distribution.",
    "The gap in one side is critical — it creates the matching impedance step.",
    "Feed point tap position on the short side adjusts impedance (aim for 50 ohms).",
    "Roll up and carry in your pocket for field/emergency use (twin-lead version).",
  ],
  relatedTemplates: ["j-pole", "vertical", "efhw"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency",
      unit: "MHz",
      min: 1,
      max: 2000,
      step: 0.1,
      defaultValue: 145.0,
      decimals: 3,
    },
    {
      key: "base_height",
      label: "Base Height",
      description: "Height of the bottom above ground",
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
      description: "Gap between the two vertical conductors",
      unit: "mm",
      min: 10,
      max: 200,
      step: 5,
      defaultValue: 25,
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
    const spacingMm = params.spacing ?? 25;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const spacing = spacingMm / 1000;
    const maxFreq = freq * 1.1;

    // Quarter-wave matching stub (velocity factor ~0.95)
    const quarterWave = wavelength * 0.25 * 0.95;
    // Half-wave radiator section (end effect shortening ~0.95)
    const halfWave = wavelength * 0.5 * 0.95;
    // Full height of the folded section above the gap
    const foldedHeight = halfWave;
    // Total height = quarterWave stub + gap(tiny) + foldedHeight
    // Gap is just the open end — physically it's where the two stubs connect differently
    const gapHeight = wavelength * 0.01; // Small gap (~1% of wavelength)
    const totalHeight = quarterWave + gapHeight + foldedHeight;

    const segsLong = autoSegment(totalHeight, maxFreq, 31);
    const segsShort = autoSegment(quarterWave, maxFreq, 11);
    const segsFolded = autoSegment(foldedHeight, maxFreq, 21);
    const segsHoriz = autoSegment(spacing, maxFreq, 3);

    return [
      // Wire 1: Left side — full height (quarter-wave stub + gap + half-wave radiator)
      {
        tag: 1,
        segments: segsLong,
        x1: 0,
        y1: 0,
        z1: baseH,
        x2: 0,
        y2: 0,
        z2: baseH + totalHeight,
        radius,
      },
      // Wire 2: Right side — quarter-wave matching stub (bottom section)
      {
        tag: 2,
        segments: segsShort,
        x1: spacing,
        y1: 0,
        z1: baseH,
        x2: spacing,
        y2: 0,
        z2: baseH + quarterWave,
        radius,
      },
      // Wire 3: Right side — folded radiator section (above gap)
      {
        tag: 3,
        segments: segsFolded,
        x1: spacing,
        y1: 0,
        z1: baseH + quarterWave + gapHeight,
        x2: spacing,
        y2: 0,
        z2: baseH + totalHeight,
        radius,
      },
      // Wire 4: Bottom connection
      {
        tag: 4,
        segments: segsHoriz,
        x1: 0,
        y1: 0,
        z1: baseH,
        x2: spacing,
        y2: 0,
        z2: baseH,
        radius,
      },
      // Wire 5: Top connection
      {
        tag: 5,
        segments: segsHoriz,
        x1: 0,
        y1: 0,
        z1: baseH + totalHeight,
        x2: spacing,
        y2: 0,
        z2: baseH + totalHeight,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at bottom of the short matching stub (wire 2, segment 1)
    const stub = wires[1]!;
    return {
      wire_tag: stub.tag,
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
    const spacingMm = params.spacing ?? 25;
    const spacing = spacingMm / 1000;
    return [{ position: [spacing, 0, baseH], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 145.0;
    const bw = freq * 0.08;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
