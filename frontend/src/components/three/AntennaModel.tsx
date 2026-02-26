import { useMemo } from "react";
import { TubeGeometry, LineCurve3, Vector3, MeshStandardMaterial } from "three";
import type { WireData } from "./types";
import { getWireColor } from "./types";

interface AntennaModelProps {
  wire: WireData;
}

/**
 * Renders a single antenna wire as a TubeGeometry with PBR metallic material.
 * NEC2 coordinates: X,Y = horizontal, Z = vertical (UP).
 * Three.js: Y = up, so we swap Z→Y.
 */
export function AntennaModel({ wire }: AntennaModelProps) {
  const { geometry, material, endCapPositions } = useMemo(() => {
    // NEC2: X=east, Y=north, Z=up → Three.js: X=east, Y=up, Z=south
    const start = new Vector3(wire.x1, wire.z1, -wire.y1);
    const end = new Vector3(wire.x2, wire.z2, -wire.y2);

    const wireLength = start.distanceTo(end);
    // Visual radius: enough to see, but proportional
    const visualRadius = Math.max(wire.radius * 50, 0.03);

    const curve = new LineCurve3(start, end);
    const tubeGeo = new TubeGeometry(curve, Math.max(2, wire.segments), visualRadius, 8, false);

    const color = getWireColor(wire.tag);
    const mat = new MeshStandardMaterial({
      color,
      metalness: 0.85,
      roughness: 0.25,
    });

    // End cap positions
    const caps: [Vector3, Vector3] = [start, end];

    return { geometry: tubeGeo, material: mat, endCapPositions: caps };
  }, [wire]);

  const capRadius = Math.max(wire.radius * 60, 0.04);

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      {/* End caps - small spheres */}
      {endCapPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[capRadius, 8, 8]} />
          <meshStandardMaterial
            color={getWireColor(wire.tag)}
            metalness={0.85}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}
