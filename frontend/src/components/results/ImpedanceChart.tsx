/**
 * Impedance (R + jX) vs Frequency chart.
 * Shows resistance (solid blue) and reactance (dashed orange).
 * 50-ohm reference line highlighted.
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import type { FrequencyResult } from "../../api/nec";
import { useChartTheme } from "../../hooks/useChartTheme";

interface ImpedanceChartProps {
  data: FrequencyResult[];
}

export function ImpedanceChart({ data }: ImpedanceChartProps) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        freq: d.frequency_mhz,
        r: d.impedance.real,
        x: d.impedance.imag,
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

  // Calculate Y axis bounds
  const yBounds = useMemo(() => {
    if (chartData.length === 0) return { min: -100, max: 200 };
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const d of chartData) {
      minVal = Math.min(minVal, d.r, d.x);
      maxVal = Math.max(maxVal, d.r, d.x);
    }
    const padding = Math.max(20, (maxVal - minVal) * 0.1);
    return {
      min: Math.floor((minVal - padding) / 10) * 10,
      max: Math.ceil((maxVal + padding) / 10) * 10,
    };
  }, [chartData]);

  const ct = useChartTheme();

  if (data.length === 0) return null;

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: -10 }}
        >
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
            domain={[yBounds.min, yBounds.max]}
            tick={{ fill: ct.tick, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            stroke={ct.axis}
            tickFormatter={(v: number) => `${v}`}
          />

          {/* 50-ohm reference line */}
          <ReferenceLine
            y={50}
            stroke="#3B82F6"
            strokeDasharray="6 3"
            strokeOpacity={0.3}
            label={{ value: "50\u03A9", position: "right", fill: "#3B82F6", fontSize: 9 }}
          />

          {/* Zero reactance reference */}
          <ReferenceLine y={0} stroke={ct.axis} strokeOpacity={0.6} />

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
              const label = name === "r" ? "R" : "X";
              const unit = "\u03A9";
              return [`${value.toFixed(1)} ${unit}`, label];
            }}
            cursor={{ stroke: ct.cursor, strokeWidth: 1 }}
          />

          <Legend
            iconType="line"
            wrapperStyle={{ fontSize: "10px", fontFamily: "JetBrains Mono, monospace" }}
            formatter={(value: string) => (
              <span style={{ color: ct.tick }}>
                {value === "r" ? "R (\u03A9)" : "X (\u03A9)"}
              </span>
            )}
          />

          {/* Resistance — solid blue */}
          <Line
            type="monotone"
            dataKey="r"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            name="r"
          />

          {/* Reactance — dashed orange */}
          <Line
            type="monotone"
            dataKey="x"
            stroke="#F59E0B"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            name="x"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
