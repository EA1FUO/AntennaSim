/**
 * Geometry helpers for measuring the relationship between two finite wires.
 * Coordinates use the NEC2 convention: X=east, Y=north, Z=up.
 */

export interface MeasurementPoint {
  x: number;
  y: number;
  z: number;
}

export interface MeasurableWire {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
}

export interface WireMeasurement {
  /** Closest point on the first selected wire. */
  firstPoint: MeasurementPoint;
  /** Closest point on the second selected wire. */
  secondPoint: MeasurementPoint;
  /** Signed offset from firstPoint to secondPoint in NEC2 coordinates. */
  delta: MeasurementPoint;
  /** Shortest distance between the two finite wire segments. */
  distance: number;
  /** Acute angle between the wire axes, or null for a zero-length wire. */
  angleDegrees: number | null;
}

const EPSILON = 1e-12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function subtract(a: MeasurementPoint, b: MeasurementPoint): MeasurementPoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled(
  point: MeasurementPoint,
  direction: MeasurementPoint,
  scale: number,
): MeasurementPoint {
  return {
    x: point.x + direction.x * scale,
    y: point.y + direction.y * scale,
    z: point.z + direction.z * scale,
  };
}

function dot(a: MeasurementPoint, b: MeasurementPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lengthSquared(vector: MeasurementPoint): number {
  return dot(vector, vector);
}

function wireEndpoints(wire: MeasurableWire): [MeasurementPoint, MeasurementPoint] {
  return [
    { x: wire.x1, y: wire.y1, z: wire.z1 },
    { x: wire.x2, y: wire.y2, z: wire.z2 },
  ];
}

/**
 * Return the closest points on two finite 3D line segments.
 *
 * This handles parallel, skew, intersecting, and degenerate segments. The
 * parameters are clamped to [0, 1], so the result always lies on each wire.
 */
function closestPointsOnSegments(
  firstStart: MeasurementPoint,
  firstEnd: MeasurementPoint,
  secondStart: MeasurementPoint,
  secondEnd: MeasurementPoint,
): [MeasurementPoint, MeasurementPoint] {
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const betweenStarts = subtract(firstStart, secondStart);
  const firstLengthSquared = lengthSquared(firstDirection);
  const secondLengthSquared = lengthSquared(secondDirection);

  if (firstLengthSquared <= EPSILON && secondLengthSquared <= EPSILON) {
    return [firstStart, secondStart];
  }

  if (firstLengthSquared <= EPSILON) {
    const secondParameter = clamp(
      dot(secondDirection, betweenStarts) / secondLengthSquared,
      0,
      1,
    );
    return [firstStart, addScaled(secondStart, secondDirection, secondParameter)];
  }

  if (secondLengthSquared <= EPSILON) {
    const firstParameter = clamp(
      -dot(firstDirection, betweenStarts) / firstLengthSquared,
      0,
      1,
    );
    return [addScaled(firstStart, firstDirection, firstParameter), secondStart];
  }

  const directionDot = dot(firstDirection, secondDirection);
  const firstStartDot = dot(firstDirection, betweenStarts);
  const secondStartDot = dot(secondDirection, betweenStarts);
  const denominator =
    firstLengthSquared * secondLengthSquared - directionDot * directionDot;

  let firstNumerator = denominator;
  let firstDenominator = denominator;
  let secondNumerator = denominator;
  let secondDenominator = denominator;

  if (denominator <= EPSILON) {
    // Nearly parallel: anchor the first point and solve on the second wire.
    firstNumerator = 0;
    firstDenominator = 1;
    secondNumerator = secondStartDot;
    secondDenominator = secondLengthSquared;
  } else {
    firstNumerator =
      directionDot * secondStartDot - secondLengthSquared * firstStartDot;
    secondNumerator =
      firstLengthSquared * secondStartDot - directionDot * firstStartDot;

    if (firstNumerator < 0) {
      firstNumerator = 0;
      secondNumerator = secondStartDot;
      secondDenominator = secondLengthSquared;
    } else if (firstNumerator > firstDenominator) {
      firstNumerator = firstDenominator;
      secondNumerator = secondStartDot + directionDot;
      secondDenominator = secondLengthSquared;
    }
  }

  if (secondNumerator < 0) {
    secondNumerator = 0;
    if (-firstStartDot < 0) {
      firstNumerator = 0;
    } else if (-firstStartDot > firstLengthSquared) {
      firstNumerator = firstDenominator;
    } else {
      firstNumerator = -firstStartDot;
      firstDenominator = firstLengthSquared;
    }
  } else if (secondNumerator > secondDenominator) {
    secondNumerator = secondDenominator;
    const endpointProjection = -firstStartDot + directionDot;
    if (endpointProjection < 0) {
      firstNumerator = 0;
    } else if (endpointProjection > firstLengthSquared) {
      firstNumerator = firstDenominator;
    } else {
      firstNumerator = endpointProjection;
      firstDenominator = firstLengthSquared;
    }
  }

  const firstParameter =
    Math.abs(firstNumerator) <= EPSILON
      ? 0
      : firstNumerator / firstDenominator;
  const secondParameter =
    Math.abs(secondNumerator) <= EPSILON
      ? 0
      : secondNumerator / secondDenominator;

  return [
    addScaled(firstStart, firstDirection, firstParameter),
    addScaled(secondStart, secondDirection, secondParameter),
  ];
}

function cleanNearZero(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}

/** Calculate closest spacing, axis offsets, and angle for two wires. */
export function measureWires(
  firstWire: MeasurableWire,
  secondWire: MeasurableWire,
): WireMeasurement {
  const [firstStart, firstEnd] = wireEndpoints(firstWire);
  const [secondStart, secondEnd] = wireEndpoints(secondWire);
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const [firstPoint, secondPoint] = closestPointsOnSegments(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd,
  );

  const rawDelta = subtract(secondPoint, firstPoint);
  const delta = {
    x: cleanNearZero(rawDelta.x),
    y: cleanNearZero(rawDelta.y),
    z: cleanNearZero(rawDelta.z),
  };
  const distance = Math.sqrt(lengthSquared(delta));

  const firstLengthSquared = lengthSquared(firstDirection);
  const secondLengthSquared = lengthSquared(secondDirection);
  let angleDegrees: number | null = null;
  if (firstLengthSquared > EPSILON && secondLengthSquared > EPSILON) {
    // Wires have no intrinsic forward direction, so use the acute angle.
    const cosine = clamp(
      Math.abs(dot(firstDirection, secondDirection)) /
        Math.sqrt(firstLengthSquared * secondLengthSquared),
      0,
      1,
    );
    angleDegrees = (Math.acos(cosine) * 180) / Math.PI;
  }

  return {
    firstPoint,
    secondPoint,
    delta,
    distance,
    angleDegrees,
  };
}

/** Advance the tap/click selection used by the measurement tool. */
export function advanceWireMeasurementSelection(
  selectedTags: readonly number[],
  tag: number,
): number[] {
  if (selectedTags.length === 0) return [tag];
  if (selectedTags.length === 1) {
    return selectedTags[0] === tag ? [] : [selectedTags[0]!, tag];
  }
  return [tag];
}
