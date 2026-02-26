/**
 * PatternFrequencySlider — scrub through frequencies to morph the 3D pattern.
 *
 * Displays a slider below the viewport (or in results panel) that allows
 * the user to select which frequency's radiation pattern is displayed in 3D.
 * Shows the frequency, SWR at that frequency, and current index.
 */

import { useCallback, useMemo } from "react";
import { useSimulationStore } from "../../stores/simulationStore";
import { formatSwr, swrColorClass } from "../../utils/units";

interface PatternFrequencySliderProps {
  /** Additional CSS classes */
  className?: string;
}

export function PatternFrequencySlider({
  className = "",
}: PatternFrequencySliderProps) {
  const result = useSimulationStore((s) => s.result);
  const selectedFreqIndex = useSimulationStore((s) => s.selectedFreqIndex);
  const setSelectedFreqIndex = useSimulationStore((s) => s.setSelectedFreqIndex);

  const freqData = result?.frequency_data;
  const count = freqData?.length ?? 0;

  const currentData = useMemo(() => {
    if (!freqData || count === 0) return null;
    const idx = Math.min(selectedFreqIndex, count - 1);
    return freqData[idx] ?? null;
  }, [freqData, count, selectedFreqIndex]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedFreqIndex(parseInt(e.target.value, 10));
    },
    [setSelectedFreqIndex]
  );

  if (!freqData || count <= 1) return null;

  const startFreq = freqData[0]!.frequency_mhz;
  const endFreq = freqData[count - 1]!.frequency_mhz;

  return (
    <div
      className={`bg-surface/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 ${className}`}
    >
      {/* Header with current freq info */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-text-secondary">Frequency</span>
        {currentData && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-accent">
              {currentData.frequency_mhz.toFixed(3)} MHz
            </span>
            <span
              className={`text-[10px] font-mono ${swrColorClass(currentData.swr_50)}`}
            >
              SWR {formatSwr(currentData.swr_50)}
            </span>
          </div>
        )}
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={count - 1}
        value={selectedFreqIndex}
        onChange={handleChange}
        className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:shadow-accent/30
          [&::-moz-range-thumb]:w-3.5
          [&::-moz-range-thumb]:h-3.5
          [&::-moz-range-thumb]:bg-accent
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0"
      />

      {/* Range labels */}
      <div className="flex justify-between mt-0.5">
        <span className="text-[8px] font-mono text-text-secondary">
          {startFreq.toFixed(1)}
        </span>
        <span className="text-[8px] font-mono text-text-secondary">
          {((startFreq + endFreq) / 2).toFixed(1)}
        </span>
        <span className="text-[8px] font-mono text-text-secondary">
          {endFreq.toFixed(1)} MHz
        </span>
      </div>
    </div>
  );
}
