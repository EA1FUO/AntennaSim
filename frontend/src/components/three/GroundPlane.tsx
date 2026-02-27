import { useMemo } from "react";
import { Grid } from "@react-three/drei";
import type { WireData } from "./types";

/**
 * Ground plane visualization with auto-sizing grid at Y=0.
 * Grid extends at least 2x the antenna's horizontal footprint.
 * Grid cell size adapts to antenna scale.
 */

interface GroundPlaneProps {
  /** Wire data for computing grid extents */
  wires?: WireData[];
}

export function GroundPlane({ wires = [] }: GroundPlaneProps) {
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

    // Grid extends at least 2x the footprint, minimum 20m
    const extent = Math.max(maxExtent * 4, 20);
    const size = Math.ceil(extent / 10) * 10; // Round up to nearest 10

    // Adapt cell/section size to scale
    let cell: number;
    let section: number;
    if (size <= 20) {
      cell = 0.5;
      section = 2;
    } else if (size <= 50) {
      cell = 1;
      section = 5;
    } else if (size <= 200) {
      cell = 2;
      section = 10;
    } else {
      cell = 5;
      section = 25;
    }

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
        cellColor="#1A1A24"
        sectionSize={sectionSize}
        sectionThickness={1}
        sectionColor="#2A2A35"
        fadeDistance={fadeDistance}
        fadeStrength={1.5}
        infiniteGrid
      />
      {/* Semi-transparent ground surface — offset below grid to prevent z-fighting */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[gridSize * 2, gridSize * 2]} />
        <meshStandardMaterial
          color="#1a2a1a"
          transparent
          opacity={0.15}
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
