import { useMemo } from "react";
import { Grid } from "@react-three/drei";
import type { WireData } from "./types";
import { useUIStore } from "../../stores/uiStore";
import { getAntennaSpan } from "./visualScale";

/**
 * Ground plane visualization with auto-sizing grid at Y=0.
 * Grid extends at least 2x the antenna's horizontal footprint.
 * Grid cell size adapts to antenna scale.
 */

interface GroundPlaneProps {
  /** Wire data for computing grid extents */
  wires?: WireData[];
}

function roundUpNice(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const scale = 10 ** exponent;
  const fraction = value / scale;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * scale;
}

export function GroundPlane({ wires = [] }: GroundPlaneProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const { gridSize, cellSize, sectionSize, fadeDistance } = useMemo(() => {
    if (wires.length === 0) {
      return { gridSize: 100, cellSize: 1, sectionSize: 5, fadeDistance: 80 };
    }

    // Compute horizontal footprint in Three.js coords
    let maxExtent = 0;
    for (const w of wires) {
      // NEC2 → Three.js: X stays, Y→Z (negated)
      maxExtent = Math.max(
        maxExtent,
        Math.abs(w.x1),
        Math.abs(w.x2),
        Math.abs(w.y1),
        Math.abs(w.y2)
      );
    }

    const antennaSpan = getAntennaSpan(wires);
    const size = roundUpNice(Math.max(maxExtent * 4, antennaSpan * 4));
    const cell = roundUpNice(size / 40);
    const section = cell * 5;

    return {
      gridSize: size,
      cellSize: cell,
      sectionSize: section,
      fadeDistance: size * 0.8,
    };
  }, [wires]);

  return (
    <group>
      {/* Main grid */}
      <Grid
        position={[0, 0, 0]}
        args={[gridSize, gridSize]}
        cellSize={cellSize}
        cellThickness={0.5}
        cellColor={isDark ? "#1A1A24" : "#C0C0C8"}
        sectionSize={sectionSize}
        sectionThickness={1}
        sectionColor={isDark ? "#2A2A35" : "#9090A0"}
        fadeDistance={fadeDistance}
        fadeStrength={1.5}
        infiniteGrid
      />
      {/* Semi-transparent ground surface — offset below grid to prevent z-fighting */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -gridSize * 0.0025, 0]}>
        <planeGeometry args={[gridSize * 2, gridSize * 2]} />
        <meshStandardMaterial
          color={isDark ? "#1a2a1a" : "#90a890"}
          transparent
          opacity={isDark ? 0.15 : 0.1}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
