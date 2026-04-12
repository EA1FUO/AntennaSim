/**
 * EFHW Inverted-V antenna template.
 *
 * A half-wave end-fed wire draped over a single high support.
 * Both ends slope down from the apex. Fed via 49:1 transformer
 * at one of the low ends.
 *
 * Geometry (side view):
 *
 *            /\
 *           /  \        ← wire draped over apex
 *          /    \
 *    feed *      * far end
 *    + counterpoise
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

export const efhwInvertedVTemplate: AntennaTemplate = {
  id: "efhw-inverted-v",
  name: "EFHW Inverted-V",
  nameShort: "EFHW-V",
  description:
    "End-fed half-wave draped over an apex — both ends slope down from a single high point.",
  longDescription:
    "An EFHW Inverted-V is an End-Fed Half-Wave antenna where the wire is draped over " +
    "a single high support (mast, tree branch) with both ends sloping downward. The total " +
    "wire length is approximately λ/2 and the feed point with 49:1 transformer is at one " +
    "of the low ends. This is one of the simplest antennas to deploy in the field: throw a " +
    "line over a branch, hoist the wire up, stake both ends, and connect the transformer. " +
    "The inverted-V shape gives a slightly broader azimuthal pattern than a flat wire and " +
    "the sloping ends lower the overall height requirement. Like the standard EFHW, multiband " +
    "operation on even harmonics is possible.",
  icon: "/\\~",
  category: "wire",
  difficulty: "beginner",
  bands: ["80m", "40m", "20m", "15m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "The 49:1 transformer is at the low (fed) end — keep the coax along the ground.",
    "Needs only one high support point (tree branch, mast, rope over a limb).",
    "A slightly broader horizontal pattern than a flat EFHW due to the sloping geometry.",
    "Works on even harmonics: a 40m EFHW-V also covers 20m and 10m.",
    "Lower both ends symmetrically for a balanced pattern, or lower one more for directional preference.",
    "A short counterpoise wire (0.05λ) at the feed end stabilizes the impedance.",
  ],
  relatedTemplates: ["efhw", "efhw-inverted-l", "inverted-v"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Fundamental frequency for half-wave resonance",
      unit: "MHz",
      min: 0.5,
      max: 2000,
      step: 0.1,
      defaultValue: 7.1,
      decimals: 3,
    },
    {
      key: "apex_height",
      label: "Apex Height",
      description: "Height of the apex (support point) above ground",
      unit: "m",
      min: 3,
      max: 50,
      step: 0.5,
      defaultValue: 12,
      decimals: 1,
    },
    {
      key: "feed_height",
      label: "Feed End Height",
      description: "Height of the fed end above ground",
      unit: "m",
      min: 0.5,
      max: 30,
      step: 0.5,
      defaultValue: 2,
      decimals: 1,
    },
    {
      key: "far_end_height",
      label: "Far End Height",
      description: "Height of the non-fed end above ground",
      unit: "m",
      min: 0.5,
      max: 30,
      step: 0.5,
      defaultValue: 2,
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
    const freq = params.frequency ?? 7.1;
    const apexHeight = params.apex_height ?? 12;
    const feedHeight = params.feed_height ?? 2;
    const farEndHeight = params.far_end_height ?? 2;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const totalLength = (wavelength / 2) * 0.97;
    const radius = (wireDiamMm / 1000) / 2;
    const legLength = totalLength / 2;

    // Feed side leg
    let feedDz = apexHeight - feedHeight;
    let feedDx: number;
    if (feedDz > legLength) {
      feedDx = 0;
      feedDz = legLength;
    } else {
      feedDx = Math.sqrt(Math.max(0, legLength * legLength - feedDz * feedDz));
    }

    // Far side leg
    let farDz = apexHeight - farEndHeight;
    let farDx: number;
    if (farDz > legLength) {
      farDx = 0;
      farDz = legLength;
    } else {
      farDx = Math.sqrt(Math.max(0, legLength * legLength - farDz * farDz));
    }

    const maxFreq = freq * 1.15;
    const segsFeedLeg = autoSegment(legLength, maxFreq, 21);
    const segsFarLeg = autoSegment(legLength, maxFreq, 21);

    const feedZ = apexHeight - feedDz;
    const farZ = apexHeight - farDz;

    const wires: WireGeometry[] = [
      // Wire 1: Feed leg (feed at segment 1)
      {
        tag: 1,
        segments: segsFeedLeg,
        x1: -feedDx, y1: 0, z1: feedZ,
        x2: 0, y2: 0, z2: apexHeight,
        radius,
      },
      // Wire 2: Far leg
      {
        tag: 2,
        segments: segsFarLeg,
        x1: 0, y1: 0, z1: apexHeight,
        x2: farDx, y2: 0, z2: farZ,
        radius,
      },
    ];

    // Wire 3: Short counterpoise at feed point
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);
    wires.push({
      tag: 3,
      segments: counterpoiseSegs,
      x1: -feedDx, y1: 0, z1: feedZ,
      x2: -feedDx - counterpoiseLength, y2: 0, z2: feedZ,
      radius,
    });

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
    const apexHeight = params.apex_height ?? 12;
    const feedHeight = params.feed_height ?? 2;
    const freq = params.frequency ?? 7.1;
    const wavelength = 300.0 / freq;
    const legLength = ((wavelength / 2) * 0.97) / 2;
    const feedDz = Math.min(apexHeight - feedHeight, legLength);
    const feedDx = Math.sqrt(Math.max(0, legLength * legLength - feedDz * feedDz));
    const feedZ = apexHeight - feedDz;
    return [{ position: [-feedDx, 0, feedZ], wireTag: 1 }];
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