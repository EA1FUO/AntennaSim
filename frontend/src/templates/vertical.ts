/**
 * Ground Plane Vertical antenna template.
 *
 * A quarter-wave vertical element with elevated radials.
 * Omnidirectional pattern in the horizontal plane.
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

export const verticalTemplate: AntennaTemplate = {
  id: "vertical",
  name: "Ground Plane Vertical",
  nameShort: "Vertical",
  description: "Quarter-wave vertical with radials — omnidirectional, low-angle radiation.",
  longDescription:
    "A ground plane vertical consists of a quarter-wave vertical radiator with horizontal or " +
    "slightly drooping radial wires at its base. It produces an omnidirectional pattern in the " +
    "horizontal plane with peak radiation at low elevation angles — excellent for DX. " +
    "Feed impedance is approximately 36 ohms with horizontal radials (use a 4:1 or adjust radial droop). " +
    "With drooping radials at 45 degrees, impedance rises to ~50 ohms for direct coax feed.",
  icon: "⊥",
  category: "vertical",
  difficulty: "beginner",
  bands: ["40m", "20m", "15m", "10m", "6m", "2m"],
  defaultGround: { type: "average" },
  tips: [
    "4 radials is the minimum; more radials improve ground plane but with diminishing returns.",
    "Droop radials at 45 degrees to raise impedance toward 50 ohms.",
    "Elevated radials (not on ground) are more efficient than buried radials.",
    "Height of the radial junction above ground affects low-angle performance.",
    "For 20m band: vertical ~5.1m, radials ~5.1m each.",
  ],
  relatedTemplates: ["j-pole", "slim-jim", "efhw"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for quarter-wave resonance",
      unit: "MHz",
      min: 1,
      max: 450,
      step: 0.1,
      defaultValue: 14.2,
      decimals: 3,
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
      key: "base_height",
      label: "Base Height",
      description: "Height of the radial junction above ground",
      unit: "m",
      min: 0.3,
      max: 30,
      step: 0.1,
      defaultValue: 0.5,
      decimals: 1,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter",
      unit: "mm",
      min: 0.5,
      max: 25,
      step: 0.5,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.2;
    const radialCount = Math.round(params.radial_count ?? 4);
    const radialDroopDeg = params.radial_droop ?? 0;
    const baseHeight = params.base_height ?? 0.5;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const quarterWave = (wavelength / 4) * 0.95; // 5% shortening
    const radius = (wireDiamMm / 1000) / 2;

    const maxFreq = freq * 1.15;
    const verticalSegs = autoSegment(quarterWave, maxFreq, 11);
    const radialLength = quarterWave;
    const radialSegs = autoSegment(radialLength, maxFreq, 7);

    const wires: WireGeometry[] = [];

    // Vertical element (tag 1)
    wires.push({
      tag: 1,
      segments: verticalSegs,
      x1: 0,
      y1: 0,
      z1: baseHeight,
      x2: 0,
      y2: 0,
      z2: baseHeight + quarterWave,
      radius,
    });

    // Radials (tags 2, 3, 4, ...)
    const droopRad = (radialDroopDeg * Math.PI) / 180;
    const radialHorizLength = radialLength * Math.cos(droopRad);
    const radialVertDrop = radialLength * Math.sin(droopRad);

    for (let i = 0; i < radialCount; i++) {
      const angle = (2 * Math.PI * i) / radialCount;
      const endX = radialHorizLength * Math.cos(angle);
      const endY = radialHorizLength * Math.sin(angle);
      const endZ = baseHeight - radialVertDrop;

      wires.push({
        tag: i + 2,
        segments: radialSegs,
        x1: 0,
        y1: 0,
        z1: baseHeight,
        x2: endX,
        y2: endY,
        z2: endZ,
        radius,
      });
    }

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // Feed at the base of the vertical element (segment 1)
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
    const freq = params.frequency ?? 14.2;
    const bw = freq * 0.15; // verticals tend to have broader bandwidth response
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
