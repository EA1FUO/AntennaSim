/**
 * SmithChart — interactive SVG-based Smith chart.
 *
 * Plots impedance data as a trajectory across frequency sweep.
 * Features:
 * - Standard Smith chart circles (constant R, constant X)
 * - Impedance locus with frequency markers
 * - Constant SWR circles (1.5, 2.0, 3.0)
 * - Click on point -> tooltip with Z, freq
 * - Theme-aware (dark/light)
 */

import { useMemo, useState, useCallback, useRef, useId } from "react";
import type { FrequencyResult } from "../../api/nec";
import { useUIStore } from "../../stores/uiStore";
import { formatFrequency, formatImpedance, applyMatching, DEFAULT_MATCHING } from "../../utils/units";
import type { MatchingConfig } from "../../utils/units";

interface SmithChartProps {
  data: FrequencyResult[];
  /** Reference impedance (default 50) */
  z0?: number;
  /** Chart size in pixels (used for internal viewBox calculation) */
  size?: number;
  /** Selected frequency index */
  selectedIndex?: number;
  /** Callback when a frequency point is clicked */
  onFrequencyClick?: (index: number) => void;
  /** When true, SVG fills its container instead of using fixed pixel dimensions */
  responsive?: boolean;
  /** Matching config for impedance transformation */
  matching?: MatchingConfig;
}

/** Convert impedance Z to reflection coefficient Gamma */
function zToGamma(
  zReal: number,
  zImag: number,
  z0: number
): { real: number; imag: number } {
  // Gamma = (Z - Z0) / (Z + Z0)
  const numReal = zReal - z0;
  const numImag = zImag;
  const denReal = zReal + z0;
  const denImag = zImag;
  const denMagSq = denReal * denReal + denImag * denImag;
  if (denMagSq === 0) return { real: 0, imag: 0 };
  return {
    real: (numReal * denReal + numImag * denImag) / denMagSq,
    imag: (numImag * denReal - numReal * denImag) / denMagSq,
  };
}

/** Generate constant resistance circle path */
function constantRCircle(r: number, cx: number, cy: number, radius: number): string {
  // Constant R circle center: (r/(r+1), 0), radius: 1/(r+1)
  const centerX = r / (r + 1);
  const circleR = 1 / (r + 1);

  // Map to SVG coordinates
  const svgCx = cx + centerX * radius;
  const svgCy = cy;
  const svgR = circleR * radius;

  return `M ${svgCx - svgR} ${svgCy} A ${svgR} ${svgR} 0 1 1 ${svgCx + svgR} ${svgCy} A ${svgR} ${svgR} 0 1 1 ${svgCx - svgR} ${svgCy}`;
}

/** Generate constant reactance arc path */
function constantXArc(
  x: number,
  cx: number,
  cy: number,
  radius: number
): string | null {
  if (x === 0) return null; // X=0 is the real axis

  // Constant X circle center: (1, 1/x), radius: 1/|x|
  const centerSvgX = cx + radius; // center at (1, ...)
  const centerSvgY = cy - (1 / x) * radius; // -Y because SVG Y is flipped
  const arcR = (1 / Math.abs(x)) * radius;

  // The arc must be clipped to the unit circle (|Gamma| <= 1)
  // We compute intersection points with the unit circle
  // Unit circle center: (0,0) in Gamma space = (cx, cy) in SVG
  // Intersection of two circles...
  // For simplicity, generate the arc and use SVG clipPath

  return `M ${centerSvgX - arcR} ${centerSvgY} A ${arcR} ${arcR} 0 1 ${x > 0 ? 0 : 1} ${centerSvgX + arcR} ${centerSvgY}`;
}

/** Constant SWR circle (centered at origin in Gamma plane) */
function swrCirclePath(swr: number, cx: number, cy: number, radius: number): string {
  const gamma = (swr - 1) / (swr + 1);
  const svgR = gamma * radius;
  return `M ${cx - svgR} ${cy} A ${svgR} ${svgR} 0 1 1 ${cx + svgR} ${cy} A ${svgR} ${svgR} 0 1 1 ${cx - svgR} ${cy}`;
}

/** Tooltip component that handles coordinate mapping for both fixed and responsive modes */
function SmithTooltip({
  data,
  svgRef,
  size,
  responsive,
}: {
  data: { svgX: number; svgY: number; freq: number; zReal: number; zImag: number; swr: number; gamma: { real: number; imag: number } };
  svgRef: React.RefObject<SVGSVGElement | null>;
  size: number;
  responsive: boolean;
  z0: number;
}) {
  // Compute actual pixel position in the container
  const pos = useMemo(() => {
    if (!responsive) {
      return {
        left: Math.min(data.svgX + 10, size - 140),
        top: Math.max(data.svgY - 70, 0),
      };
    }
    // For responsive mode, map SVG coordinates to actual rendered coordinates
    const svg = svgRef.current;
    if (!svg) {
      return { left: data.svgX + 10, top: Math.max(data.svgY - 70, 0) };
    }
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / size;
    const scaleY = rect.height / size;
    // preserveAspectRatio="xMidYMid meet" — use the smaller scale
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (rect.width - size * scale) / 2;
    const offsetY = (rect.height - size * scale) / 2;
    return {
      left: Math.min(offsetX + data.svgX * scale + 10, rect.width - 160),
      top: Math.max(offsetY + data.svgY * scale - 70, 0),
    };
  }, [data.svgX, data.svgY, svgRef, size, responsive]);

  return (
    <div
      className="absolute bg-surface border border-border rounded-md px-2 py-1.5 shadow-lg pointer-events-none z-20"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="text-[10px] font-mono space-y-0.5">
        <div className="text-accent font-bold">
          {formatFrequency(data.freq)}
        </div>
        <div className="text-text-primary">
          Z = {formatImpedance(data.zReal, data.zImag)}
        </div>
        <div className="text-text-secondary">
          SWR = {data.swr.toFixed(2)}
        </div>
        <div className="text-text-secondary">
          {"\u0393"} = {data.gamma.real.toFixed(3)} {data.gamma.imag >= 0 ? "+" : ""}{data.gamma.imag.toFixed(3)}j
          {" "}|{"\u0393"}| = {Math.sqrt(data.gamma.real ** 2 + data.gamma.imag ** 2).toFixed(3)}
        </div>
      </div>
    </div>
  );
}

export function SmithChart({
  data,
  z0: z0Prop,
  size = 280,
  selectedIndex,
  onFrequencyClick,
  responsive = false,
  matching = DEFAULT_MATCHING,
}: SmithChartProps) {
  // Use feedline Z0 from matching config if no explicit z0 prop
  const z0 = z0Prop ?? matching.feedlineZ0;
  const theme = useUIStore((s) => s.theme);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId().replace(/:/g, "_") + "_smith_clip";

  const isDark = theme === "dark";
  const margin = 30;
  const chartRadius = (size - margin * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Colors
  const gridColor = isDark ? "#2A2A35" : "#D4D4D8";
  const gridLabelColor = isDark ? "#555568" : "#A1A1AA";
  const trajectoryColor = "#3B82F6";
  const swrExcellentColor = "#10B98140";
  const swrGoodColor = "#22C55E30";
  const swrWarningColor = "#F59E0B20";
  const pointColor = "#3B82F6";
  const selectedPointColor = "#F59E0B";
  const bgColor = isDark ? "#0A0A0F" : "#F8F8FC";
  const textColor = isDark ? "#8888A0" : "#71717A";

  // Convert impedance data to Gamma coordinates (with matching applied)
  const gammaPoints = useMemo(
    () =>
      data.map((d) => {
        const m = applyMatching(d.impedance.real, d.impedance.imag, matching);
        const g = zToGamma(m.real, m.imag, z0);
        return {
          gamma: g,
          svgX: cx + g.real * chartRadius,
          svgY: cy - g.imag * chartRadius, // SVG Y is flipped
          freq: d.frequency_mhz,
          zReal: m.real,
          zImag: m.imag,
          swr: m.swr,
        };
      }),
    [data, z0, cx, cy, chartRadius, matching]
  );

  // Build trajectory polyline
  const trajectoryPath = useMemo(() => {
    if (gammaPoints.length === 0) return "";
    return gammaPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.svgX.toFixed(2)} ${p.svgY.toFixed(2)}`)
      .join(" ");
  }, [gammaPoints]);

  // Constant R circles to draw
  const rValues = [0, 0.2, 0.5, 1, 2, 5];
  // Constant X arcs to draw
  const xValues = [0.2, 0.5, 1, 2, 5, -0.2, -0.5, -1, -2, -5];

  const handlePointClick = useCallback(
    (index: number) => {
      onFrequencyClick?.(index);
    },
    [onFrequencyClick]
  );

  const tooltipData = hoveredIndex !== null ? gammaPoints[hoveredIndex] : null;

  // Determine which frequency markers to show (every Nth point)
  const markerInterval = useMemo(() => {
    if (gammaPoints.length <= 5) return 1;
    if (gammaPoints.length <= 15) return 3;
    if (gammaPoints.length <= 30) return 5;
    return Math.floor(gammaPoints.length / 6);
  }, [gammaPoints.length]);

  return (
    <div className={responsive ? "relative w-full h-full flex flex-col" : "relative flex flex-col"}>
      <div className={responsive ? "flex-1 min-h-0 relative" : "relative"}>
      <svg
        ref={svgRef}
        width={responsive ? "100%" : size}
        height={responsive ? "100%" : size}
        viewBox={`0 0 ${size} ${size}`}
        className={responsive ? "" : "mx-auto"}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={chartRadius} />
          </clipPath>
        </defs>

        {/* Background */}
        <rect width={size} height={size} fill={bgColor} rx={4} />

        {/* SWR circles (filled zones + dashed outlines) */}
        <g clipPath={`url(#${clipId})`}>
          <path d={swrCirclePath(3, cx, cy, chartRadius)} fill={swrWarningColor} />
          <path d={swrCirclePath(2, cx, cy, chartRadius)} fill={swrGoodColor} />
          <path d={swrCirclePath(1.5, cx, cy, chartRadius)} fill={swrExcellentColor} />
          {/* Dashed SWR circle outlines */}
          <path d={swrCirclePath(1.5, cx, cy, chartRadius)} fill="none" stroke={gridColor} strokeWidth={0.5} strokeDasharray="3 3" />
          <path d={swrCirclePath(2, cx, cy, chartRadius)} fill="none" stroke={gridColor} strokeWidth={0.5} strokeDasharray="3 3" />
          <path d={swrCirclePath(3, cx, cy, chartRadius)} fill="none" stroke={gridColor} strokeWidth={0.5} strokeDasharray="3 3" />
        </g>

        {/* Unit circle (boundary) */}
        <circle
          cx={cx}
          cy={cy}
          r={chartRadius}
          fill="none"
          stroke={gridColor}
          strokeWidth={1.5}
        />

        {/* Constant R circles */}
        <g clipPath={`url(#${clipId})`}>
          {rValues.map((r) => (
            <path
              key={`r-${r}`}
              d={constantRCircle(r, cx, cy, chartRadius)}
              fill="none"
              stroke={gridColor}
              strokeWidth={0.5}
            />
          ))}
        </g>

        {/* Constant X arcs */}
        <g clipPath={`url(#${clipId})`}>
          {xValues.map((x) => {
            const path = constantXArc(x, cx, cy, chartRadius);
            if (!path) return null;
            return (
              <path
                key={`x-${x}`}
                d={path}
                fill="none"
                stroke={gridColor}
                strokeWidth={0.5}
              />
            );
          })}
          {/* Real axis (X=0) */}
          <line
            x1={cx - chartRadius}
            y1={cy}
            x2={cx + chartRadius}
            y2={cy}
            stroke={gridColor}
            strokeWidth={0.5}
          />
        </g>

        {/* R value labels */}
        {rValues.filter((r) => r > 0).map((r) => {
          const labelX = cx + (r / (r + 1)) * chartRadius;
          return (
            <text
              key={`rl-${r}`}
              x={labelX}
              y={cy + 10}
              fill={gridLabelColor}
              fontSize={7}
              textAnchor="middle"
            >
              {r}
            </text>
          );
        })}

        {/* SWR circle labels */}
        {[1.5, 2, 3].map((swr) => {
          const gamma = (swr - 1) / (swr + 1);
          return (
            <text
              key={`swr-${swr}`}
              x={cx - gamma * chartRadius - 2}
              y={cy - 4}
              fill={gridLabelColor}
              fontSize={7}
              textAnchor="end"
            >
              SWR {swr}
            </text>
          );
        })}

        {/* Center point (Z0 = 50+j0) */}
        <circle cx={cx} cy={cy} r={3} fill="none" stroke={gridLabelColor} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={1.5} fill={gridLabelColor} />
        <text x={cx + 6} y={cy - 6} fill={gridLabelColor} fontSize={7} fontFamily="JetBrains Mono, monospace">
          {z0}+j0
        </text>

        {/* Impedance trajectory */}
        {trajectoryPath && (
          <path
            d={trajectoryPath}
            fill="none"
            stroke={trajectoryColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Data points */}
        {gammaPoints.map((p, i) => {
          const isSelected = i === selectedIndex;
          const isHovered = i === hoveredIndex;
          const isMarker = i % markerInterval === 0;
          const showPoint = isSelected || isHovered || isMarker;

          if (!showPoint) return null;

          return (
            <g key={i}>
              <circle
                cx={p.svgX}
                cy={p.svgY}
                r={isSelected ? 5 : isHovered ? 4 : 2.5}
                fill={isSelected ? selectedPointColor : pointColor}
                stroke={isSelected || isHovered ? "#FFFFFF" : "none"}
                strokeWidth={isSelected || isHovered ? 1 : 0}
                opacity={isSelected ? 1 : 0.8}
                className="cursor-pointer"
                onClick={() => handlePointClick(i)}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {/* Frequency label for marker points */}
              {isMarker && !isHovered && !isSelected && (
                <text
                  x={p.svgX + 5}
                  y={p.svgY - 5}
                  fill={textColor}
                  fontSize={6}
                >
                  {p.freq.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={cx} y={size - 4} fill={textColor} fontSize={8} textAnchor="middle">
          Normalized to {z0} ohm
        </text>
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <SmithTooltip
          data={tooltipData}
          svgRef={svgRef}
          size={size}
          responsive={responsive}
          z0={z0}
        />
      )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2 flex-shrink-0" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: trajectoryColor }} />
          <span style={{ color: textColor }}>Z locus</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: pointColor }} />
          <span style={{ color: textColor }}>Freq marker</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: selectedPointColor }} />
          <span style={{ color: textColor }}>Selected</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#10B981", opacity: 0.4 }} />
          <span style={{ color: textColor }}>SWR &lt;1.5</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#22C55E", opacity: 0.3 }} />
          <span style={{ color: textColor }}>SWR &lt;2</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#F59E0B", opacity: 0.25 }} />
          <span style={{ color: textColor }}>SWR &lt;3</span>
        </span>
      </div>
    </div>
  );
}
