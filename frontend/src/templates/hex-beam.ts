import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("hex-beam");

export const hexBeamTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const height = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = wireDiamMm / 1000 / 2;
    const maxFreq = freq * 1.1;
    const halfWidth = wavelength * 0.23;
    const drivenDepth = wavelength * 0.07;
    const reflectorDepth = wavelength * 0.07;
    const spacing = wavelength * 0.08;
    const dLeftTipX = -halfWidth, dLeftTipY = 0;
    const dLeftBendX = -halfWidth * 0.4, dLeftBendY = -drivenDepth;
    const dCenterX = 0, dCenterY = 0;
    const dRightBendX = halfWidth * 0.4, dRightBendY = -drivenDepth;
    const dRightTipX = halfWidth, dRightTipY = 0;
    const rY = -spacing;
    const rLeftTipX = -halfWidth * 1.05, rLeftTipY = rY;
    const rLeftBendX = -halfWidth * 0.4, rLeftBendY = rY - reflectorDepth;
    const rCenterX = 0, rCenterY = rY;
    const rRightBendX = halfWidth * 0.4, rRightBendY = rY - reflectorDepth;
    const rRightTipX = halfWidth * 1.05, rRightTipY = rY;
    const segsArm = autoSegment(halfWidth * 0.6, maxFreq, 11);
    const segsMid = autoSegment(halfWidth * 0.4, maxFreq, 7);
    return [
      { tag: 1, segments: segsArm, x1: dLeftTipX, y1: dLeftTipY, z1: height, x2: dLeftBendX, y2: dLeftBendY, z2: height, radius },
      { tag: 2, segments: segsMid, x1: dLeftBendX, y1: dLeftBendY, z1: height, x2: dCenterX, y2: dCenterY, z2: height, radius },
      { tag: 3, segments: segsMid, x1: dCenterX, y1: dCenterY, z1: height, x2: dRightBendX, y2: dRightBendY, z2: height, radius },
      { tag: 4, segments: segsArm, x1: dRightBendX, y1: dRightBendY, z1: height, x2: dRightTipX, y2: dRightTipY, z2: height, radius },
      { tag: 5, segments: segsArm, x1: rLeftTipX, y1: rLeftTipY, z1: height, x2: rLeftBendX, y2: rLeftBendY, z2: height, radius },
      { tag: 6, segments: segsMid, x1: rLeftBendX, y1: rLeftBendY, z1: height, x2: rCenterX, y2: rCenterY, z2: height, radius },
      { tag: 7, segments: segsMid, x1: rCenterX, y1: rCenterY, z1: height, x2: rRightBendX, y2: rRightBendY, z2: height, radius },
      { tag: 8, segments: segsArm, x1: rRightBendX, y1: rRightBendY, z1: height, x2: rRightTipX, y2: rRightTipY, z2: height, radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const wire2 = wires[1]!;
    return { wire_tag: wire2.tag, segment: wire2.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    return [{ position: [0, 0, height], wireTag: 2 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};