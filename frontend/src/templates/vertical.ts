import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("vertical");

export const verticalTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.2;
    const radialCount = Math.round(params.radial_count ?? 4);
    const radialDroopDeg = params.radial_droop ?? 0;
    const baseHeight = params.base_height ?? 0.5;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const quarterWave = (wavelength / 4) * 0.95;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const verticalSegs = autoSegment(quarterWave, maxFreq, 11);
    const radialLength = quarterWave;
    const radialSegs = autoSegment(radialLength, maxFreq, 7);
    const wires: WireGeometry[] = [
      { tag: 1, segments: verticalSegs, x1: 0, y1: 0, z1: baseHeight, x2: 0, y2: 0, z2: baseHeight + quarterWave, radius },
    ];
    const droopRad = (radialDroopDeg * Math.PI) / 180;
    const radialHorizLength = radialLength * Math.cos(droopRad);
    const radialVertDrop = radialLength * Math.sin(droopRad);
    for (let i = 0; i < radialCount; i++) {
      const angle = (2 * Math.PI * i) / radialCount;
      const endX = radialHorizLength * Math.cos(angle);
      const endY = radialHorizLength * Math.sin(angle);
      const endZ = baseHeight - radialVertDrop;
      wires.push({ tag: i + 2, segments: radialSegs, x1: 0, y1: 0, z1: baseHeight, x2: endX, y2: endY, z2: endZ, radius });
    }
    return wires;
  },

  generateExcitation(_params: Record<string, number>, _wires: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const baseHeight = params.base_height ?? 0.5;
    return [{ position: [0, 0, baseHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.2;
    const bw = freq * 0.15;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};