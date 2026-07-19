import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore, type EditorWire } from "../editorStore";
import type { EditorJunction } from "../../utils/editor-junctions";

const baseWires: EditorWire[] = [
  { tag: 1, segments: 3, segmentsManual: true, x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0, radius: 0.001 },
  { tag: 2, segments: 3, segmentsManual: true, x1: 3, y1: 0, z1: 0, x2: 4, y2: 0, z2: 0, radius: 0.001 },
  { tag: 3, segments: 3, segmentsManual: true, x1: 1, y1: 0, z1: 0, x2: 1, y2: 1, z2: 0, radius: 0.001 },
];

function resetEditor(wires = baseWires, junctions: EditorJunction[] = []) {
  useEditorStore.setState({
    wires: wires.map((wire) => ({ ...wire })),
    junctions: junctions.map((junction) => ({
      ...junction,
      endpoints: junction.endpoints.map((endpoint) => ({ ...endpoint })),
    })),
    nextJunctionId: 2,
    nextTag: wires.reduce((max, wire) => Math.max(max, wire.tag), 0) + 1,
    selectedTags: new Set(),
    selectedEndpoints: [],
    excitations: [],
    loads: [],
    transmissionLines: [],
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    geometryTransaction: null,
    lastEditorMessage: null,
    clipboard: [],
    clipboardJunctions: [],
  });
}

describe("editor endpoint snapping", () => {
  beforeEach(() => resetEditor());

  it("keeps endpoint selection ordered and starts over after two selections", () => {
    const store = useEditorStore.getState();
    store.selectEndpoint({ wireTag: 1, endpoint: "end" });
    store.selectEndpoint({ wireTag: 2, endpoint: "start" });
    expect(useEditorStore.getState().selectedEndpoints).toEqual([
      { wireTag: 1, endpoint: "end" },
      { wireTag: 2, endpoint: "start" },
    ]);

    store.selectEndpoint({ wireTag: 3, endpoint: "end" });
    expect(useEditorStore.getState().selectedEndpoints).toEqual([
      { wireTag: 3, endpoint: "end" },
    ]);
  });

  it("snaps only the source endpoint and keeps the opposite end fixed", () => {
    const store = useEditorStore.getState();
    store.selectEndpoint({ wireTag: 1, endpoint: "end" });
    store.selectEndpoint({ wireTag: 2, endpoint: "start" });
    expect(store.snapSelectedEndpoints(false).ok).toBe(true);

    const wire = useEditorStore.getState().wires.find((candidate) => candidate.tag === 1)!;
    expect([wire.x1, wire.y1, wire.z1]).toEqual([0, 0, 0]);
    expect([wire.x2, wire.y2, wire.z2]).toEqual([3, 0, 0]);
  });

  it("translates the source wire when preserving length", () => {
    const store = useEditorStore.getState();
    store.selectEndpoint({ wireTag: 1, endpoint: "end" });
    store.selectEndpoint({ wireTag: 2, endpoint: "start" });
    expect(store.snapSelectedEndpoints(true).ok).toBe(true);

    const wire = useEditorStore.getState().wires.find((candidate) => candidate.tag === 1)!;
    expect([wire.x1, wire.x2]).toEqual([2, 3]);
    expect(Math.hypot(wire.x2 - wire.x1, wire.y2 - wire.y1, wire.z2 - wire.z1)).toBe(1);
  });

  it("rejects source and target endpoints on the same wire", () => {
    const store = useEditorStore.getState();
    store.selectEndpoint({ wireTag: 1, endpoint: "start" });
    store.selectEndpoint({ wireTag: 1, endpoint: "end" });

    expect(store.snapSelectedEndpoints(false).ok).toBe(false);
    expect(useEditorStore.getState().wires[0]).toEqual(baseWires[0]);
  });

  it("creates one undo step for a snap operation", () => {
    const store = useEditorStore.getState();
    store.selectEndpoint({ wireTag: 1, endpoint: "end" });
    store.selectEndpoint({ wireTag: 2, endpoint: "start" });
    store.snapSelectedEndpoints(false);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().wires[0]).toEqual(baseWires[0]);
  });
});

describe("editor junction locks", () => {
  beforeEach(() => resetEditor());

  it("locks every coincident endpoint and toggles the junction back to unlocked", () => {
    useEditorStore.getState().selectEndpoint({ wireTag: 1, endpoint: "end" });
    const locked = useEditorStore.getState().toggleSelectedJunction();
    expect(locked.ok).toBe(true);
    expect(useEditorStore.getState().junctions[0]?.endpoints).toHaveLength(2);

    useEditorStore.getState().selectEndpoint({ wireTag: 3, endpoint: "start" });
    const unlocked = useEditorStore.getState().toggleSelectedJunction();
    expect(unlocked.ok).toBe(true);
    expect(useEditorStore.getState().junctions).toEqual([]);
  });

  it("moves all members of a locked junction together", () => {
    resetEditor(baseWires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);

    expect(useEditorStore.getState().moveEndpoint(1, "end", 0, 0, 2).ok).toBe(true);
    const [wire1, , wire3] = useEditorStore.getState().wires;
    expect(wire1?.z2).toBe(2);
    expect(wire3?.z1).toBe(2);
    expect(wire3?.z2).toBe(0);
  });

  it("blocks a junction move that would stretch another length-locked wire", () => {
    const wires = baseWires.map((wire) =>
      wire.tag === 3 ? { ...wire, lengthLocked: true } : wire,
    );
    resetEditor(wires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);

    expect(useEditorStore.getState().moveEndpoint(1, "end", 0, 0, 2).ok).toBe(false);
    expect(useEditorStore.getState().wires[0]?.z2).toBe(0);
    expect(useEditorStore.getState().lastEditorMessage).toContain("locked length");
  });

  it("keeps connected coordinates aligned when edited numerically", () => {
    resetEditor(baseWires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);

    useEditorStore.getState().updateWire(1, { z2: 2 });
    const [, , connected] = useEditorStore.getState().wires;
    expect(connected?.z1).toBe(2);
  });

  it("moves a locked junction when a connected wire is resized", () => {
    resetEditor(baseWires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);

    useEditorStore.getState().setWireLength(1, 2, "start");
    const [resized, , connected] = useEditorStore.getState().wires;
    expect(resized?.x2).toBe(2);
    expect(connected?.x1).toBe(2);
  });

  it("blocks a resize that would stretch another length-locked wire", () => {
    resetEditor(
      baseWires.map((wire) => wire.tag === 3 ? { ...wire, lengthLocked: true } : wire),
      [{
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      }],
    );

    useEditorStore.getState().setWireLength(1, 2, "start");
    expect(useEditorStore.getState().wires[0]?.x2).toBe(1);
    expect(useEditorStore.getState().lastEditorMessage).toContain("prevents resizing");
  });

  it("transfers external junctions and locks the new midpoint when splitting", () => {
    resetEditor(baseWires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);

    useEditorStore.getState().splitWire(1);
    const state = useEditorStore.getState();
    expect(state.junctions).toHaveLength(2);
    expect(state.junctions.some((junction) =>
      junction.endpoints.some((endpoint) => endpoint.wireTag === 1),
    )).toBe(false);
    expect(state.junctions.some((junction) =>
      junction.endpoints.some((endpoint) => endpoint.wireTag === 4 && endpoint.endpoint === "end") &&
      junction.endpoints.some((endpoint) => endpoint.wireTag === 5 && endpoint.endpoint === "start"),
    )).toBe(true);
  });

  it("keeps an external junction attached when bending a connected wire", () => {
    resetEditor(baseWires, [{
      id: 1,
      endpoints: [
        { wireTag: 1, endpoint: "end" },
        { wireTag: 3, endpoint: "start" },
      ],
    }]);

    useEditorStore.getState().bendWire(1, 0.5, 90, "horizontal", 2);
    const state = useEditorStore.getState();
    const lastBent = state.wires.find((wire) => wire.tag === 5)!;
    const connected = state.wires.find((wire) => wire.tag === 3)!;
    expect([connected.x1, connected.y1, connected.z1]).toEqual([
      lastBent.x2,
      lastBent.y2,
      lastBent.z2,
    ]);
  });

  it("duplicates internal junctions with the duplicated wire tags", () => {
    resetEditor(baseWires, [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ]);
    useEditorStore.setState({ selectedTags: new Set([1, 3]), nextTag: 4 });

    useEditorStore.getState().duplicateSelected();
    const cloned = useEditorStore.getState().junctions.find((junction) => junction.id !== 1);
    expect(cloned?.endpoints).toEqual([
      { wireTag: 4, endpoint: "end" },
      { wireTag: 5, endpoint: "start" },
    ]);
  });
});
