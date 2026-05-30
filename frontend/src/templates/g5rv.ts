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
 * The open-wire feeder is modelled with a NEC transmission-line (TL) card, not
 * a radiating wire — a single wire would carry common-mode current and present
 * the wrong impedance. The dipole center connects through the 450-ohm line to a
 * short coax stub at the bottom, which is the feed point.
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
import type { TransmissionLine } from "../api/nec";
import { autoSegment, centerSegment } from "../engine/segmentation";

// Characteristic impedance and velocity factor of the open-wire matching
// section. NEC's TL card is an ideal (VF=1) line, so the modelled length is the
// physical feeder length divided by the velocity factor to match its electrical
// length. 450-ohm window line has a velocity factor near 0.91.
const FEEDER_Z0 = 450;
const FEEDER_VELOCITY_FACTOR = 0.91;

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

    const dipoleSegs = autoSegment(dipoleLen, maxFreq, 21);

    // The 450-ohm matching section is modelled as a transmission line (see
    // generateTransmissionLines), not a radiating wire. The only extra wire is
    // a short stub at the bottom representing the coax connection point.
    const feederBottom = Math.max(height - feederLen, 0.5);
    const stubHalf = 0.1;

    return [
      // Wire 1: the dipole, fed at its center segment through the feeder line.
      {
        tag: 1,
        segments: dipoleSegs,
        x1: -halfDipole,
        y1: 0,
        z1: height,
        x2: halfDipole,
        y2: 0,
        z2: height,
        radius,
      },
      // Wire 2: Coax connection stub at the bottom of the feeder. It is
      // isolated from the dipole and joined to its center only through the
      // transmission line, so the feeder itself does not radiate.
      {
        tag: 2,
        segments: 1,
        x1: -stubHalf,
        y1: 0,
        z1: feederBottom,
        x2: stubHalf,
        y2: 0,
        z2: feederBottom,
        radius,
      },
    ];
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // Feed the coax stub (the bottom of the matching section).
    return {
      wire_tag: 2,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateTransmissionLines(
    params: Record<string, number>,
    wires: WireGeometry[]
  ): TransmissionLine[] {
    const feederLen = params.feeder_length ?? 10.36;
    // Connect the dipole's center segment to the coax stub through the 450-ohm
    // open-wire line. NEC's TL is ideal (VF=1), so scale the length by the
    // velocity factor to match the real line's electrical length.
    const dipole = wires[0]!;
    return [
      {
        wire_tag1: dipole.tag,
        segment1: centerSegment(dipole.segments),
        wire_tag2: 2,
        segment2: 1,
        impedance: FEEDER_Z0,
        length: feederLen / FEEDER_VELOCITY_FACTOR,
      },
    ];
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    const feederLen = params.feeder_length ?? 10.36;
    const feederBottom = Math.max(height - feederLen, 0.5);
    // NEC coords [necX, necY, necZ]; the viewport applies the NEC->Three swap.
    return [{ position: [0, 0, feederBottom], wireTag: 2 }];
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
