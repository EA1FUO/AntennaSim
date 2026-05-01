import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("off-center-fed");

export const offCenterFedTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const feedOffset = params.feed_offset ?? 0.36;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const totalLen = (wavelength / 2) * 0.95;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 4.5;
    const shortLen = feedOffset * totalLen;
    const longLen = (1 - feedOffset) * totalLen;
    const segsShort = autoSegment(shortLen, maxFreq, 11);
    const segsLong = autoSegment(longLen, maxFreq, 21);
    return [
      { tag: 1, segments: segsShort, x1: -shortLen, y1: 0, z1: height, x2: 0, y2: 0, z2: height, radius },
      { tag: 2, segments: segsLong, x1: 0, y1: 0, z1: height, x2: longLen, y2: 0, z2: height, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const shortArm = wires[0]!;
    return { wire_tag: shortArm.tag, segment: shortArm.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};