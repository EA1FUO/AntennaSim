import {
  computeCameraFrame,
  computeWireBBox,
  createVisualScale,
  getAntennaSpan,
} from "../visualScale";
import { dipoleTemplate } from "../../../templates/dipole";
import { wireGeometryToWireData } from "../../../templates/types";

describe("visual scale", () => {
  it("keeps a 2 GHz dipole readable without making wires bulky", () => {
    const wires = wireGeometryToWireData(
      dipoleTemplate.generateGeometry({
        frequency: 2000,
        height: 0.5,
        wire_diameter: 2,
      }),
    );
    const scale = createVisualScale(wires);
    const renderedRadius = scale.wireRadius(wires[0]!.radius);

    expect(scale.span).toBeCloseTo(0.07125, 6);
    expect((renderedRadius * 2) / scale.span).toBeLessThan(0.04);
    expect(scale.markerRadius).toBeGreaterThan(renderedRadius * 2);
    expect(scale.currentRadius / scale.span).toBe(0.006);
  });

  it("provides a scene-relative visibility floor for large thin wires", () => {
    const wires = [
      {
        tag: 1,
        segments: 11,
        x1: -5,
        y1: 0,
        z1: 10,
        x2: 5,
        y2: 0,
        z2: 10,
        radius: 0.0001,
      },
    ];
    const scale = createVisualScale(wires);

    expect(scale.wireRadius(wires[0]!.radius)).toBeCloseTo(0.02, 8);
  });

  it("keeps the feedpoint marker outside the thickest rendered wire", () => {
    const wires = [
      {
        tag: 1,
        segments: 11,
        x1: 0,
        y1: 0,
        z1: 0,
        x2: 0.05,
        y2: 0,
        z2: 0,
        radius: 0.01,
      },
    ];
    const scale = createVisualScale(wires);

    expect(scale.markerRadius).toBeGreaterThan(
      scale.wireRadius(wires[0]!.radius) * 2,
    );
  });

  it("depends on antenna dimensions rather than absolute position", () => {
    const atOrigin = [
      {
        tag: 1,
        segments: 5,
        x1: 0,
        y1: 0,
        z1: 0,
        x2: 0.1,
        y2: 0,
        z2: 0,
        radius: 0.0005,
      },
    ];
    const translated = atOrigin.map((wire) => ({
      ...wire,
      x1: wire.x1 + 100,
      x2: wire.x2 + 100,
      z1: wire.z1 + 50,
      z2: wire.z2 + 50,
    }));

    expect(getAntennaSpan(translated)).toBeCloseTo(getAntennaSpan(atOrigin), 10);
  });

  it("uses a tight scale-aware junction tolerance", () => {
    const wires = [
      {
        tag: 1,
        segments: 5,
        x1: 0,
        y1: 0,
        z1: 0,
        x2: 0.1,
        y2: 0,
        z2: 0,
        radius: 0.0005,
      },
    ];

    expect(createVisualScale(wires).junctionTolerance).toBeLessThan(0.000001);
  });

  it("frames nearby ground but prioritizes a tiny elevated antenna", () => {
    const nearby = [
      {
        tag: 1,
        segments: 5,
        x1: 0,
        y1: 0,
        z1: 0.1,
        x2: 0.1,
        y2: 0,
        z2: 0.1,
        radius: 0.0005,
      },
    ];
    const elevated = nearby.map((wire) => ({ ...wire, z1: 10, z2: 10 }));

    expect(computeWireBBox(nearby, true).min.y).toBeLessThan(0);
    expect(computeWireBBox(elevated, true).min.y).toBeGreaterThan(9);
  });

  it("computes a full-scene camera frame for a 0.5 MHz dipole", () => {
    const wires = wireGeometryToWireData(
      dipoleTemplate.generateGeometry({
        frequency: 0.5,
        height: 10,
        wire_diameter: 2,
      }),
    );
    const span = getAntennaSpan(wires);
    const frame = computeCameraFrame(computeWireBBox(wires, true), span);

    expect(span).toBeCloseTo(285, 6);
    expect(frame.distance).toBeGreaterThan(span * 2);
    expect(frame.center.x).toBeCloseTo(0, 10);
    expect(createVisualScale(wires).fogNear).toBeGreaterThan(span * 2.5);
    expect(createVisualScale(wires).fogFar).toBeGreaterThan(span * 9);
  });
});
