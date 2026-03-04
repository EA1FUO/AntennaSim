import { Text } from "@react-three/drei";
import { useMemo } from "react";
import { useUIStore } from "../../stores/uiStore";

/**
 * Compass rose on the ground plane showing N/S/E/W with degree markings.
 */
export function CompassRose() {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const radius = 20;
  const secondaryColor = isDark ? "#8888A0" : "#505068";
  const labels = useMemo(
    () => [
      { text: "N", angle: 0, color: "#EF4444" },
      { text: "E", angle: 90, color: secondaryColor },
      { text: "S", angle: 180, color: secondaryColor },
      { text: "W", angle: 270, color: secondaryColor },
    ],
    [secondaryColor]
  );

  const tickMarks = useMemo(() => {
    const ticks: { angle: number; length: number }[] = [];
    for (let deg = 0; deg < 360; deg += 30) {
      if (deg % 90 !== 0) {
        ticks.push({ angle: deg, length: 0.8 });
      }
    }
    return ticks;
  }, []);

  return (
    <group position={[0, 0.02, 0]}>
      {/* Cardinal direction labels */}
      {labels.map(({ text, angle, color }) => {
        const rad = (angle * Math.PI) / 180;
        // NEC2: Y=north, X=east. Three.js: X=east, Z=south(=-north)
        const x = Math.sin(rad) * (radius + 1.5);
        const z = -Math.cos(rad) * (radius + 1.5);
        return (
          <Text
            key={text}
            position={[x, 0.05, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={1.2}
            color={color}
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            {text}
          </Text>
        );
      })}

      {/* Circle ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[radius - 0.05, radius + 0.05, 64]} />
        <meshBasicMaterial color={isDark ? "#2A2A35" : "#9090A0"} transparent opacity={0.6} />
      </mesh>

      {/* 30-degree tick marks */}
      {tickMarks.map(({ angle, length }) => {
        const rad = (angle * Math.PI) / 180;
        const innerR = radius - length;
        const x1 = Math.sin(rad) * innerR;
        const z1 = -Math.cos(rad) * innerR;
        const x2 = Math.sin(rad) * radius;
        const z2 = -Math.cos(rad) * radius;
        return (
          <line key={angle}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([x1, 0.02, z1, x2, 0.02, z2]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={isDark ? "#2A2A35" : "#9090A0"} transparent opacity={0.6} />
          </line>
        );
      })}
    </group>
  );
}
