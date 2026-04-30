/**
 * Random Wire antenna template.
 *
 * A non-resonant end-fed long wire with a short counterpoise.
 * Used with a tuner and matching transformer for multiband HF.
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

export const randomWireTemplate: AntennaTemplate = {
  id: "random-wire",
  name: "Random Wire",
  nameShort: "Rnd Wire",
  description:
    "End-fed non-resonant long wire with a short counterpoise.",
  longDescription:
    "A random wire antenna is a non-resonant end-fed wire that is intentionally not cut to a " +
    "specific half-wave multiple. It is commonly used with an antenna tuner and a matching " +
    "transformer or unun. Because feedpoint impedance can vary widely with frequency, a " +
    "counterpoise or other RF return path at the feed point is important for predictable " +
    "operation. Random wires are popular for portable HF use because they are easy to deploy: " +
    "raise one end, slope the far end down, add a tuner and counterpoise, and operate across " +
    "multiple bands.",
  icon: "↗",
  category: "wire",
  difficulty: "beginner",
  bands: ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Random wires usually need an external tuner and often benefit from a 9:1 matching transformer.",
    "A short counterpoise at the feed helps provide a more stable RF return path.",
    "Keep the feedline away from the radiating wire to reduce common-mode current.",
    "Avoid wire lengths that create extreme feedpoint impedances on your most-used bands.",
    "The model preserves the requested total wire length; impossible height differences are rejected.",
  ],
  relatedTemplates: ["efhw", "inverted-l", "g5rv"],

  parameters: [
    {
      key: "frequency",
      label: "Center of Interest",
      description: "Frequency of interest for segmentation and default sweep",
      unit: "MHz",
      min: 0.5,
      max: 30,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "wire_length",
      label: "Wire Length",
      description: "Total length of the radiating wire",
      unit: "m",
      min: 5,
      max: 100,
      step: 0.5,
      defaultValue: 25,
      decimals: 1,
    },
    {
      key: "feed_height",
      label: "Feed Height",
      description: "Height of the feed end above ground",
      unit: "m",
      min: 1,
      max: 30,
      step: 0.5,
      defaultValue: 8,
      decimals: 1,
    },
    {
      key: "far_end_height",
      label: "Far End Height",
      description: "Height of the far end above ground",
      unit: "m",
      min: 0.5,
      max: 30,
      step: 0.5,
      defaultValue: 3,
      decimals: 1,
    },
    {
      key: "counterpoise_length",
      label: "Counterpoise Length",
      description: "Length of the short feedpoint counterpoise",
      unit: "m",
      min: 1,
      max: 20,
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
    const freq = params.frequency ?? 7.1;
    const wireLength = params.wire_length ?? 25;
    const feedHeight = params.feed_height ?? 8;
    const farEndHeight = params.far_end_height ?? 3;
    const counterpoiseLength = params.counterpoise_length ?? 5;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const heightDelta = farEndHeight - feedHeight;
    const horizontalRun = Math.sqrt(
      Math.max(0, wireLength * wireLength - heightDelta * heightDelta)
    );
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;

    const mainSegs = autoSegment(wireLength, maxFreq, 21);
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);

    return [
      {
        tag: 1,
        segments: mainSegs,
        x1: 0, y1: 0, z1: feedHeight,
        x2: horizontalRun, y2: 0, z2: farEndHeight,
        radius,
      },
      {
        tag: 2,
        segments: counterpoiseSegs,
        x1: 0, y1: 0, z1: feedHeight,
        x2: -counterpoiseLength, y2: 0, z2: feedHeight,
        radius,
      },
    ];
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
    const feedHeight = params.feed_height ?? 8;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.2;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};