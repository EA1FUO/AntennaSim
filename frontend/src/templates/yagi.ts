/**
 * Yagi-Uda antenna template.
 *
 * A directional antenna with a driven element, one reflector behind,
 * and one or more directors in front. High gain, good F/B ratio.
 * Elements are along the X axis, boom along the Y axis.
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
 * Yagi element spacing and length factors relative to wavelength.
 * Based on NBS (National Bureau of Standards) optimized designs.
 */
function getYagiDesign(numElements: number): {
  lengths: number[]; // element half-lengths as fraction of λ
  positions: number[]; // element positions along boom as fraction of λ
} {
  switch (numElements) {
    case 2:
      return {
        lengths: [0.252, 0.238], // reflector, driven
        positions: [0, 0.15],
      };
    case 3:
      return {
        lengths: [0.252, 0.238, 0.226],
        positions: [0, 0.15, 0.35],
      };
    case 4:
      return {
        lengths: [0.252, 0.238, 0.224, 0.222],
        positions: [0, 0.15, 0.35, 0.55],
      };
    case 5:
      return {
        lengths: [0.252, 0.238, 0.224, 0.222, 0.220],
        positions: [0, 0.15, 0.35, 0.55, 0.75],
      };
    case 6:
    default:
      return {
        lengths: [0.252, 0.238, 0.224, 0.222, 0.220, 0.218],
        positions: [0, 0.15, 0.35, 0.55, 0.75, 0.95],
      };
  }
}

export const yagiTemplate: AntennaTemplate = {
  id: "yagi",
  name: "Yagi-Uda",
  nameShort: "Yagi",
  description: "High-gain directional beam with 2-6 elements.",
  longDescription:
    "The Yagi-Uda is the most popular directional antenna for amateur radio. It consists of " +
    "a driven element (fed dipole), a reflector behind it, and one or more directors in front. " +
    "Parasitic coupling between elements creates a directional pattern with high forward gain " +
    "and good front-to-back ratio. More elements = more gain and narrower beamwidth, but also " +
    "a longer boom and more critical tuning. A 3-element Yagi provides about 7-8 dBi gain.",
  icon: ">>|",
  category: "directional",
  difficulty: "intermediate",
  bands: ["20m", "15m", "10m", "6m", "2m"],
  defaultGround: { type: "average" },
  tips: [
    "The reflector is slightly longer than λ/2, directors slightly shorter.",
    "More elements add gain but with diminishing returns above 5-6 elements.",
    "Element spacing affects gain vs. bandwidth tradeoff.",
    "Height above ground should be at least λ/2 for good low-angle radiation.",
    "Boom length (not element count) is the primary determinant of gain.",
  ],
  relatedTemplates: ["quad", "moxon", "hex-beam"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the Yagi design",
      unit: "MHz",
      min: 1,
      max: 2000,
      step: 0.1,
      defaultValue: 14.15,
      decimals: 3,
    },
    {
      key: "num_elements",
      label: "Elements",
      description: "Number of elements (2=reflector+driven, 3+=with directors)",
      unit: "",
      min: 2,
      max: 6,
      step: 1,
      defaultValue: 3,
      decimals: 0,
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
      label: "Element Diameter",
      description: "Element tube/wire diameter",
      unit: "mm",
      min: 1,
      max: 50,
      step: 1,
      defaultValue: 12,
      decimals: 0,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 3);
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 12;

    const wavelength = 300.0 / freq;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;

    const design = getYagiDesign(numElements);
    const wires: WireGeometry[] = [];

    // Center the boom along Y axis so driven element is near origin
    // Reflector is at positions[0], driven at positions[1]
    const boomOffset = design.positions[1]! * wavelength; // offset so driven is at y=0

    for (let i = 0; i < numElements; i++) {
      const halfLen = design.lengths[i]! * wavelength;
      const boomPos = design.positions[i]! * wavelength - boomOffset;
      const segs = autoSegment(halfLen * 2, maxFreq, 11);

      wires.push({
        tag: i + 1,
        segments: segs,
        x1: -halfLen,
        y1: boomPos,
        z1: height,
        x2: halfLen,
        y2: boomPos,
        z2: height,
        radius,
      });
    }

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed the driven element (tag 2 = second element)
    const driven = wires[1]!;
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
    // Feedpoint is at center of driven element (y=0 after offset)
    return [{ position: [0, 0, height], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    // Yagis are narrower bandwidth than dipoles
    const bw = freq * 0.07;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
