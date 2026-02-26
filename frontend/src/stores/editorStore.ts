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
import type { WireGeometry, Excitation, GroundConfig, FrequencyRange } from "../templates/types";
import type { LumpedLoad, TransmissionLine } from "../api/nec";
import { autoSegment, centerSegment } from "../engine/segmentation";

// ---- Types ----

export type EditorMode = "select" | "add" | "move";

// Re-export for convenience
export type { LumpedLoad, TransmissionLine } from "../api/nec";

export interface EditorWire extends WireGeometry {
  /** Whether this wire is currently selected */
  selected?: boolean;
}

/** A snapshot of the editor state for undo/redo */
interface EditorSnapshot {
  wires: EditorWire[];
  excitations: Excitation[];
  loads: LumpedLoad[];
  transmissionLines: TransmissionLine[];
}

// ---- Default state ----

const DEFAULT_GROUND: GroundConfig = { type: "average" };
const DEFAULT_FREQ: FrequencyRange = { start_mhz: 13.5, stop_mhz: 15.0, steps: 31 };
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
  /** Whether to compute current distribution */
  computeCurrents: boolean;
  /** Currently selected wire tags */
  selectedTags: Set<number>;
  /** Current editor mode */
  mode: EditorMode;
  /** Ground configuration */
  ground: GroundConfig;
  /** Frequency range for simulation */
  frequencyRange: FrequencyRange;
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
  /** Split a wire at its midpoint into two wires */
  splitWire: (tag: number) => void;
  /** Clear all wires */
  clearAll: () => void;
  /** Set all wires at once (e.g. from import) */
  setWires: (wires: EditorWire[], excitations?: Excitation[]) => void;

  // ---- Selection ----
  /** Select a single wire (deselects others unless additive) */
  selectWire: (tag: number, additive?: boolean) => void;
  /** Deselect all */
  deselectAll: () => void;
  /** Select all wires */
  selectAll: () => void;
  /** Toggle selection on a wire */
  toggleSelection: (tag: number) => void;

  // ---- Mode ----
  setMode: (mode: EditorMode) => void;

  // ---- Settings ----
  setGround: (ground: GroundConfig) => void;
  setFrequencyRange: (freq: FrequencyRange) => void;
  setSnapSize: (size: number) => void;
  setShowGrid: (show: boolean) => void;
  setDesignFrequency: (mhz: number) => void;

  // ---- Excitation ----
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

  // ---- Undo/Redo ----
  undo: () => void;
  redo: () => void;

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
  };
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
  computeCurrents: false,
  selectedTags: new Set<number>(),
  mode: "select",
  ground: { ...DEFAULT_GROUND },
  frequencyRange: { ...DEFAULT_FREQ },
  snapSize: 0.1,
  showGrid: true,
  nextTag: 1,
  designFrequencyMhz: DEFAULT_FREQUENCY_MHZ,

  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

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

    // Recompute segments if geometry changed
    if (updates.x1 !== undefined || updates.y1 !== undefined || updates.z1 !== undefined ||
        updates.x2 !== undefined || updates.y2 !== undefined || updates.z2 !== undefined) {
      updated.segments = computeSegments(updated, state.designFrequencyMhz);
    }

    const newWires = [...state.wires];
    newWires[idx] = updated;
    set({ ...pushUndo(state), wires: newWires });
  },

  moveWire: (tag, dx, dy, dz) => {
    const state = get();
    const idx = state.wires.findIndex((w) => w.tag === tag);
    if (idx === -1) return;
    if (dx === 0 && dy === 0 && dz === 0) return;

    const wire = state.wires[idx]!;
    const updated: EditorWire = {
      ...wire,
      x1: wire.x1 + dx,
      y1: wire.y1 + dy,
      z1: wire.z1 + dz,
      x2: wire.x2 + dx,
      y2: wire.y2 + dy,
      z2: wire.z2 + dz,
    };
    // No need to recompute segments — length is unchanged

    const newWires = [...state.wires];
    newWires[idx] = updated;
    set({ ...pushUndo(state), wires: newWires });
  },

  deleteWires: (tags) => {
    const state = get();
    const tagSet = new Set(tags);
    const newWires = state.wires.filter((w) => !tagSet.has(w.tag));
    const newExcitations = state.excitations.filter((e) => !tagSet.has(e.wire_tag));
    const newSelected = new Set(state.selectedTags);
    for (const t of tags) newSelected.delete(t);
    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
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
    };
    const wire2: EditorWire = {
      ...wire,
      tag: tag2,
      x1: midX,
      y1: midY,
      z1: midZ,
      segments: computeSegments({ x1: midX, y1: midY, z1: midZ, x2: wire.x2, y2: wire.y2, z2: wire.z2 }, state.designFrequencyMhz),
    };

    // Update excitations if they reference the split wire
    const newExcitations = state.excitations.map((e) => {
      if (e.wire_tag === tag) {
        return { ...e, wire_tag: tag1, segment: centerSegment(wire1.segments) };
      }
      return e;
    });

    const newWires = state.wires.filter((w) => w.tag !== tag).concat([wire1, wire2]);
    const newSelected = new Set(state.selectedTags);
    newSelected.delete(tag);
    newSelected.add(tag1);
    newSelected.add(tag2);

    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
      nextTag: tag2 + 1,
    });
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
      nextTag: 1,
    });
  },

  setWires: (wires, excitations) => {
    const state = get();
    const maxTag = wires.reduce((max, w) => Math.max(max, w.tag), 0);
    set({
      ...pushUndo(state),
      wires: wires.map((w) => ({ ...w })),
      excitations: excitations?.map((e) => ({ ...e })) ?? state.excitations,
      selectedTags: new Set(),
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

  // ---- Mode ----

  setMode: (mode) => set({ mode }),

  // ---- Settings ----

  setGround: (ground) => set({ ground }),
  setFrequencyRange: (freq) => set({ frequencyRange: freq }),
  setSnapSize: (size) => set({ snapSize: size }),
  setShowGrid: (show) => set({ showGrid: show }),
  setDesignFrequency: (mhz) => {
    const state = get();
    // Recompute all wire segments with new design frequency
    const newWires = state.wires.map((w) => ({
      ...w,
      segments: computeSegments(w, mhz),
    }));
    // Update excitation segments
    const newExcitations = state.excitations.map((e) => {
      const wire = newWires.find((w) => w.tag === e.wire_tag);
      if (wire) {
        return { ...e, segment: centerSegment(wire.segments) };
      }
      return e;
    });
    set({ designFrequencyMhz: mhz, wires: newWires, excitations: newExcitations });
  },

  // ---- Excitation ----

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
      selectedTags: new Set(),
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
      selectedTags: new Set(),
      undoStack: [...state.undoStack, current],
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
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
