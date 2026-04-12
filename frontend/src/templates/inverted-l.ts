/**
 * Inverted-L antenna template.
 *
 * A quarter-wave vertical with the upper portion bent horizontally.
 * Practical for HF bands where a full vertical is too tall.
 * Fed at the base with radials, like a ground-plane vertical.
 *
 * Geometry (side view):
 *
 *     ___________  ← horizontal top wire
 *     |
 *     |             ← vertical section
 *     |
 *   --+--           ← radials at base
 *     ^feed
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

export const invertedLTemplate: AntennaTemplate = {
  id: "inverted-l",
  name: "Inverted-L",
  nameShort: "Inv-L",
  description:
    "Quarter-wave vertical bent over at the top — practical HF radiator when height is limited.",
  longDescription:
    "The Inverted-L combines a vertical quarter-wave section with a horizontal top wire so the " +
    "overall radiator remains close to a quarter wavelength even when a full straight vertical " +
    "is impractical. The vertical section helps produce useful low-angle radiation, while the " +
    "horizontal section provides top loading and makes the antenna easier to fit on lower HF bands. " +
    "Like other base-fed verticals, it benefits from a good radial or counterpoise system. " +
    "Compared with a straight quarter-wave vertical, the Inverted-L usually produces mixed " +
    "polarization and somewhat different feed impedance, but it remains a classic choice for " +
    "40m and 80m installations where support height is limited.",
  icon: "┐",
  category: "vertical",
  difficulty: "beginner",
  bands: ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Keep the horizontal section away from metal supports and nearby conductors if possible.",
    "A good radial or counterpoise system is still important for efficiency and impedance stability.",
    "If the vertical section exceeds the electrical quarter-wave length, the model caps it.",
    "Drooping radials can move the feed impedance closer to 50 ohms.",
    "Expect a mix of vertical and horizontal polarization because the radiator bends at the top.",
  ],
  relatedTemplates: ["vertical", "efhw", "efhw-inverted-l"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for quarter-wave operation",
      unit: "MHz",
      min: 1,
      max: 2000,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "vertical_height",
      label: "Vertical Height",
      description: "Height of the vertical section above the feed point",
      unit: "m",
      min: 1,
      max: 30,
      step: 0.5,
      defaultValue: 6,
      decimals: 1,
    },
    {
      key: "base_height",
      label: "Base Height",
      description: "Height of the feed point and radial junction above ground",
      unit: "m",
      min: 0.3,
      max: 10,
      step: 0.1,
      defaultValue: 0.5,
      decimals: 1,
    },
    {
      key: "radial_count",
      label: "Radials",
      description: "Number of radial wires (2-8)",
      unit: "",
      min: 2,
      max: 8,
      step: 1,
      defaultValue: 4,
      decimals: 0,
    },
    {
      key: "radial_droop",
      label: "Radial Droop",
      description: "Droop angle below horizontal (0=flat, 45=drooping)",
      unit: "deg",
      min: 0,
      max: 60,
      step: 5,
      defaultValue: 0,
      decimals: 0,
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
    const verticalHeight = params.vertical_height ?? 6;
    const baseHeight = params.base_height ?? 0.5;
    const radialCount = Math.round(params.radial_count ?? 4);
    const radialDroopDeg = params.radial_droop ?? 0;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const quarterWave = (wavelength / 4) * 0.95;
    const actualVertical = Math.min(verticalHeight, quarterWave);
    const horizontalLength = Math.max(0, quarterWave - actualVertical);
    const radius = (wireDiamMm / 1000) / 2;

    const maxFreq = freq * 1.15;
    const verticalSegs = autoSegment(actualVertical, maxFreq, 11);
    const radialLength = quarterWave;
    const radialSegs = autoSegment(radialLength, maxFreq, 7);

    const topZ = baseHeight + actualVertical;
    const wires: WireGeometry[] = [];

    // Wire 1: Vertical section
    wires.push({
      tag: 1,
      segments: verticalSegs,
      x1: 0, y1: 0, z1: baseHeight,
      x2: 0, y2: 0, z2: topZ,
      radius,
    });

    let nextTag = 2;

    // Wire 2: Horizontal top section (if any)
    if (horizontalLength > 1e-6) {
      const horizontalSegs = autoSegment(horizontalLength, maxFreq, 7);
      wires.push({
        tag: nextTag,
        segments: horizontalSegs,
        x1: 0, y1: 0, z1: topZ,
        x2: horizontalLength, y2: 0, z2: topZ,
        radius,
      });
      nextTag++;
    }

    // Radials
    const droopRad = (radialDroopDeg * Math.PI) / 180;
    const radialHorizLength = radialLength * Math.cos(droopRad);
    const radialVertDrop = radialLength * Math.sin(droopRad);

    for (let i = 0; i < radialCount; i++) {
      const angle = (2 * Math.PI * i) / radialCount;
      const endX = radialHorizLength * Math.cos(angle);
      const endY = radialHorizLength * Math.sin(angle);
      const endZ = baseHeight - radialVertDrop;

      wires.push({
        tag: nextTag + i,
        segments: radialSegs,
        x1: 0, y1: 0, z1: baseHeight,
        x2: endX, y2: endY, z2: endZ,
        radius,
      });
    }

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
    const baseHeight = params.base_height ?? 0.5;
    return [{ position: [0, 0, baseHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.15;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};