/**
 * Ground type selector with presets.
 * Allows selecting common ground types or custom permittivity/conductivity.
 */

import { useCallback } from "react";
import type { GroundConfig, GroundType } from "../../templates/types";

interface GroundEditorProps {
  ground: GroundConfig;
  onChange: (ground: GroundConfig) => void;
}

const GROUND_PRESETS: { type: GroundType; label: string; description: string }[] = [
  { type: "free_space", label: "Free Space", description: "No ground effects" },
  { type: "perfect", label: "Perfect", description: "Ideal ground plane" },
  { type: "salt_water", label: "Salt Water", description: "Best real ground" },
  { type: "pastoral", label: "Pastoral", description: "Rural countryside" },
  { type: "average", label: "Average", description: "Typical suburban" },
  { type: "city", label: "City/Urban", description: "Poor ground" },
  { type: "dry_sandy", label: "Dry/Sandy", description: "Desert, sandy soil" },
];

export function GroundEditor({ ground, onChange }: GroundEditorProps) {
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const type = e.target.value as GroundType;
      onChange({ type });
    },
    [onChange]
  );

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Ground
      </h3>
      <select
        value={ground.type}
        onChange={handleTypeChange}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5
          text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent
          appearance-none cursor-pointer"
      >
        {GROUND_PRESETS.map((preset) => (
          <option key={preset.type} value={preset.type}>
            {preset.label} — {preset.description}
          </option>
        ))}
      </select>
    </div>
  );
}
