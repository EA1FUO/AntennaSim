/**
 * NearFieldPlane — 3D heatmap visualization of near-field data.
 *
 * Renders a semi-transparent flat plane in the 3D scene showing
 * E-field magnitude as a color-mapped texture. The plane sits at
 * the calculated height in the scene.
 *
 * Colormap: blue (low) -> yellow -> red (high field strength)
 */

import { useMemo } from "react";
import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  DoubleSide,
} from "three";
import type { NearFieldResult } from "../../api/nec";

interface NearFieldPlaneProps {
  data: NearFieldResult;
  /** Opacity of the heatmap plane */
  opacity?: number;
}

/** Map a normalized value (0-1) to a RGB color: blue -> yellow -> red */
function fieldToColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;

  if (clamped < 0.5) {
    // Blue -> Yellow (0.0 -> 0.5)
    const local = clamped * 2;
    r = Math.round(local * 255);
    g = Math.round(local * 255);
    b = Math.round((1 - local) * 255);
  } else {
    // Yellow -> Red (0.5 -> 1.0)
    const local = (clamped - 0.5) * 2;
    r = 255;
    g = Math.round((1 - local) * 255);
    b = 0;
  }

  return [r, g, b];
}

export function NearFieldPlane({ data, opacity = 0.6 }: NearFieldPlaneProps) {
  const texture = useMemo(() => {
    const { nx, ny, field_magnitude } = data;

    // Find max field for normalization
    let maxField = 0;
    for (let xi = 0; xi < nx; xi++) {
      for (let yi = 0; yi < ny; yi++) {
        const val = field_magnitude[xi]?.[yi] ?? 0;
        if (val > maxField) maxField = val;
      }
    }

    if (maxField <= 0) maxField = 1; // Prevent division by zero

    // Build RGBA texture data
    const texData = new Uint8Array(nx * ny * 4);
    for (let yi = 0; yi < ny; yi++) {
      for (let xi = 0; xi < nx; xi++) {
        const val = field_magnitude[xi]?.[yi] ?? 0;
        const normalized = val / maxField;
        const [r, g, b] = fieldToColor(normalized);
        const idx = (yi * nx + xi) * 4;
        texData[idx] = r;
        texData[idx + 1] = g;
        texData[idx + 2] = b;
        texData[idx + 3] = normalized > 0.01 ? Math.round(opacity * 255) : 0;
      }
    }

    const tex = new DataTexture(texData, nx, ny, RGBAFormat, UnsignedByteType);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [data, opacity]);

  // Compute plane dimensions and position in Three.js coordinates
  const { width, depth, position } = useMemo(() => {
    const w = data.nx * data.dx;
    const d = data.ny * data.dy;

    if (data.plane === "horizontal") {
      // Horizontal plane at height_m
      // NEC2: plane is in X-Y at Z=height_m
      // Three.js: Y = up, so plane at Y=height_m, extending in X and Z
      return {
        width: w,
        depth: d,
        position: [
          data.x_start + w / 2,  // Center X
          data.height_m,          // Y = NEC2 Z (height)
          -(data.y_start + d / 2), // Z = -NEC2 Y
        ] as [number, number, number],
      };
    } else {
      // Vertical plane in X-Z
      return {
        width: w,
        depth: d,
        position: [
          data.x_start + w / 2,
          d / 2, // Y = NEC2 Z
          0,
        ] as [number, number, number],
      };
    }
  }, [data]);

  return (
    <mesh
      position={position}
      rotation={data.plane === "horizontal" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
