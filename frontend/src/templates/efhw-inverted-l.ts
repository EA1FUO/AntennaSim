import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("efhw-inverted-l");

export const efhwInvertedLTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const verticalHeight = params.vertical_height ?? 8;
    const feedHeight = params.feed_height ?? 1.5;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const totalLength = (wavelength / 2) * 0.97;
    const radius = (wireDiamMm / 1000) / 2;
    const actualVertical = Math.min(verticalHeight, totalLength);
    const horizontalLength = Math.max(0, totalLength - actualVertical);
    const maxFreq = freq * 1.15;
    const verticalSegs = autoSegment(actualVertical, maxFreq, 21);
    const topZ = feedHeight + actualVertical;
    const wires: WireGeometry[] = [
      { tag: 1, segments: verticalSegs, x1: 0, y1: 0, z1: feedHeight, x2: 0, y2: 0, z2: topZ, radius },
    ];
    if (horizontalLength > 1e-6) {
      const horizontalSegs = autoSegment(horizontalLength, maxFreq, 21);
      wires.push({ tag: 2, segments: horizontalSegs, x1: 0, y1: 0, z1: topZ, x2: horizontalLength, y2: 0, z2: topZ, radius });
    }
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);
    const cpTag = wires.length + 1;
    wires.push({ tag: cpTag, segments: counterpoiseSegs, x1: 0, y1: 0, z1: feedHeight, x2: -counterpoiseLength, y2: 0, z2: feedHeight, radius });
    return wires;
  },

  generateExcitation(_params: Record<string, number>, _wires: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const feedHeight = params.feed_height ?? 1.5;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};