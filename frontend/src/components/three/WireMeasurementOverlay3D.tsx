import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import type { WireData } from "./types";
import type { VisualScale } from "./visualScale";
import { measureWires } from "../../utils/wire-measurement";
import type {
  MeasurementPoint,
  WireMeasurementPointMode,
} from "../../utils/wire-measurement";
import {
  createWireAngleGuide,
  createWireEndpointLabels,
  shouldShowWireAngleGuide,
  type WireEndpointLabel,
} from "../../utils/wire-measurement-visuals";

interface WireMeasurementOverlay3DProps {
  wires: WireData[];
  selectedTags: readonly number[];
  pointMode: WireMeasurementPointMode;
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

function EndpointLabel({
  point,
  labels,
  markerColor,
  markerRadius,
}: {
  point: MeasurementPoint;
  labels: WireEndpointLabel["labels"];
  markerColor: string;
  markerRadius: number;
}) {
  return (
    <group position={toThree(point)}>
      <mesh renderOrder={22}>
        <sphereGeometry args={[markerRadius * 0.6, 10, 10]} />
        <meshBasicMaterial
          color={markerColor}
          transparent
          opacity={0.7}
          depthTest={false}
        />
      </mesh>
      <Html
        center
        sprite
        aria-hidden="true"
        zIndexRange={[20, 0]}
        style={{
          pointerEvents: "none",
          overflow: "visible",
          whiteSpace: "nowrap",
          width: "max-content",
        }}
      >
        <span
          style={{ borderColor: markerColor }}
          className="inline-flex w-max -translate-y-4 items-center whitespace-nowrap rounded-full border bg-black/90 px-1.5 py-1 font-mono text-[10px] font-bold leading-none shadow-lg backdrop-blur-sm"
        >
          {labels.map((label, index) => (
            <span key={label.text} className="inline-flex items-center">
              {index > 0 && (
                <span className="mx-1 text-white/60" aria-hidden="true">
                  ·
                </span>
              )}
              <span style={{ color: label.color }}>{label.text}</span>
            </span>
          ))}
        </span>
      </Html>
    </group>
  );
}

/** Draw the selected point spacing, endpoint labels, and angle definition. */
export function WireMeasurementOverlay3D({
  wires,
  selectedTags,
  pointMode,
  visualScale,
}: WireMeasurementOverlay3DProps) {
  const firstWire = wires.find((wire) => wire.tag === selectedTags[0]);
  const secondWire = wires.find((wire) => wire.tag === selectedTags[1]);
  const measurement = useMemo(
    () =>
      firstWire && secondWire
        ? measureWires(firstWire, secondWire, pointMode)
        : null,
    [firstWire, secondWire, pointMode],
  );

  const angleGuide = useMemo(
    () =>
      firstWire && secondWire
        ? createWireAngleGuide(firstWire, secondWire, visualScale.span)
        : null,
    [firstWire, secondWire, visualScale.span],
  );

  const endpointLabels = useMemo((): WireEndpointLabel[] => {
    return firstWire && secondWire
      ? createWireEndpointLabels(
          firstWire,
          secondWire,
          visualScale.span * 1e-7,
        )
      : [];
  }, [firstWire, secondWire, visualScale.span]);

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
  const visibleAngleDegrees =
    angleGuide && shouldShowWireAngleGuide(angleGuide.angleDegrees)
      ? angleGuide.angleDegrees
      : null;

  return (
    <group>
      {endpointLabels.map((endpoint) => (
        <EndpointLabel
          key={endpoint.labels.map((label) => label.text).join("-")}
          point={endpoint.point}
          labels={endpoint.labels}
          markerColor={endpoint.markerColor}
          markerRadius={markerRadius}
        />
      ))}

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

      {angleGuide && visibleAngleDegrees !== null && (
        <>
          <Line
            points={angleGuide.firstAxis.map(toThree)}
            color="#F59E0B"
            lineWidth={2}
            dashed
            dashSize={visualScale.dashSize * 0.3}
            gapSize={visualScale.gapSize * 0.3}
            transparent
            opacity={0.85}
            depthTest={false}
            renderOrder={23}
          />
          <Line
            points={angleGuide.secondAxis.map(toThree)}
            color="#3B82F6"
            lineWidth={2}
            dashed
            dashSize={visualScale.dashSize * 0.3}
            gapSize={visualScale.gapSize * 0.3}
            transparent
            opacity={0.85}
            depthTest={false}
            renderOrder={23}
          />
          {angleGuide.arc.length > 1 && (
            <Line
              points={angleGuide.arc.map(toThree)}
              color="#FFFFFF"
              lineWidth={3}
              transparent
              opacity={0.95}
              depthTest={false}
              renderOrder={24}
            />
          )}
          <Html
            position={toThree(angleGuide.labelPoint)}
            center
            sprite
            aria-hidden="true"
            zIndexRange={[20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span className="whitespace-nowrap rounded border border-white/50 bg-black/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow">
              {visibleAngleDegrees.toFixed(1)}° acute
            </span>
          </Html>
        </>
      )}

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
