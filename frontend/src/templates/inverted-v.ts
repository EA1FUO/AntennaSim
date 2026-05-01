import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("inverted-v");

export const invertedVTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const apexHeight = params.apex_height ?? 12;
    const includedAngle = params.included_angle ?? 120;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const armLength = (wavelength / 2) * 0.95 / 2;
    const radius = (wireDiamMm / 1000) / 2;
    const halfAngle = (includedAngle / 2) * (Math.PI / 180);
    const horizExtent = armLength * Math.sin(halfAngle);
    const vertDrop = armLength * Math.cos(halfAngle);
    const endHeight = apexHeight - vertDrop;
    const maxFreq = freq * 1.15;
    const segsPerArm = autoSegment(armLength, maxFreq, 11);
    return [
      { tag: 1, segments: segsPerArm, x1: -horizExtent, y1: 0, z1: endHeight, x2: 0, y2: 0, z2: apexHeight, radius },
      { tag: 2, segments: segsPerArm, x1: 0, y1: 0, z1: apexHeight, x2: horizExtent, y2: 0, z2: endHeight, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const wire1 = wires[0]!;
    return { wire_tag: wire1.tag, segment: wire1.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const apexHeight = params.apex_height ?? 12;
    return [{ position: [0, 0, apexHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};