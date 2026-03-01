/**
 * Custom slider with editable value display and unit label.
 * Combines a range slider with a number input for precise control.
 * Snaps values to the nearest step to eliminate floating-point drift.
 */

import { useCallback, useState } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals?: number;
  description?: string;
  onChange: (value: number) => void;
}

/** Snap a value to the nearest step multiple and clamp to [min, max]. */
function snapToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  // Kill floating-point noise (e.g. 14.099999999998 -> 14.1)
  const clean = parseFloat(snapped.toFixed(10));
  return Math.min(max, Math.max(min, clean));
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 1,
  description,
  onChange,
}: SliderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseFloat(e.target.value);
      onChange(snapToStep(raw, min, max, step));
    },
    [onChange, min, max, step]
  );

  const handleEditStart = useCallback(() => {
    setEditText(value.toFixed(decimals));
    setIsEditing(true);
  }, [value, decimals]);

  const handleEditCommit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(snapToStep(parsed, min, max, step));
    }
  }, [editText, onChange, min, max, step]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleEditCommit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleEditCommit]
  );

  const displayValue = value.toFixed(decimals);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label
          className="text-xs text-text-secondary truncate mr-2"
          title={description}
        >
          {label}
        </label>
        {isEditing ? (
          <input
            type="number"
            value={editText}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleEditCommit}
            onKeyDown={handleEditKeyDown}
            autoFocus
            className="w-20 text-xs font-mono text-text-primary text-right
              bg-surface-secondary border border-border rounded px-1 py-0.5
              focus:outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={handleEditStart}
            className="text-xs font-mono text-text-primary whitespace-nowrap
              hover:text-accent cursor-text transition-colors"
            title="Click to type a value"
          >
            {displayValue}
            {unit && <span className="text-text-secondary ml-0.5">{unit}</span>}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:hover:bg-accent-hover
          [&::-webkit-slider-thumb]:transition-colors
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-3.5
          [&::-moz-range-thumb]:h-3.5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-accent
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:hover:bg-accent-hover
          [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-track]:bg-border
          [&::-moz-range-track]:rounded-full
          [&::-moz-range-track]:h-1.5"
      />
    </div>
  );
}
