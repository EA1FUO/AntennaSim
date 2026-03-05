/**
 * Compact editor for multi-segment frequency sweeps.
 *
 * When no segments are defined, shows the single-range sweep controls (legacy).
 * When 1+ segments exist, shows a list of segment rows with start/stop/steps
 * and remove buttons, plus an "Add custom" button and total point count.
 */

import { useCallback } from "react";
import { NumberInput } from "./NumberInput";
import { computeSteps } from "../../utils/ham-bands";
import type { FrequencyRange, FrequencySegment } from "../../templates/types";

interface FrequencySegmentEditorProps {
  /** The single-range frequency (fallback when no segments) */
  frequencyRange: FrequencyRange;
  /** Callback for changing the single range */
  onFrequencyRangeChange: (range: FrequencyRange) => void;
  /** Current frequency segments */
  segments: FrequencySegment[];
  /** Replace all segments at once */
  onSegmentsChange: (segments: FrequencySegment[]) => void;
  /** Size variant for NumberInput */
  size?: "xs" | "sm";
}

/** Maximum total frequency points across all segments */
const MAX_TOTAL_POINTS = 301;

export function FrequencySegmentEditor({
  frequencyRange,
  onFrequencyRangeChange,
  segments,
  onSegmentsChange,
  size,
}: FrequencySegmentEditorProps) {
  const totalPoints = segments.reduce((sum, seg) => sum + seg.steps, 0);
  const hasSegments = segments.length > 0;

  const handleAddCustom = useCallback(() => {
    // Default: add a segment around the current single-range center
    const center = (frequencyRange.start_mhz + frequencyRange.stop_mhz) / 2;
    const bw = Math.max(0.5, (frequencyRange.stop_mhz - frequencyRange.start_mhz) * 0.3);
    const start = Math.round(Math.max(0.1, center - bw / 2) * 100) / 100;
    const stop = Math.round(Math.min(2000, center + bw / 2) * 100) / 100;
    onSegmentsChange([
      ...segments,
      { start_mhz: start, stop_mhz: stop, steps: computeSteps(start, stop), label: "Custom" },
    ]);
  }, [segments, frequencyRange, onSegmentsChange]);

  const handleRemoveSegment = useCallback(
    (index: number) => {
      onSegmentsChange(segments.filter((_, i) => i !== index));
    },
    [segments, onSegmentsChange],
  );

  const handleUpdateSegment = useCallback(
    (index: number, updates: Partial<FrequencySegment>) => {
      const updated = segments.map((seg, i) =>
        i === index ? { ...seg, ...updates } : seg,
      );
      onSegmentsChange(updated);
    },
    [segments, onSegmentsChange],
  );

  const handleClearSegments = useCallback(() => {
    onSegmentsChange([]);
  }, [onSegmentsChange]);

  // --- Single-range mode (no segments) ---
  if (!hasSegments) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Frequency Sweep
          </h3>
        </div>
        <div className="flex items-center gap-1 px-1 flex-wrap">
          <NumberInput
            value={frequencyRange.start_mhz}
            onChange={(v) =>
              onFrequencyRangeChange({
                start_mhz: v,
                stop_mhz: frequencyRange.stop_mhz,
                steps: computeSteps(v, frequencyRange.stop_mhz),
              })
            }
            min={0.1}
            max={frequencyRange.stop_mhz - 0.1}
            decimals={1}
            size={size}
          />
          <span className="text-[10px] text-text-secondary">-</span>
          <NumberInput
            value={frequencyRange.stop_mhz}
            onChange={(v) =>
              onFrequencyRangeChange({
                start_mhz: frequencyRange.start_mhz,
                stop_mhz: v,
                steps: computeSteps(frequencyRange.start_mhz, v),
              })
            }
            min={frequencyRange.start_mhz + 0.1}
            max={500}
            decimals={1}
            unit="MHz"
            size={size}
          />
          <NumberInput
            value={frequencyRange.steps}
            onChange={(v) => onFrequencyRangeChange({ ...frequencyRange, steps: v })}
            min={1}
            max={201}
            decimals={0}
            unit="pts"
            size={size}
          />
        </div>
      </div>
    );
  }

  // --- Multi-segment mode ---
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Frequency Segments
          <span className="ml-1 text-accent font-normal normal-case">
            ({segments.length})
          </span>
        </h3>
        <button
          onClick={handleClearSegments}
          className="text-[10px] text-text-secondary hover:text-accent transition-colors"
          title="Clear all segments (revert to single sweep)"
        >
          Clear
        </button>
      </div>

      <div className="space-y-1 px-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1 flex-wrap">
            {seg.label && (
              <span className="text-[10px] font-medium text-accent w-6 shrink-0">{seg.label}</span>
            )}
            <NumberInput
              value={seg.start_mhz}
              onChange={(v) =>
                handleUpdateSegment(i, {
                  start_mhz: v,
                  steps: computeSteps(v, seg.stop_mhz),
                })
              }
              min={0.1}
              max={seg.stop_mhz - 0.01}
              decimals={3}
              size={size ?? "xs"}
            />
            <span className="text-[10px] text-text-secondary">-</span>
            <NumberInput
              value={seg.stop_mhz}
              onChange={(v) =>
                handleUpdateSegment(i, {
                  stop_mhz: v,
                  steps: computeSteps(seg.start_mhz, v),
                })
              }
              min={seg.start_mhz + 0.01}
              max={2000}
              decimals={3}
              size={size ?? "xs"}
            />
            <NumberInput
              value={seg.steps}
              onChange={(v) => handleUpdateSegment(i, { steps: v })}
              min={1}
              max={201}
              decimals={0}
              unit="pts"
              size={size ?? "xs"}
            />
            <button
              onClick={() => handleRemoveSegment(i)}
              className="text-[11px] text-text-secondary hover:text-red-400 transition-colors px-0.5 shrink-0"
              title="Remove segment"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Add custom + total */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={handleAddCustom}
          className="text-[10px] text-accent hover:text-accent/80 transition-colors"
        >
          + Add custom
        </button>
        <span
          className={`text-[10px] font-mono ${
            totalPoints > MAX_TOTAL_POINTS ? "text-red-400" : "text-text-secondary"
          }`}
        >
          {totalPoints} / {MAX_TOTAL_POINTS} pts
        </span>
      </div>
      {totalPoints > MAX_TOTAL_POINTS && (
        <p className="text-[10px] text-red-400 px-1 leading-tight">
          Total points exceed maximum. Reduce steps or remove segments.
        </p>
      )}
    </div>
  );
}
