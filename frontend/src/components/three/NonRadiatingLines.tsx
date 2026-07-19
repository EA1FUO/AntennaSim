/**
 * Renders non-radiating structures (transmission-line feeders, support stays,
 * etc.) as dashed lines in the 3D viewport. These elements carry no antenna
 * current, so they are drawn distinctly from the solid radiating wires.
 */

import { Line } from "@react-three/drei";
import type { NonRadiatingSegment } from "./transmissionLineViz";

/** NEC2 (Z=up) → Three.js (Y=up): [necX, necZ, -necY]. */
function toThree([x, y, z]: [number, number, number]): [number, number, number] {
  return [x, z, -y];
}

interface NonRadiatingLinesProps {
  segments: NonRadiatingSegment[];
  color?: string;
  dashSize?: number;
  gapSize?: number;
}

export function NonRadiatingLines({
  segments,
  color = "#7dd3fc",
  dashSize = 0.4,
  gapSize = 0.25,
}: NonRadiatingLinesProps) {
  return (
    <>
      {segments.map((seg, i) => (
        <Line
          key={i}
          points={[toThree(seg.start), toThree(seg.end)]}
          color={color}
          lineWidth={1.5}
          dashed
          dashSize={dashSize}
          gapSize={gapSize}
          transparent
          opacity={0.85}
        />
      ))}
    </>
  );
}
