/**
 * Tests for the pre-simulation validation engine.
 */

import { describe, it, expect } from "vitest";
import { validateSimulationRequest } from "../validation";
import type { WireGeometry, Excitation, GroundConfig, FrequencyRange } from "../../templates/types";

// Helpers to build test data
function wire(overrides: Partial<WireGeometry> = {}): WireGeometry {
  return {
    tag: 1,
    x1: 0, y1: 0, z1: 10,
    x2: 10, y2: 0, z2: 10,
    segments: 11,
    radius: 0.001,
    ...overrides,
  };
}

function exc(overrides: Partial<Excitation> = {}): Excitation {
  return {
    wire_tag: 1,
    segment: 6,
    voltage_real: 1,
    voltage_imag: 0,
    ...overrides,
  };
}

const ground: GroundConfig = { type: "average" };
const freeSpace: GroundConfig = { type: "free_space" };
const freq: FrequencyRange = { start_mhz: 13.5, stop_mhz: 15.0, steps: 31 };

describe("validateSimulationRequest", () => {
  it("returns valid for a correct basic setup", () => {
    const result = validateSimulationRequest([wire()], [exc()], ground, freq);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it("detects no wires", () => {
    const result = validateSimulationRequest([], [exc()], ground, freq);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "no_wires")).toBe(true);
  });

  it("detects no excitation", () => {
    const result = validateSimulationRequest([wire()], [], ground, freq);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "no_excitation")).toBe(true);
  });

  it("detects excitation referencing non-existent wire", () => {
    const result = validateSimulationRequest([wire()], [exc({ wire_tag: 99 })], ground, freq);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "excitation_orphan")).toBe(true);
  });

  it("detects excitation segment out of range", () => {
    const result = validateSimulationRequest(
      [wire({ segments: 5 })],
      [exc({ segment: 10 })],
      ground, freq
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "excitation_segment_range")).toBe(true);
  });

  it("detects zero-length wire", () => {
    const result = validateSimulationRequest(
      [wire({ x1: 5, y1: 0, z1: 10, x2: 5, y2: 0, z2: 10 })],
      [exc()],
      ground, freq
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "zero_length_wire")).toBe(true);
  });

  it("warns about segments too long for frequency", () => {
    // 10m wire at 300 MHz => wavelength = 1m, lambda/10 = 0.1m
    // 3 segments => 3.33m per segment, way too long
    const result = validateSimulationRequest(
      [wire({ segments: 3 })],
      [exc()],
      ground,
      { start_mhz: 280, stop_mhz: 300, steps: 10 }
    );
    expect(result.issues.some((i) => i.code === "segment_too_long")).toBe(true);
  });

  it("warns about radius too large relative to segment length", () => {
    // 1m wire, 5 segments => 0.2m per segment, radius > 0.1m
    const result = validateSimulationRequest(
      [wire({ x2: 1, segments: 5, radius: 0.15 })],
      [exc()],
      ground, freq
    );
    expect(result.issues.some((i) => i.code === "radius_too_large")).toBe(true);
  });

  it("detects wires below ground with non-free-space ground", () => {
    const result = validateSimulationRequest(
      [wire({ z1: -1, z2: -1 })],
      [exc()],
      ground, freq
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "wires_below_ground")).toBe(true);
  });

  it("allows wires below Z=0 in free space", () => {
    const result = validateSimulationRequest(
      [wire({ z1: -5, z2: -5 })],
      [exc()],
      freeSpace, freq
    );
    expect(result.issues.some((i) => i.code === "wires_below_ground")).toBe(false);
  });

  it("warns about all wires at ground level", () => {
    const result = validateSimulationRequest(
      [wire({ z1: 0, z2: 0 })],
      [exc()],
      ground, freq
    );
    expect(result.issues.some((i) => i.code === "all_wires_at_ground")).toBe(true);
  });

  it("warns about high segment count", () => {
    // 100 wires each with 25 segments = 2500 total
    const wires = Array.from({ length: 100 }, (_, i) =>
      wire({ tag: i + 1, segments: 25 })
    );
    const result = validateSimulationRequest(wires, [exc()], ground, freq);
    expect(result.issues.some((i) => i.code === "high_segment_count")).toBe(true);
  });

  it("detects invalid frequency range", () => {
    const result = validateSimulationRequest(
      [wire()], [exc()], ground,
      { start_mhz: 15, stop_mhz: 13, steps: 10 }
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "frequency_range_invalid")).toBe(true);
  });

  it("detects overlapping wires", () => {
    const w1 = wire({ tag: 1 });
    const w2 = wire({ tag: 2 }); // identical endpoints
    const result = validateSimulationRequest(
      [w1, w2],
      [exc()],
      ground, freq
    );
    expect(result.issues.some((i) => i.code === "overlapping_wires")).toBe(true);
  });

  it("sorts errors before warnings", () => {
    // no_excitation (error) + all_wires_at_ground (warning)
    const result = validateSimulationRequest(
      [wire({ z1: 0, z2: 0 })],
      [],
      ground, freq
    );
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues[0]!.severity).toBe("error");
  });
});
