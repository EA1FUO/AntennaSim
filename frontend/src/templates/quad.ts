/**
 * Cubical Quad antenna template.
 *
 * A directional antenna using full-wave loop elements (square shape)
 * instead of linear dipole elements. One driven loop, one reflector
 * loop, and optionally one director loop.
 * NEC2 coordinates: X=east, Y=north, Z=up.
 *
 * Each loop is a square with side = λ/4. The loops are stacked
 * along the Y axis (boom direction). The feed is at the bottom
 * center of the driven element.
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
 * Quad element dimensions.
 * Perimeter ≈ λ for driven, slightly more for reflector, slightly less for director.
 */
function getQuadDesign(numElements: number): {
  perimeters: number[]; // as fraction of λ (driven ≈ 1.0)
  positions: number[]; // boom positions as fraction of λ
} {
  switch (numElements) {
    case 1:
      return {
        perimeters: [1.02],
        positions: [0],
      };
    case 2:
      return {
        perimeters: [1.05, 1.02], // reflector, driven
        positions: [0, 0.2],
      };
    case 3:
    default:
      return {
        perimeters: [1.05, 1.02, 0.97], // reflector, driven, director
        positions: [0, 0.2, 0.4],
      };
  }
}

export const quadTemplate: AntennaTemplate = {
  id: "quad",
  name: "Cubical Quad",
  nameShort: "Quad",
  description: "Full-wave loop beam — higher gain per element than a Yagi.",
  longDescription:
    "The Cubical Quad uses full-wave square loop elements instead of linear dipoles. " +
    "Each loop has a perimeter of approximately one wavelength. The quad provides about " +
    "1-2 dB more gain than a Yagi with the same number of elements and has lower radiation " +
    "angle. A 2-element quad (reflector + driven) gives about 7 dBi gain. The feed impedance " +
    "is approximately 100-125 ohms, requiring a matching section or 75-ohm feed with a 1.5:1 SWR.",
  icon: "[]",
  category: "directional",
  difficulty: "intermediate",
  bands: ["20m", "15m", "10m", "6m"],
  defaultGround: { type: "average" },
  tips: [
    "Feed at the bottom center of the driven loop for horizontal polarization.",
    "Feed at the side center for vertical polarization.",
    "Quad loops are less affected by nearby metallic objects than Yagi elements.",
    "A 2-element quad roughly equals a 3-element Yagi in gain.",
    "The bamboo/fiberglass spreader arms make this lighter than it looks.",
  ],
  relatedTemplates: ["yagi", "delta-loop", "hex-beam"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the quad design",
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
      description: "Number of loop elements (1-3)",
      unit: "",
      min: 1,
      max: 3,
      step: 1,
      defaultValue: 2,
      decimals: 0,
    },
    {
      key: "height",
      label: "Center Height",
      description: "Height of the loop centers above ground",
      unit: "m",
      min: 3,
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
      max: 10,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 2);
    const centerHeight = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;

    const design = getQuadDesign(numElements);
    const wires: WireGeometry[] = [];
    let tagCounter = 1;

    // Center the boom so driven element is at y=0
    const drivenIdx = numElements === 1 ? 0 : 1;
    const boomOffset = design.positions[drivenIdx]! * wavelength;

    for (let i = 0; i < numElements; i++) {
      const perimeter = design.perimeters[i]! * wavelength;
      const side = perimeter / 4;
      const halfSide = side / 2;
      const boomPos = design.positions[i]! * wavelength - boomOffset;
      const sideSegs = autoSegment(side, maxFreq, 7);

      // Square loop in the XZ plane at Y = boomPos
      // Four wires forming a square: bottom, right, top, left
      // Bottom: (-halfSide, boomPos, h-halfSide) → (+halfSide, boomPos, h-halfSide)
      const zBot = centerHeight - halfSide;
      const zTop = centerHeight + halfSide;

      // Bottom wire
      wires.push({
        tag: tagCounter++,
        segments: sideSegs,
        x1: -halfSide,
        y1: boomPos,
        z1: zBot,
        x2: halfSide,
        y2: boomPos,
        z2: zBot,
        radius,
      });

      // Right wire
      wires.push({
        tag: tagCounter++,
        segments: sideSegs,
        x1: halfSide,
        y1: boomPos,
        z1: zBot,
        x2: halfSide,
        y2: boomPos,
        z2: zTop,
        radius,
      });

      // Top wire
      wires.push({
        tag: tagCounter++,
        segments: sideSegs,
        x1: halfSide,
        y1: boomPos,
        z1: zTop,
        x2: -halfSide,
        y2: boomPos,
        z2: zTop,
        radius,
      });

      // Left wire
      wires.push({
        tag: tagCounter++,
        segments: sideSegs,
        x1: -halfSide,
        y1: boomPos,
        z1: zTop,
        x2: -halfSide,
        y2: boomPos,
        z2: zBot,
        radius,
      });
    }

    return wires;
  },

  generateExcitation(
    params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    const numElements = Math.round(params.num_elements ?? 2);
    // Feed at center of the bottom wire of the driven element loop
    // For 1 element: driven is loop 0, bottom wire is tag 1
    // For 2+ elements: driven is loop 1, bottom wire is tag 5 (4 wires per loop + 1)
    const drivenBottomTag = numElements === 1 ? 1 : 5;
    const wire = wires.find((w) => w.tag === drivenBottomTag);
    const segs = wire?.segments ?? 7;
    return {
      wire_tag: drivenBottomTag,
      segment: Math.ceil(segs / 2), // center of bottom wire
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 2);
    const centerHeight = params.height ?? 12;
    const wavelength = 300.0 / freq;

    const design = getQuadDesign(numElements);
    const drivenIdx = numElements === 1 ? 0 : 1;
    const perimeter = design.perimeters[drivenIdx]! * wavelength;
    const halfSide = perimeter / 4 / 2;
    const zBot = centerHeight - halfSide;

    // Feed at bottom center of driven loop
    return [{ position: [0, 0, zBot], wireTag: numElements === 1 ? 1 : 5 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.08;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
