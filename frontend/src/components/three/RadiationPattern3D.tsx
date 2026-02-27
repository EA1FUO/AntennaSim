/**
 * 3D Radiation Pattern surface mesh.
 *
 * Renders the full 3D gain pattern as a spherical mesh where vertex
 * positions are gain_linear * direction_vector. Vertex colors mapped
 * through a perceptual colormap (blue → green → amber → red).
 */

import { useMemo, useRef, useEffect } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Color,
} from "three";
import type { Mesh } from "three";
import type { PatternData } from "../../api/nec";

interface RadiationPattern3DProps {
  pattern: PatternData;
  /** Scale factor for pattern size relative to scene */
  scale?: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Whether to show wireframe overlay */
  wireframe?: boolean;
  /** Center position in Three.js coordinates [x, y, z] (antenna centroid) */
  center?: [number, number, number];
}

/** Perceptual colormap for gain: blue → cyan → green → yellow → red */
const COLORMAP_STOPS = [
  { t: 0.0, color: new Color("#1E3A5F") },
  { t: 0.25, color: new Color("#2563EB") },
  { t: 0.5, color: new Color("#10B981") },
  { t: 0.75, color: new Color("#F59E0B") },
  { t: 1.0, color: new Color("#EF4444") },
];

function sampleColormap(t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < COLORMAP_STOPS.length - 1; i++) {
    const a = COLORMAP_STOPS[i]!;
    const b = COLORMAP_STOPS[i + 1]!;
    if (clamped >= a.t && clamped <= b.t) {
      const local = (clamped - a.t) / (b.t - a.t);
      return new Color().lerpColors(a.color, b.color, local);
    }
  }
  return COLORMAP_STOPS[COLORMAP_STOPS.length - 1]!.color.clone();
}

export function RadiationPattern3D({
  pattern,
  scale = 5,
  opacity = 0.65,
  wireframe = false,
  center = [0, 0, 0],
}: RadiationPattern3DProps) {
  const geometry = useMemo(() => {
    const {
      gain_dbi,
      theta_start,
      theta_step,
      theta_count,
      phi_start,
      phi_step,
      phi_count,
    } = pattern;

    // Find gain range for normalization
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

    if (maxGain <= -999) {
      return new BufferGeometry();
    }

    // Normalize: convert dBi to linear with max = 1
    const gainRange = Math.max(maxGain - minGain, 10); // at least 10dB range

    // Threshold: gains below -20dBi from max collapse to center to avoid noise
    const noiseFloor = maxGain - 30;

    // Build vertices, colors, and indices for a sphere mesh
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let ti = 0; ti < theta_count; ti++) {
      for (let pi = 0; pi < phi_count; pi++) {
        let gainDb = gain_dbi[ti]?.[pi] ?? -999;

        // Clamp -999.99 and very low gains to zero radius
        if (gainDb <= -999 || gainDb < noiseFloor) {
          gainDb = minGain;
        }

        // Normalized gain (0-1)
        const normalized = Math.max(0, (gainDb - minGain) / gainRange);

        // Linear gain for radius — minimum prevents zero-area triangles
        const radius = Math.max(0.005, normalized) * scale;

        // NEC2 angles: theta from zenith (0=up, 90=horizon, 180=down)
        // phi from X axis (0=east, counterclockwise when viewed from above)
        const thetaDeg = theta_start + ti * theta_step;
        const phiDeg = phi_start + pi * phi_step;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const phiRad = (phiDeg * Math.PI) / 180;

        // NEC2 spherical to Three.js cartesian
        // NEC2: theta from +Z (up), phi from +X
        // Three.js: Y is up
        const necX = radius * Math.sin(thetaRad) * Math.cos(phiRad);
        const necY = radius * Math.sin(thetaRad) * Math.sin(phiRad);
        const necZ = radius * Math.cos(thetaRad);

        // NEC2 → Three.js coordinate swap: [necX, necZ, -necY]
        positions.push(necX, necZ, -necY);

        // Color from colormap
        const color = sampleColormap(normalized);
        colors.push(color.r, color.g, color.b);
      }
    }

    // Build triangle indices (connect adjacent vertices into a mesh)
    for (let ti = 0; ti < theta_count - 1; ti++) {
      for (let pi = 0; pi < phi_count - 1; pi++) {
        const a = ti * phi_count + pi;
        const b = ti * phi_count + (pi + 1);
        const c = (ti + 1) * phi_count + pi;
        const d = (ti + 1) * phi_count + (pi + 1);

        indices.push(a, b, d);
        indices.push(a, d, c);
      }
      // Wrap around phi (connect last phi to first)
      const a = ti * phi_count + (phi_count - 1);
      const b = ti * phi_count;
      const c = (ti + 1) * phi_count + (phi_count - 1);
      const d = (ti + 1) * phi_count;

      indices.push(a, b, d);
      indices.push(a, d, c);
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    // Compute smooth vertex normals for non-faceted appearance
    geo.computeVertexNormals();
    // Normalize normals to ensure consistent lighting
    const normals = geo.getAttribute("normal");
    if (normals) {
      for (let i = 0; i < normals.count; i++) {
        const nx = normals.getX(i);
        const ny = normals.getY(i);
        const nz = normals.getZ(i);
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) {
          normals.setXYZ(i, nx / len, ny / len, nz / len);
        }
      }
      normals.needsUpdate = true;
    }

    return geo;
  }, [pattern, scale]);

  // Tag mesh with pattern data for hover measurement
  const meshRef = useRef<Mesh>(null);
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = { hoverType: "pattern", patternData: pattern };
    }
  }, [pattern]);

  if (geometry.attributes.position === undefined) {
    return null;
  }

  return (
    <group position={center}>
      {/* Solid surface */}
      {!wireframe && (
        <mesh ref={meshRef} geometry={geometry}>
          <meshPhysicalMaterial
            vertexColors
            transparent
            opacity={opacity}
            side={DoubleSide}
            roughness={0.1}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Wireframe overlay or wireframe-only mode */}
      {wireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            vertexColors
            wireframe
            transparent
            opacity={0.8}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
