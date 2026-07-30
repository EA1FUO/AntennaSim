import { useMemo, useState } from "react";
import { useUIStore } from "../../stores/uiStore";
import {
  metersToLengthUnit,
  type LengthUnit,
} from "../../utils/units";
import { measureWires } from "../../utils/wire-measurement";
import type { WireData } from "./types";

interface WireMeasurementToolProps {
  wires: WireData[];
  active: boolean;
  selectedTags: readonly number[];
  onToggle: () => void;
  onClear: () => void;
}

const UNIT_DECIMALS: Record<LengthUnit, number> = {
  m: 3,
  cm: 1,
  mm: 1,
  ft: 3,
  in: 2,
};

function RulerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M4 17.5 17.5 4 20 6.5 6.5 20 4 17.5Z" />
      <path d="m14.5 7 2.5 2.5M11.5 10l1.5 1.5M8.5 13l2.5 2.5M5.5 16l1.5 1.5" />
    </svg>
  );
}

function formatDistance(valueMeters: number, unit: LengthUnit): string {
  const value = metersToLengthUnit(valueMeters, unit);
  const cleanValue = Math.abs(value) < 1e-10 ? 0 : value;
  return `${cleanValue.toFixed(UNIT_DECIMALS[unit])} ${unit}`;
}

function formatOffset(valueMeters: number, unit: LengthUnit): string {
  const value = metersToLengthUnit(valueMeters, unit);
  const cleanValue = Math.abs(value) < 1e-10 ? 0 : value;
  const sign = cleanValue > 0 ? "+" : "";
  return `${sign}${cleanValue.toFixed(UNIT_DECIMALS[unit])} ${unit}`;
}

/** Touch-friendly viewport control and readout for wire-to-wire measurements. */
export function WireMeasurementTool({
  wires,
  active,
  selectedTags,
  onToggle,
  onClear,
}: WireMeasurementToolProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const imperial = useUIStore((state) => state.imperial);
  const metricLengthUnit = useUIStore((state) => state.metricLengthUnit);
  const imperialLengthUnit = useUIStore((state) => state.imperialLengthUnit);
  const unit = imperial ? imperialLengthUnit : metricLengthUnit;

  const firstWire = wires.find((wire) => wire.tag === selectedTags[0]);
  const secondWire = wires.find((wire) => wire.tag === selectedTags[1]);
  const measurement = useMemo(
    () =>
      firstWire && secondWire ? measureWires(firstWire, secondWire) : null,
    [firstWire, secondWire],
  );

  const instruction =
    wires.length < 2
      ? "At least two wires are needed."
      : selectedTags.length === 0
        ? "Tap or click the first wire."
        : selectedTags.length === 1
          ? `Wire #${selectedTags[0]} selected. Choose the second wire.`
          : "Tap another wire to start a new measurement.";

  return (
    <div className="absolute bottom-2 right-2 z-20 flex max-w-[calc(100%-1rem)] flex-col items-end gap-2 pointer-events-none">
      {active && (
        <div
          className="pointer-events-auto max-h-[55vh] w-[min(18rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-border bg-surface/95 p-3 shadow-xl backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-text-primary">
                Wire measurement
              </h3>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-secondary">
                {instruction}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-xs font-bold text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                aria-label="How to use wire measurement"
                aria-expanded={helpOpen}
                title="How to use wire measurement"
              >
                ?
              </button>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="min-h-11 rounded-md border border-border px-2 text-[10px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {helpOpen && (
            <div className="mt-2 rounded-md border border-accent/30 bg-accent/10 p-2 text-[10px] leading-relaxed text-text-secondary">
              Select two wires. The tool finds their closest points, shows the
              shortest spacing, and breaks the signed offset from the first
              selection to the second into NEC2 X (east), Y (north), and Z
              (up). The angle is 0° for parallel wires and 90° for
              perpendicular wires.
            </div>
          )}

          {measurement && firstWire && secondWire && (
            <div className="mt-2.5 space-y-2">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-amber-400">
                  1 · Wire #{firstWire.tag}
                </span>
                <span className="text-text-secondary">to</span>
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-blue-400">
                  2 · Wire #{secondWire.tag}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-md bg-background/80 p-2">
                  <div className="text-[9px] uppercase tracking-wider text-text-secondary">
                    Closest distance
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-text-primary">
                    {formatDistance(measurement.distance, unit)}
                  </div>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <div className="text-[9px] uppercase tracking-wider text-text-secondary">
                    Wire angle
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-text-primary">
                    {measurement.angleDegrees === null
                      ? "N/A"
                      : `${measurement.angleDegrees.toFixed(1)}°`}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400">
                  <div className="text-[9px] font-semibold">ΔX · EAST</div>
                  <div>{formatOffset(measurement.delta.x, unit)}</div>
                </div>
                <div className="rounded-md border border-green-500/30 bg-green-500/10 p-1.5 text-green-400">
                  <div className="text-[9px] font-semibold">ΔY · NORTH</div>
                  <div>{formatOffset(measurement.delta.y, unit)}</div>
                </div>
                <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-1.5 text-blue-400">
                  <div className="text-[9px] font-semibold">ΔZ · UP</div>
                  <div>{formatOffset(measurement.delta.z, unit)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className={`pointer-events-auto flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-lg backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          active
            ? "border-accent/60 bg-accent text-white"
            : "border-border/60 bg-surface/90 text-text-secondary hover:border-accent/50 hover:text-text-primary"
        }`}
        aria-pressed={active}
        title={active ? "Close wire measurement" : "Measure distance and angle between wires"}
      >
        <RulerIcon />
        <span>Measure</span>
      </button>
    </div>
  );
}
