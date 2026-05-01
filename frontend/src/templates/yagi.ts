import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("yagi");

function getYagiDesign(numElements: number): { lengths: number[]; positions: number[] } {
  switch (numElements) {
    case 2: return { lengths: [0.252, 0.238], positions: [0, 0.15] };
    case 3: return { lengths: [0.252, 0.238, 0.226], positions: [0, 0.15, 0.35] };
    case 4: return { lengths: [0.252, 0.238, 0.224, 0.222], positions: [0, 0.15, 0.35, 0.55] };
    case 5: return { lengths: [0.252, 0.238, 0.224, 0.222, 0.220], positions: [0, 0.15, 0.35, 0.55, 0.75] };
    case 6:
    default: return { lengths: [0.252, 0.238, 0.224, 0.222, 0.220, 0.218], positions: [0, 0.15, 0.35, 0.55, 0.75, 0.95] };
  }
}

export const yagiTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 3);
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 12;
    const wavelength = 300.0 / freq;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const design = getYagiDesign(numElements);
    const wires: WireGeometry[] = [];
    const boomOffset = design.positions[1]! * wavelength;
    for (let i = 0; i < numElements; i++) {
      const halfLen = design.lengths[i]! * wavelength;
      const boomPos = design.positions[i]! * wavelength - boomOffset;
      const segs = autoSegment(halfLen * 2, maxFreq, 11);
      wires.push({ tag: i + 1, segments: segs, x1: -halfLen, y1: boomPos, z1: height, x2: halfLen, y2: boomPos, z2: height, radius });
    }
    return wires;
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const driven = wires[1]!;
    return { wire_tag: driven.tag, segment: centerSegment(driven.segments), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.07;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};