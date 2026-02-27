/**
 * Balun/Unun impedance matching selector.
 *
 * Provides preset transformers (1:1, 4:1, 9:1, etc.) and a custom option
 * for user-defined ratio and feedline Z0. The matching config is applied
 * as a post-processing transformation on simulation results.
 */

import { useCallback, useState } from "react";
import type { MatchingConfig, MatchingType } from "../../utils/units";
import { MATCHING_PRESETS } from "../../utils/units";

interface BalunEditorProps {
  matching: MatchingConfig;
  onChange: (matching: MatchingConfig) => void;
}

export function BalunEditor({ matching, onChange }: BalunEditorProps) {
  const [isCustom, setIsCustom] = useState(() => {
    // Check if current config matches any preset
    return !MATCHING_PRESETS.some(
      (p) =>
        p.config.type === matching.type &&
        p.config.ratio === matching.ratio &&
        p.config.feedlineZ0 === matching.feedlineZ0
    );
  });

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === "custom") {
        setIsCustom(true);
        return;
      }
      setIsCustom(false);
      const preset = MATCHING_PRESETS[parseInt(value, 10)];
      if (preset) {
        onChange({ ...preset.config });
      }
    },
    [onChange]
  );

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...matching, type: e.target.value as MatchingType });
    },
    [matching, onChange]
  );

  const handleRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        onChange({ ...matching, ratio: val });
      }
    },
    [matching, onChange]
  );

  const handleZ0Change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...matching, feedlineZ0: parseFloat(e.target.value) });
    },
    [matching, onChange]
  );

  // Find current preset index
  const currentPresetIndex = isCustom
    ? -1
    : MATCHING_PRESETS.findIndex(
        (p) =>
          p.config.type === matching.type &&
          p.config.ratio === matching.ratio &&
          p.config.feedlineZ0 === matching.feedlineZ0
      );

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
        Matching
      </h3>
      <select
        value={isCustom ? "custom" : String(currentPresetIndex)}
        onChange={handlePresetChange}
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5
          text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent
          appearance-none cursor-pointer"
      >
        {MATCHING_PRESETS.map((preset, i) => (
          <option key={i} value={String(i)}>
            {preset.label}
          </option>
        ))}
        <option value="custom">Custom...</option>
      </select>

      {/* Show description for selected preset */}
      {!isCustom && currentPresetIndex >= 0 && (
        <p className="text-[10px] text-text-secondary px-1 leading-tight">
          {MATCHING_PRESETS[currentPresetIndex]!.description}
        </p>
      )}

      {/* Custom fields */}
      {isCustom && (
        <div className="space-y-1.5 px-1">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-text-secondary w-10 shrink-0">
              Type:
            </label>
            <select
              value={matching.type}
              onChange={handleTypeChange}
              className="flex-1 bg-background text-text-primary text-xs px-1.5 py-1 rounded border border-border outline-none"
            >
              <option value="balun">Balun (balanced)</option>
              <option value="unun">Unun (unbalanced)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-text-secondary w-10 shrink-0">
              Ratio:
            </label>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                value={matching.ratio}
                onChange={handleRatioChange}
                min={0.1}
                max={100}
                step={0.1}
                className="w-16 bg-background text-text-primary text-xs font-mono px-1.5 py-1 rounded border border-border outline-none"
              />
              <span className="text-[10px] text-text-secondary">: 1</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-text-secondary w-10 shrink-0">
              Coax:
            </label>
            <select
              value={matching.feedlineZ0}
              onChange={handleZ0Change}
              className="flex-1 bg-background text-text-primary text-xs px-1.5 py-1 rounded border border-border outline-none"
            >
              <option value="50">50 &#937;</option>
              <option value="75">75 &#937;</option>
            </select>
          </div>
          <p className="text-[10px] text-text-secondary leading-tight">
            Z<sub>transformed</sub> = Z<sub>antenna</sub> / {matching.ratio} &rarr; SWR vs {matching.feedlineZ0}&#937;
          </p>
        </div>
      )}
    </div>
  );
}
