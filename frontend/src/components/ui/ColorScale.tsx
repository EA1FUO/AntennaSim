/**
 * Color scale legend bar for the radiation pattern.
 * Shows the gain colormap from min to max with labeled ticks.
 */

interface ColorScaleProps {
  minLabel: string;
  maxLabel: string;
  unit?: string;
}

export function ColorScale({
  minLabel,
  maxLabel,
  unit = "dBi",
}: ColorScaleProps) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-mono text-text-secondary">
      <span>{minLabel}</span>
      <div
        className="h-2 w-24 rounded-sm"
        style={{
          background:
            "linear-gradient(to right, #1E3A5F, #2563EB, #10B981, #F59E0B, #EF4444)",
        }}
      />
      <span>
        {maxLabel} {unit}
      </span>
    </div>
  );
}
