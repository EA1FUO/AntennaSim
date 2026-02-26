import type { ViewToggles } from "./types";

interface ViewToggleToolbarProps {
  toggles: ViewToggles;
  onToggle: (key: keyof ViewToggles) => void;
}

/**
 * View toggle toolbar — rendered as HTML overlay on the viewport.
 */
export function ViewToggleToolbar({ toggles, onToggle }: ViewToggleToolbarProps) {
  const items: { key: keyof ViewToggles; label: string }[] = [
    { key: "grid", label: "Grid" },
    { key: "wires", label: "Wires" },
    { key: "pattern", label: "Pattern" },
    { key: "volumetric", label: "Shells" },
    { key: "current", label: "Current" },
    { key: "reflection", label: "Mirror" },
    { key: "compass", label: "Compass" },
  ];

  return (
    <div className="absolute bottom-2 left-2 flex gap-1 z-10">
      {items.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            toggles[key]
              ? "bg-accent/20 text-accent border-accent/50"
              : "bg-surface/80 text-text-secondary border-border/50"
          } backdrop-blur-sm border`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
