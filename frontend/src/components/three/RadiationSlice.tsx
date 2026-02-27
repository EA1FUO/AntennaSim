/**
 * RadiationSlice — animated cutting plane that sweeps through
 * the 3D radiation pattern showing cross-sections.
 *
 * Renders a semi-transparent disc at the current slice angle,
 * with an outline showing the 2D pattern at that cut.
 */

import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  DoubleSide,
  Line as ThreeLine,
  Group,
} from "three";
import type { PatternData } from "../../api/nec";

interface RadiationSliceProps {
  pattern: PatternData;
  /** Scale factor matching RadiationPattern3D */
  scale?: number;
  /** Center position in Three.js coords */
  center?: [number, number, number];
  /** "azimuth" = horizontal sweep, "elevation" = vertical sweep */
  mode?: "azimuth" | "elevation";
  /** Auto-play animation */
  playing?: boolean;
  /** Sweep speed (degrees per second) */
  speed?: number;
}

export function RadiationSlice({
  pattern,
  scale = 5,
  center = [0, 0, 0],
  mode = "azimuth",
  playing = true,
  speed = 30,
}: RadiationSliceProps) {
  const groupRef = useRef<Group>(null);
  const lineRef = useRef<ThreeLine | null>(null);
  const [angle, setAngle] = useState(0);

  // Animate the sweep
  useFrame((_, delta) => {
    if (!playing) return;
    setAngle((prev) => (prev + speed * delta) % 360);
  });

  // Build the slice outline geometry at the current angle
  const sliceGeometry = useMemo(() => {
    const {
      gain_dbi,
      theta_start,
      theta_step,
      theta_count,
      phi_start,
      phi_step,
      phi_count,
    } = pattern;

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
    const gainRange = Math.max(maxGain - minGain, 10);

    const positions: number[] = [];

    if (mode === "azimuth") {
      // Horizontal sweep: slice at fixed phi = angle, sweep theta
      const pi = Math.round((angle - phi_start) / phi_step);
      const clampedPi = Math.max(0, Math.min(phi_count - 1, pi));

      for (let ti = 0; ti < theta_count; ti++) {
        const gainDb = gain_dbi[ti]?.[clampedPi] ?? -999;
        const normalized = gainDb > -999 ? Math.max(0.005, (gainDb - minGain) / gainRange) : 0.005;
        const radius = normalized * scale;

        const thetaDeg = theta_start + ti * theta_step;
        const phiDeg = angle;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const phiRad = (phiDeg * Math.PI) / 180;

        const necX = radius * Math.sin(thetaRad) * Math.cos(phiRad);
        const necY = radius * Math.sin(thetaRad) * Math.sin(phiRad);
        const necZ = radius * Math.cos(thetaRad);

        positions.push(necX, necZ, -necY);
      }
    } else {
      // Vertical sweep: slice at fixed theta = angle, sweep phi
      const ti = Math.round((angle - theta_start) / theta_step);
      const clampedTi = Math.max(0, Math.min(theta_count - 1, ti));

      for (let pi = 0; pi < phi_count; pi++) {
        const gainDb = gain_dbi[clampedTi]?.[pi] ?? -999;
        const normalized = gainDb > -999 ? Math.max(0.005, (gainDb - minGain) / gainRange) : 0.005;
        const radius = normalized * scale;

        const thetaDeg = theta_start + clampedTi * theta_step;
        const phiDeg = phi_start + pi * phi_step;
        const thetaRad = (thetaDeg * Math.PI) / 180;
        const phiRad = (phiDeg * Math.PI) / 180;

        const necX = radius * Math.sin(thetaRad) * Math.cos(phiRad);
        const necY = radius * Math.sin(thetaRad) * Math.sin(phiRad);
        const necZ = radius * Math.cos(thetaRad);

        positions.push(necX, necZ, -necY);
      }
    }

    // Close the line loop
    if (positions.length >= 3) {
      positions.push(positions[0]!, positions[1]!, positions[2]!);
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, [pattern, angle, mode, scale]);

  // Slice disc material
  const lineMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: "#F59E0B",
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
      }),
    []
  );

  // Manage ThreeLine imperatively via ref to avoid creating in render
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Remove old line if present
    if (lineRef.current) {
      group.remove(lineRef.current);
      lineRef.current.geometry.dispose();
      lineRef.current = null;
    }

    // Create new line
    const line = new ThreeLine(sliceGeometry, lineMaterial);
    lineRef.current = line;
    group.add(line);

    return () => {
      if (lineRef.current) {
        group.remove(lineRef.current);
        lineRef.current.geometry.dispose();
        lineRef.current = null;
      }
    };
  }, [sliceGeometry, lineMaterial]);

  // Semi-transparent disc at the slice plane
  const discRotation = useMemo((): [number, number, number] => {
    if (mode === "azimuth") {
      const rad = (angle * Math.PI) / 180;
      return [0, -rad, 0];
    }
    return [0, 0, 0]; // elevation mode doesn't rotate the disc
  }, [angle, mode]);

  return (
    <group ref={groupRef} position={center}>
      {/* ThreeLine is added imperatively via useEffect */}

      {/* Semi-transparent disc showing the cut plane */}
      <mesh rotation={discRotation}>
        <ringGeometry args={[0, scale * 0.3, 32]} />
        <meshBasicMaterial
          color="#F59E0B"
          transparent
          opacity={0.05}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
