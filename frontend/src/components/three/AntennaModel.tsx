import { useCallback, useEffect, useMemo, useRef } from "react";
import { TubeGeometry, LineCurve3, Vector3, MeshStandardMaterial } from "three";
import type { Mesh } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { WireData } from "./types";
import { getWireColor } from "./types";
import { useUIStore } from "../../stores/uiStore";
import type { VisualScale } from "./visualScale";

interface AntennaModelProps {
  wire: WireData;
  visualScale: VisualScale;
  /** When true, wire becomes semi-transparent so current overlays show through */
  dimmed?: boolean;
  /** Selection order while the wire measurement tool is active. */
  measurementOrder?: 1 | 2;
  onMeasurementSelect?: (tag: number) => void;
}

/**
 * Renders a single antenna wire as a TubeGeometry with PBR metallic material.
 * NEC2 coordinates: X,Y = horizontal, Z = vertical (UP).
 * Three.js: Y = up, so we swap Z->Y.
 *
 * Includes end cap spheres at both endpoints for clean termination.
 */
export function AntennaModel({
  wire,
  visualScale,
  dimmed = false,
  measurementOrder,
  onMeasurementSelect,
}: AntennaModelProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const { geometry, endCapPositions } = useMemo(() => {
    // NEC2: X=east, Y=north, Z=up -> Three.js: X=east, Y=up, Z=south
    const start = new Vector3(wire.x1, wire.z1, -wire.y1);
    const end = new Vector3(wire.x2, wire.z2, -wire.y2);
    const visualRadius = visualScale.wireRadius(wire.radius);
    const curve = new LineCurve3(start, end);
    const tubeGeo = new TubeGeometry(curve, Math.max(2, wire.segments), visualRadius, 8, false);

    return {
      geometry: tubeGeo,
      endCapPositions: [start, end] as [Vector3, Vector3],
    };
  }, [wire, visualScale]);

  const measurementEnabled = onMeasurementSelect !== undefined;
  const measurementHitGeometry = useMemo(
    () =>
      measurementEnabled
        ? new TubeGeometry(
            new LineCurve3(endCapPositions[0], endCapPositions[1]),
            2,
            Math.max(
              visualScale.wireRadius(wire.radius) * 4,
              visualScale.markerRadius * 0.75,
            ),
            6,
            false,
          )
        : null,
    [measurementEnabled, endCapPositions, visualScale, wire.radius],
  );

  const material = useMemo(() => {
    const color =
      measurementOrder === 1
        ? "#F59E0B"
        : measurementOrder === 2
          ? "#3B82F6"
          : getWireColor(wire.tag);
    const mat = new MeshStandardMaterial({
      color,
      metalness: isDark ? 0.85 : 0.4,
      roughness: isDark ? 0.25 : 0.45,
      emissive: measurementOrder ? color : "#000000",
      emissiveIntensity: measurementOrder ? 0.65 : 0,
      transparent: dimmed,
      opacity: dimmed ? 0.15 : 1,
      depthWrite: !dimmed,
    });
    return mat;
  }, [wire.tag, dimmed, isDark, measurementOrder]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => measurementHitGeometry?.dispose(),
    [measurementHitGeometry],
  );
  useEffect(() => () => material.dispose(), [material]);

  const capRadius = visualScale.capRadius(wire.radius);

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

  const handleMeasurementClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!onMeasurementSelect) return;
      event.stopPropagation();
      onMeasurementSelect(wire.tag);
    },
    [onMeasurementSelect, wire.tag],
  );

  const displayColor =
    measurementOrder === 1
      ? "#F59E0B"
      : measurementOrder === 2
        ? "#3B82F6"
        : getWireColor(wire.tag);

  return (
    <group onClick={onMeasurementSelect ? handleMeasurementClick : undefined}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {measurementHitGeometry && (
        <mesh geometry={measurementHitGeometry}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {/* End caps - small spheres */}
      {endCapPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[capRadius, 8, 8]} />
          <meshStandardMaterial
            color={displayColor}
            emissive={measurementOrder ? displayColor : "#000000"}
            emissiveIntensity={measurementOrder ? 0.65 : 0}
            metalness={isDark ? 0.85 : 0.4}
            roughness={isDark ? 0.25 : 0.45}
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
  visualScale: VisualScale;
  /** When true, junctions become semi-transparent so current overlays show through */
  dimmed?: boolean;
}

export function JunctionSpheres({ wires, visualScale, dimmed = false }: JunctionSpheresProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const junctions = useMemo(() => {
    if (wires.length < 2) return [];

    // Collect all endpoints in Three.js coords
    const eps: { pos: Vector3; radius: number }[] = [];
    for (const w of wires) {
      const r = visualScale.junctionRadius(w.radius);
      eps.push({ pos: new Vector3(w.x1, w.z1, -w.y1), radius: r });
      eps.push({ pos: new Vector3(w.x2, w.z2, -w.y2), radius: r });
    }

    // Find endpoints that are within tolerance of each other (from different wires)
    const tolerance = visualScale.junctionTolerance;
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
        found.push({ pos: eps[i]!.pos, radius: eps[i]!.radius });
        used.add(i);
      }
    }

    return found;
  }, [wires, visualScale]);

  if (junctions.length === 0) return null;

  return (
    <group>
      {junctions.map((j, i) => (
        <mesh key={i} position={j.pos}>
          <sphereGeometry args={[j.radius, 12, 12]} />
          <meshStandardMaterial
            color={isDark ? "#E0E0E8" : "#606078"}
            metalness={isDark ? 0.9 : 0.4}
            roughness={isDark ? 0.2 : 0.45}
            transparent={dimmed}
            opacity={dimmed ? 0.15 : 1}
            depthWrite={!dimmed}
          />
        </mesh>
      ))}
    </group>
  );
}
