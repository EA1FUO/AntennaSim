import type { WireGeometry } from "../templates/types";

export type WireEndpoint = "start" | "end";

export interface EndpointRef {
  wireTag: number;
  endpoint: WireEndpoint;
}

export interface EditorJunction {
  id: number;
  endpoints: EndpointRef[];
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Coordinates closer than one micrometre are treated as the same point. */
export const JUNCTION_TOLERANCE_M = 1e-6;

export function endpointKey(ref: EndpointRef): string {
  return `${ref.wireTag}:${ref.endpoint}`;
}

export function sameEndpoint(a: EndpointRef, b: EndpointRef): boolean {
  return a.wireTag === b.wireTag && a.endpoint === b.endpoint;
}

export function getEndpointPosition(
  wires: readonly WireGeometry[],
  ref: EndpointRef,
): Point3 | null {
  const wire = wires.find((candidate) => candidate.tag === ref.wireTag);
  if (!wire) return null;
  return ref.endpoint === "start"
    ? { x: wire.x1, y: wire.y1, z: wire.z1 }
    : { x: wire.x2, y: wire.y2, z: wire.z2 };
}

export function distanceBetween(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Returns every endpoint at the selected endpoint's position, source first. */
export function findCoincidentEndpoints(
  wires: readonly WireGeometry[],
  source: EndpointRef,
  tolerance = JUNCTION_TOLERANCE_M,
): EndpointRef[] {
  const sourcePosition = getEndpointPosition(wires, source);
  if (!sourcePosition) return [];

  const matches: EndpointRef[] = [source];
  for (const wire of wires) {
    for (const endpoint of ["start", "end"] as const) {
      const candidate = { wireTag: wire.tag, endpoint };
      if (sameEndpoint(candidate, source)) continue;
      const position = getEndpointPosition(wires, candidate);
      if (position && distanceBetween(sourcePosition, position) <= tolerance) {
        matches.push(candidate);
      }
    }
  }
  return matches;
}

export function findEndpointJunction(
  junctions: readonly EditorJunction[],
  ref: EndpointRef,
): EditorJunction | undefined {
  return junctions.find((junction) =>
    junction.endpoints.some((candidate) => sameEndpoint(candidate, ref)),
  );
}

/** Expands endpoint references to include all members of their junctions. */
export function expandJunctionEndpoints(
  refs: readonly EndpointRef[],
  junctions: readonly EditorJunction[],
): EndpointRef[] {
  const expanded = new Map<string, EndpointRef>();
  for (const ref of refs) {
    expanded.set(endpointKey(ref), ref);
    const junction = findEndpointJunction(junctions, ref);
    for (const member of junction?.endpoints ?? []) {
      expanded.set(endpointKey(member), member);
    }
  }
  return [...expanded.values()];
}

/** Returns a wire copy with one endpoint moved to an exact position. */
export function withEndpointPosition<T extends WireGeometry>(
  wire: T,
  endpoint: WireEndpoint,
  position: Point3,
): T {
  return endpoint === "start"
    ? { ...wire, x1: position.x, y1: position.y, z1: position.z }
    : { ...wire, x2: position.x, y2: position.y, z2: position.z };
}

/** Moves an endpoint set by a shared delta, preserving translated wire lengths. */
export function translateEndpoints<T extends WireGeometry>(
  wires: readonly T[],
  refs: readonly EndpointRef[],
  delta: Point3,
): T[] {
  const refsByTag = new Map<number, Set<WireEndpoint>>();
  for (const ref of refs) {
    const endpoints = refsByTag.get(ref.wireTag) ?? new Set<WireEndpoint>();
    endpoints.add(ref.endpoint);
    refsByTag.set(ref.wireTag, endpoints);
  }

  return wires.map((wire) => {
    const endpoints = refsByTag.get(wire.tag);
    if (!endpoints) return wire;
    let updated = { ...wire };
    if (endpoints.has("start")) {
      updated = withEndpointPosition(updated, "start", {
        x: updated.x1 + delta.x,
        y: updated.y1 + delta.y,
        z: updated.z1 + delta.z,
      });
    }
    if (endpoints.has("end")) {
      updated = withEndpointPosition(updated, "end", {
        x: updated.x2 + delta.x,
        y: updated.y2 + delta.y,
        z: updated.z2 + delta.z,
      });
    }
    return updated;
  });
}

export function wireLength(wire: WireGeometry): number {
  return Math.hypot(
    wire.x2 - wire.x1,
    wire.y2 - wire.y1,
    wire.z2 - wire.z1,
  );
}
