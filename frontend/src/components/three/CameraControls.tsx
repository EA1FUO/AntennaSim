/**
 * Camera orbit controls with smooth damping, auto-framing, and follow mode.
 *
 * Auto-framing: computes bounding box of antenna wires and positions camera
 * to show the complete antenna with nearby ground context. Triggers when the
 * topology changes or dimensions change enough to leave the current framing.
 *
 * Follow mode: when wires move without count changing (e.g., height slider),
 * the camera and orbit target shift by the same delta to track the antenna.
 * Uses smooth lerp interpolation so the transition feels natural.
 *
 * Camera view presets are handled by the GizmoViewport in AxesHelper.tsx.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { WireData } from "./types";
import {
  computeCameraFrame,
  computeWireBBox,
  getAntennaSpan,
} from "./visualScale";

interface CameraControlsProps {
  /** Set to false to temporarily disable orbit (e.g., during drag) */
  enabled?: boolean;
  /** Wire data for auto-framing bounding box calculation */
  wires?: WireData[];
  /** Whether to include ground plane in framing (antenna has ground) */
  hasGround?: boolean;
}

function updateCameraClipping(camera: Camera, near: number, far: number): void {
  if (!("near" in camera) || !("far" in camera)) return;
  const clippingCamera = camera as Camera & {
    near: number;
    far: number;
    updateProjectionMatrix: () => void;
  };
  clippingCamera.near = near;
  clippingCamera.far = far;
  clippingCamera.updateProjectionMatrix();
}

export function CameraControls({ enabled = true, wires = [], hasGround = true }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  // Compute bounding box
  const bbox = useMemo(() => computeWireBBox(wires, hasGround), [wires, hasGround]);
  const antennaSpan = useMemo(() => getAntennaSpan(wires), [wires]);

  // Animation state for auto-framing
  const animRef = useRef<{
    active: boolean;
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);

  // Track topology and last framed scale (init to 0 so first mount auto-frames).
  const prevWireCountRef = useRef(0);
  const lastFramedSpanRef = useRef(0);
  // OrbitControls mounts after the first React effect. Keep an explicit pending
  // flag so the initial antenna is framed on the first available render frame.
  const pendingAutoFrameRef = useRef(wires.length > 0);

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

  const beginAutoFrame = useCallback(() => {
    const controls = controlsRef.current;
    if (wires.length === 0) {
      pendingAutoFrameRef.current = false;
      prevWireCountRef.current = 0;
      lastFramedSpanRef.current = antennaSpan;
      prevCentroidRef.current = wireCentroid.clone();
      return;
    }
    if (!controls) {
      pendingAutoFrameRef.current = true;
      return;
    }

    const { center, distance } = computeCameraFrame(bbox, antennaSpan);
    const endPos = new Vector3(
      center.x + distance * 0.6,
      center.y + distance * 0.5,
      center.z + distance * 0.6,
    );

    pendingAutoFrameRef.current = false;
    prevWireCountRef.current = wires.length;
    lastFramedSpanRef.current = antennaSpan;
    prevCentroidRef.current = wireCentroid.clone();
    animRef.current = {
      active: true,
      startPos: camera.position.clone(),
      endPos,
      startTarget: controls.target.clone(),
      endTarget: center,
      progress: 0,
    };
  }, [antennaSpan, bbox, camera, wireCentroid, wires.length]);

  // Auto-frame when topology or overall antenna size changes significantly.
  // Follow mode: when wires move without count changing (height slider, drag), apply the
  // position delta instantly so the camera keeps pace with the antenna.
  useEffect(() => {
    const previousSpan = lastFramedSpanRef.current;
    const spanRatio = previousSpan > 0 ? antennaSpan / previousSpan : Infinity;
    const shouldReframe =
      wires.length !== prevWireCountRef.current ||
      spanRatio >= 1.75 ||
      spanRatio <= 1 / 1.75;

    if (shouldReframe) {
      pendingAutoFrameRef.current = true;
      beginAutoFrame();
    } else if (wires.length > 0 && prevCentroidRef.current && controlsRef.current) {
      // Wire count unchanged but wires moved (height change, etc.) — instant follow.
      // Use raw wire centroid (not bbox center) so ground plane doesn't dilute the delta.
      const delta = wireCentroid.clone().sub(prevCentroidRef.current);
      const followThreshold = Math.max(antennaSpan * 1e-6, 1e-8);
      if (delta.lengthSq() > followThreshold * followThreshold) {
        camera.position.add(delta);
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
        prevCentroidRef.current = wireCentroid.clone();
      }
    } else {
      prevCentroidRef.current = wireCentroid.clone();
    }
  }, [
    antennaSpan,
    beginAutoFrame,
    camera,
    wireCentroid,
    wires.length,
  ]);

  // Animate camera each frame (auto-framing only)
  useFrame((_, delta) => {
    if (pendingAutoFrameRef.current && controlsRef.current) {
      beginAutoFrame();
    }

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
    updateCameraClipping(
      camera,
      Math.max(1e-5, diag * 0.001),
      Math.max(1, diag * 100),
    );

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
      minDistance={Math.max(antennaSpan * 0.05, 1e-4)}
      maxDistance={Math.max(antennaSpan * 100, 10)}
      maxPolarAngle={Math.PI * 0.95}
      makeDefault
    />
  );
}
