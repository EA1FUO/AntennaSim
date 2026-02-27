/**
 * 2D Polar radiation pattern plot.
 *
 * Features:
 * - Azimuth or elevation cut as a polar diagram using SVG
 * - Concentric gain circles clearly labeled in dBi
 * - N/S/E/W cardinal direction labels
 * - -3dB beamwidth arc visually highlighted
 * - Max gain direction marked with a dot and annotation
 * - Smooth pattern fill with gradient
 */

import { useMemo } from "react";
import type { PatternData } from "../../api/nec";
import { useChartTheme } from "../../hooks/useChartTheme";

interface PatternPolarProps {
  pattern: PatternData;
  /** "azimuth" = horizontal plane (theta=max gain), "elevation" = vertical plane (phi=max gain) */
  mode: "azimuth" | "elevation";
  /** Size in pixels */
  size?: number;
}

/** Extract a cut from the 2D gain array */
function extractCut(
  pattern: PatternData,
  mode: "azimuth" | "elevation"
): { angle: number; gain: number }[] {
  const { gain_dbi, theta_start, theta_step, theta_count, phi_start, phi_step, phi_count } = pattern;

  if (mode === "azimuth") {
    // Find theta index with max gain for azimuth cut
    let bestTheta = 0;
    let bestGain = -Infinity;
    for (let ti = 0; ti < theta_count; ti++) {
      for (let pi = 0; pi < phi_count; pi++) {
        const g = gain_dbi[ti]?.[pi] ?? -999;
        if (g > bestGain) {
          bestGain = g;
          bestTheta = ti;
        }
      }
    }

    const points: { angle: number; gain: number }[] = [];
    for (let pi = 0; pi < phi_count; pi++) {
      const phi = phi_start + pi * phi_step;
      const gain = gain_dbi[bestTheta]?.[pi] ?? -999;
      points.push({ angle: phi, gain });
    }
    return points;
  } else {
    // Elevation cut — find the phi of max gain and extract theta cut
    let bestPhi = 0;
    let bestGain = -Infinity;
    for (let ti = 0; ti < theta_count; ti++) {
      for (let pi = 0; pi < phi_count; pi++) {
        const g = gain_dbi[ti]?.[pi] ?? -999;
        if (g > bestGain) {
          bestGain = g;
          bestPhi = pi;
        }
      }
    }

    const points: { angle: number; gain: number }[] = [];
    for (let ti = 0; ti < theta_count; ti++) {
      const theta = theta_start + ti * theta_step;
      const gain = gain_dbi[ti]?.[bestPhi] ?? -999;
      // NEC2 theta: 0=zenith, 90=horizon, 180=nadir
      // Shift so 0=up (zenith) in polar
      points.push({ angle: theta + 90, gain });
    }
    return points;
  }
}

/** Convert gain in dBi to a normalized radius (0-1) */
function gainToRadius(gain: number, minGain: number, maxGain: number): number {
  if (gain <= -999) return 0;
  const range = maxGain - minGain;
  if (range <= 0) return 0.5;
  return Math.max(0, (gain - minGain) / range);
}

/** Convert polar coordinates to SVG cartesian */
function polarToXY(
  angleDeg: number,
  radius: number,
  cx: number,
  cy: number,
  plotRadius: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg is up
  return {
    x: cx + plotRadius * radius * Math.cos(rad),
    y: cy + plotRadius * radius * Math.sin(rad),
  };
}

export function PatternPolar({ pattern, mode, size = 200 }: PatternPolarProps) {
  const ct = useChartTheme();
  const cut = useMemo(() => extractCut(pattern, mode), [pattern, mode]);

  const { minGain, maxGain } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of cut) {
      if (p.gain > -999) {
        min = Math.min(min, p.gain);
        max = Math.max(max, p.gain);
      }
    }
    // Ensure at least 10dB range
    if (max - min < 10) {
      min = max - 10;
    }
    return { minGain: min, maxGain: max };
  }, [cut]);

  const cx = size / 2;
  const cy = size / 2;
  const plotRadius = (size / 2) * 0.82;

  // Build SVG path for the pattern
  const pathData = useMemo(() => {
    const points = cut.map((p) => {
      const r = gainToRadius(p.gain, minGain, maxGain);
      return polarToXY(p.angle, r, cx, cy, plotRadius);
    });
    if (points.length === 0) return "";
    const first = points[0]!;
    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i]!.x.toFixed(1)} ${points[i]!.y.toFixed(1)}`;
    }
    d += " Z";
    return d;
  }, [cut, minGain, maxGain, cx, cy, plotRadius]);

  // Find max gain point for marker
  const maxGainPoint = useMemo(() => {
    let best = { angle: 0, gain: -Infinity, x: cx, y: cy };
    for (const p of cut) {
      if (p.gain > best.gain && p.gain > -999) {
        const r = gainToRadius(p.gain, minGain, maxGain);
        const pos = polarToXY(p.angle, r, cx, cy, plotRadius);
        best = { angle: p.angle, gain: p.gain, x: pos.x, y: pos.y };
      }
    }
    return best;
  }, [cut, minGain, maxGain, cx, cy, plotRadius]);

  // Find -3dB beamwidth
  const beamwidthArc = useMemo(() => {
    const threshold = maxGain - 3;
    if (maxGain <= -999 || threshold <= minGain) return null;

    // Find continuous arc above threshold
    const aboveThreshold = cut.filter((p) => p.gain >= threshold && p.gain > -999);
    if (aboveThreshold.length < 2) return null;

    // Simple approach: find the angular range
    const angles = aboveThreshold.map((p) => p.angle);
    const startAngle = Math.min(...angles);
    const endAngle = Math.max(...angles);
    const beamwidth = endAngle - startAngle;

    if (beamwidth <= 0 || beamwidth >= 360) return null;

    // Build arc path at the -3dB radius
    const r3db = gainToRadius(threshold, minGain, maxGain);
    const arcPoints: string[] = [];
    for (let a = startAngle; a <= endAngle; a += 1) {
      const pos = polarToXY(a, r3db, cx, cy, plotRadius);
      arcPoints.push(`${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
    }
    if (arcPoints.length < 2) return null;

    return {
      path: `M ${arcPoints.join(" L ")}`,
      beamwidth,
      startAngle,
      endAngle,
    };
  }, [cut, maxGain, minGain, cx, cy, plotRadius]);

  // Grid circles — 4 even divisions
  const gridCircles = [0.25, 0.5, 0.75, 1.0];

  // Radial lines every 30 degrees
  const radialLines = Array.from({ length: 12 }, (_, i) => i * 30);

  // Cardinal labels
  const cardinalLabels = useMemo(() => {
    if (mode === "azimuth") {
      return [
        { angle: 0, label: "N" },
        { angle: 90, label: "E" },
        { angle: 180, label: "S" },
        { angle: 270, label: "W" },
      ];
    }
    return [
      { angle: 0, label: "Z" },
      { angle: 90, label: "H" },
      { angle: 180, label: "-Z" },
      { angle: 270, label: "H" },
    ];
  }, [mode]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
    >
      {/* Grid circles */}
      {gridCircles.map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={plotRadius * r}
          fill="none"
          stroke={ct.grid}
          strokeWidth={0.5}
          strokeOpacity={0.6}
        />
      ))}

      {/* Radial lines */}
      {radialLines.map((angle) => {
        const { x, y } = polarToXY(angle, 1, cx, cy, plotRadius);
        return (
          <line
            key={angle}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={ct.grid}
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
        );
      })}

      {/* Cardinal direction labels */}
      {cardinalLabels.map(({ angle, label }) => {
        const { x, y } = polarToXY(angle, 1.12, cx, cy, plotRadius);
        return (
          <text
            key={`card-${angle}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={ct.tick}
            fontSize={10}
            fontWeight="bold"
            fontFamily="JetBrains Mono, monospace"
          >
            {label}
          </text>
        );
      })}

      {/* Intermediate angle labels (every 30 deg, skip cardinals) */}
      {radialLines
        .filter((a) => a % 90 !== 0)
        .map((angle) => {
          const { x, y } = polarToXY(angle, 1.12, cx, cy, plotRadius);
          return (
            <text
              key={`ang-${angle}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={ct.tick}
              fontSize={7}
              fontFamily="JetBrains Mono, monospace"
              opacity={0.6}
            >
              {angle}{"\u00B0"}
            </text>
          );
        })}

      {/* Gain labels on grid circles */}
      {gridCircles.map((r) => {
        const gainVal = minGain + (maxGain - minGain) * r;
        return (
          <text
            key={`gain-${r}`}
            x={cx + 3}
            y={cy - plotRadius * r - 2}
            fill={ct.tick}
            fontSize={7}
            fontFamily="JetBrains Mono, monospace"
            opacity={0.8}
          >
            {gainVal.toFixed(1)} dBi
          </text>
        );
      })}

      {/* Pattern fill */}
      <path
        d={pathData}
        fill="#3B82F6"
        fillOpacity={0.15}
        stroke="#3B82F6"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* -3dB beamwidth arc highlight */}
      {beamwidthArc && (
        <path
          d={beamwidthArc.path}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* Max gain point marker */}
      {maxGainPoint.gain > -999 && (
        <g>
          <circle
            cx={maxGainPoint.x}
            cy={maxGainPoint.y}
            r={3.5}
            fill="#EF4444"
            stroke="#FFFFFF"
            strokeWidth={1}
          />
          {/* Max gain annotation */}
          <text
            x={maxGainPoint.x + (maxGainPoint.x > cx ? 6 : -6)}
            y={maxGainPoint.y - 6}
            textAnchor={maxGainPoint.x > cx ? "start" : "end"}
            fill="#EF4444"
            fontSize={8}
            fontWeight="bold"
            fontFamily="JetBrains Mono, monospace"
          >
            {maxGainPoint.gain.toFixed(1)} dBi
          </text>
        </g>
      )}

      {/* Bottom label: mode + max gain + beamwidth */}
      <text
        x={cx}
        y={size - 4}
        textAnchor="middle"
        fill={ct.tick}
        fontSize={8}
        fontFamily="JetBrains Mono, monospace"
      >
        {mode === "azimuth" ? "Azimuth (H)" : "Elevation (E)"}
        {" | Max: "}
        {maxGain.toFixed(1)} dBi
        {beamwidthArc ? ` | BW: ${beamwidthArc.beamwidth.toFixed(0)}\u00B0` : ""}
      </text>
    </svg>
  );
}
