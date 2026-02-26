/**
 * SWR vs Frequency chart using Recharts.
 * Background color zones: green (<1.5), amber (1.5-3), red (>3).
 * Shows band edges as vertical dashed lines.
 */

import { useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { FrequencyResult } from "../../api/nec";

interface SWRChartProps {
  data: FrequencyResult[];
  onFrequencyClick?: (index: number) => void;
  selectedIndex?: number;
}

export function SWRChart({ data, onFrequencyClick, selectedIndex }: SWRChartProps) {
  const chartData = useMemo(
    () =>
      data.map((d, i) => ({
        freq: d.frequency_mhz,
        swr: Math.min(d.swr_50, 10), // clamp for display
        index: i,
      })),
    [data]
  );

  const freqRange = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    return {
      min: chartData[0]!.freq,
      max: chartData[chartData.length - 1]!.freq,
    };
  }, [chartData]);

  const handleClick = useCallback(
    (point: { activePayload?: Array<{ payload: { index: number } }> }) => {
      if (point.activePayload?.[0] && onFrequencyClick) {
        onFrequencyClick(point.activePayload[0].payload.index);
      }
    },
    [onFrequencyClick]
  );

  if (data.length === 0) return null;

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: -10 }}
          onClick={handleClick}
        >
          {/* SWR quality background zones */}
          <ReferenceArea y1={1} y2={1.5} fill="#10B981" fillOpacity={0.08} />
          <ReferenceArea y1={1.5} y2={2} fill="#22C55E" fillOpacity={0.06} />
          <ReferenceArea y1={2} y2={3} fill="#F59E0B" fillOpacity={0.06} />
          <ReferenceArea y1={3} y2={10} fill="#EF4444" fillOpacity={0.04} />

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#2A2A35"
            strokeOpacity={0.5}
          />

          <XAxis
            dataKey="freq"
            type="number"
            domain={[freqRange.min, freqRange.max]}
            tick={{ fill: "#8888A0", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            stroke="#2A2A35"
          />

          <YAxis
            domain={[1, 10]}
            tick={{ fill: "#8888A0", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            stroke="#2A2A35"
            ticks={[1, 1.5, 2, 3, 5, 10]}
          />

          {/* Reference lines at key SWR values */}
          <ReferenceLine y={1.5} stroke="#22C55E" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={2} stroke="#F59E0B" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={3} stroke="#EF4444" strokeDasharray="3 3" strokeOpacity={0.4} />

          {/* Selected frequency marker */}
          {selectedIndex != null && chartData[selectedIndex] && (
            <ReferenceLine
              x={chartData[selectedIndex]!.freq}
              stroke="#3B82F6"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          )}

          <Tooltip
            contentStyle={{
              backgroundColor: "#13131A",
              border: "1px solid #2A2A35",
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "JetBrains Mono, monospace",
            }}
            labelStyle={{ color: "#8888A0" }}
            labelFormatter={(v: number) => `${v.toFixed(3)} MHz`}
            formatter={(value: number) => {
              const color =
                value < 1.5
                  ? "#10B981"
                  : value < 2
                    ? "#22C55E"
                    : value < 3
                      ? "#F59E0B"
                      : "#EF4444";
              return [
                <span key="swr" style={{ color }}>
                  {value.toFixed(2)}
                </span>,
                "SWR",
              ];
            }}
            cursor={{ stroke: "#3B82F6", strokeWidth: 1 }}
          />

          <Line
            type="monotone"
            dataKey="swr"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#3B82F6", stroke: "#0A0A0F", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
