import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("moxon");

function moxonDimensions(wireDiameterWavelengths: number) {
  const d = Math.log10(wireDiameterWavelengths);
  const A = 0.4834 - 0.0117 * d - 0.0006 * d * d;
  const B = 0.0502 - 0.0192 * d - 0.0020 * d * d;
  const C = 0.0365 + 0.0143 * d + 0.0014 * d * d;
  const D = 0.0516 + 0.0085 * d + 0.0007 * d * d;
  return { A, B, C, D, E: A };
}

export const moxonTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const wireDiamWL = (wireDiamMm / 1000) / wavelength;
    const maxFreq = freq * 1.1;
    const dim = moxonDimensions(wireDiamWL);
    const halfA = dim.A * wavelength;
    const tailB = dim.B * wavelength;
    const gapC = dim.C * wavelength;
    const tailD = dim.D * wavelength;
    const halfE = dim.A * wavelength;
    const boomDepth = tailB + gapC + tailD;
    const segsH = autoSegment(halfA * 2, maxFreq, 21);
    const segsR = autoSegment(halfE * 2, maxFreq, 21);
    const segsTailB = autoSegment(tailB, maxFreq, 5);
    const segsTailD = autoSegment(tailD, maxFreq, 5);
    const yDriven = 0;
    const yDrivenTail = -tailB;
    const yReflectorTail = -(tailB + gapC);
    const yReflector = -boomDepth;
    return [
      { tag: 1, segments: segsH, x1: -halfA, y1: yDriven, z1: height, x2: halfA, y2: yDriven, z2: height, radius },
      { tag: 2, segments: segsR, x1: -halfE, y1: yReflector, z1: height, x2: halfE, y2: yReflector, z2: height, radius },
      { tag: 3, segments: segsTailB, x1: -halfA, y1: yDriven, z1: height, x2: -halfA, y2: yDrivenTail, z2: height, radius },
      { tag: 4, segments: segsTailD, x1: -halfE, y1: yReflector, z1: height, x2: -halfE, y2: yReflectorTail, z2: height, radius },
      { tag: 5, segments: segsTailB, x1: halfA, y1: yDriven, z1: height, x2: halfA, y2: yDrivenTail, z2: height, radius },
      { tag: 6, segments: segsTailD, x1: halfE, y1: yReflector, z1: height, x2: halfE, y2: yReflectorTail, z2: height, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const driven = wires[0]!;
    return { wire_tag: driven.tag, segment: centerSegment(driven.segments), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.08;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};