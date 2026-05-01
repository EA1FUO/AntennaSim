import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("g5rv");

export const g5rvTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const height = params.height ?? 12;
    const feederLen = params.feeder_length ?? 10.36;
    const dipoleLen = params.dipole_length ?? 31.1;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const radius = wireDiamMm / 1000 / 2;
    const halfDipole = dipoleLen / 2;
    const maxFreq = 30;
    const segsDipoleArm = autoSegment(halfDipole, maxFreq, 21);
    const segsFeeder = autoSegment(feederLen, maxFreq, 11);
    const feederBottom = height - feederLen;
    return [
      { tag: 1, segments: segsDipoleArm, x1: -halfDipole, y1: 0, z1: height, x2: 0, y2: 0, z2: height, radius },
      { tag: 2, segments: segsDipoleArm, x1: 0, y1: 0, z1: height, x2: halfDipole, y2: 0, z2: height, radius },
      { tag: 3, segments: segsFeeder, x1: 0, y1: 0, z1: height, x2: 0, y2: 0, z2: Math.max(feederBottom, 0.5), radius },
    ];
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const feeder = wires[2]!;
    return { wire_tag: feeder.tag, segment: feeder.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 12;
    const feederLen = params.feeder_length ?? 10.36;
    const feederBottom = Math.max(height - feederLen, 0.5);
    return [{ position: [0, 0, feederBottom], wireTag: 3 }];
  },

  defaultFrequencyRange(_params: Record<string, number>): FrequencyRange {
    return { start_mhz: 13.5, stop_mhz: 14.5, steps: 41 };
  },
};