import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("efhw-inverted-v");

export const efhwInvertedVTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 7.1;
    const apexHeight = params.apex_height ?? 12;
    const feedHeight = params.feed_height ?? 2;
    const farEndHeight = params.far_end_height ?? 2;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const totalLength = (wavelength / 2) * 0.97;
    const radius = (wireDiamMm / 1000) / 2;
    const legLength = totalLength / 2;
    let feedDz = apexHeight - feedHeight;
    let feedDx: number;
    if (feedDz > legLength) { feedDx = 0; feedDz = legLength; }
    else { feedDx = Math.sqrt(Math.max(0, legLength * legLength - feedDz * feedDz)); }
    let farDz = apexHeight - farEndHeight;
    let farDx: number;
    if (farDz > legLength) { farDx = 0; farDz = legLength; }
    else { farDx = Math.sqrt(Math.max(0, legLength * legLength - farDz * farDz)); }
    const maxFreq = freq * 1.15;
    const segsFeedLeg = autoSegment(legLength, maxFreq, 21);
    const segsFarLeg = autoSegment(legLength, maxFreq, 21);
    const feedZ = apexHeight - feedDz;
    const farZ = apexHeight - farDz;
    const wires: WireGeometry[] = [
      { tag: 1, segments: segsFeedLeg, x1: -feedDx, y1: 0, z1: feedZ, x2: 0, y2: 0, z2: apexHeight, radius },
      { tag: 2, segments: segsFarLeg, x1: 0, y1: 0, z1: apexHeight, x2: farDx, y2: 0, z2: farZ, radius },
    ];
    const counterpoiseLength = wavelength * 0.05;
    const counterpoiseSegs = autoSegment(counterpoiseLength, maxFreq, 5);
    wires.push({ tag: 3, segments: counterpoiseSegs, x1: -feedDx, y1: 0, z1: feedZ, x2: -feedDx - counterpoiseLength, y2: 0, z2: feedZ, radius });
    return wires;
  },

  generateExcitation(_params: Record<string, number>, _wires: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const apexHeight = params.apex_height ?? 12;
    const feedHeight = params.feed_height ?? 2;
    const freq = params.frequency ?? 7.1;
    const wavelength = 300.0 / freq;
    const legLength = ((wavelength / 2) * 0.97) / 2;
    const feedDz = Math.min(apexHeight - feedHeight, legLength);
    const feedDx = Math.sqrt(Math.max(0, legLength * legLength - feedDz * feedDz));
    const feedZ = apexHeight - feedDz;
    return [{ position: [-feedDx, 0, feedZ], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 7.1;
    const bw = freq * 0.1;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};