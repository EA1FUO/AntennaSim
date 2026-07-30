import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import type { WireData } from "./types";
import type { VisualScale } from "./visualScale";
import { measureWires } from "../../utils/wire-measurement";
import type {
  MeasurementPoint,
  WireMeasurement,
  WireMeasurementPointMode,
} from "../../utils/wire-measurement";

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

interface AngleGuide {
  firstAxis: [MeasurementPoint, MeasurementPoint];
  secondAxis: [MeasurementPoint, MeasurementPoint];
  arc: MeasurementPoint[];
  labelPoint: MeasurementPoint;
}

interface EndpointLabelData {
  point: MeasurementPoint;
  labels: Array<{ text: string; color: string }>;
  markerColor: string;
}

/** NEC2 (Z=up) to Three.js (Y=up). */
function toThree(point: MeasurementPoint): [number, number, number] {
  return [point.x, point.z, -point.y];
}

function add(a: MeasurementPoint, b: MeasurementPoint): MeasurementPoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(point: MeasurementPoint, amount: number): MeasurementPoint {
  return { x: point.x * amount, y: point.y * amount, z: point.z * amount };
}

function dot(a: MeasurementPoint, b: MeasurementPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(point: MeasurementPoint): MeasurementPoint | null {
  const length = Math.sqrt(dot(point, point));
  return length > 1e-12 ? scale(point, 1 / length) : null;
}

function midpoint(a: MeasurementPoint, b: MeasurementPoint): MeasurementPoint {
  return scale(add(a, b), 0.5);
}

function distanceSquared(a: MeasurementPoint, b: MeasurementPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function createAngleGuide(
  firstWire: WireData,
  secondWire: WireData,
  measurement: WireMeasurement,
  span: number,
): AngleGuide | null {
  const firstDirection = normalize({
    x: firstWire.x2 - firstWire.x1,
    y: firstWire.y2 - firstWire.y1,
    z: firstWire.z2 - firstWire.z1,
  });
  let secondDirection = normalize({
    x: secondWire.x2 - secondWire.x1,
    y: secondWire.y2 - secondWire.y1,
    z: secondWire.z2 - secondWire.z1,
  });
  if (!firstDirection || !secondDirection) return null;

  // Wire axes have no forward direction. Flip the second axis so the guide
  // depicts the same acute angle reported in the panel.
  if (dot(firstDirection, secondDirection) < 0) {
    secondDirection = scale(secondDirection, -1);
  }

  const anchor = midpoint(measurement.firstPoint, measurement.secondPoint);
  const armLength = span * 0.14;
  const arcRadius = span * 0.075;
  const firstAxis: [MeasurementPoint, MeasurementPoint] = [
    add(anchor, scale(firstDirection, -armLength)),
    add(anchor, scale(firstDirection, armLength)),
  ];
  const secondAxis: [MeasurementPoint, MeasurementPoint] = [
    add(anchor, scale(secondDirection, -armLength)),
    add(anchor, scale(secondDirection, armLength)),
  ];

  const angleRadians =
    measurement.angleDegrees === null
      ? 0
      : (measurement.angleDegrees * Math.PI) / 180;
  const steps = Math.max(2, Math.ceil(angleRadians / (Math.PI / 36)));
  const arc: MeasurementPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const blended = normalize(
      add(
        scale(firstDirection, 1 - progress),
        scale(secondDirection, progress),
      ),
    );
    if (blended) arc.push(add(anchor, scale(blended, arcRadius)));
  }

  const labelDirection =
    normalize(add(firstDirection, secondDirection)) ?? firstDirection;
  return {
    firstAxis,
    secondAxis,
    arc,
    labelPoint: add(anchor, scale(labelDirection, arcRadius * 1.35)),
  };
}

function EndpointLabel({
  point,
  labels,
  markerColor,
  markerRadius,
}: {
  point: MeasurementPoint;
  labels: Array<{ text: string; color: string }>;
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

  // The wire angle does not depend on the selected distance endpoints. Keep
  // its visual reference at the wires' closest approach so switching point
  // modes cannot move the arc away from the geometry it explains. For fan
  // antennas this naturally anchors the angle at the shared feed point.
  const angleReferenceMeasurement = useMemo(
    () =>
      firstWire && secondWire
        ? measureWires(firstWire, secondWire, "closest")
        : null,
    [firstWire, secondWire],
  );

  const angleGuide = useMemo(
    () =>
      firstWire && secondWire && angleReferenceMeasurement
        ? createAngleGuide(
            firstWire,
            secondWire,
            angleReferenceMeasurement,
            visualScale.span,
          )
        : null,
    [firstWire, secondWire, angleReferenceMeasurement, visualScale.span],
  );

  const endpointLabels = useMemo((): EndpointLabelData[] => {
    if (!firstWire || !secondWire) return [];
    const candidates: EndpointLabelData[] = [
      {
        point: { x: firstWire.x1, y: firstWire.y1, z: firstWire.z1 },
        labels: [{ text: "1A", color: "#F59E0B" }],
        markerColor: "#F59E0B",
      },
      {
        point: { x: firstWire.x2, y: firstWire.y2, z: firstWire.z2 },
        labels: [{ text: "1B", color: "#F59E0B" }],
        markerColor: "#F59E0B",
      },
      {
        point: { x: secondWire.x1, y: secondWire.y1, z: secondWire.z1 },
        labels: [{ text: "2A", color: "#3B82F6" }],
        markerColor: "#3B82F6",
      },
      {
        point: { x: secondWire.x2, y: secondWire.y2, z: secondWire.z2 },
        labels: [{ text: "2B", color: "#3B82F6" }],
        markerColor: "#3B82F6",
      },
    ];
    const groups: EndpointLabelData[] = [];
    const toleranceSquared = (visualScale.span * 1e-7) ** 2;
    for (const candidate of candidates) {
      const existing = groups.find(
        (group) =>
          distanceSquared(group.point, candidate.point) <= toleranceSquared,
      );
      if (existing) {
        existing.labels.push(...candidate.labels);
        if (existing.markerColor !== candidate.markerColor) {
          existing.markerColor = "#FFFFFF";
        }
      } else {
        groups.push({ ...candidate, labels: [...candidate.labels] });
      }
    }
    return groups;
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

      {angleGuide && measurement.angleDegrees !== null && (
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
            zIndexRange={[20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span className="whitespace-nowrap rounded border border-white/50 bg-black/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow">
              {measurement.angleDegrees.toFixed(1)}° acute
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
