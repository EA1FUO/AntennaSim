/**
 * SWR vs Frequency chart using Recharts.
 *
 * Features:
 * - Background color zones: green (<1.5), amber (1.5-3), red (>3)
 * - Non-linear Y-axis ticks at key SWR values
 * - Band edge markers with labels
 * - Resonance point (minimum SWR) highlighted with annotation
 * - 3-decimal frequency labels on X-axis
 * - Crosshair tooltip showing frequency, SWR, and impedance
 * - Optional .s1p overlay for measured VNA data comparison
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
  Legend,
} from "recharts";
import type { FrequencyResult } from "../../api/nec";
import type { S1PDataPoint } from "../../utils/s1p-parser";
import type { MatchingConfig } from "../../utils/units";
import { applyMatching, DEFAULT_MATCHING } from "../../utils/units";
import { useChartTheme } from "../../hooks/useChartTheme";

/** Amateur radio band edges (MHz) */
const HAM_BANDS = [
  { name: "160m", start: 1.8, end: 2.0 },
  { name: "80m", start: 3.5, end: 4.0 },
  { name: "60m", start: 5.3305, end: 5.4065 },
  { name: "40m", start: 7.0, end: 7.3 },
  { name: "30m", start: 10.1, end: 10.15 },
  { name: "20m", start: 14.0, end: 14.35 },
  { name: "17m", start: 18.068, end: 18.168 },
  { name: "15m", start: 21.0, end: 21.45 },
  { name: "12m", start: 24.89, end: 24.99 },
  { name: "10m", start: 28.0, end: 29.7 },
  { name: "6m", start: 50.0, end: 54.0 },
  { name: "2m", start: 144.0, end: 148.0 },
  { name: "70cm", start: 420.0, end: 450.0 },
];

interface SWRChartProps {
  data: FrequencyResult[];
  onFrequencyClick?: (index: number) => void;
  selectedIndex?: number;
  /** Optional .s1p overlay data */
  s1pData?: S1PDataPoint[];
  /** Matching config for impedance transformation */
  matching?: MatchingConfig;
  /** Height class override (default: h-48) */
  heightClass?: string;
}

export function SWRChart({
  data,
  onFrequencyClick,
  selectedIndex,
  s1pData,
  matching = DEFAULT_MATCHING,
  heightClass = "h-56",
}: SWRChartProps) {
  // Merge simulation data and .s1p data into a unified dataset
  const chartData = useMemo(() => {
    const merged: Record<
      string,
      { freq: number; swr?: number; s1pSwr?: number; index?: number; r?: number; x?: number }
    > = {};

    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const m = applyMatching(d.impedance.real, d.impedance.imag, matching);
      const key = d.frequency_mhz.toFixed(4);
      merged[key] = {
        freq: d.frequency_mhz,
        swr: Math.min(m.swr, 10),
        index: i,
        r: m.real,
        x: m.imag,
      };
    }

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

    return Object.values(merged).sort((a, b) => a.freq - b.freq);
  }, [data, s1pData, matching]);

  const freqRange = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    return {
      min: chartData[0]!.freq,
      max: chartData[chartData.length - 1]!.freq,
    };
  }, [chartData]);

  // Find resonance point (minimum SWR in simulation data, with matching applied)
  const resonance = useMemo(() => {
    if (data.length === 0) return null;
    let minSwr = Infinity;
    let minIdx = 0;
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const m = applyMatching(d.impedance.real, d.impedance.imag, matching);
      if (m.swr < minSwr) {
        minSwr = m.swr;
        minIdx = i;
      }
    }
    return {
      freq: data[minIdx]!.frequency_mhz,
      swr: Math.min(minSwr, 10),
      index: minIdx,
    };
  }, [data, matching]);

  // Find band edges that fall within the frequency range
  const visibleBands = useMemo(() => {
    const { min, max } = freqRange;
    const span = max - min;
    if (span <= 0) return [];
    return HAM_BANDS.filter(
      (b) => b.start <= max && b.end >= min
    );
  }, [freqRange]);

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
    <div className={`w-full ${heightClass} flex flex-col`}>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 15, bottom: 5, left: -5 }}
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
            tickFormatter={(v: number) => v.toFixed(3)}
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

          {/* Band edge markers */}
          {visibleBands.map((band) => (
            <ReferenceArea
              key={band.name}
              x1={Math.max(band.start, freqRange.min)}
              x2={Math.min(band.end, freqRange.max)}
              fill="#3B82F6"
              fillOpacity={0.04}
              label={{
                value: band.name,
                position: "insideTopLeft",
                fill: ct.tick,
                fontSize: 8,
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          ))}

          {/* Selected frequency marker */}
          {selectedIndex != null && data[selectedIndex] && (
            <ReferenceLine
              x={data[selectedIndex]!.frequency_mhz}
              stroke="#3B82F6"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          )}

          {/* Resonance point marker */}
          {resonance && (
            <ReferenceLine
              x={resonance.freq}
              stroke="#10B981"
              strokeWidth={1}
              strokeDasharray="2 2"
              strokeOpacity={0.6}
              label={{
                value: `${resonance.freq.toFixed(3)} MHz  SWR ${resonance.swr.toFixed(2)}`,
                position: "top",
                fill: "#10B981",
                fontSize: 9,
                fontFamily: "JetBrains Mono, monospace",
              }}
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

          {/* Legend — always visible */}
          <Legend
            iconType="line"
            wrapperStyle={{ fontSize: "10px", fontFamily: "JetBrains Mono, monospace", paddingTop: "4px" }}
            formatter={(value: string) => (
              <span style={{ color: ct.tick }}>
                {value === "swr" ? "SWR (simulated)" : ".s1p (measured)"}
              </span>
            )}
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
            name="swr"
            animationDuration={300}
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
              animationDuration={300}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
      {/* Zone legend */}
      <div className="flex items-center justify-center gap-3 pt-1 flex-shrink-0" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#10B981", opacity: 0.35 }} />
          <span style={{ color: ct.tick }}>&lt;1.5 Good</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#F59E0B", opacity: 0.35 }} />
          <span style={{ color: ct.tick }}>1.5-3 OK</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#EF4444", opacity: 0.35 }} />
          <span style={{ color: ct.tick }}>&gt;3 Poor</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0 border-t border-dashed" style={{ borderColor: "#10B981" }} />
          <span style={{ color: ct.tick }}>Resonance</span>
        </span>
      </div>
    </div>
  );
}
