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
  /** Size in pixels (used for internal viewBox calculation) */
  size?: number;
  /** When true, SVG fills its container instead of using fixed pixel dimensions */
  responsive?: boolean;
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
      // polarToXY already places 0° at the top, so no shift needed
      points.push({ angle: theta, gain });
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

export function PatternPolar({ pattern, mode, size = 200, responsive = false }: PatternPolarProps) {
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

  // Extra padding around the plot so outer labels don't clip the viewBox
  const pad = size * 0.12;
  const vbSize = size + pad * 2;
  const cx = vbSize / 2;
  const cy = vbSize / 2;
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

  // Find -3dB beamwidth arcs for all lobes above threshold.
  // Splits above-threshold angles into contiguous lobe groups so multi-lobe
  // patterns (e.g. a dipole's figure-8) get an arc on each lobe instead of
  // one giant arc spanning across nulls. The beamwidth reported in the info
  // line is for the main lobe (the one containing the peak gain).
  const beamwidthArcs = useMemo(() => {
    const threshold = maxGain - 3;
    if (maxGain <= -999 || threshold <= minGain) return null;

    // Collect angles above threshold, sorted
    const aboveAngles = cut
      .filter((p) => p.gain >= threshold && p.gain > -999)
      .map((p) => p.angle)
      .sort((a, b) => a - b);
    if (aboveAngles.length < 2) return null;

    // Determine the angular step between data points
    const stepSize = cut.length >= 2
      ? Math.abs(cut[1]!.angle - cut[0]!.angle) || 1
      : 1;
    // A gap larger than 1.5x the step size indicates separate lobes
    const gapThreshold = stepSize * 1.5;

    // Split into contiguous lobe groups
    const lobes: number[][] = [[aboveAngles[0]!]];
    for (let i = 1; i < aboveAngles.length; i++) {
      const gap = aboveAngles[i]! - aboveAngles[i - 1]!;
      if (gap > gapThreshold) {
        lobes.push([aboveAngles[i]!]);
      } else {
        lobes[lobes.length - 1]!.push(aboveAngles[i]!);
      }
    }

    // Handle wrap-around: if the first and last lobes are connected across 360°
    if (lobes.length > 1) {
      const firstLobe = lobes[0]!;
      const lastLobe = lobes[lobes.length - 1]!;
      const wrapGap = (360 - lastLobe[lastLobe.length - 1]!) + firstLobe[0]!;
      if (wrapGap <= gapThreshold) {
        lobes[0] = [...lastLobe, ...firstLobe];
        lobes.pop();
      }
    }

    const r3db = gainToRadius(threshold, minGain, maxGain);

    // Build an arc path for each lobe
    const arcs: { path: string; beamwidth: number }[] = [];
    let mainLobeBeamwidth = 0;
    const peakAngle = maxGainPoint.angle;

    for (const lobe of lobes) {
      if (lobe.length < 2) continue;
      const start = Math.min(...lobe);
      const end = Math.max(...lobe);
      const bw = end - start;
      if (bw <= 0 || bw >= 360) continue;

      const pts: string[] = [];
      for (let a = start; a <= end; a += 1) {
        const pos = polarToXY(a, r3db, cx, cy, plotRadius);
        pts.push(`${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
      }
      if (pts.length < 2) continue;

      arcs.push({ path: `M ${pts.join(" L ")}`, beamwidth: bw });

      // Track beamwidth of the lobe containing the peak
      if (lobe.some((a) => Math.abs(a - peakAngle) < gapThreshold)) {
        mainLobeBeamwidth = bw;
      }
    }

    if (arcs.length === 0) return null;
    return { arcs, mainLobeBeamwidth };
  }, [cut, maxGain, maxGainPoint.angle, minGain, cx, cy, plotRadius]);

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
      { angle: 0, label: "Zen" },
      { angle: 90, label: "Hor" },
      { angle: 180, label: "Nad" },
      { angle: 270, label: "Hor" },
    ];
  }, [mode]);

  // Legend colors
  const patternColor = "#3B82F6";
  const beamwidthColor = "#F59E0B";
  const maxGainColor = "#EF4444";

  return (
    <div className={responsive ? "w-full h-full flex flex-col" : "flex flex-col"}>
    <div className={responsive ? "flex-1 min-h-0" : ""}>
    <svg
      width={responsive ? "100%" : size}
      height={responsive ? "100%" : size}
      viewBox={`0 0 ${vbSize} ${vbSize}`}
      className={responsive ? "" : "mx-auto"}
      preserveAspectRatio="xMidYMid meet"
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
        const { x, y } = polarToXY(angle, 1.25, cx, cy, plotRadius);
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
          const { x, y } = polarToXY(angle, 1.25, cx, cy, plotRadius);
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

      {/* Pattern fill */}
      <path
        d={pathData}
        fill="#3B82F6"
        fillOpacity={0.15}
        stroke="#3B82F6"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* -3dB beamwidth arc highlights — one per lobe */}
      {beamwidthArcs?.arcs.map((arc, i) => (
        <path
          key={`bw-${i}`}
          d={arc.path}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}

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

      {/* Gain labels on grid circles — rendered after pattern so they stay on top */}
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
            opacity={0.9}
            style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3, strokeLinejoin: "round" }}
          >
            {gainVal.toFixed(1)} dBi
          </text>
        );
      })}

    </svg>
    </div>
    {/* Info line: mode + max gain + beamwidth — outside SVG to avoid overlap */}
    <div
      className="text-center shrink-0 pt-1"
      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px", color: ct.tick }}
    >
      {mode === "azimuth" ? "Azimuth (H)" : "Elevation (E)"}
      {" | Max: "}
      {maxGain.toFixed(1)} dBi
      {beamwidthArcs ? ` | BW: ${beamwidthArcs.mainLobeBeamwidth.toFixed(0)}\u00B0` : ""}
    </div>
    {/* Legend */}
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1.5 shrink-0" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "9px" }}>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: patternColor, opacity: 0.4 }} />
        <span style={{ color: ct.tick }}>Gain pattern</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: beamwidthColor, opacity: 0.7 }} />
        <span style={{ color: ct.tick }}>-3dB beamwidth</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: maxGainColor }} />
        <span style={{ color: ct.tick }}>Max gain</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-0 border-t" style={{ borderColor: ct.grid, opacity: 0.6 }} />
        <span style={{ color: ct.tick }}>dBi grid</span>
      </span>
    </div>
    </div>
  );
}
