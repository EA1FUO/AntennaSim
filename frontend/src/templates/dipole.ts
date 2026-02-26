/**
 * Half-wave Dipole antenna template.
 *
 * The simplest and most fundamental antenna. Two wires extending
 * horizontally from a center feed point, with total length ~λ/2.
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

export const dipoleTemplate: AntennaTemplate = {
  id: "dipole",
  name: "Half-Wave Dipole",
  nameShort: "Dipole",
  description: "Classic half-wave dipole — the fundamental antenna for any band.",
  longDescription:
    "A half-wave dipole consists of two equal-length wires fed at the center. " +
    "Total length is approximately one-half wavelength at the design frequency. " +
    "It produces a figure-8 pattern in the horizontal plane with ~2.15 dBi gain. " +
    "The feed impedance at resonance is approximately 73 ohms in free space, " +
    "varying with height above ground. This is the reference antenna for all other designs.",
  icon: "—|—",
  category: "wire",
  difficulty: "beginner",
  bands: ["160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"],
  defaultGround: { type: "average" },
  tips: [
    "Height above ground significantly affects impedance and pattern.",
    "At λ/2 height, gain maximizes at low angles — ideal for DX.",
    "At λ/4 height, the pattern tilts upward — better for NVIS.",
    "Use thicker wire (larger diameter) for broader SWR bandwidth.",
    "Resonant frequency is slightly lower than the formula λ/2 due to end effects.",
  ],
  relatedTemplates: ["inverted-v", "fan-dipole", "off-center-fed"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency for half-wave resonance",
      unit: "MHz",
      min: 0.5,
      max: 450,
      step: 0.1,
      defaultValue: 14.1,
      decimals: 3,
    },
    {
      key: "height",
      label: "Height",
      description: "Height above ground at the feed point",
      unit: "m",
      min: 0.5,
      max: 100,
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
    const freq = params.frequency ?? 14.1;
    const height = params.height ?? 10;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    // Half-wave length with 5% shortening for end effects
    const halfLength = (wavelength / 2) * 0.95 / 2;
    const radius = (wireDiamMm / 1000) / 2;

    const maxFreq = freq * 1.15; // account for sweep above design freq
    const segsPerArm = autoSegment(halfLength, maxFreq, 11);

    return [
      {
        tag: 1,
        segments: segsPerArm,
        x1: -halfLength,
        y1: 0,
        z1: height,
        x2: 0,
        y2: 0,
        z2: height,
        radius,
      },
      {
        tag: 2,
        segments: segsPerArm,
        x1: 0,
        y1: 0,
        z1: height,
        x2: halfLength,
        y2: 0,
        z2: height,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at the end of wire 1 (junction with wire 2)
    const wire1 = wires[0]!;
    return {
      wire_tag: wire1.tag,
      segment: wire1.segments, // last segment of arm 1 = center feed point
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
    const freq = params.frequency ?? 14.1;
    const bw = freq * 0.1; // +/- 5% of design frequency
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(500, freq + bw / 2),
      steps: 31,
    };
  },
};
