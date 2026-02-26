/**
 * Custom slider with value display and unit label.
 * Shows current value in monospace font, with configurable decimals.
 */

import { useCallback, useRef } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange]
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
        <span className="text-xs font-mono text-text-primary whitespace-nowrap">
          {displayValue}
          {unit && <span className="text-text-secondary ml-0.5">{unit}</span>}
        </span>
      </div>
      <input
        ref={inputRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
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
