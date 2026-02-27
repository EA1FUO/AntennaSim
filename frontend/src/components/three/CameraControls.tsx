/**
 * Camera orbit controls with smooth damping, preset support, and auto-framing.
 *
 * Auto-framing: computes bounding box of antenna wires and positions camera
 * to show the complete antenna with ground context. Triggers on template
 * change and camera preset buttons (not on slider tweaks).
 */

import { useRef, useEffect, useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3, Box3 } from "three";
import { useUIStore } from "../../stores/uiStore";
import { getPresetCamera } from "./CameraPresets";
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
  const activePreset = useUIStore((s) => s.activePreset);
  const setActivePreset = useUIStore((s) => s.setActivePreset);
  const { camera } = useThree();

  // Compute bounding box
  const bbox = useMemo(() => computeWireBBox(wires, hasGround), [wires, hasGround]);

  // Animation state
  const animRef = useRef<{
    active: boolean;
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);

  // Track previous wire count to detect template changes
  const prevWireCountRef = useRef(wires.length);

  // Auto-frame when wires change significantly (template change) — only when wire count changes
  useEffect(() => {
    if (wires.length === prevWireCountRef.current) return;
    prevWireCountRef.current = wires.length;

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
  }, [bbox, wires.length, camera]);

  // When activePreset changes, compute framed preset position based on bbox
  useEffect(() => {
    if (!activePreset || !controlsRef.current) return;

    const defaultPreset = getPresetCamera(activePreset);
    const center = new Vector3();
    const size = new Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);
    const diagonal = Math.max(size.length(), 3);
    const dist = diagonal * 1.5;

    let endPos: Vector3;
    let endTarget: Vector3;

    switch (activePreset) {
      case "top":
        endPos = new Vector3(center.x, center.y + dist, center.z + 0.01);
        endTarget = center.clone();
        break;
      case "front":
        endPos = new Vector3(center.x, center.y, center.z + dist);
        endTarget = center.clone();
        break;
      case "side":
        endPos = new Vector3(center.x + dist, center.y, center.z);
        endTarget = center.clone();
        break;
      case "isometric":
      default:
        endPos = new Vector3(
          center.x + dist * 0.6,
          center.y + dist * 0.5,
          center.z + dist * 0.6
        );
        endTarget = center.clone();
        break;
    }

    // Fall back to default preset positions if no wires
    if (wires.length === 0) {
      endPos = new Vector3(...defaultPreset.position);
      endTarget = new Vector3(...defaultPreset.target);
    }

    animRef.current = {
      active: true,
      startPos: camera.position.clone(),
      endPos,
      startTarget: controlsRef.current.target.clone(),
      endTarget,
      progress: 0,
    };
  }, [activePreset, camera, bbox, wires.length]);

  // Animate camera each frame
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

  // Clear preset when user manually orbits
  const handleChange = () => {
    if (!animRef.current?.active) {
      const current = useUIStore.getState().activePreset;
      if (current !== null) {
        setActivePreset(null);
      }
    }
  };

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={200}
      maxPolarAngle={Math.PI * 0.95}
      onChange={handleChange}
    />
  );
}
