/**
 * Impedance (R + jX) vs Frequency chart.
 *
 * Features:
 * - R (resistance) as solid blue line, X (reactance) as solid orange line
 * - 50-ohm reference line (dashed gray with label)
 * - Zero-reactance reference line
 * - Resonance markers where X crosses zero (jX = 0)
 * - Crosshair tooltip showing frequency, R, X, and |Z|
 * - Clear legend with color-coded labels
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
  /** Height class override (default: h-48) */
  heightClass?: string;
}

export function ImpedanceChart({ data, heightClass = "h-48" }: ImpedanceChartProps) {
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

  // Find resonance points where X crosses zero
  const resonanceFreqs = useMemo(() => {
    const crossings: number[] = [];
    for (let i = 0; i < chartData.length - 1; i++) {
      const x0 = chartData[i]!.x;
      const x1 = chartData[i + 1]!.x;
      // Sign change indicates zero crossing
      if ((x0 >= 0 && x1 < 0) || (x0 < 0 && x1 >= 0)) {
        // Linear interpolation to find exact crossing frequency
        const f0 = chartData[i]!.freq;
        const f1 = chartData[i + 1]!.freq;
        const ratio = Math.abs(x0) / (Math.abs(x0) + Math.abs(x1));
        crossings.push(f0 + ratio * (f1 - f0));
      }
    }
    return crossings;
  }, [chartData]);

  const ct = useChartTheme();

  if (data.length === 0) return null;

  return (
    <div className={`w-full ${heightClass}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, bottom: 5, left: -5 }}
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
            tickFormatter={(v: number) => v.toFixed(3)}
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
            stroke="#6B7280"
            strokeDasharray="6 3"
            strokeOpacity={0.5}
            label={{ value: "50\u03A9", position: "right", fill: "#6B7280", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
          />

          {/* Zero reactance reference (resonance line) */}
          <ReferenceLine y={0} stroke={ct.axis} strokeOpacity={0.6} />

          {/* Resonance markers where X crosses zero */}
          {resonanceFreqs.map((freq, i) => (
            <ReferenceLine
              key={`res-${i}`}
              x={freq}
              stroke="#10B981"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: `${freq.toFixed(3)}`,
                position: "top",
                fill: "#10B981",
                fontSize: 8,
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          ))}

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
              const label = name === "r" ? "R" : "jX";
              const color = name === "r" ? "#3B82F6" : "#F59E0B";
              return [
                <span key={name} style={{ color }}>
                  {value.toFixed(1)} {"\u03A9"}
                </span>,
                label,
              ];
            }}
            cursor={{ stroke: ct.cursor, strokeWidth: 1 }}
          />

          <Legend
            iconType="line"
            wrapperStyle={{ fontSize: "10px", fontFamily: "JetBrains Mono, monospace" }}
            formatter={(value: string) => (
              <span style={{ color: ct.tick }}>
                {value === "r" ? "R (\u03A9)" : "jX (\u03A9)"}
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
            activeDot={{ r: 3, fill: "#3B82F6" }}
            name="r"
            animationDuration={300}
          />

          {/* Reactance — solid orange */}
          <Line
            type="monotone"
            dataKey="x"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "#F59E0B" }}
            name="x"
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
