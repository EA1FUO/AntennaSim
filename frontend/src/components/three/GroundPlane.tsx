import { Grid } from "@react-three/drei";

/**
 * Ground plane visualization with grid at z=0.
 * Uses drei Grid for clean rendering.
 */
export function GroundPlane() {
  return (
    <group>
      {/* Main grid */}
      <Grid
        position={[0, 0, 0]}
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1A1A24"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#2A2A35"
        fadeDistance={80}
        fadeStrength={1.5}
        infiniteGrid
      />
      {/* Semi-transparent ground surface — offset below grid to prevent z-fighting */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#1a2a1a"
          transparent
          opacity={0.15}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
