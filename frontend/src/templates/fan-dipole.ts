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
    // Half-width of the central feed gap. All left arms join the left
    // terminal, all right arms the right terminal, and the source sits on the
    // short segment between them — so every dipole is driven differentially at
    // its center, not just the longest one.
    const feedHalfGap = 0.05;

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
      // Elements run slightly longer than a free-space half-wave: mutual
      // coupling between the closely-spaced fan elements raises each element's
      // resonant frequency, so the usual ~5% end-effect shortening would place
      // the bands too high. A factor near 1.0 centers the dips in-band.
      const halfLen = (wavelength / 2) * 1.01 / 2;
      const maxFreq = freq * 1.15;
      const segs = autoSegment(halfLen, maxFreq, 11);

      // Vertical offset: lowest band at center height, higher bands droop slightly
      // Fan spread distributes elements vertically.
      const vertOffset = selectedBands.length > 1
        ? -fanSpread * (i / (selectedBands.length - 1))
        : 0;
      const wireZ = height + vertOffset;
      // Keep each arm a fixed half-length: the fan spread tilts the element
      // (the ends drop by vertOffset) rather than stretching it. The
      // horizontal span shrinks so the conductor stays exactly halfLen, and
      // arms run from the feed terminal (±feedHalfGap) out to the tip.
      const horizSpan = Math.sqrt(Math.max(0, halfLen * halfLen - vertOffset * vertOffset));
      const tipX = feedHalfGap + horizSpan;

      // Left arm: tip → left feed terminal
      wires.push({
        tag,
        segments: segs,
        x1: -tipX,
        y1: 0,
        z1: wireZ,
        x2: -feedHalfGap,
        y2: 0,
        z2: height,
        radius,
      });
      tag++;

      // Right arm: right feed terminal → tip
      wires.push({
        tag,
        segments: segs,
        x1: feedHalfGap,
        y1: 0,
        z1: height,
        x2: tipX,
        y2: 0,
        z2: wireZ,
        radius,
      });
      tag++;
    }

    // Feed segment bridging the two terminals — the single source drives every
    // dipole across its center simultaneously.
    wires.push({
      tag,
      segments: 1,
      x1: -feedHalfGap,
      y1: 0,
      z1: height,
      x2: feedHalfGap,
      y2: 0,
      z2: height,
      radius,
    });

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed the central bridging segment (last wire) so every dipole is driven
    // differentially across its center.
    const feedSegment = wires[wires.length - 1]!;
    return {
      wire_tag: feedSegment.tag,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 10;
    const feedSegment = wires[wires.length - 1]!;
    return [{ position: [0, 0, height], wireTag: feedSegment.tag }];
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
