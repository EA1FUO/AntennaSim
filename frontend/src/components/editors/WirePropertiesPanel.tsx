/**
 * WirePropertiesPanel — shows detailed properties of the selected wire(s).
 *
 * When a single wire is selected, shows editable coordinates and
 * excitation/load management. When multiple wires are selected,
 * shows a summary.
 */

import { useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorWire } from "../../stores/editorStore";
import { centerSegment } from "../../engine/segmentation";
import { useUIStore } from "../../stores/uiStore";
import type { Excitation } from "../../templates/types";

function CoordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-[10px] text-text-secondary w-5 text-right shrink-0">
        {label}
      </label>
      <input
        type="number"
        step="0.1"
        value={value.toFixed(3)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && isFinite(v)) onChange(v);
        }}
        className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1.5 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
      />
    </div>
  );
}

export function WirePropertiesPanel() {
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const updateWire = useEditorStore((s) => s.updateWire);
  const setExcitation = useEditorStore((s) => s.setExcitation);
  const removeExcitation = useEditorStore((s) => s.removeExcitation);
  const splitWire = useEditorStore((s) => s.splitWire);
  const deleteWires = useEditorStore((s) => s.deleteWires);
  const pickingExcitationForTag = useEditorStore((s) => s.pickingExcitationForTag);
  const setPickingExcitationForTag = useEditorStore((s) => s.setPickingExcitationForTag);
  const accurateFeedpoint = useUIStore((s) => s.accurateFeedpoint);
  const setAccurateFeedpoint = useUIStore((s) => s.setAccurateFeedpoint);

  const selectedWires = wires.filter((w) => selectedTags.has(w.tag));

  const handleCoordChange = useCallback(
    (tag: number, field: keyof EditorWire, value: number) => {
      updateWire(tag, { [field]: value } as Partial<EditorWire>);
    },
    [updateWire]
  );

  const handleRadiusChange = useCallback(
    (tag: number, value: number) => {
      if (value > 0) {
        updateWire(tag, { radius: value });
      }
    },
    [updateWire]
  );

  if (selectedTags.size === 0) {
    return (
      <div className="p-3 text-center text-text-secondary text-xs">
        Select a wire to view properties
      </div>
    );
  }

  if (selectedWires.length > 1) {
    return (
      <div className="p-3 space-y-2">
        <h4 className="text-xs font-medium text-text-secondary">
          {selectedWires.length} wires selected
        </h4>
        <div className="text-[10px] text-text-secondary space-y-0.5 font-mono">
          <div>Tags: {selectedWires.map((w) => w.tag).join(", ")}</div>
          <div>
            Total segments:{" "}
            {selectedWires.reduce((s, w) => s + w.segments, 0)}
          </div>
        </div>
        <button
          onClick={() => deleteWires(selectedWires.map((w) => w.tag))}
          className="w-full py-1 text-[10px] rounded bg-swr-bad/20 text-swr-bad hover:bg-swr-bad/30 transition-colors"
        >
          Delete selected
        </button>
      </div>
    );
  }

  // Single wire selected
  const wire = selectedWires[0]!;
  const excitation: Excitation | undefined = excitations.find((e) => e.wire_tag === wire.tag);
  const hasExcitation = !!excitation;
  const isPicking = pickingExcitationForTag === wire.tag;

  return (
    <div className="p-2 space-y-3">
      {/* Wire header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-text-primary">
          Wire <span className="text-accent">{wire.tag}</span>
        </h4>
        <span className="text-[10px] font-mono text-text-secondary">
          {wire.segments} segs
        </span>
      </div>

      {/* Endpoint 1 */}
      <div className="space-y-1">
        <div className="text-[10px] text-text-secondary font-medium">
          Point 1
        </div>
        <CoordField
          label="X"
          value={wire.x1}
          onChange={(v) => handleCoordChange(wire.tag, "x1", v)}
        />
        <CoordField
          label="Y"
          value={wire.y1}
          onChange={(v) => handleCoordChange(wire.tag, "y1", v)}
        />
        <CoordField
          label="Z"
          value={wire.z1}
          onChange={(v) => handleCoordChange(wire.tag, "z1", v)}
        />
      </div>

      {/* Endpoint 2 */}
      <div className="space-y-1">
        <div className="text-[10px] text-text-secondary font-medium">
          Point 2
        </div>
        <CoordField
          label="X"
          value={wire.x2}
          onChange={(v) => handleCoordChange(wire.tag, "x2", v)}
        />
        <CoordField
          label="Y"
          value={wire.y2}
          onChange={(v) => handleCoordChange(wire.tag, "y2", v)}
        />
        <CoordField
          label="Z"
          value={wire.z2}
          onChange={(v) => handleCoordChange(wire.tag, "z2", v)}
        />
      </div>

      {/* Radius */}
      <div className="space-y-1">
        <div className="text-[10px] text-text-secondary font-medium">
          Radius
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            max="0.1"
            value={wire.radius.toFixed(4)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) handleRadiusChange(wire.tag, v);
            }}
            className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1.5 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
          />
          <span className="text-[10px] text-text-secondary">m</span>
        </div>
      </div>

      {/* Wire length (computed) */}
      <div className="text-[10px] font-mono text-text-secondary border-t border-border pt-2">
        Length:{" "}
        {Math.sqrt(
          (wire.x2 - wire.x1) ** 2 +
            (wire.y2 - wire.y1) ** 2 +
            (wire.z2 - wire.z1) ** 2
        ).toFixed(3)}{" "}
        m
      </div>

      {/* Excitation */}
      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="text-[10px] text-text-secondary font-medium">
          Excitation
        </div>
        {hasExcitation ? (
          <>
            {/* Segment picker: number input + total */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Seg</span>
              <input
                type="number"
                min={1}
                max={wire.segments}
                value={excitation.segment}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= wire.segments) {
                    setExcitation(wire.tag, v);
                  }
                }}
                className="w-12 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-center"
              />
              <span className="text-[10px] text-text-secondary font-mono">
                of {wire.segments}
              </span>
            </div>

            {/* Quick-pick buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => setExcitation(wire.tag, 1)}
                className={`flex-1 py-0.5 text-[10px] rounded transition-colors ${
                  excitation.segment === 1
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-hover text-text-secondary hover:text-text-primary"
                }`}
              >
                Start
              </button>
              <button
                onClick={() =>
                  setExcitation(wire.tag, centerSegment(wire.segments))
                }
                className={`flex-1 py-0.5 text-[10px] rounded transition-colors ${
                  excitation.segment === centerSegment(wire.segments)
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-hover text-text-secondary hover:text-text-primary"
                }`}
              >
                Center
              </button>
              <button
                onClick={() => setExcitation(wire.tag, wire.segments)}
                className={`flex-1 py-0.5 text-[10px] rounded transition-colors ${
                  excitation.segment === wire.segments
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-hover text-text-secondary hover:text-text-primary"
                }`}
              >
                End
              </button>
            </div>

            {/* Pick on wire + Remove */}
            <div className="flex gap-1">
              <button
                onClick={() =>
                  setPickingExcitationForTag(isPicking ? null : wire.tag)
                }
                className={`flex-1 py-0.5 text-[10px] rounded transition-colors ${
                  isPicking
                    ? "bg-swr-warning/30 text-swr-warning"
                    : "bg-swr-warning/10 text-swr-warning hover:bg-swr-warning/20"
                }`}
              >
                {isPicking ? "Cancel pick" : "Pick on wire"}
              </button>
              <button
                onClick={() => {
                  removeExcitation(wire.tag);
                  if (isPicking) setPickingExcitationForTag(null);
                }}
                className="flex-1 py-0.5 text-[10px] rounded bg-swr-bad/10 text-swr-bad hover:bg-swr-bad/20 transition-colors"
              >
                Remove
              </button>
            </div>

            {/* Accurate feedpoint visualization */}
            <div className="relative flex items-center gap-1.5 group/feedhelp">
              <input
                type="checkbox"
                checked={accurateFeedpoint}
                onChange={(e) => setAccurateFeedpoint(e.target.checked)}
                className="accent-accent w-3 h-3"
              />
              <span className="text-[10px] text-text-secondary">
                Accurate feedpoint
              </span>
              <span className="text-[10px] text-text-secondary/50 cursor-help">
                ?
              </span>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover/feedhelp:block bg-surface border border-border rounded-md px-2.5 py-1.5 shadow-lg text-[10px] text-text-secondary leading-relaxed w-52 z-50 pointer-events-none">
                NEC2 applies voltage at the segment center, not the wire
                endpoint. When enabled, the marker shows the exact segment
                center. When disabled, endpoint segments snap to the wire
                edge for a cleaner visual at junctions.
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <button
              onClick={() =>
                setExcitation(wire.tag, centerSegment(wire.segments))
              }
              className="w-full py-0.5 text-[10px] rounded bg-swr-warning/20 text-swr-warning hover:bg-swr-warning/30 transition-colors"
            >
              Set as feedpoint
            </button>
            <button
              onClick={() => {
                setExcitation(wire.tag, centerSegment(wire.segments));
                setPickingExcitationForTag(wire.tag);
              }}
              className="w-full py-0.5 text-[10px] rounded bg-swr-warning/10 text-swr-warning hover:bg-swr-warning/20 transition-colors"
            >
              Pick on wire
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-border pt-2 flex gap-1">
        <button
          onClick={() => splitWire(wire.tag)}
          className="flex-1 py-0.5 text-[10px] rounded bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          Split
        </button>
        <button
          onClick={() => deleteWires([wire.tag])}
          className="flex-1 py-0.5 text-[10px] rounded bg-swr-bad/20 text-swr-bad hover:bg-swr-bad/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
