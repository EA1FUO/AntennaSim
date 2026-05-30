/**
 * Resolves transmission-line port references into drawable 3D segments for the
 * viewport. Kept separate from the rendering component so the component file
 * only exports a component (React Fast Refresh requirement).
 */

import type { WireGeometry } from "../../templates/types";
import type { TransmissionLine } from "../../api/nec";

/** A straight segment in NEC coordinates (X=east, Y=north, Z=up). */
export interface NonRadiatingSegment {
  start: [number, number, number];
  end: [number, number, number];
}

/** Center of a given 1-based segment along a wire, in NEC coordinates. */
function segmentCenter(wire: WireGeometry, segment: number): [number, number, number] {
  // Clamp to the wire's segment range so a stale reference (e.g. after the wire
  // was re-segmented) lands on the wire instead of extrapolating past its end.
  const seg = Math.max(1, Math.min(segment, wire.segments));
  const t = (seg - 0.5) / wire.segments;
  return [
    wire.x1 + t * (wire.x2 - wire.x1),
    wire.y1 + t * (wire.y2 - wire.y1),
    wire.z1 + t * (wire.z2 - wire.z1),
  ];
}

/**
 * Resolve transmission-line port references (wire tag + segment) into segments
 * connecting the two endpoints, so the feeder can be drawn in the viewport.
 */
export function resolveTransmissionLines(
  transmissionLines: TransmissionLine[],
  wires: WireGeometry[]
): NonRadiatingSegment[] {
  const wireByTag = new Map<number, WireGeometry>();
  for (const w of wires) {
    if (!wireByTag.has(w.tag)) wireByTag.set(w.tag, w);
  }

  const segments: NonRadiatingSegment[] = [];
  for (const tl of transmissionLines) {
    const w1 = wireByTag.get(tl.wire_tag1);
    const w2 = wireByTag.get(tl.wire_tag2);
    if (!w1 || !w2) continue;
    segments.push({
      start: segmentCenter(w1, tl.segment1),
      end: segmentCenter(w2, tl.segment2),
    });
  }
  return segments;
}
