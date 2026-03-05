/**
 * Ground type selector with presets and custom permittivity/conductivity.
 * Includes all 10 ground types from the NEC2 backend.
 * When "Custom" is selected, shows input fields for dielectric constant
 * and conductivity so users can model any soil type.
 */

import { useCallback } from "react";
import { NumberInput } from "../ui/NumberInput";
import type { GroundConfig, GroundType } from "../../templates/types";

interface GroundEditorProps {
  ground: GroundConfig;
  onChange: (ground: GroundConfig) => void;
}

const GROUND_PRESETS: { type: GroundType; label: string; description: string }[] = [
  { type: "free_space", label: "Free Space", description: "No ground effects" },
  { type: "perfect", label: "Perfect", description: "Ideal ground plane" },
  { type: "salt_water", label: "Salt Water", description: "\u03B5r=80, \u03C3=5 S/m" },
  { type: "fresh_water", label: "Fresh Water", description: "\u03B5r=80, \u03C3=0.001 S/m" },
  { type: "pastoral", label: "Pastoral", description: "\u03B5r=14, \u03C3=0.01 S/m" },
  { type: "average", label: "Average", description: "\u03B5r=13, \u03C3=0.005 S/m" },
  { type: "rocky", label: "Rocky", description: "\u03B5r=12, \u03C3=0.002 S/m" },
  { type: "city", label: "City/Urban", description: "\u03B5r=5, \u03C3=0.001 S/m" },
  { type: "dry_sandy", label: "Dry/Sandy", description: "\u03B5r=3, \u03C3=0.0001 S/m" },
  { type: "custom", label: "Custom", description: "Set your own values" },
];

export function GroundEditor({ ground, onChange }: GroundEditorProps) {
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const type = e.target.value as GroundType;
      if (type === "custom") {
        onChange({
          type,
          custom_permittivity: ground.custom_permittivity ?? 13,
          custom_conductivity: ground.custom_conductivity ?? 0.005,
        });
      } else {
        onChange({ type });
      }
    },
    [onChange, ground.custom_permittivity, ground.custom_conductivity]
  );

  const handlePermittivityChange = useCallback(
    (val: number) => {
      onChange({ ...ground, custom_permittivity: val });
    },
    [onChange, ground]
  );

  const handleConductivityChange = useCallback(
    (val: number) => {
      onChange({ ...ground, custom_conductivity: val });
    },
    [onChange, ground]
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

      {/* Custom ground parameters */}
      {ground.type === "custom" && (
        <div className="space-y-2 pl-1">
          <NumberInput
            label={`Dielectric (\u03B5r)`}
            value={ground.custom_permittivity ?? 13}
            onChange={handlePermittivityChange}
            min={1}
            max={100}
            decimals={1}
            size="sm"
          />
          <NumberInput
            label={`Conductivity (\u03C3)`}
            value={ground.custom_conductivity ?? 0.005}
            onChange={handleConductivityChange}
            min={0}
            max={10}
            decimals={4}
            unit="S/m"
            size="sm"
          />
          <p className="text-[11px] text-text-secondary leading-relaxed px-0.5">
            Typical values: soil {"\u03B5"}r=3-20, {"\u03C3"}=0.0001-0.03.
            Water {"\u03B5"}r=80, concrete {"\u03B5"}r=4-8.
          </p>
        </div>
      )}
    </div>
  );
}
