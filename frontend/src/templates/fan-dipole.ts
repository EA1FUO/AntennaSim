import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("fan-dipole");

const BAND_FREQS: Record<string, number> = {
  "80m": 3.6, "40m": 7.1, "20m": 14.15, "15m": 21.2, "10m": 28.5,
};

export const fanDipoleTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const numBands = Math.round(params.num_bands ?? 3);
    const height = params.height ?? 10;
    const fanSpread = params.fan_spread ?? 1.0;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const radius = wireDiamMm / 1000 / 2;
    const bandKeys = ["80m", "40m", "20m", "15m", "10m"];
    const selectedBands: string[] = [];
    if (numBands >= 5) selectedBands.push(...bandKeys);
    else if (numBands === 4) selectedBands.push("80m", "40m", "20m", "10m");
    else if (numBands === 3) selectedBands.push("40m", "20m", "10m");
    else selectedBands.push("20m", "10m");
    const wires: WireGeometry[] = [];
    let tag = 1;
    for (let i = 0; i < selectedBands.length; i++) {
      const bandKey = selectedBands[i]!;
      const freq = BAND_FREQS[bandKey]!;
      const wavelength = 300.0 / freq;
      const halfLen = (wavelength / 2) * 0.95 / 2;
      const maxFreq = freq * 1.15;
      const segs = autoSegment(halfLen, maxFreq, 11);
      const vertOffset = selectedBands.length > 1 ? -fanSpread * (i / (selectedBands.length - 1)) : 0;
      const wireZ = height + vertOffset;
      wires.push({ tag, segments: segs, x1: -halfLen, y1: 0, z1: wireZ, x2: 0, y2: 0, z2: height, radius });
      tag++;
      wires.push({ tag, segments: segs, x1: 0, y1: 0, z1: height, x2: halfLen, y2: 0, z2: wireZ, radius });
      tag++;
    }
    return wires;
  },

  generateExcitation(_params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const firstArm = wires[0]!;
    return { wire_tag: firstArm.tag, segment: firstArm.segments, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const height = params.height ?? 10;
    return [{ position: [0, 0, height], wireTag: 1 }];
  },

  defaultFrequencyRange(_params: Record<string, number>): FrequencyRange {
    return { start_mhz: 13.5, stop_mhz: 14.5, steps: 31 };
  },
};