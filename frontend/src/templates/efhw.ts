/**
 * End-Fed Half-Wave (EFHW) antenna template.
 *
 * A half-wave wire fed at one end via a high-impedance matching
 * transformer (typically 49:1). The wire slopes from feed height
 * to a far-end height. Very popular for portable/stealth operation.
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

export const efhwTemplate: AntennaTemplate = {
  id: "efhw",
  name: "End-Fed Half-Wave",
  nameShort: "EFHW",
  description: "End-fed half-wave with transformer — easy single-support antenna.",
  longDescription:
    "An End-Fed Half-Wave (EFHW) is a half-wave wire fed at one end through a high-impedance " +
    "matching transformer (typically 49:1 unun). The antenna presents roughly 2400-5000 ohms " +
    "at the feed point, which the transformer steps down to ~50 ohms. It can be strung as a " +
    "sloper from a single support, making it ideal for portable, stealth, and field day use. " +
    "Multi-band operation is possible since harmonics (2nd, 4th) maintain high impedance at the feed.",
  icon: "—~",
  category: "wire",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "The 49:1 transformer is critical — without it, SWR will be extremely high.",
    "Works well as a sloper: feed point at top of mast, far end near ground.",
    "Resonant on even harmonics too (40m EFHW also works on 20m and 10m).",
    "Keep the feed point coax away from the wire to minimize common-mode currents.",
    "A short counterpoise wire (0.05λ) at the feed helps stabilize impedance.",
  ],
  relatedTemplates: ["dipole", "inverted-v"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Fundamental frequency for half-wave resonance",
      unit: "MHz",
      min: 0.5,
      max: 2000,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "feed_height",
      label: "Feed Height",
      description: "Height of the feed point (typically at mast top)",
      unit: "m",
      min: 1,
      max: 50,
      step: 0.5,
      defaultValue: 10,
      decimals: 1,
    },
    {
      key: "far_end_height",
      label: "Far End Height",
      description: "Height of the far end of the wire",
      unit: "m",
      min: 0.5,
      max: 50,
      step: 0.5,
      defaultValue: 3,
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
    const freq = params.frequency ?? 7.1;
    const feedHeight = params.feed_height ?? 10;
    const farEndHeight = params.far_end_height ?? 3;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const wireLength = (wavelength / 2) * 0.97; // slightly less shortening for EFHW
    const radius = (wireDiamMm / 1000) / 2;

    // Wire extends along X axis from feed point to far end
    // Height slopes from feedHeight to farEndHeight
    const maxFreq = freq * 1.15;
    const segs = autoSegment(wireLength, maxFreq, 21);

    // Short counterpoise wire (~0.05λ) hanging down from feed
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);

    return [
      // Main radiating wire
      {
        tag: 1,
        segments: segs,
        x1: 0,
        y1: 0,
        z1: feedHeight,
        x2: wireLength,
        y2: 0,
        z2: farEndHeight,
        radius,
      },
      // Short counterpoise
      {
        tag: 2,
        segments: counterpoiseSegs,
        x1: 0,
        y1: 0,
        z1: feedHeight,
        x2: -counterpoiseLength,
        y2: 0,
        z2: feedHeight,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // Feed at the beginning of wire 1 (segment 1 = end-fed)
    return {
      wire_tag: 1,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const feedHeight = params.feed_height ?? 10;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
