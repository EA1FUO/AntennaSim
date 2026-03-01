/**
 * Hex Beam antenna template.
 *
 * A broadband directional antenna using a hexagonal frame with wire
 * elements in a "W" shape. Compact, lightweight, and wind-resistant.
 * Provides Yagi-like performance in a much smaller turning radius.
 *
 * Geometry (top view):
 *
 *          ___
 *         /   \       ← reflector follows hex perimeter
 *        / \_/ \      ← driven element (inner W shape)
 *        \     /
 *         \___/
 *           ^
 *      radiation direction
 *
 * The antenna is modeled as a 2-element beam with W-shaped elements
 * on a hexagonal frame. Elements along X, beam direction along Y.
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

export const hexBeamTemplate: AntennaTemplate = {
  id: "hex-beam",
  name: "Hex Beam",
  nameShort: "Hex",
  description:
    "Compact broadband beam on a hex frame — Yagi performance, smaller footprint.",
  longDescription:
    "The Hex Beam (or Hexagonal Beam) is a lightweight directional antenna that uses " +
    "wire elements bent into a W shape on a hexagonal frame. It provides performance " +
    "similar to a 2-element Yagi (5-6 dBi gain, 15-20 dB F/B) but with a significantly " +
    "smaller turning radius — about 60% of a full-size Yagi. The W-shaped elements " +
    "create broadband performance through capacitive end-loading. Hex beams are very " +
    "popular for multi-band HF operations, often covering 20m through 6m on a single " +
    "frame. Wind loading is very low due to the wire construction.",
  icon: "W",
  category: "directional",
  difficulty: "intermediate",
  bands: ["20m", "17m", "15m", "12m", "10m", "6m"],
  defaultGround: { type: "average" },
  tips: [
    "Turning radius is ~60% of an equivalent Yagi — great for small towers.",
    "Very low wind loading compared to aluminum Yagis.",
    "The W shape provides natural broadbanding through end loading.",
    "Can easily be multiband with multiple wire sets on the same frame.",
    "Element sag affects performance — keep the frame level.",
    "Typical gain 5-6 dBi with 15-20 dB F/B ratio.",
  ],
  relatedTemplates: ["moxon", "yagi", "quad"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for the hex beam design",
      unit: "MHz",
      min: 5,
      max: 2000,
      step: 0.1,
      defaultValue: 14.15,
      decimals: 3,
    },
    {
      key: "height",
      label: "Height",
      description: "Height above ground",
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
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;

    // Hex beam dimensions (empirical from G3TXQ design)
    // Driven element: W shape with total wire length ~0.46λ
    // Reflector: W shape with total wire length ~0.50λ
    // Hex frame size determines the spread

    // Half-width of the hex frame (tip to center)
    const halfWidth = wavelength * 0.23;
    // Forward/backward depth of the W bends
    const drivenDepth = wavelength * 0.07; // how far the W bends back
    const reflectorDepth = wavelength * 0.07;
    // Spacing between driven and reflector (center to center)
    const spacing = wavelength * 0.08;

    // Driven element: W shape centered at y=0
    // Points: left tip → left bend → center feed → right bend → right tip
    const dLeftTipX = -halfWidth;
    const dLeftTipY = 0;
    const dLeftBendX = -halfWidth * 0.4;
    const dLeftBendY = -drivenDepth;
    const dCenterX = 0;
    const dCenterY = 0;
    const dRightBendX = halfWidth * 0.4;
    const dRightBendY = -drivenDepth;
    const dRightTipX = halfWidth;
    const dRightTipY = 0;

    // Reflector: W shape behind driven
    const rY = -spacing;
    const rLeftTipX = -halfWidth * 1.05; // slightly wider
    const rLeftTipY = rY;
    const rLeftBendX = -halfWidth * 0.4;
    const rLeftBendY = rY - reflectorDepth;
    const rCenterX = 0;
    const rCenterY = rY;
    const rRightBendX = halfWidth * 0.4;
    const rRightBendY = rY - reflectorDepth;
    const rRightTipX = halfWidth * 1.05;
    const rRightTipY = rY;

    const segsArm = autoSegment(halfWidth * 0.6, maxFreq, 11);
    const segsMid = autoSegment(halfWidth * 0.4, maxFreq, 7);

    return [
      // Driven element (4 wires forming the W)
      // Wire 1: Left tip → Left bend
      {
        tag: 1, segments: segsArm,
        x1: dLeftTipX, y1: dLeftTipY, z1: height,
        x2: dLeftBendX, y2: dLeftBendY, z2: height,
        radius,
      },
      // Wire 2: Left bend → Center (feed)
      {
        tag: 2, segments: segsMid,
        x1: dLeftBendX, y1: dLeftBendY, z1: height,
        x2: dCenterX, y2: dCenterY, z2: height,
        radius,
      },
      // Wire 3: Center → Right bend
      {
        tag: 3, segments: segsMid,
        x1: dCenterX, y1: dCenterY, z1: height,
        x2: dRightBendX, y2: dRightBendY, z2: height,
        radius,
      },
      // Wire 4: Right bend → Right tip
      {
        tag: 4, segments: segsArm,
        x1: dRightBendX, y1: dRightBendY, z1: height,
        x2: dRightTipX, y2: dRightTipY, z2: height,
        radius,
      },
      // Reflector element (4 wires forming the W)
      // Wire 5: Left tip → Left bend
      {
        tag: 5, segments: segsArm,
        x1: rLeftTipX, y1: rLeftTipY, z1: height,
        x2: rLeftBendX, y2: rLeftBendY, z2: height,
        radius,
      },
      // Wire 6: Left bend → Center
      {
        tag: 6, segments: segsMid,
        x1: rLeftBendX, y1: rLeftBendY, z1: height,
        x2: rCenterX, y2: rCenterY, z2: height,
        radius,
      },
      // Wire 7: Center → Right bend
      {
        tag: 7, segments: segsMid,
        x1: rCenterX, y1: rCenterY, z1: height,
        x2: rRightBendX, y2: rRightBendY, z2: height,
        radius,
      },
      // Wire 8: Right bend → Right tip
      {
        tag: 8, segments: segsArm,
        x1: rRightBendX, y1: rRightBendY, z1: height,
        x2: rRightTipX, y2: rRightTipY, z2: height,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at junction of wire 2 and 3 (center of driven W)
    // Wire 2's last segment is the center feed point
    const wire2 = wires[1]!;
    return {
      wire_tag: wire2.tag,
      segment: wire2.segments,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
