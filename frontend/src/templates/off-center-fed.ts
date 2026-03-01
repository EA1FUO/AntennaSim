/**
 * Off-Center Fed Dipole (Windom / OCF) antenna template.
 *
 * A dipole fed at a point approximately 1/3 from one end instead of
 * the center. This provides a feed impedance of approximately 200-300 ohms,
 * which can be matched with a 4:1 balun to 50-ohm coax. The off-center
 * feed point creates multiband operation on even harmonics.
 *
 * Geometry (front view):
 *
 *   ______|_________________________
 *   short |     long side
 *         ^feed (at ~1/3 point)
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

export const offCenterFedTemplate: AntennaTemplate = {
  id: "off-center-fed",
  name: "Off-Center Fed Dipole",
  nameShort: "OCF",
  description:
    "Windom/OCF dipole — multiband operation from a single wire with off-center feed.",
  longDescription:
    "The Off-Center Fed (OCF) Dipole, also known as the Windom, is a half-wave dipole " +
    "fed at a point approximately 1/3 from one end. This feed point location presents " +
    "a feed impedance of approximately 200-300 ohms (matched with a 4:1 balun to 50 ohms). " +
    "The key advantage is that the off-center feed point maintains a reasonable impedance " +
    "on even harmonics, giving multiband operation on the fundamental and approximately " +
    "every even multiple (e.g., 80m fundamental → works on 40m, 20m, 10m). " +
    "Simple construction — just one wire, a 4:1 balun, and coax.",
  icon: "--|----",
  category: "multiband",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Feed at ~36% from one end (not exactly 1/3) for best multiband impedance.",
    "A 4:1 current balun is essential — do NOT use a voltage balun.",
    "Works on fundamental + even harmonics: e.g., 80/40/20/10m.",
    "May not work well on odd harmonics (e.g., 15m for an 80m OCF).",
    "Total wire length for 80m: ~40.5m (133 ft), for 40m: ~20.25m.",
    "Keep the wire as straight and horizontal as possible.",
  ],
  relatedTemplates: ["dipole", "efhw", "g5rv", "fan-dipole"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Fundamental resonant frequency",
      unit: "MHz",
      min: 0.5,
      max: 2000,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "feed_offset",
      label: "Feed Offset",
      description: "Feed point position as fraction from one end (0.33 = classic Windom)",
      unit: "",
      min: 0.2,
      max: 0.45,
      step: 0.01,
      defaultValue: 0.36,
      decimals: 2,
    },
    {
      key: "height",
      label: "Height",
      description: "Height above ground",
      unit: "m",
      min: 2,
      max: 30,
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
      max: 5,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const feedOffset = params.feed_offset ?? 0.36;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const totalLen = (wavelength / 2) * 0.95; // with end effect shortening
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 4.5; // account for 4th harmonic

    // Short side = feedOffset * totalLen, Long side = (1 - feedOffset) * totalLen
    const shortLen = feedOffset * totalLen;
    const longLen = (1 - feedOffset) * totalLen;

    const segsShort = autoSegment(shortLen, maxFreq, 11);
    const segsLong = autoSegment(longLen, maxFreq, 21);

    return [
      // Wire 1: Short arm (negative X direction from feed)
      {
        tag: 1,
        segments: segsShort,
        x1: -shortLen,
        y1: 0,
        z1: height,
        x2: 0,
        y2: 0,
        z2: height,
        radius,
      },
      // Wire 2: Long arm (positive X direction from feed)
      {
        tag: 2,
        segments: segsLong,
        x1: 0,
        y1: 0,
        z1: height,
        x2: longLen,
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
    // Feed at the junction — last segment of the short arm
    const shortArm = wires[0]!;
    return {
      wire_tag: shortArm.tag,
      segment: shortArm.segments,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return {
      start_mhz: Math.max(0.1, freq - bw / 2),
      stop_mhz: Math.min(2000, freq + bw / 2),
      steps: 31,
    };
  },
};
