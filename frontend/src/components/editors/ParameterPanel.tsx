/**
 * Parameter sliders panel — renders all template parameters as sliders.
 * Updates the antenna store in real-time as the user drags.
 * Length controls follow the global metric/imperial mode and can use a more
 * precise unit within that system, while template values stay in meters.
 */

import { useCallback } from "react";
import { Slider } from "../ui/Slider";
import { useUIStore } from "../../stores/uiStore";
import {
  IMPERIAL_LENGTH_UNIT_OPTIONS,
  lengthUnitToMeters,
  METRIC_LENGTH_UNIT_OPTIONS,
  metersToLengthUnit,
} from "../../utils/units";
import type { LengthUnit } from "../../utils/units";
import type { ParameterDef } from "../../templates/types";

interface ParameterPanelProps {
  parameters: ParameterDef[];
  values: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const LENGTH_PARAMETER_UNITS = new Set(["m"]);
const HEIGHT_PARAMETER_KEYS = new Set([
  "height",
  "base_height",
  "feed_height",
  "far_end_height",
]);
const HEIGHT_SLIDER_MIN = 1;
const HEIGHT_SLIDER_MAX = 100;
const HEIGHT_SLIDER_STEP = 1;

const LENGTH_UNIT_DECIMALS: Record<LengthUnit, number> = {
  m: 3,
  cm: 1,
  mm: 0,
  ft: 2,
  in: 1,
};

export function ParameterPanel({
  parameters,
  values,
  onParamChange,
}: ParameterPanelProps) {
  const imperial = useUIStore((s) => s.imperial);
  const metricLengthUnit = useUIStore((s) => s.metricLengthUnit);
  const imperialLengthUnit = useUIStore((s) => s.imperialLengthUnit);
  const setLengthUnit = useUIStore((s) => s.setLengthUnit);

  const unitOptions = imperial
    ? IMPERIAL_LENGTH_UNIT_OPTIONS
    : METRIC_LENGTH_UNIT_OPTIONS;
  const selectedLengthUnit: LengthUnit = imperial
    ? imperialLengthUnit
    : metricLengthUnit;

  const handleChange = useCallback(
    (key: string, lengthUnit?: LengthUnit) => (value: number) => {
      onParamChange(
        key,
        lengthUnit ? lengthUnitToMeters(value, lengthUnit) : value,
      );
    },
    [onParamChange],
  );

  const handleUnitChange = useCallback(
    (rawUnit: string) => setLengthUnit(rawUnit as LengthUnit),
    [setLengthUnit],
  );

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Parameters
      </h3>
      <div className="space-y-3">
        {parameters.map((param) => {
          const isLength = LENGTH_PARAMETER_UNITS.has(param.unit);
          const isHeight = HEIGHT_PARAMETER_KEYS.has(param.key);
          const lengthUnit = isLength ? selectedLengthUnit : undefined;
          const rawValue = values[param.key] ?? param.defaultValue;
          const displayValue = lengthUnit
            ? metersToLengthUnit(rawValue, lengthUnit)
            : rawValue;
          const min = lengthUnit
            ? isHeight
              ? HEIGHT_SLIDER_MIN
              : metersToLengthUnit(param.min, lengthUnit)
            : param.min;
          const max = lengthUnit
            ? isHeight
              ? HEIGHT_SLIDER_MAX
              : metersToLengthUnit(param.max, lengthUnit)
            : param.max;
          const step = lengthUnit
            ? isHeight
              ? HEIGHT_SLIDER_STEP
              : metersToLengthUnit(param.step, lengthUnit)
            : param.step;

          return (
            <Slider
              key={param.key}
              label={param.label}
              value={displayValue}
              min={min}
              max={max}
              step={step}
              unit={lengthUnit ?? param.unit}
              unitOptions={lengthUnit ? unitOptions : undefined}
              onUnitChange={lengthUnit ? handleUnitChange : undefined}
              decimals={
                lengthUnit
                  ? LENGTH_UNIT_DECIMALS[lengthUnit]
                  : (param.decimals ?? 1)
              }
              description={param.description}
              onChange={handleChange(param.key, lengthUnit)}
            />
          );
        })}
      </div>
    </div>
  );
}
