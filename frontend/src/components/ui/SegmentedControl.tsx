/**
 * Segmented control for mobile tab switching.
 */

import { useCallback } from "react";

interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({
  segments,
  activeKey,
  onChange,
}: SegmentedControlProps) {
  const handleClick = useCallback(
    (key: string) => () => onChange(key),
    [onChange]
  );

  return (
    <div className="flex bg-background rounded-lg p-0.5 border border-border">
      {segments.map((seg) => (
        <button
          key={seg.key}
          onClick={handleClick(seg.key)}
          className={`
            flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
            ${
              activeKey === seg.key
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }
          `}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
