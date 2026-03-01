import { useState, useRef, useEffect } from "react";
import type { ViewToggles } from "./types";

interface ViewToggleToolbarProps {
  toggles: ViewToggles;
  onToggle: (key: keyof ViewToggles) => void;
}

interface ToggleGroup {
  label: string;
  items: { key: keyof ViewToggles; label: string }[];
}

const GROUPS: ToggleGroup[] = [
  {
    label: "Geometry",
    items: [
      { key: "grid", label: "Grid" },
      { key: "wires", label: "Wires" },
      { key: "compass", label: "Compass" },
    ],
  },
  {
    label: "Radiation",
    items: [
      { key: "pattern", label: "Pattern" },
      { key: "volumetric", label: "Shells" },
      { key: "slice", label: "Slice" },
      { key: "nearField", label: "NF" },
    ],
  },
  {
    label: "Current",
    items: [
      { key: "current", label: "Current" },
      { key: "currentFlow", label: "Flow" },
    ],
  },
  {
    label: "Other",
    items: [
      { key: "reflection", label: "Mirror" },
    ],
  },
];

/**
 * "Display" popover — replaces the old 10-button toggle row.
 * Single button at bottom-left opens a grouped popover above it.
 */
export function ViewToggleToolbar({ toggles, onToggle }: ViewToggleToolbarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Count active toggles (only the ones shown in the popover)
  const activeCount = GROUPS.reduce(
    (sum, group) => sum + group.items.filter(({ key }) => toggles[key]).length,
    0
  );

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={containerRef} className="absolute bottom-2 left-2 z-10">
      {/* Popover */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-surface/95 backdrop-blur-md border border-border rounded-lg shadow-lg p-2.5 min-w-[200px]">
          {GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-2 pt-2 border-t border-border/50" : ""}>
              <div className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5 px-0.5">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {group.items.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => onToggle(key)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      toggles[key]
                        ? "bg-accent/20 text-accent border-accent/50"
                        : "bg-background/60 text-text-secondary border-border/50 hover:bg-background hover:text-text-primary"
                    } border`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors backdrop-blur-sm border ${
          open
            ? "bg-accent/20 text-accent border-accent/50"
            : "bg-surface/80 text-text-secondary border-border/50 hover:bg-surface hover:text-text-primary"
        }`}
      >
        <span>Display</span>
        <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold leading-none">
          {activeCount}
        </span>
      </button>
    </div>
  );
}
