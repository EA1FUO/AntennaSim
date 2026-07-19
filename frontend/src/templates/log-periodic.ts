/**
 * Log-Periodic Dipole Array (LPDA) antenna template.
 *
 * A broadband directional antenna consisting of multiple dipole elements
 * of progressively increasing length, connected by a transposed feeder.
 * Covers a wide frequency range (typically 2:1 or greater) with consistent
 * gain and impedance.
 *
 * Geometry (top view):
 *
 *   shortest →  |   |   |    |    |     |   ← longest
 *               =========== boom ===========
 *                    → radiation direction
 *
 * Elements along X, boom along Y, antenna at height Z.
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
import { MAX_FREQUENCY_MHZ, MIN_FREQUENCY_MHZ } from "../engine/limits";

/**
 * Derive the full LPDA design from the parameters: element lengths/positions,
 * the Carrel feeder characteristic impedance, and the rear termination stub.
 * Shared by every template method so the geometry, feed, and phase-line agree.
 */
function lpdaDesign(params: Record<string, number>) {
  const freqLow = params.freq_low ?? 14.0;
  const freqHigh = params.freq_high ?? 30.0;
  const tau = params.tau ?? 0.9;
  const sigma = params.sigma ?? 0.06;
  const height = params.height ?? 12;
  const wireDiamM = (params.wire_diameter ?? 6) / 1000;
  const radius = wireDiamM / 2;

  const lambdaMax = 300.0 / freqLow;
  const lambdaMin = 300.0 / freqHigh;

  // Element half-lengths, longest (rear) to shortest (front). The longest is a
  // half-wave at freqLow; the series extends ~2 steps past freqHigh so the
  // active region never runs off the front (feed) element.
  const halfLengths: number[] = [];
  let cur = lambdaMax / 4;
  const minHalf = (lambdaMin / 4) * tau * tau;
  while (cur >= minHalf && halfLengths.length < 24) {
    halfLengths.push(cur);
    cur *= tau;
  }
  if (halfLengths.length < 2) halfLengths.push(cur);
  const n = halfLengths.length;

  // Spacing d_n = 2*sigma*L_n (L_n = full length = 2*halfLen).
  const spacings: number[] = [];
  for (let i = 0; i < n - 1; i++) spacings.push(4 * sigma * halfLengths[i]!);

  const positions: number[] = [0];
  for (let i = 0; i < spacings.length; i++) positions.push(positions[i]! + spacings[i]!);
  const offset = positions[n - 1]! / 2;

  const maxFreq = freqHigh * 1.1;
  const segs = halfLengths.map((hl) => autoSegment(hl * 2, maxFreq, 11));

  // Carrel design: the transposed phase-line feeder impedance that yields a
  // ~50 ohm input. Z_feed = Z_in^2/(8 σ' Z_cN) + Z_in √[(Z_in/(8 σ' Z_cN))^2 + 1].
  const zIn = 50;
  const sigmaPrime = sigma / Math.sqrt(tau);
  const shortestLen = 2 * halfLengths[n - 1]!;
  const zElement = 120 * (Math.log(shortestLen / wireDiamM) - 2.25);
  const ratio = zIn / (8 * sigmaPrime * zElement);
  const feederZ0 = zIn * ratio + zIn * Math.sqrt(ratio * ratio + 1);

  // Rear termination: a shorted stub ~lambdaMax/8 behind the longest element,
  // which absorbs energy past the active region and tames the SWR.
  const termLength = lambdaMax / 8;
  const termTag = n + 1;

  return {
    freqLow, freqHigh, height, radius, halfLengths, spacings, positions,
    offset, segs, n, feederZ0, termLength, termTag,
  };
}

export const logPeriodicTemplate: AntennaTemplate = {
  id: "log-periodic",
  name: "Log-Periodic Dipole Array",
  nameShort: "LPDA",
  description:
    "Broadband directional antenna covering a wide frequency range with consistent gain.",
  longDescription:
    "The Log-Periodic Dipole Array (LPDA) is a broadband directional antenna that maintains " +
    "relatively constant gain and impedance across a wide frequency range. It consists of " +
    "multiple dipole elements of varying length connected to a common transposed feeder. " +
    "The element lengths and spacings are related by a constant ratio (tau), and the spacing " +
    "angle (sigma) determines the bandwidth-to-gain tradeoff. Typical gain is 6-8 dBi with " +
    "moderate F/B ratio. LPDAs are used extensively for TV reception, EMC testing, and " +
    "amateur radio where broadband coverage is needed without retuning.",
  icon: ">>>",
  category: "directional",
  difficulty: "advanced",
  bands: ["20m", "17m", "15m", "12m", "10m", "6m"],
  defaultGround: { type: "average" },
  tips: [
    "Tau (τ) controls the bandwidth/gain tradeoff — higher τ = more gain but more elements.",
    "Sigma (σ) controls the spacing — typical values 0.04 to 0.08.",
    "Feed at the shortest element (front) for correct phasing.",
    "The transposed feeder provides 180° phase shift between adjacent elements.",
    "Add 1-2 extra elements beyond the design range for clean pattern at band edges.",
    "Typical gain is 6-8 dBi — less than a Yagi but over much wider bandwidth.",
  ],
  relatedTemplates: ["yagi", "moxon", "hex-beam"],

  parameters: [
    {
      key: "freq_low",
      label: "Low Frequency",
      description: "Lower edge of the operating range",
      unit: "MHz",
      min: 1,
      max: 1000,
      step: 0.1,
      defaultValue: 14.0,
      decimals: 3,
    },
    {
      key: "freq_high",
      label: "High Frequency",
      description: "Upper edge of the operating range",
      unit: "MHz",
      min: 2,
      max: MAX_FREQUENCY_MHZ,
      step: 0.1,
      defaultValue: 30.0,
      decimals: 3,
    },
    {
      key: "tau",
      label: "Tau (τ)",
      description: "Design ratio — higher = more gain, more elements",
      unit: "",
      min: 0.8,
      max: 0.98,
      step: 0.005,
      defaultValue: 0.9,
      decimals: 3,
    },
    {
      key: "sigma",
      label: "Sigma (σ)",
      description: "Relative spacing factor",
      unit: "",
      min: 0.03,
      max: 0.12,
      step: 0.002,
      defaultValue: 0.06,
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
      label: "Element Diameter",
      description: "Element tube/wire diameter",
      unit: "mm",
      min: 1,
      max: 25,
      step: 0.5,
      defaultValue: 6,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const d = lpdaDesign(params);
    const wires: WireGeometry[] = [];

    // Dipole elements, longest (rear) to shortest (front).
    for (let i = 0; i < d.n; i++) {
      const halfLen = d.halfLengths[i]!;
      const boomPos = d.positions[i]! - d.offset;
      wires.push({
        tag: i + 1,
        segments: d.segs[i]!,
        x1: -halfLen,
        y1: boomPos,
        z1: d.height,
        x2: halfLen,
        y2: boomPos,
        z2: d.height,
        radius: d.radius,
      });
    }

    // Short stub behind the longest element — the rear termination point.
    const stubY = d.positions[0]! - d.offset - d.termLength;
    wires.push({
      tag: d.termTag,
      segments: 1,
      x1: -0.05,
      y1: stubY,
      z1: d.height,
      x2: 0.05,
      y2: stubY,
      z2: d.height,
      radius: d.radius,
    });

    return wires;
  },

  generateExcitation(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // The transposed phase line is driven at the front (shortest) element.
    const d = lpdaDesign(params);
    return {
      wire_tag: d.n,
      segment: centerSegment(d.segs[d.n - 1]!),
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateTransmissionLines(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): TransmissionLine[] {
    const d = lpdaDesign(params);
    const lines: TransmissionLine[] = [];

    // Transposed feeder between consecutive element centers. A negative
    // characteristic impedance tells NEC the line is crossed over, which gives
    // the 180-degree phase reversal between adjacent elements.
    for (let i = 0; i < d.n - 1; i++) {
      lines.push({
        wire_tag1: i + 1,
        segment1: centerSegment(d.segs[i]!),
        wire_tag2: i + 2,
        segment2: centerSegment(d.segs[i + 1]!),
        impedance: -d.feederZ0,
        length: d.spacings[i]!,
      });
    }

    // Shorted termination stub from the longest element to the rear stub wire
    // (a large shunt admittance at the far end short-circuits it).
    lines.push({
      wire_tag1: 1,
      segment1: centerSegment(d.segs[0]!),
      wire_tag2: d.termTag,
      segment2: 1,
      impedance: d.feederZ0,
      length: d.termLength,
      shunt_admittance_real2: 1000,
    });

    return lines;
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const d = lpdaDesign(params);
    const frontY = d.positions[d.n - 1]! - d.offset;
    return [{ position: [0, frontY, d.height], wireTag: d.n }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freqLow = params.freq_low ?? 14.0;
    const freqHigh = params.freq_high ?? 30.0;
    // Cover the design range with some margin
    return {
      start_mhz: Math.max(MIN_FREQUENCY_MHZ, freqLow * 0.9),
      stop_mhz: Math.min(MAX_FREQUENCY_MHZ, freqHigh * 1.1),
      steps: 51,
    };
  },
};
