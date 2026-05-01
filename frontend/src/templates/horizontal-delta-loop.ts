import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment, centerSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("horizontal-delta-loop");

export const horizontalDeltaLoopTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.15;
    const height = params.height ?? 10;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;
    const perimeter = wavelength * 1.02;
    const side = perimeter / 3;
    const triHeight = side * Math.sqrt(3) / 2;
    const apex = { x: 0, y: (2 * triHeight) / 3 };
    const left = { x: -side / 2, y: -triHeight / 3 };
    const right = { x: side / 2, y: -triHeight / 3 };
    const segs = autoSegment(side, maxFreq, 21);
    return [
      { tag: 1, segments: segs, x1: left.x, y1: left.y, z1: height, x2: right.x, y2: right.y, z2: height, radius },
      { tag: 2, segments: segs, x1: right.x, y1: right.y, z1: height, x2: apex.x, y2: apex.y, z2: height, radius },
      { tag: 3, segments: segs, x1: apex.x, y1: apex.y, z1: height, x2: left.x, y2: left.y, z2: height, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const base = wires[0]!;
    return { wire_tag: base.tag, segment: centerSegment(base.segments), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const freq = params.frequency ?? 7.15;
    const height = params.height ?? 10;
    const perimeter = (300.0 / freq) * 1.02;
    const side = perimeter / 3;
    const triHeight = side * Math.sqrt(3) / 2;
    return [{ position: [0, -triHeight / 3, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.15;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};