/**
 * CurrentFlowParticles — animated luminous particles traveling along wires
 * showing current flow direction and magnitude.
 *
 * Uses InstancedMesh with small emissive spheres. Particles move along
 * wire paths, with speed proportional to current magnitude and color
 * mapped from the current colormap.
 *
 * Performance: max ~500 particles total across all wires.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  AdditiveBlending,
  Vector3,
} from "three";
import type { SegmentCurrent } from "../../api/nec";

interface CurrentFlowParticlesProps {
  currents: SegmentCurrent[];
  /** Maximum total particles */
  maxParticles?: number;
}

/** Per-wire data for particle animation */
interface WireParticleData {
  /** Start position in Three.js coords */
  start: Vector3;
  /** End position in Three.js coords */
  end: Vector3;
  /** Wire length */
  length: number;
  /** Current magnitude (determines speed + brightness) */
  currentMag: number;
  /** Number of particles on this wire */
  count: number;
  /** Base color for particles */
  color: Color;
}

/** Colormap for current magnitude: blue -> cyan -> yellow -> red */
function currentToColor(normalized: number): Color {
  const t = Math.max(0, Math.min(1, normalized));
  if (t < 0.33) {
    return new Color().lerpColors(new Color("#2563EB"), new Color("#06B6D4"), t / 0.33);
  } else if (t < 0.66) {
    return new Color().lerpColors(new Color("#06B6D4"), new Color("#F59E0B"), (t - 0.33) / 0.33);
  }
  return new Color().lerpColors(new Color("#F59E0B"), new Color("#EF4444"), (t - 0.66) / 0.34);
}

export function CurrentFlowParticles({
  currents,
  maxParticles = 500,
}: CurrentFlowParticlesProps) {
  const meshRef = useRef<InstancedMesh>(null);

  // Build per-wire particle data from current segments
  const { wireData, totalParticles } = useMemo(() => {
    if (currents.length === 0) return { wireData: [] as WireParticleData[], totalParticles: 0 };

    // Group consecutive segments by tag to reconstruct wires
    const wireMap = new Map<number, SegmentCurrent[]>();
    for (const seg of currents) {
      const existing = wireMap.get(seg.tag) ?? [];
      existing.push(seg);
      wireMap.set(seg.tag, existing);
    }

    // Find max current for normalization
    let maxCurrent = 0;
    for (const seg of currents) {
      maxCurrent = Math.max(maxCurrent, seg.current_magnitude);
    }
    if (maxCurrent <= 0) maxCurrent = 1;

    // Build wire particle data — use first and last segment as wire endpoints
    const wires: WireParticleData[] = [];
    let totalCount = 0;

    for (const [_tag, segs] of wireMap) {
      if (segs.length < 1) continue;

      // Sort by segment index
      segs.sort((a, b) => a.segment - b.segment);

      const first = segs[0]!;
      const last = segs[segs.length - 1]!;

      // NEC2 -> Three.js: [x, z, -y]
      const start = new Vector3(first.x, first.z, -first.y);
      const end = new Vector3(last.x, last.z, -last.y);
      const wireLength = start.distanceTo(end);

      if (wireLength < 0.01) continue;

      // Average current magnitude on this wire
      const avgCurrent = segs.reduce((sum, s) => sum + s.current_magnitude, 0) / segs.length;
      const normalized = avgCurrent / maxCurrent;

      // Particle count proportional to wire length, min 2, scaled by budget
      const rawCount = Math.max(2, Math.round(wireLength * 3));
      const count = Math.min(rawCount, 20); // Cap per wire

      wires.push({
        start,
        end,
        length: wireLength,
        currentMag: normalized,
        count,
        color: currentToColor(normalized),
      });

      totalCount += count;
    }

    // Scale down if over budget
    if (totalCount > maxParticles) {
      const scale = maxParticles / totalCount;
      let adjusted = 0;
      for (const w of wires) {
        w.count = Math.max(1, Math.round(w.count * scale));
        adjusted += w.count;
      }
      return { wireData: wires, totalParticles: adjusted };
    }

    return { wireData: wires, totalParticles: totalCount };
  }, [currents, maxParticles]);

  // Geometry and material (memoized, shared)
  const geometry = useMemo(() => new SphereGeometry(0.025, 6, 6), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#FFFFFF",
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  // Temp object for matrix updates
  const tempObj = useMemo(() => new Object3D(), []);

  // Reusable vector for per-frame interpolation — avoids GC pressure
  const _lerpVec = useMemo(() => new Vector3(), []);

  // Animate particles each frame
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || wireData.length === 0) return;

    const time = state.clock.elapsedTime;
    let instanceIdx = 0;

    for (const wire of wireData) {
      const speed = 0.3 + wire.currentMag * 0.7; // Speed: 0.3 to 1.0
      const scale = 0.5 + wire.currentMag * 0.8;

      for (let i = 0; i < wire.count; i++) {
        // Calculate particle position along wire — reuse _lerpVec, no allocation
        const phase = (i / wire.count + time * speed) % 1.0;
        _lerpVec.lerpVectors(wire.start, wire.end, phase);

        tempObj.position.copy(_lerpVec);
        tempObj.scale.setScalar(scale);

        tempObj.updateMatrix();
        mesh.setMatrixAt(instanceIdx, tempObj.matrix);

        // Set color per instance
        mesh.setColorAt(instanceIdx, wire.color);

        instanceIdx++;
      }
    }

    if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (totalParticles === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, totalParticles]}
      frustumCulled={false}
    />
  );
}
