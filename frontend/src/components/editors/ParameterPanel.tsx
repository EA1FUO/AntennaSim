/**
 * Parameter sliders panel — renders all template parameters as sliders.
 * Updates the antenna store in real-time as the user drags.
 */

import { useCallback } from "react";
import { Slider } from "../ui/Slider";
import type { ParameterDef } from "../../templates/types";

interface ParameterPanelProps {
  parameters: ParameterDef[];
  values: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

export function ParameterPanel({
  parameters,
  values,
  onParamChange,
}: ParameterPanelProps) {
  const handleChange = useCallback(
    (key: string) => (value: number) => onParamChange(key, value),
    [onParamChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Parameters
      </h3>
      <div className="space-y-3">
        {parameters.map((param) => (
          <Slider
            key={param.key}
            label={param.label}
            value={values[param.key] ?? param.defaultValue}
            min={param.min}
            max={param.max}
            step={param.step}
            unit={param.unit}
            decimals={param.decimals ?? 1}
            description={param.description}
            onChange={handleChange(param.key)}
          />
        ))}
      </div>
    </div>
  );
}
