import { describe, expect, it } from "vitest";
import type { MeasurableWire } from "../wire-measurement";
import {
  createWireAngleGuide,
  createWireEndpointLabels,
  shouldShowWireAngleGuide,
} from "../wire-measurement-visuals";

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

describe("createWireAngleGuide", () => {
  it("anchors a fan-antenna angle at the shared feed point", () => {
    const guide = createWireAngleGuide(
      wire([0, 0, 0], [2, 0, 0]),
      wire([0, 0, 0], [1, Math.sqrt(3), 0]),
      2,
    );

    expect(guide).not.toBeNull();
    expect(guide!.anchor).toEqual({ x: 0, y: 0, z: 0 });
    expect(guide!.angleDegrees).toBeCloseTo(60);
    expect(guide!.arc.length).toBeGreaterThan(2);
  });

  it("returns no guide when either wire has zero length", () => {
    const guide = createWireAngleGuide(
      wire([0, 0, 0], [0, 0, 0]),
      wire([0, 0, 0], [1, 0, 0]),
      1,
    );

    expect(guide).toBeNull();
  });

  it("flips a reversed wire direction to depict the acute axis angle", () => {
    const guide = createWireAngleGuide(
      wire([0, 0, 0], [2, 0, 0]),
      wire([0, 0, 0], [-1, -1, 0]),
      2,
    );

    expect(guide).not.toBeNull();
    expect(guide!.angleDegrees).toBeCloseTo(45);
    const secondAxisDirection = {
      x: guide!.secondAxis[1].x - guide!.secondAxis[0].x,
      y: guide!.secondAxis[1].y - guide!.secondAxis[0].y,
    };
    expect(secondAxisDirection.x).toBeGreaterThan(0);
    expect(secondAxisDirection.y).toBeGreaterThan(0);
  });
});

describe("createWireEndpointLabels", () => {
  it("merges shared fan endpoints and preserves both label colors", () => {
    const labels = createWireEndpointLabels(
      wire([0, 0, 0], [2, 0, 0]),
      wire([0, 0, 0], [1, 1, 0]),
      1e-7,
    );

    expect(labels).toHaveLength(3);
    expect(labels[0]!.labels.map((label) => label.text)).toEqual(["1A", "2A"]);
    expect(labels[0]!.labels.map((label) => label.color)).toEqual([
      "#F59E0B",
      "#3B82F6",
    ]);
    expect(labels[0]!.markerColor).toBe("#FFFFFF");
  });

  it("keeps distinct endpoints in separate badges", () => {
    const labels = createWireEndpointLabels(
      wire([0, 0, 0], [1, 0, 0]),
      wire([0, 1, 0], [1, 1, 0]),
      1e-7,
    );

    expect(labels).toHaveLength(4);
  });

  it("groups all labels when both selected wires are the same point", () => {
    const labels = createWireEndpointLabels(
      wire([1, 2, 3], [1, 2, 3]),
      wire([1, 2, 3], [1, 2, 3]),
      1e-7,
    );

    expect(labels).toHaveLength(1);
    expect(labels[0]!.labels.map((label) => label.text)).toEqual([
      "1A",
      "1B",
      "2A",
      "2B",
    ]);
    expect(labels[0]!.markerColor).toBe("#FFFFFF");
  });
});

describe("shouldShowWireAngleGuide", () => {
  it("hides unavailable and displayed-zero angles", () => {
    expect(shouldShowWireAngleGuide(null)).toBe(false);
    expect(shouldShowWireAngleGuide(0)).toBe(false);
    expect(shouldShowWireAngleGuide(0.049)).toBe(false);
    expect(shouldShowWireAngleGuide(0.05)).toBe(true);
  });
});
