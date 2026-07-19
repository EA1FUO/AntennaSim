import { Box3, Vector3 } from "three";
import type { WireData } from "./types";

const MIN_SCENE_SPAN_M = 1e-4;
const MIN_WIRE_RADIUS_RATIO = 0.002;
const MAX_WIRE_RADIUS_RATIO = 0.015;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Characteristic antenna size, independent of its absolute position.
 * The longest individual wire is included so a single-axis antenna still
 * receives a useful scale when the other bounding-box dimensions are zero.
 */
export function getAntennaSpan(wires: WireData[]): number {
  if (wires.length === 0) return 1;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let longestWire = 0;

  for (const wire of wires) {
    minX = Math.min(minX, wire.x1, wire.x2);
    minY = Math.min(minY, wire.y1, wire.y2);
    minZ = Math.min(minZ, wire.z1, wire.z2);
    maxX = Math.max(maxX, wire.x1, wire.x2);
    maxY = Math.max(maxY, wire.y1, wire.y2);
    maxZ = Math.max(maxZ, wire.z1, wire.z2);

    const dx = wire.x2 - wire.x1;
    const dy = wire.y2 - wire.y1;
    const dz = wire.z2 - wire.z1;
    longestWire = Math.max(longestWire, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  return Math.max(
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
    longestWire,
    MIN_SCENE_SPAN_M,
  );
}

/** Compute a padded Three.js bounding box for scale-aware camera framing. */
export function computeWireBBox(wires: WireData[], hasGround: boolean): Box3 {
  const bbox = new Box3();

  if (wires.length === 0) {
    bbox.set(new Vector3(-5, 0, -5), new Vector3(5, 10, 5));
    return bbox;
  }

  for (const wire of wires) {
    bbox.expandByPoint(new Vector3(wire.x1, wire.z1, -wire.y1));
    bbox.expandByPoint(new Vector3(wire.x2, wire.z2, -wire.y2));
  }

  const antennaSpan = getAntennaSpan(wires);
  if (hasGround && bbox.min.y > 0 && bbox.min.y <= antennaSpan * 3) {
    bbox.min.y = 0;
  }

  const padding = new Vector3(
    antennaSpan,
    antennaSpan,
    antennaSpan,
  ).multiplyScalar(0.2);
  return bbox.expandByVector(padding);
}

/** Camera target and distance required to contain a padded antenna box. */
export function computeCameraFrame(
  bbox: Box3,
  antennaSpan: number,
): { center: Vector3; distance: number } {
  const center = new Vector3();
  const size = new Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);
  return {
    center,
    distance: Math.max(size.length() * 1.5, antennaSpan * 1.5, 0.01),
  };
}

export interface VisualScale {
  span: number;
  wireRadius: (physicalRadius: number) => number;
  capRadius: (physicalRadius: number) => number;
  junctionRadius: (physicalRadius: number) => number;
  markerRadius: number;
  currentRadius: number;
  particleRadius: number;
  ghostRadius: number;
  junctionTolerance: number;
  patternScale: number;
  dashSize: number;
  gapSize: number;
  fogNear: number;
  fogFar: number;
}

/**
 * Build visual-only dimensions for a viewport. Simulation geometry is never
 * changed: physical radius remains available in wire metadata and NEC cards.
 */
export function createVisualScale(wires: WireData[]): VisualScale {
  const span = getAntennaSpan(wires);
  const minWireRadius = span * MIN_WIRE_RADIUS_RATIO;
  const maxWireRadius = span * MAX_WIRE_RADIUS_RATIO;
  const wireRadius = (physicalRadius: number) =>
    clamp(physicalRadius, minWireRadius, maxWireRadius);
  const capRadius = (physicalRadius: number) =>
    Math.max(wireRadius(physicalRadius) * 1.25, span * 0.003);
  const thickestWireRadius = wires.reduce(
    (largest, wire) => Math.max(largest, wireRadius(wire.radius)),
    minWireRadius,
  );

  return {
    span,
    wireRadius,
    capRadius,
    junctionRadius: (physicalRadius: number) => capRadius(physicalRadius) * 1.35,
    // Keep feedpoints visible even when a physically thick wire reaches the
    // visual-radius cap. This only affects the marker, never NEC geometry.
    markerRadius: Math.max(span * 0.015, thickestWireRadius * 2.5),
    currentRadius: span * 0.006,
    particleRadius: span * 0.003,
    ghostRadius: span * 0.003,
    junctionTolerance: Math.max(span * 1e-6, 1e-7),
    patternScale: span * 0.5,
    dashSize: span * 0.04,
    gapSize: span * 0.025,
    // Preserve the usual depth cue while keeping antennas that exceed the
    // original fixed fog range fully visible.
    fogNear: Math.max(60, span * 3),
    fogFar: Math.max(200, span * 10),
  };
}
