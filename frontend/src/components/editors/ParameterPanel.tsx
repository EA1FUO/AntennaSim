/**
 * Parameter sliders panel — renders all template parameters as sliders.
 * Updates the antenna store in real-time as the user drags.
 * Supports imperial unit display (m -> ft) while keeping store values in metric.
 */

import { useCallback, useMemo } from "react";
import { Slider } from "../ui/Slider";
import { useUIStore } from "../../stores/uiStore";
import { metersToFeet, feetToMeters } from "../../utils/units";
import type { ParameterDef } from "../../templates/types";

interface ParameterPanelProps {
  parameters: ParameterDef[];
  values: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/** Units that should be converted to imperial */
const METRIC_LENGTH_UNITS = new Set(["m"]);
const M_TO_FT = 3.28084;

export function ParameterPanel({
  parameters,
  values,
  onParamChange,
}: ParameterPanelProps) {
  const imperial = useUIStore((s) => s.imperial);

  const handleChange = useCallback(
    (key: string, isMetricLength: boolean) => (value: number) => {
      // Convert back to meters if displaying in feet
      onParamChange(key, isMetricLength && imperial ? feetToMeters(value) : value);
    },
    [onParamChange, imperial]
  );

  // Memoize the converted parameters to avoid recalculating on every render
  const displayParams = useMemo(() => {
    return parameters.map((param) => {
      const isMetricLength = METRIC_LENGTH_UNITS.has(param.unit);
      if (isMetricLength && imperial) {
        return {
          ...param,
          unit: "ft",
          min: Math.round(metersToFeet(param.min) * 10) / 10,
          max: Math.round(metersToFeet(param.max) * 10) / 10,
          step: Math.round(param.step * M_TO_FT * 10) / 10 || 0.1,
        };
      }
      return param;
    });
  }, [parameters, imperial]);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Parameters
      </h3>
      <div className="space-y-3">
        {displayParams.map((param, i) => {
          const original = parameters[i]!;
          const isMetricLength = METRIC_LENGTH_UNITS.has(original.unit);
          const rawValue = values[original.key] ?? original.defaultValue;
          const displayValue = isMetricLength && imperial ? metersToFeet(rawValue) : rawValue;

          return (
            <Slider
              key={param.key}
              label={param.label}
              value={displayValue}
              min={param.min}
              max={param.max}
              step={param.step}
              unit={param.unit}
              decimals={param.decimals ?? 1}
              description={param.description}
              onChange={handleChange(original.key, isMetricLength)}
            />
          );
        })}
      </div>
    </div>
  );
}
