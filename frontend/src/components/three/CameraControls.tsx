/**
 * Camera orbit controls with smooth damping and preset support.
 *
 * Reads the activePreset from the UI store and smoothly animates
 * the camera to the preset position/target when changed.
 *
 * Also exposes an enableControls flag to disable orbit during drag operations.
 */

import { useRef, useEffect } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useUIStore } from "../../stores/uiStore";
import { getPresetCamera } from "./CameraPresets";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface CameraControlsProps {
  /** Set to false to temporarily disable orbit (e.g., during drag) */
  enabled?: boolean;
}

export function CameraControls({ enabled = true }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const activePreset = useUIStore((s) => s.activePreset);
  const setActivePreset = useUIStore((s) => s.setActivePreset);
  const { camera } = useThree();

  // Animation state
  const animRef = useRef<{
    active: boolean;
    startPos: Vector3;
    endPos: Vector3;
    startTarget: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);

  // When activePreset changes, start a smooth animation
  useEffect(() => {
    if (!activePreset || !controlsRef.current) return;

    const preset = getPresetCamera(activePreset);
    const controls = controlsRef.current;

    animRef.current = {
      active: true,
      startPos: camera.position.clone(),
      endPos: new Vector3(...preset.position),
      startTarget: controls.target.clone(),
      endTarget: new Vector3(...preset.target),
      progress: 0,
    };
  }, [activePreset, camera]);

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

    if (anim.progress >= 1) {
      anim.active = false;
      animRef.current = null;
    }
  });

  // Clear preset when user manually orbits
  const handleChange = () => {
    if (!animRef.current?.active) {
      // User is manually moving the camera — clear the active preset
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
