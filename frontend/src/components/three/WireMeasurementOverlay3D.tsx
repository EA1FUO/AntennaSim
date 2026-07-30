import { Line } from "@react-three/drei";
import { useMemo } from "react";
import type { WireData } from "./types";
import type { VisualScale } from "./visualScale";
import { measureWires } from "../../utils/wire-measurement";
import type { MeasurementPoint } from "../../utils/wire-measurement";

interface WireMeasurementOverlay3DProps {
  wires: WireData[];
  selectedTags: readonly number[];
  visualScale: VisualScale;
}

interface AxisLeg {
  key: "x" | "y" | "z";
  start: MeasurementPoint;
  end: MeasurementPoint;
  color: string;
}

/** NEC2 (Z=up) to Three.js (Y=up). */
function toThree(point: MeasurementPoint): [number, number, number] {
  return [point.x, point.z, -point.y];
}

/** Draw the closest-point spacing and its X/Y/Z decomposition. */
export function WireMeasurementOverlay3D({
  wires,
  selectedTags,
  visualScale,
}: WireMeasurementOverlay3DProps) {
  const firstWire = wires.find((wire) => wire.tag === selectedTags[0]);
  const secondWire = wires.find((wire) => wire.tag === selectedTags[1]);
  const measurement = useMemo(
    () =>
      firstWire && secondWire ? measureWires(firstWire, secondWire) : null,
    [firstWire, secondWire],
  );

  const axisLegs = useMemo((): AxisLeg[] => {
    if (!measurement) return [];
    const { firstPoint, secondPoint } = measurement;
    const afterX = {
      x: secondPoint.x,
      y: firstPoint.y,
      z: firstPoint.z,
    };
    const afterY = {
      x: secondPoint.x,
      y: secondPoint.y,
      z: firstPoint.z,
    };
    return [
      { key: "x", start: firstPoint, end: afterX, color: "#EF4444" },
      { key: "y", start: afterX, end: afterY, color: "#22C55E" },
      { key: "z", start: afterY, end: secondPoint, color: "#3B82F6" },
    ].filter(
      (leg) =>
        Math.abs(leg.end.x - leg.start.x) > 1e-12 ||
        Math.abs(leg.end.y - leg.start.y) > 1e-12 ||
        Math.abs(leg.end.z - leg.start.z) > 1e-12,
    ) as AxisLeg[];
  }, [measurement]);

  if (!measurement) return null;

  const markerRadius = Math.max(
    visualScale.markerRadius * 0.7,
    visualScale.span * 0.008,
  );

  return (
    <group>
      {measurement.distance > 1e-12 && (
        <Line
          points={[
            toThree(measurement.firstPoint),
            toThree(measurement.secondPoint),
          ]}
          color="#FFFFFF"
          lineWidth={2}
          dashed
          dashSize={visualScale.dashSize * 0.45}
          gapSize={visualScale.gapSize * 0.45}
          transparent
          opacity={0.9}
          depthTest={false}
          renderOrder={20}
        />
      )}

      {axisLegs.map((leg) => (
        <Line
          key={leg.key}
          points={[toThree(leg.start), toThree(leg.end)]}
          color={leg.color}
          lineWidth={3}
          transparent
          opacity={0.95}
          depthTest={false}
          renderOrder={21}
        />
      ))}

      <mesh position={toThree(measurement.firstPoint)} renderOrder={22}>
        <sphereGeometry args={[markerRadius, 12, 12]} />
        <meshBasicMaterial color="#F59E0B" depthTest={false} />
      </mesh>
      <mesh position={toThree(measurement.secondPoint)} renderOrder={22}>
        <sphereGeometry args={[markerRadius, 12, 12]} />
        <meshBasicMaterial color="#3B82F6" depthTest={false} />
      </mesh>
    </group>
  );
}
