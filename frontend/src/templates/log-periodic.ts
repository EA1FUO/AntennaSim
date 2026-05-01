import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("log-periodic");

export const logPeriodicTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freqLow = params.freq_low ?? 14.0;
    const freqHigh = params.freq_high ?? 30.0;
    const tau = params.tau ?? 0.9;
    const sigma = params.sigma ?? 0.06;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 6;
    const radius = wireDiamMm / 1000 / 2;
    const lambdaMax = 300.0 / freqLow;
    const lambdaMin = 300.0 / freqHigh;
    const halfLengths: number[] = [];
    let currentHalfLen = (lambdaMax / 2) * 0.95 / 2;
    const minHalfLen = (lambdaMin / 2) * 0.95 / 2 * tau;
    while (currentHalfLen >= minHalfLen && halfLengths.length < 20) {
      halfLengths.push(currentHalfLen);
      currentHalfLen *= tau;
    }
    if (halfLengths.length < 2) halfLengths.push(currentHalfLen);
    const spacings: number[] = [];
    for (let i = 0; i < halfLengths.length - 1; i++) {
      spacings.push(4 * sigma * halfLengths[i]!);
    }
    const positions: number[] = [0];
    for (let i = 0; i < spacings.length; i++) positions.push(positions[i]! + spacings[i]!);
    const totalBoom = positions[positions.length - 1]!;
    const offset = totalBoom / 2;
    const wires: WireGeometry[] = [];
    const maxFreq = freqHigh * 1.1;
    for (let i = 0; i < halfLengths.length; i++) {
      const halfLen = halfLengths[i]!;
      const boomPos = positions[i]! - offset;
      const segs = autoSegment(halfLen * 2, maxFreq, 11);
      wires.push({ tag: i + 1, segments: segs, x1: -halfLen, y1: boomPos, z1: height, x2: halfLen, y2: boomPos, z2: height, radius });
    }
    return wires;
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const frontElement = wires[wires.length - 1]!;
    return { wire_tag: frontElement.tag, segment: centerSegment(frontElement.segments), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    const front = wires[wires.length - 1]!;
    const yPos = (front.y1 + front.y2) / 2;
    return [{ position: [0, yPos, height], wireTag: front.tag }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freqLow = params.freq_low ?? 14.0;
    const freqHigh = params.freq_high ?? 30.0;
    return { start_mhz: Math.max(0.1, freqLow * 0.9), stop_mhz: Math.min(2000, freqHigh * 1.1), steps: 51 };
  },
};