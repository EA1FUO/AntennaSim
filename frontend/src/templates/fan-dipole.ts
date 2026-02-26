/**
 * Fan Dipole (multiband) antenna template.
 *
 * Multiple dipoles of different lengths fed from a common center point,
 * spread out in a fan shape. Each dipole pair is resonant on a different
 * band. The interaction between elements is usually small enough that
 * each band operates independently.
 *
 * Geometry (front view):
 *
 *     \    ____/____    /
 *      \  /    |    \  /     ← shorter dipoles (higher bands)
 *       \/     |     \/
 *    __________|__________   ← longest dipole (lowest band)
 *              ^feed
 *
 * All wires share a common center feed point at the same height.
 * Wires spread in the XZ plane (slight vertical offset for fan spacing).
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

/**
 * Band center frequencies for common HF bands (MHz).
 */
const BAND_FREQS: Record<string, number> = {
  "80m": 3.6,
  "40m": 7.1,
  "20m": 14.15,
  "15m": 21.2,
  "10m": 28.5,
};

export const fanDipoleTemplate: AntennaTemplate = {
  id: "fan-dipole",
  name: "Fan Dipole",
  nameShort: "Fan",
  description:
    "Multiband dipole with separate resonant elements for each band.",
  longDescription:
    "The Fan Dipole is a multiband antenna using multiple dipole pairs of different " +
    "lengths, all connected at a common center feed point. Each pair is cut to be resonant " +
    "on a different band, and the elements are spread apart vertically (like a fan) to " +
    "minimize interaction. This simple approach provides multiband coverage with a single " +
    "coax feed and no tuner required on the design bands. Performance on each band is " +
    "similar to a single-band dipole. Common configurations cover 3-5 HF bands.",
  icon: "=|=",
  category: "multiband",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Spread elements vertically by 0.3-0.5m to reduce interaction between bands.",
    "Start by cutting each pair for single-band resonance, then trim in place.",
    "The 15m element may need significant trimming due to interaction with the 20m element.",
    "A common feed point means only one coax run is needed.",
    "Use spreader bars (PVC, fiberglass) to maintain element spacing.",
    "Harmonically related bands (40m/15m) may interact — check SWR on both.",
  ],
  relatedTemplates: ["dipole", "g5rv", "off-center-fed"],

  parameters: [
    {
      key: "num_bands",
      label: "Number of Bands",
      description: "How many band pairs (2-5)",
      unit: "",
      min: 2,
      max: 5,
      step: 1,
      defaultValue: 3,
      decimals: 0,
    },
    {
      key: "height",
      label: "Height",
      description: "Height of the center feed point above ground",
      unit: "m",
      min: 3,
      max: 30,
      step: 0.5,
      defaultValue: 10,
      decimals: 1,
    },
    {
      key: "fan_spread",
      label: "Fan Spread",
      description: "Vertical separation between longest and shortest elements",
      unit: "m",
      min: 0.1,
      max: 3,
      step: 0.1,
      defaultValue: 1.0,
      decimals: 1,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter",
      unit: "mm",
      min: 0.5,
      max: 5,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const numBands = Math.round(params.num_bands ?? 3);
    const height = params.height ?? 10;
    const fanSpread = params.fan_spread ?? 1.0;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const radius = wireDiamMm / 1000 / 2;

    // Select bands based on numBands (from lowest to highest freq)
    const bandKeys = ["80m", "40m", "20m", "15m", "10m"];
    // Pick evenly spaced from available bands
    const selectedBands: string[] = [];
    if (numBands >= 5) {
      selectedBands.push(...bandKeys);
    } else if (numBands === 4) {
      selectedBands.push("80m", "40m", "20m", "10m");
    } else if (numBands === 3) {
      selectedBands.push("40m", "20m", "10m");
    } else {
      selectedBands.push("20m", "10m");
    }

    const wires: WireGeometry[] = [];
    let tag = 1;

    for (let i = 0; i < selectedBands.length; i++) {
      const bandKey = selectedBands[i]!;
      const freq = BAND_FREQS[bandKey]!;
      const wavelength = 300.0 / freq;
      const halfLen = (wavelength / 2) * 0.95 / 2; // half-length with end effect
      const maxFreq = freq * 1.15;
      const segs = autoSegment(halfLen, maxFreq, 11);

      // Vertical offset: lowest band at center height, higher bands droop slightly
      // Fan spread distributes elements vertically
      const vertOffset = selectedBands.length > 1
        ? -fanSpread * (i / (selectedBands.length - 1))
        : 0;
      const wireZ = height + vertOffset;

      // Left arm
      wires.push({
        tag,
        segments: segs,
        x1: -halfLen,
        y1: 0,
        z1: wireZ,
        x2: 0,
        y2: 0,
        z2: height, // all meet at center
        radius,
      });
      tag++;

      // Right arm
      wires.push({
        tag,
        segments: segs,
        x1: 0,
        y1: 0,
        z1: height, // all meet at center
        x2: halfLen,
        y2: 0,
        z2: wireZ,
        radius,
      });
      tag++;
    }

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at the junction — last segment of the first left arm wire
    const firstArm = wires[0]!;
    return {
      wire_tag: firstArm.tag,
      segment: firstArm.segments, // end closest to center
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 10;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const numBands = Math.round(params.num_bands ?? 3);
    // Show the middle band by default
    if (numBands <= 3) {
      return { start_mhz: 13.5, stop_mhz: 14.5, steps: 31 };
    } else {
      return { start_mhz: 13.5, stop_mhz: 14.5, steps: 31 };
    }
  },
};
