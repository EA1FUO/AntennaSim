/**
 * G5RV antenna template.
 *
 * A classic multiband wire antenna designed by Louis Varney (G5RV).
 * Consists of a 102-foot (31.1m) center-fed dipole with a 34-foot (10.36m)
 * open-wire transmission line matching section, then coax to the rig.
 *
 * The open-wire section transforms the impedance on multiple bands to
 * something the tuner can handle. Works on 80m through 10m with a tuner.
 *
 * Geometry (front view):
 *
 *   ______________|______________
 *                 |               ← horizontal dipole at height
 *                 |               ← open-wire feeder (vertical drop)
 *                 |
 *                 * feed point    ← at bottom of open-wire section
 *
 * Note: The open-wire feeder uses a TL (transmission line) card in NEC2,
 * but since the V1 template system only generates wires, we model the
 * physical wire layout. The TL card would be used in V2 editor mode.
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

export const g5rvTemplate: AntennaTemplate = {
  id: "g5rv",
  name: "G5RV",
  nameShort: "G5RV",
  description:
    "Classic multiband dipole with open-wire matching section — 80m to 10m.",
  longDescription:
    "The G5RV is one of the most popular multiband wire antennas in amateur radio. " +
    "Designed by Louis Varney (G5RV), it consists of a 102-foot (31.1m) center-fed dipole " +
    "with a 34-foot (10.36m) open-wire (450-ohm ladder line) matching section dropping " +
    "vertically from the center. The open-wire section transforms the impedance on " +
    "multiple bands. It works well on 20m (where it's close to resonant) and provides " +
    "acceptable performance on 80m through 10m with an antenna tuner. The G5RV is " +
    "easy to build, inexpensive, and fits in most suburban lots.",
  icon: "T",
  category: "multiband",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "17m", "15m", "12m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "Works best on 20m — close to resonant, ~60 ohm feedpoint impedance.",
    "An antenna tuner is needed for most other bands.",
    "Keep the open-wire section as vertical as possible for best performance.",
    "Use real 450-ohm ladder line, not 300-ohm TV twin-lead (too lossy).",
    "A 'G5RV Junior' (half-size) covers 40m through 10m in smaller spaces.",
    "Total horizontal span is 31.1m (102 ft) — needs good supports at both ends.",
  ],
  relatedTemplates: ["dipole", "fan-dipole", "off-center-fed"],

  parameters: [
    {
      key: "height",
      label: "Dipole Height",
      description: "Height of the horizontal dipole wire",
      unit: "m",
      min: 5,
      max: 30,
      step: 0.5,
      defaultValue: 12,
      decimals: 1,
    },
    {
      key: "feeder_length",
      label: "Feeder Length",
      description: "Length of the open-wire matching section",
      unit: "m",
      min: 5,
      max: 20,
      step: 0.5,
      defaultValue: 10.36,
      decimals: 2,
    },
    {
      key: "dipole_length",
      label: "Dipole Length",
      description: "Total horizontal wire length (full-size = 31.1m)",
      unit: "m",
      min: 10,
      max: 50,
      step: 0.5,
      defaultValue: 31.1,
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
    const height = params.height ?? 12;
    const feederLen = params.feeder_length ?? 10.36;
    const dipoleLen = params.dipole_length ?? 31.1;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const radius = wireDiamMm / 1000 / 2;
    const halfDipole = dipoleLen / 2;
    // We use the highest frequency band for segmentation (28 MHz)
    const maxFreq = 30;

    const segsDipoleArm = autoSegment(halfDipole, maxFreq, 21);
    const segsFeeder = autoSegment(feederLen, maxFreq, 11);

    // The feeder drops from the center of the dipole
    const feederBottom = height - feederLen;

    return [
      // Wire 1: Left arm of dipole
      {
        tag: 1,
        segments: segsDipoleArm,
        x1: -halfDipole,
        y1: 0,
        z1: height,
        x2: 0,
        y2: 0,
        z2: height,
        radius,
      },
      // Wire 2: Right arm of dipole
      {
        tag: 2,
        segments: segsDipoleArm,
        x1: 0,
        y1: 0,
        z1: height,
        x2: halfDipole,
        y2: 0,
        z2: height,
        radius,
      },
      // Wire 3: Open-wire feeder (modeled as a single wire dropping down)
      // In reality this is a TL card, but we model the physical wire
      {
        tag: 3,
        segments: segsFeeder,
        x1: 0,
        y1: 0,
        z1: height,
        x2: 0,
        y2: 0,
        z2: Math.max(feederBottom, 0.5),
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at the bottom of the feeder wire
    const feeder = wires[2]!;
    return {
      wire_tag: feeder.tag,
      segment: feeder.segments, // bottom end
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    const feederLen = params.feeder_length ?? 10.36;
    const feederBottom = Math.max(height - feederLen, 0.5);
    return [{ position: [0, 0, feederBottom], wireTag: 3 }];
  },

  defaultFrequencyRange(_params: Record<string, number>): FrequencyRange {
    // G5RV is multiband — show 20m by default where it works best
    return {
      start_mhz: 13.5,
      stop_mhz: 14.5,
      steps: 41,
    };
  },
};
