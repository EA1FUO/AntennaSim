import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { arcToWireSegments } from "./types";

const _meta = getTemplateMetadata("magnetic-loop");

export const magneticLoopTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const radius = params.radius ?? 0.5;
    const tubeDia = params.tube_dia ?? 12;
    const height = params.height ?? 3;
    const wireRadius = (tubeDia / 1000) / 2;
    const arc = { tag: 1, segments: 36, arc_radius: radius, start_angle: 0, end_angle: 360, wire_radius: wireRadius };
    return arcToWireSegments(arc, height);
  },

  generateExcitation(_params: Record<string, number>, _wires: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const radius = params.radius ?? 0.5;
    const height = params.height ?? 3;
    return [{ position: [radius, height, 0], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.1;
    const bw = freq * 0.05;
    return { start_mhz: Math.max(0.1, freq - bw), stop_mhz: Math.min(2000, freq + bw), steps: 21 };
  },
};