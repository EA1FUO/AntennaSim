import { describe, expect, it } from "vitest";
import {
  advanceWireMeasurementSelection,
  measureWires,
} from "../wire-measurement";
import type { MeasurableWire } from "../wire-measurement";

function wire(
  start: [number, number, number],
  end: [number, number, number],
): MeasurableWire {
  return {
    x1: start[0],
    y1: start[1],
    z1: start[2],
    x2: end[0],
    y2: end[1],
    z2: end[2],
  };
}

describe("measureWires", () => {
  it("measures parallel Yagi-style element spacing", () => {
    const result = measureWires(
      wire([-5, 0, 10], [5, 0, 10]),
      wire([-4, 2, 10], [4, 2, 10]),
    );

    expect(result.distance).toBeCloseTo(2);
    expect(result.delta).toEqual({ x: 0, y: 2, z: 0 });
    expect(result.angleDegrees).toBeCloseTo(0);
  });

  it("finds the intersection and angle of perpendicular wires", () => {
    const result = measureWires(
      wire([-1, 0, 0], [1, 0, 0]),
      wire([0, -1, 0], [0, 1, 0]),
    );

    expect(result.distance).toBeCloseTo(0);
    expect(result.firstPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.secondPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.angleDegrees).toBeCloseTo(90);
  });

  it("keeps closest-point results invariant at millimetre scale", () => {
    const result = measureWires(
      wire([-0.0005, 0, 0], [0.0005, 0, 0]),
      wire([0, -0.0005, 0], [0, 0.0005, 0]),
    );

    expect(result.distance).toBeCloseTo(0, 12);
    expect(result.firstPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.secondPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.angleDegrees).toBeCloseTo(90);
  });

  it("preserves sub-millimetre spacing instead of cleaning it to zero", () => {
    const result = measureWires(
      wire([-0.0005, 0, 0], [0.0005, 0, 0]),
      wire([-0.0005, 0.000001, 0], [0.0005, 0.000001, 0]),
    );

    expect(result.distance).toBeCloseTo(0.000001, 12);
    expect(result.delta).toEqual({ x: 0, y: 0.000001, z: 0 });
  });

  it("measures the closest points of skew wires", () => {
    const result = measureWires(
      wire([0, 0, 0], [2, 0, 0]),
      wire([1, -1, 3], [1, 1, 3]),
    );

    expect(result.firstPoint).toEqual({ x: 1, y: 0, z: 0 });
    expect(result.secondPoint).toEqual({ x: 1, y: 0, z: 3 });
    expect(result.delta).toEqual({ x: 0, y: 0, z: 3 });
    expect(result.distance).toBeCloseTo(3);
    expect(result.angleDegrees).toBeCloseTo(90);
  });

  it("clamps closest points to the finite wire endpoints", () => {
    const result = measureWires(
      wire([0, 0, 0], [1, 0, 0]),
      wire([3, 2, 0], [3, 3, 0]),
    );

    expect(result.firstPoint).toEqual({ x: 1, y: 0, z: 0 });
    expect(result.secondPoint).toEqual({ x: 3, y: 2, z: 0 });
    expect(result.delta).toEqual({ x: 2, y: 2, z: 0 });
    expect(result.distance).toBeCloseTo(Math.sqrt(8));
  });

  it("treats opposite wire directions as parallel", () => {
    const result = measureWires(
      wire([0, 0, 0], [2, 0, 0]),
      wire([2, 1, 0], [0, 1, 0]),
    );

    expect(result.angleDegrees).toBeCloseTo(0);
  });

  it("handles a zero-length wire without inventing an angle", () => {
    const result = measureWires(
      wire([0, 0, 0], [0, 0, 0]),
      wire([2, -1, 0], [2, 1, 0]),
    );

    expect(result.distance).toBeCloseTo(2);
    expect(result.angleDegrees).toBeNull();
  });

  it("measures the farthest endpoint pair", () => {
    const result = measureWires(
      wire([0, 0, 0], [2, 0, 0]),
      wire([0, 1, 0], [5, 1, 0]),
      "farthest",
    );

    expect(result.firstPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.secondPoint).toEqual({ x: 5, y: 1, z: 0 });
    expect(result.firstEndpoint).toBe("start");
    expect(result.secondEndpoint).toBe("end");
    expect(result.distance).toBeCloseTo(Math.sqrt(26));
  });

  it.each([
    ["start-start", { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    ["start-end", { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }],
    ["end-start", { x: 2, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    ["end-end", { x: 2, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }],
  ] as const)("measures the %s endpoint pair", (mode, firstPoint, secondPoint) => {
    const result = measureWires(
      wire([0, 0, 0], [2, 0, 0]),
      wire([10, 0, 0], [20, 0, 0]),
      mode,
    );

    expect(result.firstPoint).toEqual(firstPoint);
    expect(result.secondPoint).toEqual(secondPoint);
  });
});

describe("advanceWireMeasurementSelection", () => {
  it("selects two wires, deselects the first, and starts over after a result", () => {
    expect(advanceWireMeasurementSelection([], 3)).toEqual([3]);
    expect(advanceWireMeasurementSelection([3], 3)).toEqual([]);
    expect(advanceWireMeasurementSelection([3], 7)).toEqual([3, 7]);
    expect(advanceWireMeasurementSelection([3, 7], 9)).toEqual([9]);
  });
});
