/**
 * VolumetricShells — nested semi-transparent gain surfaces at multiple thresholds.
 *
 * Creates a "glowing nebula" or "onion layer" effect by rendering multiple
 * concentric radiation pattern surfaces at different gain thresholds:
 * -3dB, -6dB, -10dB, -20dB from max gain.
 *
 * Outer shell = max gain contour (most opaque)
 * Inner shells = progressively more transparent
 */

import { useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Color,
  AdditiveBlending,
} from "three";
import type { PatternData } from "../../api/nec";

interface VolumetricShellsProps {
  pattern: PatternData;
  /** Scale factor for pattern size */
  scale?: number;
  /** Center position in Three.js coordinates */
  center?: [number, number, number];
}

/** Shell definition: dB below max, opacity, color */
const SHELLS = [
  { dbBelow: 3, opacity: 0.35, color: new Color("#EF4444") },
  { dbBelow: 6, opacity: 0.20, color: new Color("#F59E0B") },
  { dbBelow: 10, opacity: 0.12, color: new Color("#10B981") },
  { dbBelow: 20, opacity: 0.06, color: new Color("#2563EB") },
];

/** Build a shell geometry at a given gain threshold */
function buildShellGeometry(
  pattern: PatternData,
  thresholdDb: number,
  maxGain: number,
  minGain: number,
  scale: number
): BufferGeometry | null {
  const {
    gain_dbi,
    theta_start,
    theta_step,
    theta_count,
    phi_start,
    phi_step,
    phi_count,
  } = pattern;

  const threshold = maxGain - thresholdDb;
  const gainRange = Math.max(maxGain - minGain, 10);

  const positions: number[] = [];
  const indices: number[] = [];

  for (let ti = 0; ti < theta_count; ti++) {
    for (let pi = 0; pi < phi_count; pi++) {
      const gainDb = gain_dbi[ti]?.[pi] ?? -999;

      // Clamp to threshold — if gain is below threshold, use threshold surface
      const effectiveGain = Math.max(gainDb, threshold);
      const normalized =
        effectiveGain > -999 ? Math.max(0, (effectiveGain - minGain) / gainRange) : 0;
      const radius = Math.max(0.01, normalized) * scale;

      const thetaDeg = theta_start + ti * theta_step;
      const phiDeg = phi_start + pi * phi_step;
      const thetaRad = (thetaDeg * Math.PI) / 180;
      const phiRad = (phiDeg * Math.PI) / 180;

      // NEC2 spherical to Three.js
      const necX = radius * Math.sin(thetaRad) * Math.cos(phiRad);
      const necY = radius * Math.sin(thetaRad) * Math.sin(phiRad);
      const necZ = radius * Math.cos(thetaRad);

      // NEC2 -> Three.js: [necX, necZ, -necY]
      positions.push(necX, necZ, -necY);
    }
  }

  // Build triangle indices
  for (let ti = 0; ti < theta_count - 1; ti++) {
    for (let pi = 0; pi < phi_count - 1; pi++) {
      const a = ti * phi_count + pi;
      const b = ti * phi_count + (pi + 1);
      const c = (ti + 1) * phi_count + pi;
      const d = (ti + 1) * phi_count + (pi + 1);
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
    // Wrap around phi
    const a = ti * phi_count + (phi_count - 1);
    const b = ti * phi_count;
    const c = (ti + 1) * phi_count + (phi_count - 1);
    const d = (ti + 1) * phi_count;
    indices.push(a, b, d);
    indices.push(a, d, c);
  }

  if (positions.length === 0) return null;

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function VolumetricShells({
  pattern,
  scale = 5,
  center = [0, 0, 0],
}: VolumetricShellsProps) {
  const shells = useMemo(() => {
    const { gain_dbi, theta_count, phi_count } = pattern;

    // Find gain range
    let maxGain = -Infinity;
    let minGain = Infinity;
    for (let ti = 0; ti < theta_count; ti++) {
      for (let pi = 0; pi < phi_count; pi++) {
        const g = gain_dbi[ti]?.[pi] ?? -999;
        if (g > -999) {
          maxGain = Math.max(maxGain, g);
          minGain = Math.min(minGain, g);
        }
      }
    }

    if (maxGain <= -999) return [];

    return SHELLS.map((shell) => ({
      ...shell,
      geometry: buildShellGeometry(pattern, shell.dbBelow, maxGain, minGain, scale),
    })).filter((s) => s.geometry !== null);
  }, [pattern, scale]);

  if (shells.length === 0) return null;

  return (
    <group position={center}>
      {shells.map((shell, i) => (
        <mesh key={i} geometry={shell.geometry!}>
          <meshPhysicalMaterial
            color={shell.color}
            transparent
            opacity={shell.opacity}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
            roughness={0.3}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}
