/**
 * SWR vs Frequency chart using Recharts.
 * Background color zones: green (<1.5), amber (1.5-3), red (>3).
 * Optional .s1p overlay for measured VNA data comparison.
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
import type { S1PDataPoint } from "../../utils/s1p-parser";
import { useChartTheme } from "../../hooks/useChartTheme";

interface SWRChartProps {
  data: FrequencyResult[];
  onFrequencyClick?: (index: number) => void;
  selectedIndex?: number;
  /** Optional .s1p overlay data */
  s1pData?: S1PDataPoint[];
}

export function SWRChart({
  data,
  onFrequencyClick,
  selectedIndex,
  s1pData,
}: SWRChartProps) {
  // Merge simulation data and .s1p data into a unified dataset.
  // For the sim line we use "swr", for .s1p we use "s1pSwr".
  const chartData = useMemo(() => {
    // Build a map keyed by frequency (rounded to avoid float mismatches)
    const merged: Record<
      string,
      { freq: number; swr?: number; s1pSwr?: number; index?: number }
    > = {};

    // Add simulation data
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const key = d.frequency_mhz.toFixed(4);
      merged[key] = {
        freq: d.frequency_mhz,
        swr: Math.min(d.swr_50, 10),
        index: i,
      };
    }

    // Add .s1p data
    if (s1pData) {
      for (const pt of s1pData) {
        const key = pt.frequency_mhz.toFixed(4);
        if (merged[key]) {
          merged[key]!.s1pSwr = Math.min(pt.swr, 10);
        } else {
          merged[key] = {
            freq: pt.frequency_mhz,
            s1pSwr: Math.min(pt.swr, 10),
          };
        }
      }
    }

    // Sort by frequency
    return Object.values(merged).sort((a, b) => a.freq - b.freq);
  }, [data, s1pData]);

  const freqRange = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    return {
      min: chartData[0]!.freq,
      max: chartData[chartData.length - 1]!.freq,
    };
  }, [chartData]);

  const handleClick = useCallback(
    (point: { activePayload?: Array<{ payload: { index?: number } }> }) => {
      const idx = point.activePayload?.[0]?.payload?.index;
      if (idx != null && onFrequencyClick) {
        onFrequencyClick(idx);
      }
    },
    [onFrequencyClick]
  );

  const ct = useChartTheme();

  if (data.length === 0 && !s1pData?.length) return null;

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
            stroke={ct.grid}
            strokeOpacity={0.5}
          />

          <XAxis
            dataKey="freq"
            type="number"
            domain={[freqRange.min, freqRange.max]}
            tick={{ fill: ct.tick, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            stroke={ct.axis}
          />

          <YAxis
            domain={[1, 10]}
            tick={{ fill: ct.tick, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            stroke={ct.axis}
            ticks={[1, 1.5, 2, 3, 5, 10]}
          />

          {/* Reference lines at key SWR values */}
          <ReferenceLine y={1.5} stroke="#22C55E" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={2} stroke="#F59E0B" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={3} stroke="#EF4444" strokeDasharray="3 3" strokeOpacity={0.4} />

          {/* Selected frequency marker */}
          {selectedIndex != null && data[selectedIndex] && (
            <ReferenceLine
              x={data[selectedIndex]!.frequency_mhz}
              stroke="#3B82F6"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          )}

          <Tooltip
            contentStyle={{
              backgroundColor: ct.tooltipBg,
              border: `1px solid ${ct.tooltipBorder}`,
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "JetBrains Mono, monospace",
            }}
            labelStyle={{ color: ct.tooltipLabel }}
            labelFormatter={(v: number) => `${v.toFixed(3)} MHz`}
            formatter={(value: number, name: string) => {
              const color =
                value < 1.5
                  ? "#10B981"
                  : value < 2
                    ? "#22C55E"
                    : value < 3
                      ? "#F59E0B"
                      : "#EF4444";
              const label = name === "s1pSwr" ? ".s1p" : "SWR";
              return [
                <span key={name} style={{ color }}>
                  {value.toFixed(2)}
                </span>,
                label,
              ];
            }}
            cursor={{ stroke: ct.cursor, strokeWidth: 1 }}
          />

          {/* Simulation SWR line */}
          <Line
            type="monotone"
            dataKey="swr"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#3B82F6", stroke: "#0A0A0F", strokeWidth: 2 }}
            connectNulls={false}
          />

          {/* .s1p overlay line */}
          {s1pData && s1pData.length > 0 && (
            <Line
              type="monotone"
              dataKey="s1pSwr"
              stroke="#EC4899"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              connectNulls={false}
              name="s1pSwr"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
