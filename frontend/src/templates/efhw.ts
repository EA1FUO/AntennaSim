import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("efhw");

export const efhwTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const feedHeight = params.feed_height ?? 10;
    const farEndHeight = params.far_end_height ?? 3;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const wireLength = (wavelength / 2) * 0.97;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const segs = autoSegment(wireLength, maxFreq, 21);
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);
    return [
      { tag: 1, segments: segs, x1: 0, y1: 0, z1: feedHeight, x2: wireLength, y2: 0, z2: farEndHeight, radius },
      { tag: 2, segments: counterpoiseSegs, x1: 0, y1: 0, z1: feedHeight, x2: -counterpoiseLength, y2: 0, z2: feedHeight, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, _wires: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const feedHeight = params.feed_height ?? 10;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};