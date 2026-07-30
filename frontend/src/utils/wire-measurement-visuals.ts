import {
  measureWires,
  type MeasurableWire,
  type MeasurementPoint,
} from "./wire-measurement";

export const FIRST_MEASUREMENT_COLOR = "#F59E0B";
export const SECOND_MEASUREMENT_COLOR = "#3B82F6";

export interface WireAngleGuide {
  anchor: MeasurementPoint;
  firstAxis: [MeasurementPoint, MeasurementPoint];
  secondAxis: [MeasurementPoint, MeasurementPoint];
  arc: MeasurementPoint[];
  labelPoint: MeasurementPoint;
  angleDegrees: number;
}

export interface WireEndpointLabel {
  point: MeasurementPoint;
  labels: Array<{ text: string; color: string }>;
  markerColor: string;
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
  return length > 0 ? scale(point, 1 / length) : null;
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

/**
 * Build the in-scene representation of the acute angle between two wire axes.
 * The guide is always anchored at the finite segments' closest approach, so it
 * remains stable while the user changes the point pair used for distance.
 */
export function createWireAngleGuide(
  firstWire: MeasurableWire,
  secondWire: MeasurableWire,
  span: number,
): WireAngleGuide | null {
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

  const closestMeasurement = measureWires(firstWire, secondWire, "closest");
  if (closestMeasurement.angleDegrees === null) return null;

  // Wire axes have no forward direction. Flip the second direction so the
  // visual depicts the same acute angle reported by measureWires().
  if (dot(firstDirection, secondDirection) < 0) {
    secondDirection = scale(secondDirection, -1);
  }

  const anchor = midpoint(
    closestMeasurement.firstPoint,
    closestMeasurement.secondPoint,
  );
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

  const angleRadians = (closestMeasurement.angleDegrees * Math.PI) / 180;
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
    anchor,
    firstAxis,
    secondAxis,
    arc,
    labelPoint: add(anchor, scale(labelDirection, arcRadius * 1.35)),
    angleDegrees: closestMeasurement.angleDegrees,
  };
}

/** Group coincident endpoint badges while preserving each wire's color. */
export function createWireEndpointLabels(
  firstWire: MeasurableWire,
  secondWire: MeasurableWire,
  tolerance: number,
): WireEndpointLabel[] {
  const candidates: WireEndpointLabel[] = [
    {
      point: { x: firstWire.x1, y: firstWire.y1, z: firstWire.z1 },
      labels: [{ text: "1A", color: FIRST_MEASUREMENT_COLOR }],
      markerColor: FIRST_MEASUREMENT_COLOR,
    },
    {
      point: { x: firstWire.x2, y: firstWire.y2, z: firstWire.z2 },
      labels: [{ text: "1B", color: FIRST_MEASUREMENT_COLOR }],
      markerColor: FIRST_MEASUREMENT_COLOR,
    },
    {
      point: { x: secondWire.x1, y: secondWire.y1, z: secondWire.z1 },
      labels: [{ text: "2A", color: SECOND_MEASUREMENT_COLOR }],
      markerColor: SECOND_MEASUREMENT_COLOR,
    },
    {
      point: { x: secondWire.x2, y: secondWire.y2, z: secondWire.z2 },
      labels: [{ text: "2B", color: SECOND_MEASUREMENT_COLOR }],
      markerColor: SECOND_MEASUREMENT_COLOR,
    },
  ];
  const groups: WireEndpointLabel[] = [];
  const toleranceSquared = tolerance * tolerance;

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
}

/** Match viewport visibility to the one-decimal angle shown in the panel. */
export function shouldShowWireAngleGuide(angleDegrees: number | null): boolean {
  return angleDegrees !== null && Math.round(angleDegrees * 10) > 0;
}
