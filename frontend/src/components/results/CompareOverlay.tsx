/**
 * CompareOverlay — overlay SWR curves from multiple saved simulation results.
 *
 * Allows the user to visually compare different antenna configurations
 * by overlaying SWR (and optionally impedance) curves from saved results.
 */

import { useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useCompareStore } from "../../stores/compareStore";
import { useSimulationStore } from "../../stores/simulationStore";
import { useChartTheme } from "../../hooks/useChartTheme";

interface CompareOverlayProps {
  className?: string;
}

export function CompareOverlay({ className = "" }: CompareOverlayProps) {
  const savedResults = useCompareStore((s) => s.savedResults);
  const isComparing = useCompareStore((s) => s.isComparing);
  const setComparing = useCompareStore((s) => s.setComparing);
  const saveResult = useCompareStore((s) => s.saveResult);
  const removeResult = useCompareStore((s) => s.removeResult);
  const clearAll = useCompareStore((s) => s.clearAll);

  const currentResult = useSimulationStore((s) => s.result);
  const ct = useChartTheme();

  const handleSave = useCallback(() => {
    if (currentResult) {
      saveResult(currentResult);
    }
  }, [currentResult, saveResult]);

  const handleToggle = useCallback(() => {
    setComparing(!isComparing);
  }, [isComparing, setComparing]);

  // Build merged chart data
  // Each frequency point has swr_0, swr_1, swr_2... for each saved result
  const chartData = (() => {
    if (savedResults.length === 0) return [];

    // Collect all unique frequencies across all results
    const freqSet = new Set<number>();
    for (const saved of savedResults) {
      for (const d of saved.result.frequency_data) {
        freqSet.add(Math.round(d.frequency_mhz * 1000) / 1000);
      }
    }

    const freqs = Array.from(freqSet).sort((a, b) => a - b);

    return freqs.map((freq) => {
      const row: Record<string, number> = { frequency: freq };
      for (let i = 0; i < savedResults.length; i++) {
        const saved = savedResults[i]!;
        // Find closest frequency in this result
        let closest = saved.result.frequency_data[0];
        let minDist = Infinity;
        for (const d of saved.result.frequency_data) {
          const dist = Math.abs(d.frequency_mhz - freq);
          if (dist < minDist) {
            minDist = dist;
            closest = d;
          }
        }
        if (closest && minDist < 0.1) {
          row[`swr_${i}`] = Math.min(closest.swr_50, 10);
        }
      }
      return row;
    });
  })();

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={!currentResult}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={handleToggle}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
              isComparing
                ? "border-accent/50 text-accent bg-accent/10"
                : "border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {isComparing ? "Hide" : "Show"}
          </button>
          {savedResults.length > 0 && (
            <button
              onClick={clearAll}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary hover:text-swr-bad transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Saved results list */}
      {savedResults.length > 0 && (
        <div className="space-y-0.5">
          {savedResults.map((saved) => (
            <div
              key={saved.id}
              className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-background"
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: saved.color }}
                />
                <span className="text-text-primary truncate max-w-[120px]">
                  {saved.label}
                </span>
              </div>
              <button
                onClick={() => removeResult(saved.id)}
                className="text-text-secondary hover:text-swr-bad transition-colors ml-1"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Compare chart */}
      {isComparing && chartData.length > 0 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="frequency"
                stroke={ct.axis}
                tick={{ fontSize: 8, fill: ct.tick }}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                domain={[1, 10]}
                stroke={ct.axis}
                tick={{ fontSize: 8, fill: ct.tick }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: ct.tooltipBg,
                  border: `1px solid ${ct.tooltipBorder}`,
                  borderRadius: "4px",
                  fontSize: "10px",
                }}
                labelFormatter={(v: number) => `${v.toFixed(3)} MHz`}
              />
              <ReferenceLine y={2} stroke="#22C55E" strokeDasharray="3 3" strokeWidth={0.5} />

              {savedResults.map((saved, i) => (
                <Line
                  key={saved.id}
                  type="monotone"
                  dataKey={`swr_${i}`}
                  stroke={saved.color}
                  strokeWidth={1.5}
                  dot={false}
                  name={saved.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {savedResults.length === 0 && (
        <p className="text-[9px] text-text-secondary">
          Save simulation results to compare SWR curves.
        </p>
      )}
    </div>
  );
}
