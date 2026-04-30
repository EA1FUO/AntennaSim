/**
 * Tests for ham band definitions and analysis utilities.
 *
 * Why these tests matter:
 * - Wrong band edges mean SWR charts show markers at wrong frequencies
 * - Band analysis drives the multi-band results tab — wrong mapping = misleading performance ratings
 * - Region filtering affects which bands appear for EU vs US users
 */

import {
  HAM_BANDS,
  getBandsForRegion,
  getBandEdges,
  bandToFrequencyRange,
  bandToSegment,
  hasBandSegment,
  removeBandSegment,
  computeSteps,
  analyzeBandPerformance,
} from "../ham-bands";
import type { FrequencySegment } from "../../templates/types";
import type { FrequencyResult } from "../../api/nec";

// ---------------------------------------------------------------------------
// Band data integrity
// ---------------------------------------------------------------------------

describe("Ham band definitions", () => {
  it("has at least 13 bands defined", () => {
    expect(HAM_BANDS.length).toBeGreaterThanOrEqual(13);
  });

  it("every band has start < stop and center within range", () => {
    for (const b of HAM_BANDS) {
      expect(b.start_mhz).toBeLessThan(b.stop_mhz);
      expect(b.center_mhz).toBeGreaterThanOrEqual(b.start_mhz);
      expect(b.center_mhz).toBeLessThanOrEqual(b.stop_mhz);
    }
  });

  it("every band has a non-empty label and name", () => {
    for (const b of HAM_BANDS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.name.length).toBeGreaterThan(0);
    }
  });

  it("bands are ordered by frequency", () => {
    for (let i = 1; i < HAM_BANDS.length; i++) {
      expect(HAM_BANDS[i]!.start_mhz).toBeGreaterThanOrEqual(HAM_BANDS[i - 1]!.start_mhz);
    }
  });
});

// ---------------------------------------------------------------------------
// Region filtering
// ---------------------------------------------------------------------------

describe("getBandsForRegion", () => {
  it("Region 1 includes 80m R1 but not 80m R2", () => {
    const r1 = getBandsForRegion("r1");
    const band80 = r1.filter((b) => b.label === "80m");
    expect(band80).toHaveLength(1);
    expect(band80[0]!.stop_mhz).toBe(3.8); // R1 stops at 3.8
  });

  it("Region 2 includes 80m R2 with wider allocation", () => {
    const r2 = getBandsForRegion("r2");
    const band80 = r2.filter((b) => b.label === "80m");
    expect(band80).toHaveLength(1);
    expect(band80[0]!.stop_mhz).toBe(4.0); // R2 stops at 4.0
  });

  it("Region 1 has 40m ending at 7.2 MHz", () => {
    const r1 = getBandsForRegion("r1");
    const band40 = r1.filter((b) => b.label === "40m");
    expect(band40).toHaveLength(1);
    expect(band40[0]!.stop_mhz).toBe(7.2);
  });

  it("all worldwide bands appear in every region", () => {
    const allBands = HAM_BANDS.filter((b) => b.region === "all");
    for (const region of ["r1", "r2", "r3"] as const) {
      const regionBands = getBandsForRegion(region);
      for (const ab of allBands) {
        expect(regionBands).toContainEqual(ab);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Band edges (for SWRChart)
// ---------------------------------------------------------------------------

describe("getBandEdges", () => {
  it("returns one entry per band label for Region 1", () => {
    const edges = getBandEdges("r1");
    const labels = edges.map((e) => e.name);
    // No duplicate labels
    expect(new Set(labels).size).toBe(labels.length);
    expect(edges.length).toBeGreaterThanOrEqual(13);
  });
});

// ---------------------------------------------------------------------------
// computeSteps — adaptive sweep resolution
// ---------------------------------------------------------------------------

describe("computeSteps", () => {
  it("narrow range (50 kHz) gets at least 21 steps", () => {
    expect(computeSteps(10.1, 10.15)).toBe(21);
  });

  it("medium range (350 kHz) gets proportional steps", () => {
    const steps = computeSteps(14.0, 14.35);
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(steps).toBeLessThanOrEqual(21);
  });

  it("wide range (1.7 MHz) gets more steps", () => {
    const steps = computeSteps(28.0, 29.7);
    expect(steps).toBeGreaterThan(30);
    expect(steps).toBeLessThanOrEqual(101);
  });

  it("very wide range (30+ MHz) is capped at 101", () => {
    expect(computeSteps(420, 450)).toBe(101);
  });

  it("zero-width range returns 21 (minimum)", () => {
    expect(computeSteps(14.0, 14.0)).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// bandToFrequencyRange
// ---------------------------------------------------------------------------

describe("bandToFrequencyRange", () => {
  it("20m band: 14.0–14.35 MHz with reasonable step count", () => {
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    const range = bandToFrequencyRange(band);
    expect(range.start_mhz).toBe(14.0);
    expect(range.stop_mhz).toBe(14.35);
    expect(range.steps).toBeGreaterThanOrEqual(21);
    expect(range.steps).toBeLessThanOrEqual(101);
  });

  it("narrow 30m band: still has at least 21 steps", () => {
    const band = HAM_BANDS.find((b) => b.label === "30m")!;
    const range = bandToFrequencyRange(band);
    expect(range.steps).toBeGreaterThanOrEqual(21);
  });

  it("wide 10m band: capped at 101 steps", () => {
    const band = HAM_BANDS.find((b) => b.label === "10m")!;
    const range = bandToFrequencyRange(band);
    expect(range.steps).toBeLessThanOrEqual(101);
  });
});

// ---------------------------------------------------------------------------
// Multi-segment helpers
// ---------------------------------------------------------------------------

describe("bandToSegment", () => {
  it("converts a band to a FrequencySegment with label", () => {
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    const seg = bandToSegment(band);
    expect(seg.start_mhz).toBe(14.0);
    expect(seg.stop_mhz).toBe(14.35);
    expect(seg.label).toBe("20m");
    expect(seg.steps).toBeGreaterThanOrEqual(21);
  });
});

describe("hasBandSegment", () => {
  it("returns true when segment matches band", () => {
    const segments: FrequencySegment[] = [
      { start_mhz: 14.0, stop_mhz: 14.35, steps: 15, label: "20m" },
    ];
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    expect(hasBandSegment(segments, band)).toBe(true);
  });

  it("returns false when no segment matches", () => {
    const segments: FrequencySegment[] = [
      { start_mhz: 7.0, stop_mhz: 7.2, steps: 11, label: "40m" },
    ];
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    expect(hasBandSegment(segments, band)).toBe(false);
  });

  it("returns false for empty segments", () => {
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    expect(hasBandSegment([], band)).toBe(false);
  });
});

describe("removeBandSegment", () => {
  it("removes the matching segment", () => {
    const segments: FrequencySegment[] = [
      { start_mhz: 14.0, stop_mhz: 14.35, steps: 15, label: "20m" },
      { start_mhz: 21.0, stop_mhz: 21.45, steps: 20, label: "15m" },
    ];
    const band = HAM_BANDS.find((b) => b.label === "20m" && b.region === "all")!;
    const result = removeBandSegment(segments, band);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("15m");
  });

  it("returns same array when no match found", () => {
    const segments: FrequencySegment[] = [
      { start_mhz: 14.0, stop_mhz: 14.35, steps: 15, label: "20m" },
    ];
    const band = HAM_BANDS.find((b) => b.label === "40m" && b.region === "r1")!;
    const result = removeBandSegment(segments, band);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeBandPerformance
// ---------------------------------------------------------------------------

describe("analyzeBandPerformance", () => {
  // Helper to create a minimal FrequencyResult.
  // Impedance is derived from the target SWR so that applyMatching
  // with default matching (50Ω, 1:1) reproduces the expected SWR.
  function makeResult(freq: number, swr: number, gain: number): FrequencyResult {
    // For a pure-real impedance: R = swr * Z0 gives the desired SWR
    const impedanceReal = swr * 50;
    return {
      frequency_mhz: freq,
      impedance: { real: impedanceReal, imag: 0 },
      swr_50: swr,
      gain_max_dbi: gain,
      gain_max_theta: 0,
      gain_max_phi: 0,
      front_to_back_db: null,
      beamwidth_e_deg: null,
      beamwidth_h_deg: null,
      efficiency_percent: 100,
      pattern: null,
      currents: null,
    };
  }

  it("marks bands as not_simulated when no data points exist", () => {
    const results = [makeResult(14.1, 1.5, 2.15)]; // Only 20m
    const analysis = analyzeBandPerformance(results, "r1");
    const band40 = analysis.find((a) => a.band.label === "40m")!;
    expect(band40.simulated).toBe(false);
    expect(band40.quality).toBe("not_simulated");
  });

  it("correctly identifies excellent SWR < 1.5", () => {
    const results = [
      makeResult(14.0, 1.3, 2.15),
      makeResult(14.1, 1.1, 2.15),
      makeResult(14.2, 1.4, 2.15),
      makeResult(14.35, 1.8, 2.15),
    ];
    const analysis = analyzeBandPerformance(results, "r1");
    const band20 = analysis.find((a) => a.band.label === "20m")!;
    expect(band20.simulated).toBe(true);
    expect(band20.quality).toBe("excellent");
    expect(band20.minSwr).toBeCloseTo(1.1, 1);
    expect(band20.minSwrFreqMhz).toBeCloseTo(14.1, 1);
  });

  it("computes usable bandwidth correctly", () => {
    const results = [
      makeResult(14.0, 2.5, 2.0),  // Above threshold
      makeResult(14.1, 1.8, 2.15), // Below threshold
      makeResult(14.2, 1.5, 2.15), // Below threshold
      makeResult(14.3, 1.9, 2.15), // Below threshold
      makeResult(14.35, 3.0, 2.0), // Above threshold
    ];
    const analysis = analyzeBandPerformance(results, "r1", 2.0);
    const band20 = analysis.find((a) => a.band.label === "20m")!;
    expect(band20.usableBandwidthKhz).toBe(200); // 14.1 to 14.3 = 200 kHz
  });

  it("computes average and peak gain", () => {
    const results = [
      makeResult(14.0, 1.5, 2.0),
      makeResult(14.175, 1.3, 2.5),
      makeResult(14.35, 1.8, 1.5),
    ];
    const analysis = analyzeBandPerformance(results, "r1");
    const band20 = analysis.find((a) => a.band.label === "20m")!;
    expect(band20.peakGainDbi).toBe(2.5);
    expect(band20.avgGainDbi).toBeCloseTo(2.0, 1);
  });

  it("returns all bands for the region", () => {
    const analysis = analyzeBandPerformance([], "r1");
    // Should have all R1 bands even with no data
    const r1Count = getBandsForRegion("r1").length;
    expect(analysis).toHaveLength(r1Count);
  });
});
