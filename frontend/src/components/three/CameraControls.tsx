/**
 * Camera orbit controls with smooth damping, auto-framing, and follow mode.
 *
 * Auto-framing: computes bounding box of antenna wires and positions camera
 * to show the complete antenna with ground context. Triggers on template
 * change (wire count change), not on slider tweaks.
 *
 * Follow mode: when wires move without count changing (e.g., height slider),
 * the camera and orbit target shift by the same delta to track the antenna.
 * Uses smooth lerp interpolation so the transition feels natural.
 *
 * Camera view presets are handled by the GizmoViewport in AxesHelper.tsx.
 */

import { useRef, useEffect, useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3, Box3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { WireData } from "./types";

interface CameraControlsProps {
  /** Set to false to temporarily disable orbit (e.g., during drag) */
  enabled?: boolean;
  /** Wire data for auto-framing bounding box calculation */
  wires?: WireData[];
  /** Whether to include ground plane in framing (antenna has ground) */
  hasGround?: boolean;
}

/** Compute bounding box of all wires in Three.js coordinates */
function computeWireBBox(wires: WireData[], hasGround: boolean): Box3 {
  const bbox = new Box3();

  if (wires.length === 0) {
    // Default bbox for empty scene
    bbox.set(new Vector3(-5, 0, -5), new Vector3(5, 10, 5));
    return bbox;
  }

  for (const w of wires) {
    // NEC2 → Three.js: [necX, necZ, -necY]
    bbox.expandByPoint(new Vector3(w.x1, w.z1, -w.y1));
    bbox.expandByPoint(new Vector3(w.x2, w.z2, -w.y2));
  }

  // Include ground plane at Y=0 if antenna has ground
  if (hasGround) {
    const min = bbox.min.clone();
    min.y = Math.min(min.y, 0);
    bbox.min.copy(min);
  }

  // Expand by 20% for breathing room
  const center = new Vector3();
  const size = new Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);

  // Minimum 2m in each dimension
  size.x = Math.max(size.x, 2);
  size.y = Math.max(size.y, 2);
  size.z = Math.max(size.z, 2);

  const padding = size.clone().multiplyScalar(0.2);
  bbox.expandByVector(padding);

  return bbox;
}

export function CameraControls({ enabled = true, wires = [], hasGround = true }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  // Compute bounding box
  const bbox = useMemo(() => computeWireBBox(wires, hasGround), [wires, hasGround]);

  // Animation state for auto-framing
  const animRef = useRef<{
    active: boolean;
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);

  // Track previous wire count to detect template changes (init to 0 so first mount triggers auto-frame)
  const prevWireCountRef = useRef(0);

  // Track previous wire centroid (ignoring ground/padding) for follow-mode delta
  const prevCentroidRef = useRef<Vector3 | null>(null);

  // Compute the raw centroid of wire endpoints in Three.js coords (no ground, no padding)
  const wireCentroid = useMemo(() => {
    if (wires.length === 0) return new Vector3();
    const sum = new Vector3();
    let count = 0;
    for (const w of wires) {
      // NEC2 → Three.js: [necX, necZ, -necY]
      sum.add(new Vector3(w.x1, w.z1, -w.y1));
      sum.add(new Vector3(w.x2, w.z2, -w.y2));
      count += 2;
    }
    return sum.divideScalar(count);
  }, [wires]);

  // Auto-frame when wires change significantly (template change) — only when wire count changes.
  // Follow mode: when wires move without count changing (height slider, drag), apply the
  // position delta instantly so the camera keeps pace with the antenna.
  useEffect(() => {
    if (wires.length !== prevWireCountRef.current) {
      // Wire count changed — full auto-frame
      prevWireCountRef.current = wires.length;
      prevCentroidRef.current = wireCentroid.clone();

      if (wires.length === 0 || !controlsRef.current) return;

      const center = new Vector3();
      const size = new Vector3();
      bbox.getCenter(center);
      bbox.getSize(size);
      const diagonal = size.length();

      // Position camera at 1.5x diagonal distance, isometric-ish angle
      const dist = Math.max(diagonal * 1.5, 5);
      const endPos = new Vector3(
        center.x + dist * 0.6,
        center.y + dist * 0.5,
        center.z + dist * 0.6
      );

      animRef.current = {
        active: true,
        startPos: camera.position.clone(),
        endPos,
        startTarget: controlsRef.current.target.clone(),
        endTarget: center,
        progress: 0,
      };
    } else if (wires.length > 0 && prevCentroidRef.current && controlsRef.current) {
      // Wire count unchanged but wires moved (height change, etc.) — instant follow.
      // Use raw wire centroid (not bbox center) so ground plane doesn't dilute the delta.
      const delta = wireCentroid.clone().sub(prevCentroidRef.current);
      if (delta.lengthSq() > 0.0001) {
        camera.position.add(delta);
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
        prevCentroidRef.current = wireCentroid.clone();
      }
    } else {
      prevCentroidRef.current = wireCentroid.clone();
    }
  }, [bbox, wires.length, wireCentroid, camera]);

  // Animate camera each frame (auto-framing only)
  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim || !anim.active || !controlsRef.current) return;

    anim.progress = Math.min(anim.progress + delta * 3.5, 1);

    // Smooth easing (ease-out cubic)
    const t = 1 - Math.pow(1 - anim.progress, 3);

    camera.position.lerpVectors(anim.startPos, anim.endPos, t);
    controlsRef.current.target.lerpVectors(anim.startTarget, anim.endTarget, t);
    controlsRef.current.update();

    // Update near/far based on bounding box
    const bboxSize = new Vector3();
    bbox.getSize(bboxSize);
    const diag = bboxSize.length();
    camera.near = Math.max(0.01, diag * 0.001);
    camera.far = Math.max(500, diag * 10);
    camera.updateProjectionMatrix();

    if (anim.progress >= 1) {
      anim.active = false;
      animRef.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={200}
      maxPolarAngle={Math.PI * 0.95}
      makeDefault
    />
  );
}
