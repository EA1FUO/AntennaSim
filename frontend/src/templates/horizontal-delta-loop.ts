/**
 * Horizontal Delta Loop (Skyloop) antenna template.
 *
 * A full-wavelength triangular loop mounted in the horizontal plane.
 * Popular for HF operation when suspended above ground.
 *
 * Geometry (top view, looking down Z axis):
 *
 *            /\
 *           /  \      <- apex
 *          /    \
 *         /______\    <- base side (feed at center)
 *
 * The triangle lies in the XY plane at constant Z = height.
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

export const horizontalDeltaLoopTemplate: AntennaTemplate = {
  id: "horizontal-delta-loop",
  name: "Horizontal Delta Loop",
  nameShort: "H-Delta",
  description:
    "Full-wavelength horizontal triangular loop (skyloop) for multi-band HF operation.",
  longDescription:
    "A Horizontal Delta Loop (often called a skyloop) is a full-wavelength triangular " +
    "wire loop mounted parallel to the ground. It offers broad HF coverage with low noise " +
    "pickup and can be effective for both regional and DX operation depending on height " +
    "above ground. At lower heights it favors higher takeoff angles (NVIS/regional), and " +
    "at greater heights it supports lower-angle radiation. As with other full-wave loops, " +
    "feed impedance varies with installation details and may require matching.",
  icon: "/_\\",
  category: "loop",
  difficulty: "intermediate",
  bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Keep loop height as uniform as possible for predictable pattern behavior.",
    "At lower heights, expect stronger high-angle radiation (regional/NVIS).",
    "Higher installation heights improve lower-angle radiation for longer paths.",
    "Use a tuner or matching network as feed impedance can vary with installation.",
    "Perimeter is set near one wavelength at the design frequency.",
  ],
  relatedTemplates: ["delta-loop", "quad", "magnetic-loop"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Resonant frequency of the loop",
      unit: "MHz",
      min: 0.5,
      max: 2000,
      step: 0.1,
      defaultValue: 7.15,
      decimals: 3,
    },
    {
      key: "height",
      label: "Loop Height",
      description: "Height of the horizontal loop above ground",
      unit: "m",
      min: 0.5,
      max: 50,
      step: 0.5,
      defaultValue: 10,
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
    const freq = params.frequency ?? 7.15;
    const height = params.height ?? 10;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;

    // Perimeter ~= 1.02 * wavelength (slightly long for practical tuning margin)
    const perimeter = wavelength * 1.02;
    const side = perimeter / 3;
    const triHeight = side * Math.sqrt(3) / 2;

    // Coordinates chosen so triangle centroid sits at origin in XY.
    const apex = { x: 0, y: (2 * triHeight) / 3 };
    const left = { x: -side / 2, y: -triHeight / 3 };
    const right = { x: side / 2, y: -triHeight / 3 };

    const segs = autoSegment(side, maxFreq, 21);

    return [
      // Wire 1: Base side (feed at center)
      {
        tag: 1,
        segments: segs,
        x1: left.x,
        y1: left.y,
        z1: height,
        x2: right.x,
        y2: right.y,
        z2: height,
        radius,
      },
      // Wire 2: Right side to apex
      {
        tag: 2,
        segments: segs,
        x1: right.x,
        y1: right.y,
        z1: height,
        x2: apex.x,
        y2: apex.y,
        z2: height,
        radius,
      },
      // Wire 3: Apex to left side
      {
        tag: 3,
        segments: segs,
        x1: apex.x,
        y1: apex.y,
        z1: height,
        x2: left.x,
        y2: left.y,
        z2: height,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    const base = wires[0]!;
    return {
      wire_tag: base.tag,
      segment: centerSegment(base.segments),
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const freq = params.frequency ?? 7.15;
    const height = params.height ?? 10;
    const perimeter = (300.0 / freq) * 1.02;
    const side = perimeter / 3;
    const triHeight = side * Math.sqrt(3) / 2;

    // Midpoint of base side in centroid-aligned coordinate system.
    return [{ position: [0, -triHeight / 3, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.15;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
