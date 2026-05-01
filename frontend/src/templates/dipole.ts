import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("dipole");

export const dipoleTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.1;
    const height = params.height ?? 10;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const halfLength = (wavelength / 2) * 0.95 / 2;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const segsPerArm = autoSegment(halfLength, maxFreq, 11);
    return [
      { tag: 1, segments: segsPerArm, x1: -halfLength, y1: 0, z1: height, x2: 0, y2: 0, z2: height, radius },
      { tag: 2, segments: segsPerArm, x1: 0, y1: 0, z1: height, x2: halfLength, y2: 0, z2: height, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const wire1 = wires[0]!;
    return { wire_tag: wire1.tag, segment: wire1.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 10;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};