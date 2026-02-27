/**
 * CurrentDistribution3D — colors wire segments by current magnitude.
 *
 * When simulation results include current data (compute_currents=true),
 * each wire segment is rendered with a color mapped to its current magnitude.
 * Uses a hot colormap: dark blue (zero) -> cyan -> green -> yellow -> red (max).
 *
 * Also supports animated "flow particles" that travel along wires in the
 * direction of current flow, with speed proportional to current magnitude.
 */

import { useMemo, useRef, useEffect } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  Color,
  CatmullRomCurve3,
  Group,
} from "three";
import type { Mesh } from "three";
import { useFrame } from "@react-three/fiber";
import type { SegmentCurrent } from "../../api/nec";

interface CurrentDistribution3DProps {
  /** Current data from simulation (per-segment) */
  currents: SegmentCurrent[];
  /** Whether to show animated flow particles */
  showParticles?: boolean;
  /** Tube radius scale */
  tubeRadius?: number;
}

/** Hot colormap for current magnitude: dark blue -> cyan -> green -> yellow -> red */
const CURRENT_COLORMAP = [
  { t: 0.0, color: new Color("#1E3A5F") },
  { t: 0.2, color: new Color("#2563EB") },
  { t: 0.4, color: new Color("#10B981") },
  { t: 0.6, color: new Color("#22C55E") },
  { t: 0.8, color: new Color("#F59E0B") },
  { t: 1.0, color: new Color("#EF4444") },
];

function sampleCurrentColormap(t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < CURRENT_COLORMAP.length - 1; i++) {
    const a = CURRENT_COLORMAP[i]!;
    const b = CURRENT_COLORMAP[i + 1]!;
    if (clamped >= a.t && clamped <= b.t) {
      const local = (clamped - a.t) / (b.t - a.t);
      return new Color().lerpColors(a.color, b.color, local);
    }
  }
  return CURRENT_COLORMAP[CURRENT_COLORMAP.length - 1]!.color.clone();
}

/** Group currents by wire tag */
function groupCurrentsByTag(currents: SegmentCurrent[]): Map<number, SegmentCurrent[]> {
  const map = new Map<number, SegmentCurrent[]>();
  for (const c of currents) {
    const list = map.get(c.tag) ?? [];
    list.push(c);
    map.set(c.tag, list);
  }
  // Sort each group by segment number
  for (const [, list] of map) {
    list.sort((a, b) => a.segment - b.segment);
  }
  return map;
}

/** Single wire's current distribution visualization */
function WireCurrentTube({
  segments,
  maxMagnitude,
  tubeRadius,
}: {
  segments: SegmentCurrent[];
  maxMagnitude: number;
  tubeRadius: number;
}) {
  const geometry = useMemo(() => {
    if (segments.length < 2) return null;

    // Build a line from segment positions (NEC2 -> Three.js)
    const points: Vector3[] = [];
    const magnitudes: number[] = [];

    for (const seg of segments) {
      // NEC2: X=east, Y=north, Z=up -> Three.js: [x, z, -y]
      points.push(new Vector3(seg.x, seg.z, -seg.y));
      magnitudes.push(seg.current_magnitude);
    }

    if (points.length < 2) return null;

    // Create tube-like geometry using cylinder segments
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const radialSegments = 6;

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const normalized = maxMagnitude > 0 ? magnitudes[i]! / maxMagnitude : 0;
      const color = sampleCurrentColormap(normalized);

      // Variable radius based on current (subtle)
      const r = tubeRadius * (0.5 + 0.5 * normalized);

      // Get tangent direction
      let tangent: Vector3;
      if (i === 0) {
        tangent = new Vector3().subVectors(points[1]!, points[0]!).normalize();
      } else if (i === points.length - 1) {
        tangent = new Vector3().subVectors(points[i]!, points[i - 1]!).normalize();
      } else {
        tangent = new Vector3().subVectors(points[i + 1]!, points[i - 1]!).normalize();
      }

      // Build a frame perpendicular to tangent
      const up = Math.abs(tangent.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
      const right = new Vector3().crossVectors(tangent, up).normalize();
      const actualUp = new Vector3().crossVectors(right, tangent).normalize();

      // Create ring of vertices
      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const x = p.x + (right.x * cos + actualUp.x * sin) * r;
        const y = p.y + (right.y * cos + actualUp.y * sin) * r;
        const z = p.z + (right.z * cos + actualUp.z * sin) * r;

        positions.push(x, y, z);
        colors.push(color.r, color.g, color.b);
      }

      // Create triangles between this ring and previous
      if (i > 0) {
        const vertsPerRing = radialSegments + 1;
        const currRing = i * vertsPerRing;
        const prevRing = (i - 1) * vertsPerRing;

        for (let j = 0; j < radialSegments; j++) {
          const a = prevRing + j;
          const b = prevRing + j + 1;
          const c = currRing + j;
          const d = currRing + j + 1;

          indices.push(a, b, d);
          indices.push(a, d, c);
        }
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [segments, maxMagnitude, tubeRadius]);

  // Tag mesh with current data for hover measurement
  const meshRef = useRef<Mesh>(null);
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = { hoverType: "current", segments };
    }
  }, [segments]);

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        metalness={0.4}
        roughness={0.5}
      />
    </mesh>
  );
}

/** Animated particles flowing along a wire */
function FlowParticles({
  segments,
  maxMagnitude,
}: {
  segments: SegmentCurrent[];
  maxMagnitude: number;
}) {
  const particleRef = useRef<Group>(null);

  const { curve, particleCount, speeds } = useMemo(() => {
    if (segments.length < 2) return { curve: null, particleCount: 0, speeds: [] as number[] };

    const points = segments.map(
      (s) => new Vector3(s.x, s.z, -s.y) // NEC2 -> Three.js
    );

    const c = new CatmullRomCurve3(points, false);

    // More particles for higher current wires
    const avgMag = segments.reduce((sum, s) => sum + s.current_magnitude, 0) / segments.length;
    const normalizedAvg = maxMagnitude > 0 ? avgMag / maxMagnitude : 0;
    const count = Math.max(2, Math.floor(normalizedAvg * 8));

    // Speed per particle (slightly randomized)
    const sp = Array.from({ length: count }, () =>
      (0.15 + normalizedAvg * 0.4) * (0.8 + Math.random() * 0.4)
    );

    return { curve: c, particleCount: count, speeds: sp };
  }, [segments, maxMagnitude]);

  // Reusable vector for per-frame curve sampling — avoids GC pressure
  const _curvePoint = useMemo(() => new Vector3(), []);

  // Animate particle positions along the curve
  useFrame((_, delta) => {
    if (!particleRef.current || !curve || particleCount === 0) return;

    const children = particleRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const mesh = children[i]!;
      // Store t value in userData
      let t = (mesh.userData.t as number) ?? (i / particleCount);
      t += speeds[i]! * delta;
      if (t > 1) t -= 1;
      mesh.userData.t = t;

      curve.getPointAt(t, _curvePoint);
      mesh.position.copy(_curvePoint);
    }
  });

  if (!curve || particleCount === 0) return null;

  return (
    <group ref={particleRef}>
      {Array.from({ length: particleCount }, (_, i) => (
        <mesh key={i} userData={{ t: i / particleCount }}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial
            color="#F59E0B"
            emissive="#F59E0B"
            emissiveIntensity={1.5}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

export function CurrentDistribution3D({
  currents,
  showParticles = true,
  tubeRadius = 0.05,
}: CurrentDistribution3DProps) {
  const { groupedCurrents, maxMagnitude } = useMemo(() => {
    const grouped = groupCurrentsByTag(currents);
    let max = 0;
    for (const c of currents) {
      max = Math.max(max, c.current_magnitude);
    }
    return { groupedCurrents: grouped, maxMagnitude: max };
  }, [currents]);

  if (currents.length === 0 || maxMagnitude === 0) return null;

  return (
    <group>
      {Array.from(groupedCurrents.entries()).map(([tag, segs]) => (
        <group key={tag}>
          <WireCurrentTube
            segments={segs}
            maxMagnitude={maxMagnitude}
            tubeRadius={tubeRadius}
          />
          {showParticles && (
            <FlowParticles segments={segs} maxMagnitude={maxMagnitude} />
          )}
        </group>
      ))}
    </group>
  );
}
