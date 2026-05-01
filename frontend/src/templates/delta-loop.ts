import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("delta-loop");

export const deltaLoopTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const baseH = params.base_height ?? 5;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;
    const perimeter = wavelength * 1.02;
    const side = perimeter / 3;
    const halfBase = side / 2;
    const triHeight = side * Math.sqrt(3) / 2;
    const apexZ = baseH + triHeight;
    const segsBase = autoSegment(side, maxFreq, 21);
    const segsSide = autoSegment(side, maxFreq, 21);
    return [
      { tag: 1, segments: segsBase, x1: -halfBase, y1: 0, z1: baseH, x2: halfBase, y2: 0, z2: baseH, radius },
      { tag: 2, segments: segsSide, x1: halfBase, y1: 0, z1: baseH, x2: 0, y2: 0, z2: apexZ, radius },
      { tag: 3, segments: segsSide, x1: 0, y1: 0, z1: apexZ, x2: -halfBase, y2: 0, z2: baseH, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const base = wires[0]!;
    return { wire_tag: base.tag, segment: centerSegment(base.segments), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const baseH = params.base_height ?? 5;
    return [{ position: [0, 0, baseH], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};