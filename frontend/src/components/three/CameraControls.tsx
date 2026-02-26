import { OrbitControls } from "@react-three/drei";

/**
 * Camera orbit controls with smooth damping.
 */
export function CameraControls() {
  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={200}
      maxPolarAngle={Math.PI * 0.95}
    />
  );
}
