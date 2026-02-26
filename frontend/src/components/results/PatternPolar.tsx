/**
 * 2D Polar radiation pattern plot.
 * Draws azimuth or elevation cut as a polar diagram using SVG.
 * Shows gain in dBi on radial axis with -3dB beamwidth arc.
 */

import { useMemo } from "react";
import type { PatternData } from "../../api/nec";

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
    // Find theta index closest to 90 degrees (horizon) or max gain theta
    // For azimuth cut, we want a horizontal plane cut
    // theta=90 in NEC2 is the horizon
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

    // Extract the phi cut at that theta
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
      // Convert theta to elevation angle for polar plot
      // NEC2 theta: 0=zenith, 90=horizon, 180=nadir
      // We want to display as 0=up (zenith), 90=horizon, etc.
      points.push({ angle: theta + 90, gain }); // shift so 0=zenith in polar
    }
    return points;
  }
}

/** Convert gain in dBi to a normalized radius (0-1) for the polar plot */
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
  const plotRadius = (size / 2) * 0.85;

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
    d += " Z"; // close the path
    return d;
  }, [cut, minGain, maxGain, cx, cy, plotRadius]);

  // Grid circles at 25%, 50%, 75%, 100%
  const gridCircles = [0.25, 0.5, 0.75, 1.0];

  // Cardinal lines every 30 degrees
  const cardinalLines = Array.from({ length: 12 }, (_, i) => i * 30);

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
          stroke="#2A2A35"
          strokeWidth={0.5}
          strokeOpacity={0.6}
        />
      ))}

      {/* Radial lines */}
      {cardinalLines.map((angle) => {
        const { x, y } = polarToXY(angle, 1, cx, cy, plotRadius);
        return (
          <line
            key={angle}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="#2A2A35"
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
        );
      })}

      {/* Angle labels at cardinal directions */}
      {[0, 90, 180, 270].map((angle) => {
        const { x, y } = polarToXY(angle, 1.1, cx, cy, plotRadius);
        const label =
          mode === "azimuth"
            ? ["N", "E", "S", "W"][angle / 90]
            : ["0\u00B0", "90\u00B0", "180\u00B0", "270\u00B0"][angle / 90];
        return (
          <text
            key={angle}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#8888A0"
            fontSize={9}
            fontFamily="JetBrains Mono, monospace"
          >
            {label}
          </text>
        );
      })}

      {/* Gain labels on grid circles */}
      {gridCircles.map((r) => {
        const gainVal = minGain + (maxGain - minGain) * r;
        return (
          <text
            key={r}
            x={cx + 2}
            y={cy - plotRadius * r - 2}
            fill="#8888A0"
            fontSize={7}
            fontFamily="JetBrains Mono, monospace"
          >
            {gainVal.toFixed(0)}
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

      {/* Max gain label */}
      <text
        x={cx}
        y={size - 4}
        textAnchor="middle"
        fill="#8888A0"
        fontSize={8}
        fontFamily="JetBrains Mono, monospace"
      >
        {mode === "azimuth" ? "Azimuth" : "Elevation"} | Max: {maxGain.toFixed(1)} dBi
      </text>
    </svg>
  );
}
