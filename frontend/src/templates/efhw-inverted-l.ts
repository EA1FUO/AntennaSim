/**
 * EFHW Inverted-L antenna template.
 *
 * A half-wave end-fed wire bent into an L shape: the wire runs
 * vertically from a low feed point up to a mast top, then continues
 * horizontally. Total wire length ≈ λ/2. Fed via 49:1 transformer.
 *
 * Geometry (side view):
 *
 *     ___________  ← horizontal top (remaining λ/2 length)
 *     |
 *     |             ← vertical section
 *     |
 *     * feed        ← 49:1 transformer + counterpoise
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

export const efhwInvertedLTemplate: AntennaTemplate = {
  id: "efhw-inverted-l",
  name: "EFHW Inverted-L",
  nameShort: "EFHW-L",
  description:
    "End-fed half-wave bent into an L shape — vertical section plus horizontal top wire.",
  longDescription:
    "An EFHW Inverted-L is an End-Fed Half-Wave antenna where the wire runs vertically from " +
    "a low feed point up to the top of a mast, then continues horizontally. The total wire " +
    "length remains approximately λ/2. This layout is very practical when only a single mast " +
    "is available: the vertical section provides some low-angle radiation component, while the " +
    "horizontal top section completes the half-wave resonance. Like all EFHW antennas, a 49:1 " +
    "transformer and a short counterpoise are used at the feed point. Multiband operation on " +
    "even harmonics is possible (e.g., a 40m EFHW-L also works on 20m and 10m).",
  icon: "┐~",
  category: "wire",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "A 49:1 transformer at the feed point is essential — the end-fed impedance is several thousand ohms.",
    "The vertical section adds a useful vertical radiation component, helpful for medium-distance contacts.",
    "If the mast is taller than λ/2, the wire is entirely vertical with no horizontal section.",
    "Works on even harmonics: a 40m EFHW-L also covers 20m and 10m.",
    "Keep the counterpoise wire away from the vertical section to avoid coupling.",
    "Needs only one support point (mast top) plus a low anchor for the horizontal wire end.",
  ],
  relatedTemplates: ["efhw", "efhw-inverted-v", "inverted-l"],

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
      key: "vertical_height",
      label: "Vertical Section",
      description: "Height of the vertical wire section above the feed point",
      unit: "m",
      min: 1,
      max: 30,
      step: 0.5,
      defaultValue: 8,
      decimals: 1,
    },
    {
      key: "feed_height",
      label: "Feed Height",
      description: "Height of the feed point above ground",
      unit: "m",
      min: 0.5,
      max: 10,
      step: 0.5,
      defaultValue: 1.5,
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
    const verticalHeight = params.vertical_height ?? 8;
    const feedHeight = params.feed_height ?? 1.5;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const totalLength = (wavelength / 2) * 0.97;
    const radius = (wireDiamMm / 1000) / 2;

    const actualVertical = Math.min(verticalHeight, totalLength);
    const horizontalLength = Math.max(0, totalLength - actualVertical);

    const maxFreq = freq * 1.15;
    const verticalSegs = autoSegment(actualVertical, maxFreq, 21);
    const topZ = feedHeight + actualVertical;

    const wires: WireGeometry[] = [
      {
        tag: 1,
        segments: verticalSegs,
        x1: 0, y1: 0, z1: feedHeight,
        x2: 0, y2: 0, z2: topZ,
        radius,
      },
    ];

    if (horizontalLength > 1e-6) {
      const horizontalSegs = autoSegment(horizontalLength, maxFreq, 21);
      wires.push({
        tag: 2,
        segments: horizontalSegs,
        x1: 0, y1: 0, z1: topZ,
        x2: horizontalLength, y2: 0, z2: topZ,
        radius,
      });
    }

    // Short counterpoise
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);
    const cpTag = wires.length + 1;
    wires.push({
      tag: cpTag,
      segments: counterpoiseSegs,
      x1: 0, y1: 0, z1: feedHeight,
      x2: -counterpoiseLength, y2: 0, z2: feedHeight,
      radius,
    });

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
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
    const feedHeight = params.feed_height ?? 1.5;
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