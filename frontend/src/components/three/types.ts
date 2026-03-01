/** Wire data for 3D rendering */
export interface WireData {
  tag: number;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  radius: number;
  segments: number;
}

/** Feedpoint location for 3D rendering */
export interface FeedpointData {
  position: [number, number, number];
  wireTag: number;
}

/** View toggle state */
export interface ViewToggles {
  grid: boolean;
  wires: boolean;
  pattern: boolean;
  labels: boolean;
  compass: boolean;
  scale: boolean;
  /** V2: Show current distribution colors on wires */
  current: boolean;
  /** V2: Show ground reflection ghost */
  reflection: boolean;
  /** V2: Show volumetric gain shells instead of surface */
  volumetric: boolean;
  /** V2: Show near-field heatmap plane */
  nearField: boolean;
  /** V2: Show animated current flow particles */
  currentFlow: boolean;
  /** V2: Show animated radiation pattern slice */
  slice: boolean;
}

/** Wire colors for multi-wire identification */
export const WIRE_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
] as const;

export function getWireColor(tag: number): string {
  return WIRE_COLORS[(tag - 1) % WIRE_COLORS.length] ?? WIRE_COLORS[0]!;
}

// ---- 3D Hover Measurement Types ----

export type MeasurementData =
  | { type: "pattern"; gainDbi: number; theta: number; phi: number }
  | { type: "wire"; tag: number; lengthM: number; zMin: number; zMax: number; radiusMm: number }
  | { type: "current"; tag: number; segment: number; magnitudeA: number; phaseDeg: number; x: number; y: number; z: number }
  | { type: "nearfield"; fieldVm: number; x: number; y: number; heightM: number };
