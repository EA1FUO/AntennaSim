import { getTemplateMetadata } from "./metadata-loader";
import type { AntennaTemplate, WireGeometry, Excitation, FeedpointData, FrequencyRange } from "./types";
import { autoSegment } from "../engine/segmentation";

const _meta = getTemplateMetadata("quad");

function getQuadDesign(numElements: number): { perimeters: number[]; positions: number[] } {
  switch (numElements) {
    case 1: return { perimeters: [1.02], positions: [0] };
    case 2: return { perimeters: [1.05, 1.02], positions: [0, 0.2] };
    case 3:
    default: return { perimeters: [1.05, 1.02, 0.97], positions: [0, 0.2, 0.4] };
  }
}

export const quadTemplate: AntennaTemplate = {
  ..._meta,

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 2);
    const centerHeight = params.height ?? 12;
    const wireDiamMm = params.wire_diameter ?? 2.0;
    const wavelength = 300.0 / freq;
    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const design = getQuadDesign(numElements);
    const wires: WireGeometry[] = [];
    let tagCounter = 1;
    const drivenIdx = numElements === 1 ? 0 : 1;
    const boomOffset = design.positions[drivenIdx]! * wavelength;
    for (let i = 0; i < numElements; i++) {
      const perimeter = design.perimeters[i]! * wavelength;
      const side = perimeter / 4;
      const halfSide = side / 2;
      const boomPos = design.positions[i]! * wavelength - boomOffset;
      const sideSegs = autoSegment(side, maxFreq, 7);
      const zBot = centerHeight - halfSide;
      const zTop = centerHeight + halfSide;
      wires.push({ tag: tagCounter++, segments: sideSegs, x1: -halfSide, y1: boomPos, z1: zBot, x2: halfSide, y2: boomPos, z2: zBot, radius });
      wires.push({ tag: tagCounter++, segments: sideSegs, x1: halfSide, y1: boomPos, z1: zBot, x2: halfSide, y2: boomPos, z2: zTop, radius });
      wires.push({ tag: tagCounter++, segments: sideSegs, x1: halfSide, y1: boomPos, z1: zTop, x2: -halfSide, y2: boomPos, z2: zTop, radius });
      wires.push({ tag: tagCounter++, segments: sideSegs, x1: -halfSide, y1: boomPos, z1: zTop, x2: -halfSide, y2: boomPos, z2: zBot, radius });
    }
    return wires;
  },

  generateExcitation(params: Record<string, number>, wires: WireGeometry[]): Excitation {
    const numElements = Math.round(params.num_elements ?? 2);
    const drivenBottomTag = numElements === 1 ? 1 : 5;
    const wire = wires.find((w) => w.tag === drivenBottomTag);
    const segs = wire?.segments ?? 7;
    return { wire_tag: drivenBottomTag, segment: Math.ceil(segs / 2), voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _wires: WireGeometry[]): FeedpointData[] {
    const freq = params.frequency ?? 14.15;
    const numElements = Math.round(params.num_elements ?? 2);
    const centerHeight = params.height ?? 12;
    const wavelength = 300.0 / freq;
    const design = getQuadDesign(numElements);
    const drivenIdx = numElements === 1 ? 0 : 1;
    const perimeter = design.perimeters[drivenIdx]! * wavelength;
    const halfSide = perimeter / 4 / 2;
    const zBot = centerHeight - halfSide;
    return [{ position: [0, 0, zBot], wireTag: numElements === 1 ? 1 : 5 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.15;
    const bw = freq * 0.08;
    return { start_mhz: Math.max(0.1, freq - bw / 2), stop_mhz: Math.min(2000, freq + bw / 2), steps: 31 };
  },
};