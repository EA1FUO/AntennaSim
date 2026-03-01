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
import { autoSegment, centerSegment } from "../engine/segmentation";

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
      step: 0.5,
      defaultValue: 14.0,
      decimals: 1,
    },
    {
      key: "freq_high",
      label: "High Frequency",
      description: "Upper edge of the operating range",
      unit: "MHz",
      min: 2,
      max: 2000,
      step: 0.5,
      defaultValue: 30.0,
      decimals: 1,
    },
    {
      key: "tau",
      label: "Tau (τ)",
      description: "Design ratio — higher = more gain, more elements",
      unit: "",
      min: 0.8,
      max: 0.98,
      step: 0.01,
      defaultValue: 0.9,
      decimals: 2,
    },
    {
      key: "sigma",
      label: "Sigma (σ)",
      description: "Relative spacing factor",
      unit: "",
      min: 0.03,
      max: 0.12,
      step: 0.005,
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
    const freqLow = params.freq_low ?? 14.0;
    const freqHigh = params.freq_high ?? 30.0;
    const tau = params.tau ?? 0.9;
    const sigma = params.sigma ?? 0.06;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 6;

    const radius = wireDiamMm / 1000 / 2;

    // Calculate element half-lengths
    // Longest element: λ/2 at freqLow (with some margin)
    const lambdaMax = 300.0 / freqLow;
    const lambdaMin = 300.0 / freqHigh;

    // Generate elements from longest (back) to shortest (front)
    const halfLengths: number[] = [];
    let currentHalfLen = (lambdaMax / 2) * 0.95 / 2; // half-length with end effect
    const minHalfLen = (lambdaMin / 2) * 0.95 / 2 * tau; // one step beyond min

    while (currentHalfLen >= minHalfLen && halfLengths.length < 20) {
      halfLengths.push(currentHalfLen);
      currentHalfLen *= tau;
    }

    const numElements = halfLengths.length;
    if (numElements < 2) {
      // Fallback: at least 2 elements
      halfLengths.push(currentHalfLen);
    }

    // Calculate spacings from sigma and tau
    // d_n = 2 * sigma * L_n (where L_n is the half-length of element n)
    const spacings: number[] = [];
    for (let i = 0; i < halfLengths.length - 1; i++) {
      const d = 4 * sigma * halfLengths[i]!;
      spacings.push(d);
    }

    // Position elements along Y axis (boom direction)
    // Longest element at back (most negative Y), shortest at front
    const positions: number[] = [0];
    for (let i = 0; i < spacings.length; i++) {
      positions.push(positions[i]! + spacings[i]!);
    }

    // Center the array so middle is at Y=0
    const totalBoom = positions[positions.length - 1]!;
    const offset = totalBoom / 2;

    const wires: WireGeometry[] = [];
    const maxFreq = freqHigh * 1.1;

    for (let i = 0; i < halfLengths.length; i++) {
      const halfLen = halfLengths[i]!;
      const boomPos = positions[i]! - offset;
      const segs = autoSegment(halfLen * 2, maxFreq, 11);

      wires.push({
        tag: i + 1,
        segments: segs,
        x1: -halfLen,
        y1: boomPos,
        z1: height,
        x2: halfLen,
        y2: boomPos,
        z2: height,
        radius,
      });
    }

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed the shortest element (front, last wire = highest freq)
    // In practice, LPDA is fed at the front through the transposed line
    // For NEC2 template mode, we feed the second element (close to 50 ohms)
    // The first element (shortest) is actually the front
    const frontElement = wires[wires.length - 1]!;
    return {
      wire_tag: frontElement.tag,
      segment: centerSegment(frontElement.segments),
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    wires: WireGeometry[]
  ): FeedpointData[] {
    const height = params.height ?? 12;
    // Feedpoint at center of the front (shortest) element
    const front = wires[wires.length - 1]!;
    const yPos = (front.y1 + front.y2) / 2;
    return [{ position: [0, yPos, height], wireTag: front.tag }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freqLow = params.freq_low ?? 14.0;
    const freqHigh = params.freq_high ?? 30.0;
    // Cover the design range with some margin
    return {
      start_mhz: Math.max(0.1, freqLow * 0.9),
      stop_mhz: Math.min(2000, freqHigh * 1.1),
      steps: 51,
    };
  },
};
