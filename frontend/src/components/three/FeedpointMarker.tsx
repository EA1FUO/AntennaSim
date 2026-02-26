import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

interface FeedpointMarkerProps {
  position: [number, number, number];
}

/**
 * Glowing sphere at the excitation/feedpoint.
 * Pulses subtly: scale = 1 + 0.15 * sin(time * 3)
 */
export function FeedpointMarker({ position }: FeedpointMarkerProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 3);
      meshRef.current.scale.setScalar(s);
    }
  });

  // Convert NEC2 coords to Three.js: [x, z, -y]
  const threePos: [number, number, number] = [
    position[0],
    position[2],
    -position[1],
  ];

  return (
    <mesh ref={meshRef} position={threePos}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshPhysicalMaterial
        color="#F59E0B"
        emissive="#F59E0B"
        emissiveIntensity={2}
        transparent
        opacity={0.9}
        roughness={0.1}
      />
    </mesh>
  );
}
