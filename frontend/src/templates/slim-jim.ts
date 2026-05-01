import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("slim-jim");

export const slimJimTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 145.0;
    const baseH = params.base_height ?? 1.5;
    const spacingMm = params.spacing ?? 25;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const spacing = spacingMm / 1000;
    const maxFreq = freq * 1.1;
    const quarterWave = wavelength * 0.25 * 0.95;
    const halfWave = wavelength * 0.5 * 0.95;
    const foldedHeight = halfWave;
    const gapHeight = wavelength * 0.01;
    const totalHeight = quarterWave + gapHeight + foldedHeight;
    const segsLong = autoSegment(totalHeight, maxFreq, 31);
    const segsShort = autoSegment(quarterWave, maxFreq, 11);
    const segsFolded = autoSegment(foldedHeight, maxFreq, 21);
    const segsHoriz = autoSegment(spacing, maxFreq, 3);
    return [
      { tag: 1, segments: segsLong, x1: 0, y1: 0, z1: baseH, x2: 0, y2: 0, z2: baseH + totalHeight, radius },
      { tag: 2, segments: segsShort, x1: spacing, y1: 0, z1: baseH, x2: spacing, y2: 0, z2: baseH + quarterWave, radius },
      { tag: 3, segments: segsFolded, x1: spacing, y1: 0, z1: baseH + quarterWave + gapHeight, x2: spacing, y2: 0, z2: baseH + totalHeight, radius },
      { tag: 4, segments: segsHoriz, x1: 0, y1: 0, z1: baseH, x2: spacing, y2: 0, z2: baseH, radius },
      { tag: 5, segments: segsHoriz, x1: 0, y1: 0, z1: baseH + totalHeight, x2: spacing, y2: 0, z2: baseH + totalHeight, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const stub = wires[1]!;
    return { wire_tag: stub.tag, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const baseH = params.base_height ?? 1.5;
    const spacingMm = params.spacing ?? 25;
    const spacing = spacingMm / 1000;
    return [{ position: [spacing, 0, baseH], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 145.0;
    const bw = freq * 0.08;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};