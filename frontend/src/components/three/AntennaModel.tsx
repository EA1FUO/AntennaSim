import { useMemo, useRef, useEffect } from "react";
import { TubeGeometry, LineCurve3, Vector3, MeshStandardMaterial } from "three";
import type { Mesh } from "three";
import type { WireData } from "./types";
import { getWireColor } from "./types";

interface AntennaModelProps {
  wire: WireData;
  /** When true, wire becomes semi-transparent so current overlays show through */
  dimmed?: boolean;
}

/**
 * Renders a single antenna wire as a TubeGeometry with PBR metallic material.
 * NEC2 coordinates: X,Y = horizontal, Z = vertical (UP).
 * Three.js: Y = up, so we swap Z->Y.
 *
 * Includes end cap spheres at both endpoints for clean termination.
 */
export function AntennaModel({ wire, dimmed = false }: AntennaModelProps) {
  const { geometry, material, endCapPositions } = useMemo(() => {
    // NEC2: X=east, Y=north, Z=up -> Three.js: X=east, Y=up, Z=south
    const start = new Vector3(wire.x1, wire.z1, -wire.y1);
    const end = new Vector3(wire.x2, wire.z2, -wire.y2);

    // Visual radius: enough to see, but proportional
    const visualRadius = Math.max(wire.radius * 50, 0.03);

    const curve = new LineCurve3(start, end);
    const tubeGeo = new TubeGeometry(curve, Math.max(2, wire.segments), visualRadius, 8, false);

    const color = getWireColor(wire.tag);
    const mat = new MeshStandardMaterial({
      color,
      metalness: 0.85,
      roughness: 0.25,
      transparent: dimmed,
      opacity: dimmed ? 0.15 : 1,
      depthWrite: !dimmed,
    });

    const caps: [Vector3, Vector3] = [start, end];
    return { geometry: tubeGeo, material: mat, endCapPositions: caps };
  }, [wire, dimmed]);

  const capRadius = Math.max(wire.radius * 60, 0.04);

  // Tag mesh with wire data for hover measurement
  const meshRef = useRef<Mesh>(null);
  useEffect(() => {
    if (meshRef.current) {
      const dx = wire.x2 - wire.x1;
      const dy = wire.y2 - wire.y1;
      const dz = wire.z2 - wire.z1;
      meshRef.current.userData = {
        hoverType: "wire",
        tag: wire.tag,
        lengthM: Math.sqrt(dx * dx + dy * dy + dz * dz),
        zMin: Math.min(wire.z1, wire.z2),
        zMax: Math.max(wire.z1, wire.z2),
        radiusMm: wire.radius * 1000,
      };
    }
  }, [wire]);

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {/* End caps - small spheres */}
      {endCapPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[capRadius, 8, 8]} />
          <meshStandardMaterial
            color={getWireColor(wire.tag)}
            metalness={0.85}
            roughness={0.25}
            transparent={dimmed}
            opacity={dimmed ? 0.15 : 1}
            depthWrite={!dimmed}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Renders junction spheres where multiple wires connect.
 * Slightly larger than end caps for visual distinction.
 */
interface JunctionSpheresProps {
  wires: WireData[];
  /** When true, junctions become semi-transparent so current overlays show through */
  dimmed?: boolean;
}

export function JunctionSpheres({ wires, dimmed = false }: JunctionSpheresProps) {
  const junctions = useMemo(() => {
    if (wires.length < 2) return [];

    // Collect all endpoints in Three.js coords
    const eps: { pos: Vector3; radius: number }[] = [];
    for (const w of wires) {
      const r = Math.max(w.radius * 60, 0.04);
      eps.push({ pos: new Vector3(w.x1, w.z1, -w.y1), radius: r });
      eps.push({ pos: new Vector3(w.x2, w.z2, -w.y2), radius: r });
    }

    // Find endpoints that are within tolerance of each other (from different wires)
    const tolerance = 0.01;
    const found: { pos: Vector3; radius: number }[] = [];
    const used = new Set<number>();

    for (let i = 0; i < eps.length; i++) {
      if (used.has(i)) continue;
      let isJunction = false;
      for (let j = i + 1; j < eps.length; j++) {
        // Skip endpoints from the same wire (i and j differ by at least 2 indices to cross wires)
        const wireI = Math.floor(i / 2);
        const wireJ = Math.floor(j / 2);
        if (wireI === wireJ) continue;

        if (eps[i]!.pos.distanceTo(eps[j]!.pos) < tolerance) {
          isJunction = true;
          used.add(j);
        }
      }
      if (isJunction) {
        found.push({ pos: eps[i]!.pos, radius: eps[i]!.radius * 1.5 });
        used.add(i);
      }
    }

    return found;
  }, [wires]);

  if (junctions.length === 0) return null;

  return (
    <group>
      {junctions.map((j, i) => (
        <mesh key={i} position={j.pos}>
          <sphereGeometry args={[j.radius, 12, 12]} />
          <meshStandardMaterial
            color="#E0E0E8"
            metalness={0.9}
            roughness={0.2}
            transparent={dimmed}
            opacity={dimmed ? 0.15 : 1}
            depthWrite={!dimmed}
          />
        </mesh>
      ))}
    </group>
  );
}
