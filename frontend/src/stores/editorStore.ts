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

// ---- Types ----

export type EditorMode = "select" | "add" | "move";

// Re-export for convenience
export type { LumpedLoad, TransmissionLine } from "../api/nec";

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

  // ---- Clipboard / Transform ----
  /** Clipboard for copy/paste */
  clipboard: EditorWire[];
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
  computeCurrents: true,
  selectedTags: new Set<number>(),
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

    const newWires = [...state.wires];
    newWires[idx] = updated;
    // Fix any excitation segment indices that exceed the new segment count
    const newExcitations = fixExcitations(state.excitations, newWires);
    set({ ...pushUndo(state), wires: newWires, excitations: newExcitations });
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

  moveSelected: (dx, dy, dz) => {
    const state = get();
    if (state.selectedTags.size === 0) return;
    if (dx === 0 && dy === 0 && dz === 0) return;
    const newWires = state.wires.map((w) =>
      state.selectedTags.has(w.tag)
        ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, z1: w.z1 + dz, x2: w.x2 + dx, y2: w.y2 + dy, z2: w.z2 + dz }
        : w
    );
    set({ ...pushUndo(state), wires: newWires });
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

    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
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

    const updates: Partial<EditorWire> = anchor === "start"
      ? { x2: newX, y2: newY, z2: newZ }
      : { x1: newX, y1: newY, z1: newZ };

    const newWires = state.wires.map((w) => {
      if (w.tag !== tag) return w;
      const updated = { ...w, ...updates };
      if (!w.segmentsManual) {
        updated.segments = computeSegments(updated, state.designFrequencyMhz);
      }
      return updated;
    });

    set({ ...pushUndo(state), wires: newWires });
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

    const newWires = state.wires.filter((w) => w.tag !== tag).concat(newWiresList);

    set({
      ...pushUndo(state),
      wires: newWires,
      excitations: newExcitations,
      selectedTags: newSelected,
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
      nextTag: 1,
    });
  },

  setWires: (wires, excitations) => {
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
    // Recompute wire segments with new design frequency (skip manually overridden)
    const newWires = state.wires.map((w) =>
      w.segmentsManual ? { ...w } : { ...w, segments: computeSegments(w, mhz) }
    );
    // Scale excitation segments proportionally to preserve relative position
    const newExcitations = state.excitations.map((e) => {
      const oldWire = state.wires.find((w) => w.tag === e.wire_tag);
      const newWire = newWires.find((w) => w.tag === e.wire_tag);
      if (oldWire && newWire && oldWire.segments !== newWire.segments) {
        const ratio = e.segment / oldWire.segments;
        const scaled = Math.max(1, Math.min(newWire.segments, Math.round(ratio * newWire.segments)));
        return { ...e, segment: scaled };
      }
      return e;
    });
    // Update frequency range to center on the new design frequency (~10% bandwidth)
    const bandwidth = mhz * 0.1;
    const newStart = Math.round(Math.max(0.1, mhz - bandwidth / 2) * 1000) / 1000;
    const newStop = Math.round(Math.min(2000, mhz + bandwidth / 2) * 1000) / 1000;
    const newFreqRange: FrequencyRange = {
      start_mhz: newStart,
      stop_mhz: newStop,
      steps: computeSteps(newStart, newStop),
    };
    set({
      ...pushUndo(state),
      designFrequencyMhz: mhz,
      wires: newWires,
      excitations: newExcitations,
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
    set({ clipboard: selected.map((w) => ({ ...w })) });
  },

  paste: () => {
    const state = get();
    if (state.clipboard.length === 0) return;

    let tag = state.nextTag;
    const newWires: EditorWire[] = state.clipboard.map((w) => ({
      ...w,
      tag: tag++,
      y1: w.y1 + 1, // offset 1m in Y
      y2: w.y2 + 1,
      selected: false,
    }));

    const newSelected = new Set(newWires.map((w) => w.tag));

    set({
      ...pushUndo(state),
      wires: [...state.wires, ...newWires],
      selectedTags: newSelected,
      nextTag: tag,
    });
  },

  duplicateSelected: () => {
    const state = get();
    const selected = state.wires.filter((w) => state.selectedTags.has(w.tag));
    if (selected.length === 0) return;

    let tag = state.nextTag;
    const newWires: EditorWire[] = selected.map((w) => ({
      ...w,
      tag: tag++,
      y1: w.y1 + 0.5, // offset 0.5m in Y
      y2: w.y2 + 0.5,
      selected: false,
    }));

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
    const newWires: EditorWire[] = selected.map((w) => {
      const mirrored: EditorWire = { ...w, tag: tag++, selected: false };
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

    const newSelected = new Set([
      ...state.selectedTags,
      ...newWires.map((w) => w.tag),
    ]);

    set({
      ...pushUndo(state),
      wires: [...state.wires, ...newWires],
      selectedTags: newSelected,
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
