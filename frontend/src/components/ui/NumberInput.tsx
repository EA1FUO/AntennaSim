/**
 * Click-to-edit number input — same UX as the Slider's value display.
 *
 * Shows the current value as a clickable label. Clicking turns it into
 * a text input where the user can freely type. The value is committed
 * on Enter or blur, and cancelled on Escape.
 *
 * This avoids the common <input type="number"> pitfalls:
 * - No live validation while typing (you can clear the field to retype)
 * - No tiny spinner buttons
 * - No fighting with step enforcement on keystroke
 */

import { useCallback, useState } from "react";

interface NumberInputProps {
  /** Current value */
  value: number;
  /** Called when the user commits a new value */
  onChange: (value: number) => void;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Decimal places to display */
  decimals?: number;
  /** Unit label shown after the value */
  unit?: string;
  /** Optional label shown before the value */
  label?: string;
  /** Additional class on the wrapper */
  className?: string;
  /** Size variant */
  size?: "xs" | "sm";
}

function clamp(raw: number, min: number | undefined, max: number | undefined): number {
  let v = raw;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  decimals = 1,
  unit,
  label,
  className = "",
  size = "xs",
}: NumberInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const textSize = size === "xs" ? "text-[10px]" : "text-xs";
  const inputPy = size === "xs" ? "py-0.5" : "py-1";

  const handleEditStart = useCallback(() => {
    setEditText(value.toFixed(decimals));
    setIsEditing(true);
  }, [value, decimals]);

  const handleEditCommit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed, min, max));
    }
  }, [editText, onChange, min, max]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleEditCommit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleEditCommit]
  );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {label && (
        <span className={`${textSize} text-text-secondary shrink-0`}>
          {label}
        </span>
      )}
      {isEditing ? (
        <input
          type="text"
          inputMode="decimal"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleEditCommit}
          onKeyDown={handleKeyDown}
          autoFocus
          className={`w-16 ${textSize} font-mono text-text-primary text-right
            bg-background border border-accent/50 rounded px-1.5 ${inputPy}
            focus:outline-none`}
        />
      ) : (
        <button
          type="button"
          onClick={handleEditStart}
          className={`${textSize} font-mono text-text-primary text-right whitespace-nowrap
            bg-background border border-border rounded px-1.5 ${inputPy}
            hover:border-accent/50 cursor-text transition-colors min-w-[3rem]`}
        >
          {value.toFixed(decimals)}
        </button>
      )}
      {unit && (
        <span className={`${textSize} text-text-secondary shrink-0`}>
          {unit}
        </span>
      )}
    </div>
  );
}
