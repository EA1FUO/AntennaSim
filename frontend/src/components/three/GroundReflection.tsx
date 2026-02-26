/**
 * GroundReflection — ghost mirror image of the antenna below ground (z=0).
 *
 * Renders a faded, slightly transparent copy of all antenna wires
 * reflected below the ground plane. Helps users understand image theory
 * and why antenna height matters for radiation patterns.
 *
 * The reflection mirrors NEC2 Z coordinates: z -> -z, which in Three.js
 * means Y -> -Y since Three.js Y = NEC2 Z.
 */

import { useMemo } from "react";
import { TubeGeometry, LineCurve3, Vector3, MeshStandardMaterial } from "three";
import type { WireData } from "./types";

interface GroundReflectionProps {
  wires: WireData[];
  /** Opacity of the ghost reflection (default 0.15) */
  opacity?: number;
}

/** Single reflected wire */
function ReflectedWire({ wire, opacity }: { wire: WireData; opacity: number }) {
  const { geometry, material, startPos, endPos } = useMemo(() => {
    // NEC2: X=east, Y=north, Z=up -> Three.js: [x, z, -y]
    // Reflection mirrors Z in NEC2 (which is Y in Three.js): negate Y
    const start = new Vector3(wire.x1, -wire.z1, -wire.y1);
    const end = new Vector3(wire.x2, -wire.z2, -wire.y2);

    const visualRadius = Math.max(wire.radius * 50, 0.03);
    const curve = new LineCurve3(start, end);
    const tubeGeo = new TubeGeometry(curve, Math.max(2, wire.segments), visualRadius, 6, false);

    const mat = new MeshStandardMaterial({
      color: "#6688AA",
      metalness: 0.3,
      roughness: 0.6,
      transparent: true,
      opacity,
      depthWrite: false,
    });

    return { geometry: tubeGeo, material: mat, startPos: start, endPos: end };
  }, [wire, opacity]);

  const capRadius = Math.max(wire.radius * 60, 0.04);

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      {/* End caps */}
      <mesh position={startPos}>
        <sphereGeometry args={[capRadius, 6, 6]} />
        <meshStandardMaterial
          color="#6688AA"
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
      <mesh position={endPos}>
        <sphereGeometry args={[capRadius, 6, 6]} />
        <meshStandardMaterial
          color="#6688AA"
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function GroundReflection({ wires, opacity = 0.15 }: GroundReflectionProps) {
  if (wires.length === 0) return null;

  return (
    <group>
      {wires.map((wire) => (
        <ReflectedWire key={`ref-${wire.tag}`} wire={wire} opacity={opacity} />
      ))}
    </group>
  );
}
