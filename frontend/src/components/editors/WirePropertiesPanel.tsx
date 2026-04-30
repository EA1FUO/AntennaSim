/**
 * WirePropertiesPanel — shows detailed properties of the selected wire(s).
 *
 * When a single wire is selected, shows editable coordinates and
 * excitation/load management. When multiple wires are selected,
 * shows a summary.
 */

import { useCallback, useState } from "react";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorWire } from "../../stores/editorStore";
import { centerSegment } from "../../engine/segmentation";
import { useUIStore } from "../../stores/uiStore";
import { NumberInput } from "../ui/NumberInput";
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
    <NumberInput
      label={label}
      value={value}
      onChange={onChange}
      decimals={3}
      unit="m"
    />
  );
}

function WireLengthSection({
  wire,
  onSetLength,
  onToggleLock,
  onBend,
  onHang,
}: {
  wire: EditorWire;
  onSetLength: (len: number) => void;
  onToggleLock: () => void;
  onBend: (position: number, angleDeg: number, plane: "horizontal" | "vertical", numSegments: number) => void;
  onHang: (numSegments: number, targetLength?: number) => void;
}) {
  const [showBend, setShowBend] = useState(false);
  const [bendAngle, setBendAngle] = useState(90);
  const [bendPlane, setBendPlane] = useState<"horizontal" | "vertical">("horizontal");
  const [bendSegments, setBendSegments] = useState(2);
  const [showHang, setShowHang] = useState(false);
  const [hangSegments, setHangSegments] = useState(5);
  const [hangLength, setHangLength] = useState<number | null>(null); // null = wire length + 1m

  const length = Math.sqrt(
    (wire.x2 - wire.x1) ** 2 + (wire.y2 - wire.y1) ** 2 + (wire.z2 - wire.z1) ** 2
  );

  return (
    <div className="border-t border-border pt-2 space-y-1.5">
      <div className="text-[11px] text-text-secondary font-medium">Length</div>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <NumberInput
            value={length}
            onChange={(v) => { if (v > 0) onSetLength(v); }}
            min={0.01}
            max={1000}
            decimals={3}
            unit="m"
          />
        </div>
        <button
          onClick={onToggleLock}
          className={`p-1 rounded transition-colors ${
            wire.lengthLocked
              ? "bg-accent/20 text-accent"
              : "bg-surface-hover text-text-secondary hover:text-text-primary"
          }`}
          title={wire.lengthLocked ? "Length locked — unlock to allow free movement" : "Lock length — endpoint drags maintain wire length"}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            {wire.lengthLocked ? (
              <path d="M4 7V5a4 4 0 118 0v2h1a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1h1zm2 0h4V5a2 2 0 10-4 0v2zm2 3a1 1 0 100 2 1 1 0 000-2z" />
            ) : (
              <path d="M10 7V5a2 2 0 10-4 0v1H4V5a4 4 0 118 0v2h1a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1h7zm-2 3a1 1 0 100 2 1 1 0 000-2z" />
            )}
          </svg>
        </button>
      </div>

      {/* Bend wire tool */}
      <button
        onClick={() => { setShowBend(!showBend); if (!showBend) setShowHang(false); }}
        className="w-full py-0.5 text-[11px] rounded bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
      >
        {showBend ? "Cancel bend" : "Bend wire"}
      </button>

      {showBend && (
        <div className="space-y-1.5 bg-background rounded p-2 border border-border">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-text-secondary w-12 shrink-0">Angle</label>
            <NumberInput
              value={bendAngle}
              onChange={setBendAngle}
              min={-180}
              max={180}
              decimals={0}
              unit="deg"
              size="sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-text-secondary w-12 shrink-0">Plane</label>
            <select
              value={bendPlane}
              onChange={(e) => setBendPlane(e.target.value as "horizontal" | "vertical")}
              className="flex-1 bg-background text-text-primary text-[10px] px-1.5 py-0.5 rounded border border-border outline-none"
            >
              <option value="horizontal">Horizontal (XY)</option>
              <option value="vertical">Vertical (up/down)</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-text-secondary w-12 shrink-0">Wires</label>
            <NumberInput
              value={bendSegments}
              onChange={(v) => setBendSegments(Math.max(2, Math.min(20, Math.round(v))))}
              min={2}
              max={20}
              decimals={0}
              size="sm"
            />
          </div>
          <button
            onClick={() => {
              onBend(0.5, bendAngle, bendPlane, bendSegments);
              setShowBend(false);
            }}
            className="w-full py-1 text-[11px] rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Apply bend
          </button>
          {bendSegments > 10 && (
            <p className="text-[9px] text-swr-warning leading-tight">
              Many wire segments may slow simulation.
            </p>
          )}
          <p className="text-[9px] text-text-secondary/70 leading-tight">
            Splits wire into {bendSegments} segments. Total length is preserved.
          </p>
        </div>
      )}

      {/* Hang wire (catenary sag) */}
      <button
        onClick={() => { setShowHang(!showHang); if (!showHang) setShowBend(false); }}
        className="w-full py-0.5 text-[11px] rounded bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
      >
        {showHang ? "Cancel hang" : "Hang wire"}
      </button>

      {showHang && (() => {
        const span = Math.sqrt(
          (wire.x2 - wire.x1) ** 2 + (wire.y2 - wire.y1) ** 2 + (wire.z2 - wire.z1) ** 2
        );
        const effectiveLength = hangLength ?? (length + 1);
        const slack = Math.max(0, effectiveLength - span);
        const sag = slack > 1e-6 ? Math.sqrt(3 * span * slack / 8) : 0;
        return (
        <div className="space-y-1.5 bg-background rounded p-2 border border-border">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-text-secondary w-12 shrink-0">Length</label>
            <NumberInput
              value={effectiveLength}
              onChange={(v) => setHangLength(Math.max(length, v))}
              min={length}
              max={span * 3}
              decimals={2}
              unit="m"
              size="sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-text-secondary w-12 shrink-0">Wires</label>
            <NumberInput
              value={hangSegments}
              onChange={(v) => setHangSegments(Math.max(2, Math.min(30, Math.round(v))))}
              min={2}
              max={30}
              decimals={0}
              size="sm"
            />
          </div>
          <div className="text-[9px] font-mono text-text-secondary">
            Span: {span.toFixed(2)} m | Sag: {sag.toFixed(2)} m
          </div>
          <button
            onClick={() => {
              onHang(hangSegments, hangLength ?? undefined);
              setShowHang(false);
            }}
            className="w-full py-1 text-[11px] rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Apply hang
          </button>
          <p className="text-[9px] text-text-secondary/70 leading-tight">
            Set length longer than the span to increase droop. More wire = more sag.
          </p>
        </div>
        );
      })()}
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
  const resetSegments = useEditorStore((s) => s.resetSegments);
  const deleteWires = useEditorStore((s) => s.deleteWires);
  const setWireLength = useEditorStore((s) => s.setWireLength);
  const toggleLengthLock = useEditorStore((s) => s.toggleLengthLock);
  const bendWire = useEditorStore((s) => s.bendWire);
  const hangWire = useEditorStore((s) => s.hangWire);
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
        <div className="text-[11px] text-text-secondary space-y-0.5 font-mono">
          <div>Tags: {selectedWires.map((w) => w.tag).join(", ")}</div>
          <div>
            Total segments:{" "}
            {selectedWires.reduce((s, w) => s + w.segments, 0)}
          </div>
        </div>
        <button
          onClick={() => deleteWires(selectedWires.map((w) => w.tag))}
          className="w-full py-1 text-[11px] rounded bg-swr-bad/20 text-swr-bad hover:bg-swr-bad/30 transition-colors"
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
        <div className="flex items-center gap-1">
          <NumberInput
            value={wire.segments}
            onChange={(v) => updateWire(wire.tag, { segments: v })}
            decimals={0}
            min={1}
            max={200}
            size="xs"
          />
          <span className="text-[10px] text-text-secondary">segs</span>
          {wire.segmentsManual ? (
            <button
              onClick={() => resetSegments(wire.tag)}
              className="text-[10px] text-accent hover:text-accent/80 transition-colors"
              title="Reset to auto-computed segments (lambda/10 rule)"
            >
              Auto
            </button>
          ) : (
            <span className="text-[10px] text-text-secondary/60">(auto)</span>
          )}
        </div>
      </div>

      {/* Endpoint 1 */}
      <div className="space-y-1">
        <div className="text-[11px] text-text-secondary font-medium">
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
        <div className="text-[11px] text-text-secondary font-medium">
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
        <div className="text-[11px] text-text-secondary font-medium">
          Radius
        </div>
        <NumberInput
          value={wire.radius}
          onChange={(v) => handleRadiusChange(wire.tag, v)}
          min={0.0001}
          max={0.1}
          decimals={4}
          unit="m"
        />
      </div>

      {/* Wire length — editable + lock toggle */}
      <WireLengthSection
        wire={wire}
        onSetLength={(len) => setWireLength(wire.tag, len, "end")}
        onToggleLock={() => toggleLengthLock(wire.tag)}
        onBend={(pos, angle, plane, segs) => bendWire(wire.tag, pos, angle, plane, segs)}
        onHang={(segs, len) => hangWire(wire.tag, segs, len)}
      />

      {/* Excitation */}
      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="text-[11px] text-text-secondary font-medium">
          Excitation
        </div>
        {hasExcitation ? (
          <>
            {/* Segment picker: number input + total */}
            <div className="flex items-center gap-1">
              <NumberInput
                label="Seg"
                value={excitation.segment}
                onChange={(v) => setExcitation(wire.tag, v)}
                min={1}
                max={wire.segments}
                decimals={0}
              />
              <span className="text-[11px] text-text-secondary font-mono">
                of {wire.segments}
              </span>
            </div>

            {/* Quick-pick buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => setExcitation(wire.tag, 1)}
                className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
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
                className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
                  excitation.segment === centerSegment(wire.segments)
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-hover text-text-secondary hover:text-text-primary"
                }`}
              >
                Center
              </button>
              <button
                onClick={() => setExcitation(wire.tag, wire.segments)}
                className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
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
                className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
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
                className="flex-1 py-0.5 text-[11px] rounded bg-swr-bad/10 text-swr-bad hover:bg-swr-bad/20 transition-colors"
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
              <span className="text-[11px] text-text-secondary">
                Accurate feedpoint
              </span>
              <span className="text-[11px] text-text-secondary/50 cursor-help">
                ?
              </span>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover/feedhelp:block bg-surface border border-border rounded-md px-2.5 py-1.5 shadow-lg text-[11px] text-text-secondary leading-relaxed w-52 z-50 pointer-events-none">
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
              className="w-full py-0.5 text-[11px] rounded bg-swr-warning/20 text-swr-warning hover:bg-swr-warning/30 transition-colors"
            >
              Set as feedpoint
            </button>
            <button
              onClick={() => {
                setExcitation(wire.tag, centerSegment(wire.segments));
                setPickingExcitationForTag(wire.tag);
              }}
              className="w-full py-0.5 text-[11px] rounded bg-swr-warning/10 text-swr-warning hover:bg-swr-warning/20 transition-colors"
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
          className="flex-1 py-0.5 text-[11px] rounded bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          Split
        </button>
        <button
          onClick={() => deleteWires([wire.tag])}
          className="flex-1 py-0.5 text-[11px] rounded bg-swr-bad/20 text-swr-bad hover:bg-swr-bad/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
