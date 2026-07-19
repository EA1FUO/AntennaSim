/**
 * Wire Editor state store — V2 editor for free-form antenna design.
 *
 * Manages:
 * - Wire list CRUD (add, update, delete, split)
 * - Selection (single wire or multiple)
 * - Edit mode (select, add, move)
 * - Excitation sources
 * - Undo/redo history
 * - Snap & grid settings
 */

import { create } from "zustand";
import type { WireGeometry, Excitation, GroundConfig, FrequencyRange, FrequencySegment } from "../templates/types";
import type { LumpedLoad, TransmissionLine } from "../api/nec";
import { autoSegment, centerSegment } from "../engine/segmentation";
import { computeSteps } from "../utils/ham-bands";
import { clampFrequencyMhz, MAX_FREQUENCY_MHZ, MIN_FREQUENCY_MHZ } from "../engine/limits";
import {
  expandJunctionEndpoints,
  findCoincidentEndpoints,
  findEndpointJunction,
  getEndpointPosition,
  sameEndpoint,
  translateEndpoints,
  withEndpointPosition,
  wireLength,
  type EditorJunction,
  type EndpointRef,
  type Point3,
  type WireEndpoint,
} from "../utils/editor-junctions";

// ---- Types ----

export type EditorMode = "select" | "add" | "move";

// Re-export for convenience
export type { LumpedLoad, TransmissionLine } from "../api/nec";
export type { EditorJunction, EndpointRef, WireEndpoint } from "../utils/editor-junctions";

export interface EditorActionResult {
  ok: boolean;
  message: string;
}

export interface EditorWire extends WireGeometry {
  /** Whether this wire is currently selected */
  selected?: boolean;
  /** Whether segments were manually set by the user (sticky override) */
  segmentsManual?: boolean;
  /** Whether wire length is locked during endpoint drags */
  lengthLocked?: boolean;
}

/** A snapshot of the editor state for undo/redo */
interface EditorSnapshot {
  wires: EditorWire[];
  excitations: Excitation[];
  loads: LumpedLoad[];
  transmissionLines: TransmissionLine[];
  junctions: EditorJunction[];
  nextJunctionId: number;
}

// ---- Default state ----

const DEFAULT_GROUND: GroundConfig = { type: "average" };
const DEFAULT_FREQ: FrequencyRange = { start_mhz: 13.5, stop_mhz: 15.0, steps: computeSteps(13.5, 15.0) };
const DEFAULT_WIRE_RADIUS = 0.001; // 1mm
const DEFAULT_FREQUENCY_MHZ = 14.1;

const MAX_UNDO_STACK = 100;

// ---- Store interface ----

interface EditorState {
  /** All wires in the editor */
  wires: EditorWire[];
  /** Excitation sources */
  excitations: Excitation[];
  /** V2: Lumped loads */
  loads: LumpedLoad[];
  /** V2: Transmission lines */
  transmissionLines: TransmissionLine[];
  /** Persistent groups of endpoints that must remain coincident */
  junctions: EditorJunction[];
  /** Next stable junction identifier */
  nextJunctionId: number;
  /** Whether to compute current distribution */
  computeCurrents: boolean;
  /** Currently selected wire tags */
  selectedTags: Set<number>;
  /** Ordered endpoint selection: source first, target second */
  selectedEndpoints: EndpointRef[];
  /** Last connection action result shown by the editor */
  lastEditorMessage: string | null;
  /** Current editor mode */
  mode: EditorMode;
  /** Ground configuration */
  ground: GroundConfig;
  /** Frequency range for simulation */
  frequencyRange: FrequencyRange;
  /** Multi-segment frequency sweep (empty = use single frequencyRange) */
  frequencySegments: FrequencySegment[];
  /** Snap grid size in meters (0 = disabled) */
  snapSize: number;
  /** Whether grid is shown */
  showGrid: boolean;
  /** Next available tag number */
  nextTag: number;
  /** Design frequency for auto-segmentation */
  designFrequencyMhz: number;

  // Undo/redo
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  /** Pre-drag state used to make a complete gesture one undo operation */
  geometryTransaction: EditorSnapshot | null;

  // ---- Wire CRUD ----
  /** Add a new wire. Returns the assigned tag. */
  addWire: (wire: Omit<EditorWire, "tag" | "segments">) => number;
  /** Add a wire with explicit tag and segments */
  addWireRaw: (wire: EditorWire) => void;
  /** Update a wire by tag */
  updateWire: (tag: number, updates: Partial<Omit<EditorWire, "tag">>) => void;
  /** Delete wires by tag(s) */
  deleteWires: (tags: number[]) => void;
  /** Delete all selected wires */
  deleteSelected: () => void;
  /** Move an entire wire by a delta in NEC2 coordinates */
  moveWire: (tag: number, dx: number, dy: number, dz: number) => void;
  /** Move an endpoint and every endpoint locked into its junction */
  moveEndpoint: (tag: number, endpoint: WireEndpoint, dx: number, dy: number, dz: number) => EditorActionResult;
  /** Move all selected wires by the same delta */
  moveSelected: (dx: number, dy: number, dz: number) => void;
  /** Move ALL wires by a delta in NEC2 Z (height) */
  moveAllWiresZ: (dz: number) => void;
  /** Split a wire at its midpoint into two wires */
  splitWire: (tag: number) => void;
  /** Reset a wire's segments to auto-computed (lambda/10 rule) */
  resetSegments: (tag: number) => void;
  /** Clear all wires */
  clearAll: () => void;
  /** Set all wires at once (e.g. from import) */
  setWires: (wires: EditorWire[], excitations?: Excitation[], junctions?: EditorJunction[]) => void;

  // ---- Selection ----
  /** Select a single wire (deselects others unless additive) */
  selectWire: (tag: number, additive?: boolean) => void;
  /** Deselect all */
  deselectAll: () => void;
  /** Select all wires */
  selectAll: () => void;
  /** Toggle selection on a wire */
  toggleSelection: (tag: number) => void;
  /** Select source then target endpoint; a third selection starts over */
  selectEndpoint: (ref: EndpointRef) => void;
  clearEndpointSelection: () => void;

  // ---- Endpoint snapping & junctions ----
  snapSelectedEndpoints: (preserveLength: boolean) => EditorActionResult;
  /** Lock coincident endpoints, or unlock the selected endpoint's junction */
  toggleSelectedJunction: () => EditorActionResult;
  setJunctions: (junctions: EditorJunction[]) => void;
  clearEditorMessage: () => void;

  // ---- Mode ----
  setMode: (mode: EditorMode) => void;
  /** Vertical-drag toggle for mobile (replaces Shift key) */
  verticalDrag: boolean;
  setVerticalDrag: (on: boolean) => void;

  // ---- Settings ----
  setGround: (ground: GroundConfig) => void;
  setFrequencyRange: (freq: FrequencyRange) => void;
  /** Set all frequency segments at once */
  setFrequencySegments: (segments: FrequencySegment[]) => void;
  /** Add a frequency segment */
  addFrequencySegment: (segment: FrequencySegment) => void;
  /** Remove a frequency segment by index */
  removeFrequencySegment: (index: number) => void;
  /** Update a frequency segment at a specific index */
  updateFrequencySegment: (index: number, segment: FrequencySegment) => void;
  /** Clear all frequency segments (revert to single sweep) */
  clearFrequencySegments: () => void;
  setSnapSize: (size: number) => void;
  setShowGrid: (show: boolean) => void;
  setDesignFrequency: (mhz: number) => void;

  // ---- Excitation ----
  /** Wire tag currently in "pick segment on viewport" mode, or null */
  pickingExcitationForTag: number | null;
  setPickingExcitationForTag: (tag: number | null) => void;
  setExcitation: (wireTag: number, segment: number) => void;
  removeExcitation: (wireTag: number) => void;

  // ---- V2: Loads ----
  addLoad: (load: LumpedLoad) => void;
  updateLoad: (index: number, load: LumpedLoad) => void;
  removeLoad: (index: number) => void;

  // ---- V2: Transmission Lines ----
  addTransmissionLine: (tl: TransmissionLine) => void;
  updateTransmissionLine: (index: number, tl: TransmissionLine) => void;
  removeTransmissionLine: (index: number) => void;

  // ---- V2: Currents ----
  setComputeCurrents: (compute: boolean) => void;

  // ---- Wire Length ----
  /** Set wire to a specific length, keeping the anchor endpoint fixed */
  setWireLength: (tag: number, length: number, anchor: "start" | "end") => void;
  /** Toggle length lock on a wire */
  toggleLengthLock: (tag: number) => void;
  /** Bend a wire: split at position and rotate the second half by angle */
  bendWire: (tag: number, position: number, angleDeg: number, plane: "horizontal" | "vertical", numSegments?: number) => void;
  /** Simulate wire hanging between its endpoints with gravity sag */
  hangWire: (tag: number, numSegments: number, targetLength?: number) => void;

  // ---- Clipboard / Transform ----
  /** Clipboard for copy/paste */
  clipboard: EditorWire[];
  /** Junctions fully contained by the copied wire selection */
  clipboardJunctions: EditorJunction[];
  /** Copy selected wires to clipboard */
  copySelected: () => void;
  /** Paste clipboard wires (offset by 1m in Y) */
  paste: () => void;
  /** Duplicate selected wires in place (offset by 0.5m in Y) */
  duplicateSelected: () => void;
  /** Mirror selected wires across an axis */
  mirrorSelected: (axis: "x" | "y" | "z") => void;

  // ---- Undo/Redo ----
  undo: () => void;
  redo: () => void;
  beginGeometryTransaction: () => void;
  commitGeometryTransaction: () => void;
  cancelGeometryTransaction: () => void;

  // ---- Derived ----
  /** Get the selected wire(s) */
  getSelectedWires: () => EditorWire[];
  /** Get total segment count */
  getTotalSegments: () => number;
  /** Get WireGeometry array for simulation */
  getWireGeometry: () => WireGeometry[];
}

/** Save current state as a snapshot for undo */
function takeSnapshot(state: EditorState): EditorSnapshot {
  return {
    wires: state.wires.map((w) => ({ ...w })),
    excitations: state.excitations.map((e) => ({ ...e })),
    loads: state.loads.map((l) => ({ ...l })),
    transmissionLines: state.transmissionLines.map((t) => ({ ...t })),
    junctions: state.junctions.map((junction) => ({
      ...junction,
      endpoints: junction.endpoints.map((endpoint) => ({ ...endpoint })),
    })),
    nextJunctionId: state.nextJunctionId,
  };
}

function pushSnapshot(
  state: EditorState,
  snapshot: EditorSnapshot,
): Pick<EditorState, "undoStack" | "redoStack" | "canUndo" | "canRedo"> {
  return {
    undoStack: [
      ...state.undoStack.slice(-MAX_UNDO_STACK + 1),
      snapshot,
    ],
    redoStack: [],
    canUndo: true,
    canRedo: false,
  };
}

function geometryHistory(state: EditorState) {
  return state.geometryTransaction ? {} : pushUndo(state);
}

/** Push snapshot to undo stack and clear redo */
function pushUndo(state: EditorState): Pick<EditorState, "undoStack" | "redoStack" | "canUndo" | "canRedo"> {
  const snapshot = takeSnapshot(state);
  const undoStack = [...state.undoStack.slice(-MAX_UNDO_STACK + 1), snapshot];
  return {
    undoStack,
    redoStack: [],
    canUndo: true,
    canRedo: false,
  };
}

/** Auto-segment a wire based on design frequency */
function computeSegments(wire: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }, freqMhz: number): number {
  const dx = wire.x2 - wire.x1;
  const dy = wire.y2 - wire.y1;
  const dz = wire.z2 - wire.z1;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return autoSegment(length, freqMhz);
}

/** Ensure all excitation segment indices are valid for their wire's segment count.
 *  If an excitation references a segment beyond the wire's count, clamp it. */
function fixExcitations(excitations: Excitation[], wires: EditorWire[]): Excitation[] {
  let changed = false;
  const fixed = excitations.map((e) => {
    const wire = wires.find((w) => w.tag === e.wire_tag);
    if (!wire) return e;
    if (e.segment > wire.segments) {
      changed = true;
      return { ...e, segment: Math.min(e.segment, wire.segments) };
    }
    return e;
  });
  return changed ? fixed : excitations;
}

/** Keep every segment-based reference at the same relative wire position. */
function reconcileSegmentReferences(state: EditorState, wires: EditorWire[]) {
  const scaleSegment = (tag: number, segment: number): number => {
    const before = state.wires.find((wire) => wire.tag === tag);
    const after = wires.find((wire) => wire.tag === tag);
    if (!before || !after || before.segments === after.segments) return segment;
    const ratio = segment / before.segments;
    return Math.max(1, Math.min(after.segments, Math.round(ratio * after.segments)));
  };

  return {
    excitations: state.excitations.map((excitation) => ({
      ...excitation,
      segment: scaleSegment(excitation.wire_tag, excitation.segment),
    })),
    loads: state.loads.map((load) => ({
      ...load,
      segment_start: scaleSegment(load.wire_tag, load.segment_start),
      segment_end: scaleSegment(load.wire_tag, load.segment_end),
    })),
    transmissionLines: state.transmissionLines.map((line) => ({
      ...line,
      segment1: scaleSegment(line.wire_tag1, line.segment1),
      segment2: scaleSegment(line.wire_tag2, line.segment2),
    })),
  };
}

function recomputeMovedWireSegments(
  before: readonly EditorWire[],
  after: EditorWire[],
  designFrequencyMhz: number,
): EditorWire[] {
  return after.map((wire) => {
    const original = before.find((candidate) => candidate.tag === wire.tag);
    if (!original || wire.segmentsManual) return wire;
    const geometryChanged =
      original.x1 !== wire.x1 || original.y1 !== wire.y1 || original.z1 !== wire.z1 ||
      original.x2 !== wire.x2 || original.y2 !== wire.y2 || original.z2 !== wire.z2;
    if (!geometryChanged) return wire;
    return { ...wire, segments: computeSegments(wire, designFrequencyMhz) };
  });
}

function lengthLockConflict(before: readonly EditorWire[], after: readonly EditorWire[]): number | null {
  for (const original of before) {
    if (!original.lengthLocked) continue;
    const updated = after.find((wire) => wire.tag === original.tag);
    if (updated && Math.abs(wireLength(original) - wireLength(updated)) > 1e-7) {
      return original.tag;
    }
  }
  return null;
}

function actionResult(ok: boolean, message: string): EditorActionResult {
  return { ok, message };
}

function setEndpointPosition(
  wires: readonly EditorWire[],
  ref: EndpointRef,
  position: Point3,
): EditorWire[] {
  return wires.map((wire) =>
    wire.tag === ref.wireTag
      ? withEndpointPosition(wire, ref.endpoint, position)
      : wire,
  );
}

function replaceWireInJunctions(
  junctions: readonly EditorJunction[],
  oldTag: number,
  firstTag: number,
  lastTag: number,
): EditorJunction[] {
  return junctions.map((junction) => ({
    ...junction,
    endpoints: junction.endpoints.map((endpoint) => {
      if (endpoint.wireTag !== oldTag) return { ...endpoint };
      return endpoint.endpoint === "start"
        ? { wireTag: firstTag, endpoint: "start" as const }
        : { wireTag: lastTag, endpoint: "end" as const };
    }),
  }));
}

function appendChainJunctions(
  junctions: EditorJunction[],
  wires: readonly EditorWire[],
  nextJunctionId: number,
): { junctions: EditorJunction[]; nextJunctionId: number } {
  const result = [...junctions];
  let id = nextJunctionId;
  for (let index = 0; index < wires.length - 1; index += 1) {
    result.push({
      id: id++,
      endpoints: [
        { wireTag: wires[index]!.tag, endpoint: "end" },
        { wireTag: wires[index + 1]!.tag, endpoint: "start" },
      ],
    });
  }
  return { junctions: result, nextJunctionId: id };
}

function cloneContainedJunctions(
  junctions: readonly EditorJunction[],
  tagMap: ReadonlyMap<number, number>,
  nextJunctionId: number,
): { junctions: EditorJunction[]; nextJunctionId: number } {
  const cloned: EditorJunction[] = [];
  let id = nextJunctionId;
  for (const junction of junctions) {
    const endpoints = junction.endpoints.flatMap((endpoint) => {
      const wireTag = tagMap.get(endpoint.wireTag);
      return wireTag === undefined ? [] : [{ wireTag, endpoint: endpoint.endpoint }];
    });
    if (endpoints.length >= 2) cloned.push({ id: id++, endpoints });
  }
  return { junctions: cloned, nextJunctionId: id };
}

/** Snap a coordinate to grid */
function snap(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  wires: [],
  excitations: [],
  loads: [],
  transmissionLines: [],
  junctions: [],
  nextJunctionId: 1,
  computeCurrents: true,
  selectedTags: new Set<number>(),
  selectedEndpoints: [],
  lastEditorMessage: null,
  mode: "select",
  verticalDrag: false,
  ground: { ...DEFAULT_GROUND },
  frequencyRange: { ...DEFAULT_FREQ },
  frequencySegments: [],
  snapSize: 0.1,
  showGrid: true,
  nextTag: 1,
  designFrequencyMhz: DEFAULT_FREQUENCY_MHZ,
  clipboard: [],
  clipboardJunctions: [],

  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  geometryTransaction: null,

  // ---- Wire CRUD ----

  addWire: (wireInput) => {
    const state = get();
    const tag = state.nextTag;
    const segments = computeSegments(wireInput, state.designFrequencyMhz);
    const wire: EditorWire = {
      ...wireInput,
      tag,
      segments,
      radius: wireInput.radius || DEFAULT_WIRE_RADIUS,
    };
    set({
      ...pushUndo(state),
      wires: [...state.wires, wire],
      nextTag: tag + 1,
      // Auto-add excitation if this is the first wire
      excitations: state.excitations.length === 0
        ? [{ wire_tag: tag, segment: centerSegment(segments), voltage_real: 1, voltage_imag: 0 }]
        : state.excitations,
    });
    return tag;
  },

  addWireRaw: (wire) => {
    const state = get();
    set({
      ...pushUndo(state),
      wires: [...state.wires, { ...wire }],
      nextTag: Math.max(state.nextTag, wire.tag + 1),
    });
  },

  updateWire: (tag, updates) => {
    const state = get();
    const idx = state.wires.findIndex((w) => w.tag === tag);
    if (idx === -1) return;

    const wire = state.wires[idx]!;
    const updated = { ...wire, ...updates };

    // If segments explicitly set by user, mark as manual override
    if (updates.segments !== undefined) {
      updated.segments = Math.max(1, Math.min(200, Math.round(updates.segments)));
      updated.segmentsManual = true;
    }

    // Recompute segments if geometry changed and not manually overridden
    if (!updated.segmentsManual &&
        (updates.x1 !== undefined || updates.y1 !== undefined || updates.z1 !== undefined ||
         updates.x2 !== undefined || updates.y2 !== undefined || updates.z2 !== undefined)) {
      updated.segments = computeSegments(updated, state.designFrequencyMhz);
    }

    let newWires = [...state.wires];
    newWires[idx] = updated;

    const startChanged = updated.x1 !== wire.x1 || updated.y1 !== wire.y1 || updated.z1 !== wire.z1;
    const endChanged = updated.x2 !== wire.x2 || updated.y2 !== wire.y2 || updated.z2 !== wire.z2;
    const positionByEndpoint: Array<[EndpointRef, Point3]> = [];
    if (startChanged) {
      positionByEndpoint.push([
        { wireTag: tag, endpoint: "start" },
        { x: updated.x1, y: updated.y1, z: updated.z1 },
      ]);
    }
    if (endChanged) {
      positionByEndpoint.push([
        { wireTag: tag, endpoint: "end" },
        { x: updated.x2, y: updated.y2, z: updated.z2 },
      ]);
    }
    for (const [endpoint, position] of positionByEndpoint) {
      for (const member of expandJunctionEndpoints([endpoint], state.junctions)) {
        newWires = setEndpointPosition(newWires, member, position);
      }
    }

    const conflict = lengthLockConflict(state.wires, newWires);
    if (conflict !== null) {
      set({ lastEditorMessage: `Wire ${conflict} has a locked length. Unlock it before editing connected coordinates.` });
      return;
    }

    newWires = recomputeMovedWireSegments(state.wires, newWires, state.designFrequencyMhz);
    const references = reconcileSegmentReferences(state, newWires);
    set({
      ...pushUndo(state),
      wires: newWires,
      ...references,
      lastEditorMessage: null,
    });
  },

  moveWire: (tag, dx, dy, dz) => {
    const state = get();
    const wire = state.wires.find((candidate) => candidate.tag === tag);
    if (!wire) return;
    if (dx === 0 && dy === 0 && dz === 0) return;
    const refs = expandJunctionEndpoints(
      [
        { wireTag: tag, endpoint: "start" },
        { wireTag: tag, endpoint: "end" },
      ],
      state.junctions,
    );
    const translated = translateEndpoints(state.wires, refs, { x: dx, y: dy, z: dz });
    const conflict = lengthLockConflict(state.wires, translated);
    if (conflict !== null) {
      set({ lastEditorMessage: `Wire ${conflict} has a locked length and prevents this connected move.` });
      return;
    }
    const newWires = recomputeMovedWireSegments(state.wires, translated, state.designFrequencyMhz);
    set({
      ...geometryHistory(state),
      wires: newWires,
      ...reconcileSegmentReferences(state, newWires),
      lastEditorMessage: null,
    });
  },

  moveEndpoint: (tag, endpoint, dx, dy, dz) => {
    const state = get();
    const source = { wireTag: tag, endpoint };
    if (!getEndpointPosition(state.wires, source)) {
      return actionResult(false, "The selected endpoint no longer exists.");
    }
    if (dx === 0 && dy === 0 && dz === 0) {
      return actionResult(true, "Endpoint unchanged.");
    }
    const refs = expandJunctionEndpoints([source], state.junctions);
    const translated = translateEndpoints(state.wires, refs, { x: dx, y: dy, z: dz });
    const conflict = lengthLockConflict(state.wires, translated);
    if (conflict !== null) {
      const message = `Wire ${conflict} has a locked length and prevents this junction move.`;
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }
    const newWires = recomputeMovedWireSegments(state.wires, translated, state.designFrequencyMhz);
    set({
      ...geometryHistory(state),
      wires: newWires,
      ...reconcileSegmentReferences(state, newWires),
      lastEditorMessage: null,
    });
    return actionResult(true, refs.length > 1 ? `Moved ${refs.length} locked endpoints.` : "Moved endpoint.");
  },

  moveSelected: (dx, dy, dz) => {
    const state = get();
    if (state.selectedTags.size === 0) return;
    if (dx === 0 && dy === 0 && dz === 0) return;
    const refs = expandJunctionEndpoints(
      [...state.selectedTags].flatMap((wireTag) => [
        { wireTag, endpoint: "start" as const },
        { wireTag, endpoint: "end" as const },
      ]),
      state.junctions,
    );
    const translated = translateEndpoints(state.wires, refs, { x: dx, y: dy, z: dz });
    const conflict = lengthLockConflict(state.wires, translated);
    if (conflict !== null) {
      set({ lastEditorMessage: `Wire ${conflict} has a locked length and prevents this connected move.` });
      return;
    }
    const newWires = recomputeMovedWireSegments(state.wires, translated, state.designFrequencyMhz);
    set({
      ...geometryHistory(state),
      wires: newWires,
      ...reconcileSegmentReferences(state, newWires),
      lastEditorMessage: null,
    });
  },

  moveAllWiresZ: (dz) => {
    const state = get();
    if (dz === 0 || state.wires.length === 0) return;
    const newWires = state.wires.map((w) => ({
      ...w,
      z1: w.z1 + dz,
      z2: w.z2 + dz,
    }));
    set({ ...pushUndo(state), wires: newWires });
  },

  deleteWires: (tags) => {
    const state = get();
    const tagSet = new Set(tags);
    const newWires = state.wires.filter((w) => !tagSet.has(w.tag));
    const newExcitations = state.excitations.filter((e) => !tagSet.has(e.wire_tag));
    const newSelected = new Set(state.selectedTags);
    for (const t of tags) newSelected.delete(t);
    const newJunctions = state.junctions
      .map((junction) => ({
        ...junction,
        endpoints: junction.endpoints.filter((endpoint) => !tagSet.has(endpoint.wireTag)),
      }))
      .filter((junction) => junction.endpoints.length >= 2);
    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
      selectedEndpoints: state.selectedEndpoints.filter((endpoint) => !tagSet.has(endpoint.wireTag)),
      junctions: newJunctions,
    });
  },

  deleteSelected: () => {
    const state = get();
    if (state.selectedTags.size === 0) return;
    get().deleteWires([...state.selectedTags]);
  },

  splitWire: (tag) => {
    const state = get();
    const wire = state.wires.find((w) => w.tag === tag);
    if (!wire) return;

    const midX = (wire.x1 + wire.x2) / 2;
    const midY = (wire.y1 + wire.y2) / 2;
    const midZ = (wire.z1 + wire.z2) / 2;

    const tag1 = state.nextTag;
    const tag2 = state.nextTag + 1;

    const wire1: EditorWire = {
      ...wire,
      tag: tag1,
      x2: midX,
      y2: midY,
      z2: midZ,
      segments: computeSegments({ x1: wire.x1, y1: wire.y1, z1: wire.z1, x2: midX, y2: midY, z2: midZ }, state.designFrequencyMhz),
      segmentsManual: false,
    };
    const wire2: EditorWire = {
      ...wire,
      tag: tag2,
      x1: midX,
      y1: midY,
      z1: midZ,
      segments: computeSegments({ x1: midX, y1: midY, z1: midZ, x2: wire.x2, y2: wire.y2, z2: wire.z2 }, state.designFrequencyMhz),
      segmentsManual: false,
    };

    // Update excitations if they reference the split wire.
    // Map segment to the correct half based on its original position.
    const halfSegment = Math.ceil(wire.segments / 2);
    const newExcitations = state.excitations.map((e) => {
      if (e.wire_tag === tag) {
        if (e.segment <= halfSegment) {
          // Falls in first half — scale into wire1's segment range
          const ratio = e.segment / halfSegment;
          const newSeg = Math.max(1, Math.min(wire1.segments, Math.round(ratio * wire1.segments)));
          return { ...e, wire_tag: tag1, segment: newSeg };
        } else {
          // Falls in second half — scale into wire2's segment range
          const offsetInSecondHalf = e.segment - halfSegment;
          const secondHalfTotal = wire.segments - halfSegment;
          const ratio = offsetInSecondHalf / secondHalfTotal;
          const newSeg = Math.max(1, Math.min(wire2.segments, Math.round(ratio * wire2.segments)));
          return { ...e, wire_tag: tag2, segment: newSeg };
        }
      }
      return e;
    });

    const newWires = state.wires.filter((w) => w.tag !== tag).concat([wire1, wire2]);
    const newSelected = new Set(state.selectedTags);
    newSelected.delete(tag);
    newSelected.add(tag1);
    newSelected.add(tag2);

    const transferredJunctions = state.junctions.map((junction) => ({
      ...junction,
      endpoints: junction.endpoints.map((endpoint) => {
        if (endpoint.wireTag !== tag) return endpoint;
        return endpoint.endpoint === "start"
          ? { wireTag: tag1, endpoint: "start" as const }
          : { wireTag: tag2, endpoint: "end" as const };
      }),
    }));
    const midpointJunction: EditorJunction = {
      id: state.nextJunctionId,
      endpoints: [
        { wireTag: tag1, endpoint: "end" },
        { wireTag: tag2, endpoint: "start" },
      ],
    };

    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: [...transferredJunctions, midpointJunction],
      nextJunctionId: state.nextJunctionId + 1,
      nextTag: tag2 + 1,
    });
  },

  setWireLength: (tag, length, anchor) => {
    const state = get();
    const wire = state.wires.find((w) => w.tag === tag);
    if (!wire || length <= 0) return;

    // Anchor is the fixed end; the other end moves along the direction vector
    const [ax, ay, az] = anchor === "start"
      ? [wire.x1, wire.y1, wire.z1]
      : [wire.x2, wire.y2, wire.z2];
    const [mx, my, mz] = anchor === "start"
      ? [wire.x2, wire.y2, wire.z2]
      : [wire.x1, wire.y1, wire.z1];

    let dx = mx - ax, dy = my - ay, dz = mz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 1e-9) {
      // Zero-length wire: extend along +Z
      dx = 0; dy = 0; dz = 1;
    } else {
      dx /= dist; dy /= dist; dz /= dist;
    }

    const newX = ax + dx * length;
    const newY = ay + dy * length;
    const newZ = az + dz * length;

    const movingEndpoint: WireEndpoint = anchor === "start" ? "end" : "start";
    const currentPosition = movingEndpoint === "start"
      ? { x: wire.x1, y: wire.y1, z: wire.z1 }
      : { x: wire.x2, y: wire.y2, z: wire.z2 };
    const refs = expandJunctionEndpoints(
      [{ wireTag: tag, endpoint: movingEndpoint }],
      state.junctions,
    );
    const translated = translateEndpoints(state.wires, refs, {
      x: newX - currentPosition.x,
      y: newY - currentPosition.y,
      z: newZ - currentPosition.z,
    });
    // Editing this wire's length is an explicit override, even when its own
    // length lock is enabled. Other connected length locks still protect
    // their wires from being stretched by the resize.
    const conflict = lengthLockConflict(
      state.wires.map((candidate) => candidate.tag === tag
        ? { ...candidate, lengthLocked: false }
        : candidate),
      translated,
    );
    if (conflict !== null) {
      set({ lastEditorMessage: `Wire ${conflict} has a locked length and prevents resizing this connection.` });
      return;
    }
    const newWires = recomputeMovedWireSegments(
      state.wires,
      translated,
      state.designFrequencyMhz,
    );

    set({
      ...pushUndo(state),
      wires: newWires,
      ...reconcileSegmentReferences(state, newWires),
      lastEditorMessage: null,
    });
  },

  toggleLengthLock: (tag) => {
    const state = get();
    const newWires = state.wires.map((w) =>
      w.tag === tag ? { ...w, lengthLocked: !w.lengthLocked } : w
    );
    set({ ...pushUndo(state), wires: newWires });
  },

  bendWire: (tag, _position, angleDeg, plane, numSegments = 2) => {
    const state = get();
    const wire = state.wires.find((w) => w.tag === tag);
    if (!wire || numSegments < 2) return;

    const n = Math.min(numSegments, 20);

    const totalDx = wire.x2 - wire.x1, totalDy = wire.y2 - wire.y1, totalDz = wire.z2 - wire.z1;
    const totalLen = Math.sqrt(totalDx * totalDx + totalDy * totalDy + totalDz * totalDz);
    if (totalLen < 1e-9) return;

    // Equal-length segments, bend angle distributed at each joint
    const segmentLen = totalLen / n;
    const anglePerJoint = (angleDeg * Math.PI) / 180 / (n - 1);

    // Helper: rotate direction vector in the chosen plane
    const rotateDir = (dx: number, dy: number, dz: number, angle: number): [number, number, number] => {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      if (plane === "horizontal") {
        return [dx * cos - dy * sin, dx * sin + dy * cos, dz];
      }
      const hLen = Math.sqrt(dx * dx + dy * dy);
      if (hLen < 1e-9) {
        return [dz * sin, 0, dz * cos];
      }
      const hx = dx / hLen, hy = dy / hLen;
      const newH = hLen * cos - dz * sin;
      const newV = hLen * sin + dz * cos;
      return [hx * newH, hy * newH, newV];
    };

    let dirX = totalDx / totalLen, dirY = totalDy / totalLen, dirZ = totalDz / totalLen;
    let curX = wire.x1, curY = wire.y1, curZ = wire.z1;

    const newWiresList: EditorWire[] = [];
    const newSelected = new Set(state.selectedTags);
    newSelected.delete(tag);
    let nextTag = state.nextTag;

    for (let i = 0; i < n; i++) {
      if (i > 0) {
        [dirX, dirY, dirZ] = rotateDir(dirX, dirY, dirZ, anglePerJoint);
      }

      const endX = curX + dirX * segmentLen;
      const endY = curY + dirY * segmentLen;
      const endZ = curZ + dirZ * segmentLen;

      const newTag = nextTag++;
      newWiresList.push({
        ...wire,
        tag: newTag,
        x1: curX, y1: curY, z1: curZ,
        x2: endX, y2: endY, z2: endZ,
        segments: computeSegments(
          { x1: curX, y1: curY, z1: curZ, x2: endX, y2: endY, z2: endZ },
          state.designFrequencyMhz,
        ),
        segmentsManual: false,
      });
      newSelected.add(newTag);

      curX = endX; curY = endY; curZ = endZ;
    }

    // Remap excitations: assign to the first new wire at a scaled segment
    const newExcitations = state.excitations.map((e) => {
      if (e.wire_tag !== tag) return e;
      const firstWire = newWiresList[0]!;
      const ratio = e.segment / wire.segments;
      return { ...e, wire_tag: firstWire.tag, segment: Math.max(1, Math.min(firstWire.segments, Math.round(ratio * firstWire.segments))) };
    });

    let newWires = state.wires.filter((w) => w.tag !== tag).concat(newWiresList);
    const transferredJunctions = replaceWireInJunctions(
      state.junctions,
      tag,
      newWiresList[0]!.tag,
      newWiresList[newWiresList.length - 1]!.tag,
    );
    const chain = appendChainJunctions(
      transferredJunctions,
      newWiresList,
      state.nextJunctionId,
    );
    const bentEnd = { wireTag: newWiresList[newWiresList.length - 1]!.tag, endpoint: "end" as const };
    const bentEndPosition = getEndpointPosition(newWires, bentEnd)!;
    const externalJunction = findEndpointJunction(chain.junctions, bentEnd);
    if (externalJunction) {
      for (const member of externalJunction.endpoints) {
        newWires = setEndpointPosition(newWires, member, bentEndPosition);
      }
      const conflict = lengthLockConflict(state.wires, newWires);
      if (conflict !== null) {
        set({ lastEditorMessage: `Wire ${conflict} has a locked length and prevents bending this connection.` });
        return;
      }
      newWires = recomputeMovedWireSegments(state.wires, newWires, state.designFrequencyMhz);
    }

    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: chain.junctions,
      nextJunctionId: chain.nextJunctionId,
      nextTag,
      lastEditorMessage: null,
    });
  },

  hangWire: (tag, numSegments, targetLength) => {
    const state = get();
    const wire = state.wires.find((w) => w.tag === tag);
    if (!wire || numSegments < 2) return;

    const n = Math.min(numSegments, 30);

    // Endpoints (NEC2 coords)
    const ax = wire.x1, ay = wire.y1, az = wire.z1;
    const bx = wire.x2, by = wire.y2, bz = wire.z2;

    // Use target length if provided, otherwise current wire length
    const currentLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2);
    const wireLen = targetLength ?? currentLen;
    if (wireLen < 1e-9) return;

    // Horizontal span (XY distance) and vertical difference
    const hSpan = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    const vDiff = bz - az; // height difference

    // Straight-line 3D span
    const span = Math.sqrt(hSpan * hSpan + vDiff * vDiff);

    // Sag: parabolic approximation. If wire is taut (L ≈ span), minimal sag.
    // maxSag = sqrt(3 * span * (wireLen - span) / 8)
    const slack = Math.max(0, wireLen - span);
    const maxSag = slack > 1e-6 ? Math.sqrt(3 * span * slack / 8) : 0;

    // Build points along the catenary/parabolic curve
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Linear interpolation for the straight-line baseline
      const lx = ax + (bx - ax) * t;
      const ly = ay + (by - ay) * t;
      const lz = az + (bz - az) * t;
      // Parabolic sag below the baseline (4*s*t*(1-t) peaks at midpoint)
      const sag = 4 * maxSag * t * (1 - t);
      points.push({ x: lx, y: ly, z: lz - sag });
    }

    // Create wire segments
    const newWiresList: EditorWire[] = [];
    const newSelected = new Set(state.selectedTags);
    newSelected.delete(tag);
    let nextTag = state.nextTag;

    for (let i = 0; i < n; i++) {
      const p1 = points[i]!, p2 = points[i + 1]!;
      const newTag = nextTag++;
      newWiresList.push({
        ...wire,
        tag: newTag,
        x1: p1.x, y1: p1.y, z1: p1.z,
        x2: p2.x, y2: p2.y, z2: p2.z,
        segments: computeSegments(
          { x1: p1.x, y1: p1.y, z1: p1.z, x2: p2.x, y2: p2.y, z2: p2.z },
          state.designFrequencyMhz,
        ),
        segmentsManual: false,
        lengthLocked: false,
      });
      newSelected.add(newTag);
    }

    // Remap excitations to first segment
    const newExcitations = state.excitations.map((e) => {
      if (e.wire_tag !== tag) return e;
      const firstWire = newWiresList[0]!;
      const ratio = e.segment / wire.segments;
      return { ...e, wire_tag: firstWire.tag, segment: Math.max(1, Math.min(firstWire.segments, Math.round(ratio * firstWire.segments))) };
    });

    const newWires = state.wires.filter((w) => w.tag !== tag).concat(newWiresList);
    const transferredJunctions = replaceWireInJunctions(
      state.junctions,
      tag,
      newWiresList[0]!.tag,
      newWiresList[newWiresList.length - 1]!.tag,
    );
    const chain = appendChainJunctions(
      transferredJunctions,
      newWiresList,
      state.nextJunctionId,
    );
    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: chain.junctions,
      nextJunctionId: chain.nextJunctionId,
      nextTag,
    });
  },

  resetSegments: (tag) => {
    const state = get();
    const idx = state.wires.findIndex((w) => w.tag === tag);
    if (idx === -1) return;

    const wire = state.wires[idx]!;
    const segments = computeSegments(wire, state.designFrequencyMhz);
    const updated = { ...wire, segments, segmentsManual: false };
    const newWires = [...state.wires];
    newWires[idx] = updated;
    const newExcitations = fixExcitations(state.excitations, newWires);
    set({ ...pushUndo(state), wires: newWires, excitations: newExcitations });
  },

  clearAll: () => {
    const state = get();
    set({
      ...pushUndo(state),
      wires: [],
      excitations: [],
      loads: [],
      transmissionLines: [],
      selectedTags: new Set(),
      selectedEndpoints: [],
      junctions: [],
      nextJunctionId: 1,
      nextTag: 1,
    });
  },

  setWires: (wires, excitations, junctions = []) => {
    const state = get();
    const maxTag = wires.reduce((max, w) => Math.max(max, w.tag), 0);
    const newWires = wires.map((w) => ({ ...w }));
    const rawExcitations = excitations?.map((e) => ({ ...e })) ?? state.excitations;
    // Fix any excitation segment indices that exceed wire segment counts
    const fixedExcitations = fixExcitations(rawExcitations, newWires);
    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: fixedExcitations,
      selectedTags: new Set(),
      selectedEndpoints: [],
      junctions: junctions.map((junction) => ({
        ...junction,
        endpoints: junction.endpoints.map((endpoint) => ({ ...endpoint })),
      })),
      nextJunctionId: junctions.reduce((max, junction) => Math.max(max, junction.id), 0) + 1,
      nextTag: maxTag + 1,
    });
  },

  // ---- Selection ----

  selectWire: (tag, additive = false) => {
    const state = get();
    if (additive) {
      const newSelected = new Set(state.selectedTags);
      newSelected.add(tag);
      set({ selectedTags: newSelected });
    } else {
      set({ selectedTags: new Set([tag]) });
    }
  },

  deselectAll: () => {
    set({ selectedTags: new Set() });
  },

  selectAll: () => {
    const state = get();
    set({ selectedTags: new Set(state.wires.map((w) => w.tag)) });
  },

  toggleSelection: (tag) => {
    const state = get();
    const newSelected = new Set(state.selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    set({ selectedTags: newSelected });
  },

  selectEndpoint: (ref) => {
    const state = get();
    if (!getEndpointPosition(state.wires, ref)) return;
    const existingIndex = state.selectedEndpoints.findIndex((candidate) =>
      sameEndpoint(candidate, ref),
    );
    if (existingIndex >= 0) {
      set({
        selectedEndpoints: state.selectedEndpoints.filter((_, index) => index !== existingIndex),
        lastEditorMessage: null,
      });
      return;
    }
    const selectedEndpoints = state.selectedEndpoints.length < 2
      ? [...state.selectedEndpoints, { ...ref }]
      : [{ ...ref }];
    set({ selectedEndpoints, lastEditorMessage: null });
  },

  clearEndpointSelection: () => set({ selectedEndpoints: [], lastEditorMessage: null }),

  snapSelectedEndpoints: (preserveLength) => {
    const state = get();
    const [source, target] = state.selectedEndpoints;
    if (!source || !target) {
      const message = "Select a source endpoint, then a target endpoint.";
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }
    if (source.wireTag === target.wireTag) {
      const message = "Source and target must belong to different wires.";
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }
    const sourcePosition = getEndpointPosition(state.wires, source);
    const targetPosition = getEndpointPosition(state.wires, target);
    if (!sourcePosition || !targetPosition) {
      const message = "One of the selected endpoints no longer exists.";
      set({ lastEditorMessage: message, selectedEndpoints: [] });
      return actionResult(false, message);
    }

    const initialRefs: EndpointRef[] = preserveLength
      ? [
          { wireTag: source.wireTag, endpoint: "start" },
          { wireTag: source.wireTag, endpoint: "end" },
        ]
      : [source];
    const refs = expandJunctionEndpoints(initialRefs, state.junctions);
    if (refs.some((ref) => sameEndpoint(ref, target))) {
      const message = "The target is already part of the connection being moved.";
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }

    const delta: Point3 = {
      x: targetPosition.x - sourcePosition.x,
      y: targetPosition.y - sourcePosition.y,
      z: targetPosition.z - sourcePosition.z,
    };
    const translated = translateEndpoints(state.wires, refs, delta);
    const conflict = lengthLockConflict(state.wires, translated);
    if (conflict !== null) {
      const message = `Wire ${conflict} has a locked length. Unlock it before snapping this connection.`;
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }
    const newWires = recomputeMovedWireSegments(state.wires, translated, state.designFrequencyMhz);
    const message = preserveLength
      ? `Snapped Wire ${source.wireTag} without changing its length.`
      : `Snapped Wire ${source.wireTag} ${source.endpoint} to Wire ${target.wireTag} ${target.endpoint}.`;
    set({
      ...pushUndo(state),
      wires: newWires,
      ...reconcileSegmentReferences(state, newWires),
      selectedEndpoints: [],
      lastEditorMessage: message,
    });
    return actionResult(true, message);
  },

  toggleSelectedJunction: () => {
    const state = get();
    const source = state.selectedEndpoints[0];
    if (!source) {
      const message = "Select one endpoint to lock or unlock its junction.";
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }

    const existing = findEndpointJunction(state.junctions, source);
    if (existing) {
      const message = `Unlocked Junction ${existing.id}.`;
      set({
        ...pushUndo(state),
        junctions: state.junctions.filter((junction) => junction.id !== existing.id),
        selectedEndpoints: [],
        lastEditorMessage: message,
      });
      return actionResult(true, message);
    }

    const sourcePosition = getEndpointPosition(state.wires, source);
    if (!sourcePosition) {
      const message = "The selected endpoint no longer exists.";
      set({ lastEditorMessage: message, selectedEndpoints: [] });
      return actionResult(false, message);
    }
    const coincident = findCoincidentEndpoints(state.wires, source);
    if (coincident.length < 2) {
      const message = "No other endpoints are located at the selected point.";
      set({ lastEditorMessage: message });
      return actionResult(false, message);
    }

    const junctionIdsToMerge = new Set<number>();
    const endpoints = new Map<string, EndpointRef>();
    for (const endpoint of coincident) {
      endpoints.set(`${endpoint.wireTag}:${endpoint.endpoint}`, endpoint);
      const junction = findEndpointJunction(state.junctions, endpoint);
      if (junction) {
        junctionIdsToMerge.add(junction.id);
        for (const member of junction.endpoints) {
          endpoints.set(`${member.wireTag}:${member.endpoint}`, member);
        }
      }
    }
    const junction: EditorJunction = {
      id: state.nextJunctionId,
      endpoints: [...endpoints.values()],
    };
    let normalizedWires = state.wires;
    for (const endpoint of junction.endpoints) {
      normalizedWires = setEndpointPosition(normalizedWires, endpoint, sourcePosition);
    }
    normalizedWires = recomputeMovedWireSegments(
      state.wires,
      normalizedWires,
      state.designFrequencyMhz,
    );
    const message = `Locked ${junction.endpoints.length} endpoints in Junction ${junction.id}.`;
    set({
      ...pushUndo(state),
      wires: normalizedWires,
      ...reconcileSegmentReferences(state, normalizedWires),
      junctions: [
        ...state.junctions.filter((candidate) => !junctionIdsToMerge.has(candidate.id)),
        junction,
      ],
      nextJunctionId: state.nextJunctionId + 1,
      selectedEndpoints: [],
      lastEditorMessage: message,
    });
    return actionResult(true, message);
  },

  setJunctions: (junctions) => {
    const validTags = new Set(get().wires.map((wire) => wire.tag));
    const sanitized = junctions
      .map((junction) => ({
        ...junction,
        endpoints: junction.endpoints.filter((endpoint) => validTags.has(endpoint.wireTag)),
      }))
      .filter((junction) => junction.endpoints.length >= 2);
    set({
      junctions: sanitized,
      nextJunctionId: sanitized.reduce((max, junction) => Math.max(max, junction.id), 0) + 1,
      selectedEndpoints: [],
    });
  },

  clearEditorMessage: () => set({ lastEditorMessage: null }),

  // ---- Mode ----

  setMode: (mode) => set({ mode, verticalDrag: false }),
  setVerticalDrag: (on) => set({ verticalDrag: on }),

  // ---- Settings ----

  setGround: (ground) => set({ ground }),
  setFrequencyRange: (freq) => set({ frequencyRange: freq }),
  setFrequencySegments: (segments) => set({ frequencySegments: segments }),
  addFrequencySegment: (segment) => {
    const state = get();
    set({ frequencySegments: [...state.frequencySegments, segment] });
  },
  removeFrequencySegment: (index) => {
    const state = get();
    set({ frequencySegments: state.frequencySegments.filter((_, i) => i !== index) });
  },
  updateFrequencySegment: (index, segment) => {
    const state = get();
    const updated = [...state.frequencySegments];
    updated[index] = segment;
    set({ frequencySegments: updated });
  },
  clearFrequencySegments: () => set({ frequencySegments: [] }),
  setSnapSize: (size) => set({ snapSize: size }),
  setShowGrid: (show) => set({ showGrid: show }),
  setDesignFrequency: (mhz) => {
    const state = get();
    const designFrequencyMhz = clampFrequencyMhz(mhz);
    // Recompute wire segments with new design frequency (skip manually overridden)
    const newWires = state.wires.map((w) =>
      w.segmentsManual ? { ...w } : { ...w, segments: computeSegments(w, designFrequencyMhz) }
    );
    // Scale a segment reference on a wire proportionally to its new segment count,
    // so excitations, loads, and transmission lines keep their relative position
    // when a wire is re-segmented.
    const scaleSeg = (tag: number, seg: number): number => {
      const oldWire = state.wires.find((w) => w.tag === tag);
      const newWire = newWires.find((w) => w.tag === tag);
      if (oldWire && newWire && oldWire.segments !== newWire.segments) {
        const ratio = seg / oldWire.segments;
        return Math.max(1, Math.min(newWire.segments, Math.round(ratio * newWire.segments)));
      }
      return seg;
    };
    const newExcitations = state.excitations.map((e) => ({
      ...e,
      segment: scaleSeg(e.wire_tag, e.segment),
    }));
    const newLoads = state.loads.map((l) => ({
      ...l,
      segment_start: scaleSeg(l.wire_tag, l.segment_start),
      segment_end: scaleSeg(l.wire_tag, l.segment_end),
    }));
    const newTransmissionLines = state.transmissionLines.map((tl) => ({
      ...tl,
      segment1: scaleSeg(tl.wire_tag1, tl.segment1),
      segment2: scaleSeg(tl.wire_tag2, tl.segment2),
    }));
    // Update frequency range to center on the new design frequency (~10% bandwidth)
    const bandwidth = designFrequencyMhz * 0.1;
    const newStart = Math.round(Math.max(MIN_FREQUENCY_MHZ, designFrequencyMhz - bandwidth / 2) * 1000) / 1000;
    const newStop = Math.round(Math.min(MAX_FREQUENCY_MHZ, designFrequencyMhz + bandwidth / 2) * 1000) / 1000;
    const newFreqRange: FrequencyRange = {
      start_mhz: newStart,
      stop_mhz: newStop,
      steps: computeSteps(newStart, newStop),
    };
    set({
      ...pushUndo(state),
      designFrequencyMhz,
      wires: newWires,
      excitations: newExcitations,
      loads: newLoads,
      transmissionLines: newTransmissionLines,
      frequencyRange: newFreqRange,
    });
  },

  // ---- Excitation ----

  pickingExcitationForTag: null,

  setPickingExcitationForTag: (tag) => set({ pickingExcitationForTag: tag }),

  setExcitation: (wireTag, segment) => {
    const state = get();
    const existing = state.excitations.findIndex((e) => e.wire_tag === wireTag);
    const exc: Excitation = { wire_tag: wireTag, segment, voltage_real: 1, voltage_imag: 0 };
    let newExcitations: Excitation[];
    if (existing >= 0) {
      newExcitations = [...state.excitations];
      newExcitations[existing] = exc;
    } else {
      newExcitations = [...state.excitations, exc];
    }
    set({ ...pushUndo(state), excitations: newExcitations });
  },

  removeExcitation: (wireTag) => {
    const state = get();
    set({
      ...pushUndo(state),
      excitations: state.excitations.filter((e) => e.wire_tag !== wireTag),
    });
  },

  // ---- V2: Loads ----

  addLoad: (load) => {
    const state = get();
    set({ ...pushUndo(state), loads: [...state.loads, { ...load }] });
  },

  updateLoad: (index, load) => {
    const state = get();
    const newLoads = [...state.loads];
    newLoads[index] = { ...load };
    set({ ...pushUndo(state), loads: newLoads });
  },

  removeLoad: (index) => {
    const state = get();
    set({ ...pushUndo(state), loads: state.loads.filter((_, i) => i !== index) });
  },

  // ---- V2: Transmission Lines ----

  addTransmissionLine: (tl) => {
    const state = get();
    set({ ...pushUndo(state), transmissionLines: [...state.transmissionLines, { ...tl }] });
  },

  updateTransmissionLine: (index, tl) => {
    const state = get();
    const newTLs = [...state.transmissionLines];
    newTLs[index] = { ...tl };
    set({ ...pushUndo(state), transmissionLines: newTLs });
  },

  removeTransmissionLine: (index) => {
    const state = get();
    set({ ...pushUndo(state), transmissionLines: state.transmissionLines.filter((_, i) => i !== index) });
  },

  // ---- V2: Currents ----

  setComputeCurrents: (compute) => set({ computeCurrents: compute }),

  // ---- Clipboard / Transform ----

  copySelected: () => {
    const state = get();
    const selected = state.wires.filter((w) => state.selectedTags.has(w.tag));
    if (selected.length === 0) return;
    const selectedTags = new Set(selected.map((wire) => wire.tag));
    const clipboardJunctions = state.junctions.flatMap((junction) => {
      const endpoints = junction.endpoints.filter((endpoint) => selectedTags.has(endpoint.wireTag));
      return endpoints.length >= 2 ? [{ ...junction, endpoints: endpoints.map((endpoint) => ({ ...endpoint })) }] : [];
    });
    set({
      clipboard: selected.map((w) => ({ ...w })),
      clipboardJunctions,
    });
  },

  paste: () => {
    const state = get();
    if (state.clipboard.length === 0) return;

    let tag = state.nextTag;
    const tagMap = new Map<number, number>();
    const newWires: EditorWire[] = state.clipboard.map((w) => {
      const newTag = tag++;
      tagMap.set(w.tag, newTag);
      return {
        ...w,
        tag: newTag,
        y1: w.y1 + 1, // offset 1m in Y
        y2: w.y2 + 1,
        selected: false,
      };
    });
    const cloned = cloneContainedJunctions(
      state.clipboardJunctions,
      tagMap,
      state.nextJunctionId,
    );

    const newSelected = new Set(newWires.map((w) => w.tag));

    set({
      ...pushUndo(state),
      wires: [...state.wires, ...newWires],
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: [...state.junctions, ...cloned.junctions],
      nextJunctionId: cloned.nextJunctionId,
      nextTag: tag,
    });
  },

  duplicateSelected: () => {
    const state = get();
    const selected = state.wires.filter((w) => state.selectedTags.has(w.tag));
    if (selected.length === 0) return;

    let tag = state.nextTag;
    const tagMap = new Map<number, number>();
    const newWires: EditorWire[] = selected.map((w) => {
      const newTag = tag++;
      tagMap.set(w.tag, newTag);
      return {
        ...w,
        tag: newTag,
        y1: w.y1 + 0.5, // offset 0.5m in Y
        y2: w.y2 + 0.5,
        selected: false,
      };
    });
    const cloned = cloneContainedJunctions(
      state.junctions,
      tagMap,
      state.nextJunctionId,
    );

    // Also duplicate excitations that reference selected wires
    const newExcitations = [...state.excitations];
    for (const w of selected) {
      const exc = state.excitations.find((e) => e.wire_tag === w.tag);
      if (exc) {
        const newWire = newWires.find(
          (nw) =>
            Math.abs(nw.x1 - w.x1) < 1e-6 &&
            Math.abs(nw.z1 - w.z1) < 1e-6 &&
            Math.abs(nw.x2 - w.x2) < 1e-6 &&
            Math.abs(nw.z2 - w.z2) < 1e-6,
        );
        if (newWire) {
          newExcitations.push({ ...exc, wire_tag: newWire.tag });
        }
      }
    }

    const newSelected = new Set(newWires.map((w) => w.tag));

    set({
      ...pushUndo(state),
      wires: [...state.wires, ...newWires],
      excitations: newExcitations,
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: [...state.junctions, ...cloned.junctions],
      nextJunctionId: cloned.nextJunctionId,
      nextTag: tag,
    });
  },

  mirrorSelected: (axis) => {
    const state = get();
    const selected = state.wires.filter((w) => state.selectedTags.has(w.tag));
    if (selected.length === 0) return;

    // Compute centroid of selected wires
    let cx = 0, cy = 0, cz = 0;
    let count = 0;
    for (const w of selected) {
      cx += w.x1 + w.x2;
      cy += w.y1 + w.y2;
      cz += w.z1 + w.z2;
      count += 2;
    }
    cx /= count;
    cy /= count;
    cz /= count;

    // Mirror function: reflect coordinate across centroid on the given axis
    const mirror = (val: number, center: number) => 2 * center - val;

    let tag = state.nextTag;
    const tagMap = new Map<number, number>();
    const newWires: EditorWire[] = selected.map((w) => {
      const newTag = tag++;
      tagMap.set(w.tag, newTag);
      const mirrored: EditorWire = { ...w, tag: newTag, selected: false };
      if (axis === "x") {
        mirrored.x1 = mirror(w.x1, cx);
        mirrored.x2 = mirror(w.x2, cx);
      } else if (axis === "y") {
        mirrored.y1 = mirror(w.y1, cy);
        mirrored.y2 = mirror(w.y2, cy);
      } else {
        mirrored.z1 = mirror(w.z1, cz);
        mirrored.z2 = mirror(w.z2, cz);
      }
      return mirrored;
    });
    const cloned = cloneContainedJunctions(
      state.junctions,
      tagMap,
      state.nextJunctionId,
    );

    const newSelected = new Set([
      ...state.selectedTags,
      ...newWires.map((w) => w.tag),
    ]);

    set({
      ...pushUndo(state),
      wires: [...state.wires, ...newWires],
      selectedTags: newSelected,
      selectedEndpoints: [],
      junctions: [...state.junctions, ...cloned.junctions],
      nextJunctionId: cloned.nextJunctionId,
      nextTag: tag,
    });
  },

  // ---- Undo/Redo ----

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;

    const current = takeSnapshot(state);
    const previous = state.undoStack[state.undoStack.length - 1]!;
    const newUndoStack = state.undoStack.slice(0, -1);

    set({
      wires: previous.wires,
      excitations: previous.excitations,
      loads: previous.loads,
      transmissionLines: previous.transmissionLines,
      junctions: previous.junctions,
      nextJunctionId: previous.nextJunctionId,
      selectedTags: new Set(),
      selectedEndpoints: [],
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, current],
      canUndo: newUndoStack.length > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const current = takeSnapshot(state);
    const next = state.redoStack[state.redoStack.length - 1]!;
    const newRedoStack = state.redoStack.slice(0, -1);

    set({
      wires: next.wires,
      excitations: next.excitations,
      loads: next.loads,
      transmissionLines: next.transmissionLines,
      junctions: next.junctions,
      nextJunctionId: next.nextJunctionId,
      selectedTags: new Set(),
      selectedEndpoints: [],
      undoStack: [...state.undoStack, current],
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
    });
  },

  beginGeometryTransaction: () => {
    const state = get();
    if (!state.geometryTransaction) {
      set({ geometryTransaction: takeSnapshot(state), lastEditorMessage: null });
    }
  },

  commitGeometryTransaction: () => {
    const state = get();
    if (!state.geometryTransaction) return;
    const before = JSON.stringify({
      wires: state.geometryTransaction.wires,
      junctions: state.geometryTransaction.junctions,
    });
    const after = JSON.stringify({ wires: state.wires, junctions: state.junctions });
    set({
      ...(before === after ? {} : pushSnapshot(state, state.geometryTransaction)),
      geometryTransaction: null,
    });
  },

  cancelGeometryTransaction: () => {
    const state = get();
    if (!state.geometryTransaction) return;
    const snapshot = state.geometryTransaction;
    set({
      wires: snapshot.wires,
      excitations: snapshot.excitations,
      loads: snapshot.loads,
      transmissionLines: snapshot.transmissionLines,
      junctions: snapshot.junctions,
      nextJunctionId: snapshot.nextJunctionId,
      geometryTransaction: null,
      lastEditorMessage: "Movement cancelled.",
    });
  },

  // ---- Derived ----

  getSelectedWires: () => {
    const state = get();
    return state.wires.filter((w) => state.selectedTags.has(w.tag));
  },

  getTotalSegments: () => {
    return get().wires.reduce((sum, w) => sum + w.segments, 0);
  },

  getWireGeometry: () => {
    return get().wires.map(({ selected: _, ...w }) => w as WireGeometry);
  },
}));

// Export the snap utility for use in 3D components
export { snap };
