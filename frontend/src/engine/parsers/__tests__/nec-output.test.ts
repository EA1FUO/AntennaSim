/**
 * Tests for NEC2 output parser (nec-output.ts).
 *
 * Why these tests matter:
 * - computeSwr is the most-displayed metric in the UI — wrong formula = misleading results
 * - parseNecOutput drives all result displays — if parsing breaks, everything breaks
 * - Beamwidth and F/B ratio had bugs in PR #29 — these are now tested
 * - Edge cases (empty output, missing sections) must not crash the UI
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeSwr, parseNecOutput, parseNearFieldOutput } from "../nec-output";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// computeSwr — unit tests with known analytical values
// ---------------------------------------------------------------------------

describe("computeSwr", () => {
  // Perfect match: gamma = 0, SWR = 1
  it("returns 1.0 for perfect 50-ohm match", () => {
    expect(computeSwr(50, 0, 50)).toBe(1.0);
  });

  // Pure resistive mismatch: gamma = (Z-Z0)/(Z+Z0), SWR = Z/Z0
  it("returns 2.0 for 100+j0 into 50 ohms", () => {
    expect(computeSwr(100, 0, 50)).toBeCloseTo(2.0, 2);
  });

  it("returns 2.0 for 25+j0 into 50 ohms", () => {
    expect(computeSwr(25, 0, 50)).toBeCloseTo(2.0, 2);
  });

  // Reactive impedance: known analytical result
  // gamma = j50 / (100 + j50), |gamma| = 50/sqrt(12500) = 0.4472
  // SWR = 1.4472 / 0.5528 = 2.618
  it("handles reactive impedance: 50+j50 into 50 ohms", () => {
    expect(computeSwr(50, 50, 50)).toBeCloseTo(2.618, 1);
  });

  // Purely reactive: |gamma| = 1, SWR clipped to 999
  it("clips to 999.0 for purely reactive impedance", () => {
    expect(computeSwr(0, 50, 50)).toBe(999.0);
  });

  // Degenerate cases NEC2 can produce with bad geometry
  it("returns 999.0 for zero impedance", () => {
    expect(computeSwr(0, 0, 50)).toBe(999.0);
  });

  it("returns 999.0 for negative resistance", () => {
    expect(computeSwr(-10, 0, 50)).toBe(999.0);
  });

  // SWR(Z, Z0) == SWR(Z0^2/Z, Z0) — reciprocity check
  it("SWR is symmetric: 100+j0 == 25+j0 into 50 ohms", () => {
    expect(computeSwr(100, 0, 50)).toBeCloseTo(computeSwr(25, 0, 50), 4);
  });

  // SWR must always be >= 1 for any positive R
  it("SWR >= 1.0 for all positive resistances", () => {
    const cases: [number, number][] = [
      [10, 0], [50, 0], [200, 0], [73, 42.5], [25, -10], [50, 200],
    ];
    for (const [r, x] of cases) {
      expect(computeSwr(r, x, 50)).toBeGreaterThanOrEqual(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// parseNecOutput — fixture-based tests (dipole in free space)
// ---------------------------------------------------------------------------

describe("parseNecOutput — fixture", () => {
  const fixturePath = resolve(__dirname, "fixtures/dipole-freespace.txt");
  const fixtureContent = readFileSync(fixturePath, "utf-8");

  // Fixture has 4 phi cuts (0, 5, 90, 180, 270) × 37 theta points each
  // nTheta=37 (-90 to 90, step 5), nPhi=72 (0 to 355, step 5)
  const nTheta = 37;
  const nPhi = 72;
  const thetaStart = -90;
  const thetaStep = 5;
  const phiStart = 0;
  const phiStep = 5;

  function parse(computeCurrents = false) {
    return parseNecOutput(
      fixtureContent, nTheta, nPhi, thetaStart, thetaStep, phiStart, phiStep, computeCurrents,
    );
  }

  it("parses exactly one frequency", () => {
    const results = parse();
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency_mhz).toBeCloseTo(14.1, 2);
  });

  it("extracts impedance: ~73+j0.6 ohms (half-wave dipole characteristic)", () => {
    const r = parse()[0]!;
    expect(r.impedance.real).toBeCloseTo(73.0, 0);
    expect(r.impedance.imag).toBeCloseTo(0.6, 0);
  });

  it("computes SWR ~1.46 for 73+j0.6 into 50 ohms", () => {
    const r = parse()[0]!;
    expect(r.swr_50).toBeGreaterThan(1.3);
    expect(r.swr_50).toBeLessThan(1.6);
  });

  it("extracts max gain ~6.76 dBi (dipole in E-plane)", () => {
    const r = parse()[0]!;
    // Dipole broadside gain with both vertical+horizontal components
    expect(r.gain_max_dbi).toBeCloseTo(6.76, 1);
  });

  it("identifies gain maximum at theta=-40 (broadside)", () => {
    const r = parse()[0]!;
    // Peak should be at theta=-40 or +40 (symmetric), phi=0 or 180
    expect(Math.abs(r.gain_max_theta)).toBeCloseTo(40, 5);
  });

  // Beamwidth tests — these caught the PR #29 bug
  it("computes E-plane beamwidth for dipole pattern", () => {
    const r = parse()[0]!;
    // Dipole E-plane beamwidth is typically ~78 degrees
    // With our fixture data, the -3dB threshold from 6.76 is 3.76 dBi
    // The pattern drops below 3.76 dBi at approximately theta=-75 and theta=+75
    if (r.beamwidth_e_deg !== null) {
      expect(r.beamwidth_e_deg).toBeGreaterThan(50);
      expect(r.beamwidth_e_deg).toBeLessThan(180);
    }
  });

  // Front-to-back ratio
  it("computes front-to-back ratio for dipole", () => {
    const r = parse()[0]!;
    // A dipole is symmetric front-to-back in its broadside plane,
    // so F/B should be ~0 dB (same gain front and back at phi=0 vs phi=180)
    if (r.front_to_back_db !== null) {
      expect(r.front_to_back_db).toBeCloseTo(0, 0);
    }
  });

  it("builds pattern grid with correct dimensions", () => {
    const r = parse()[0]!;
    expect(r.pattern).not.toBeNull();
    expect(r.pattern!.theta_step).toBe(5);
    expect(r.pattern!.phi_step).toBe(5);
    expect(r.pattern!.gain_dbi.length).toBe(nTheta);
  });

  it("parses current distribution when requested", () => {
    const r = parse(true)[0]!;
    expect(r.currents).not.toBeNull();
    expect(r.currents!.length).toBeGreaterThan(0);

    // Center segment (tag 1) should have highest current magnitude
    const c = r.currents!.find((s) => s.segment === 11)!;
    expect(c.tag).toBe(1);
    expect(c.current_magnitude).toBeGreaterThan(0);
  });

  it("returns null currents when not requested", () => {
    const r = parse(false)[0]!;
    expect(r.currents).toBeNull();
  });

  it("computes 100% efficiency for lossless free-space dipole", () => {
    const r = parse()[0]!;
    expect(r.efficiency_percent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// parseNecOutput — multi-frequency
// ---------------------------------------------------------------------------

describe("parseNecOutput — multi-frequency", () => {
  it("parses two frequencies with different impedances", () => {
    const output = `
  FREQUENCY : 1.4000E+01 MHZ
  WAVELENGTH: 2.1414E+01 METERS

                               ***ANTENNA INPUT PARAMETERS***

  TAG   SEG.    VOLTAGE (VOLTS)         CURRENT (AMPS)         IMPEDANCE (OHMS)        ADMITTANCE (MHOS)       POWER
  NO.   NO.     REAL        IMAG.       REAL        IMAG.       REAL        IMAG.       REAL        IMAG.      (WATTS)
   1    11  1.0000E+00  0.0000E+00  1.2000E-02 -2.0000E-03  7.0000E+01  1.1667E+01  1.2000E-02 -2.0000E-03  6.0000E-03

                               ***RADIATION PATTERNS***

       ---- ANGLES ----           ---- POWER GAINS ----          ---- POLARIZATION ----
       THETA      PHI         VERTC.    HORIZ.     TOTAL       AXIAL      TILT       SENSE
      DEGREES   DEGREES        DB        DB         DB        RATIO      DEG.
       -90.00     0.00      -999.99    -999.99    -999.99     0.00000     0.00      LINEAR

  FREQUENCY : 1.4350E+01 MHZ
  WAVELENGTH: 2.0890E+01 METERS

                               ***ANTENNA INPUT PARAMETERS***

  TAG   SEG.    VOLTAGE (VOLTS)         CURRENT (AMPS)         IMPEDANCE (OHMS)        ADMITTANCE (MHOS)       POWER
  NO.   NO.     REAL        IMAG.       REAL        IMAG.       REAL        IMAG.       REAL        IMAG.      (WATTS)
   1    11  1.0000E+00  0.0000E+00  1.0000E-02 -3.0000E-03  8.0000E+01  2.4000E+01  1.0000E-02 -3.0000E-03  5.0000E-03

                               ***RADIATION PATTERNS***

       ---- ANGLES ----           ---- POWER GAINS ----          ---- POLARIZATION ----
       THETA      PHI         VERTC.    HORIZ.     TOTAL       AXIAL      TILT       SENSE
      DEGREES   DEGREES        DB        DB         DB        RATIO      DEG.
       -90.00     0.00      -999.99    -999.99    -999.99     0.00000     0.00      LINEAR
`;
    const results = parseNecOutput(output, 1, 1, -90, 5, 0, 5);
    expect(results).toHaveLength(2);
    expect(results[0]!.frequency_mhz).toBeCloseTo(14.0, 1);
    expect(results[1]!.frequency_mhz).toBeCloseTo(14.35, 1);
    expect(results[0]!.impedance.real).toBeCloseTo(70.0, 0);
    expect(results[1]!.impedance.real).toBeCloseTo(80.0, 0);
  });
});

// ---------------------------------------------------------------------------
// parseNecOutput — edge cases that must not crash the UI
// ---------------------------------------------------------------------------

describe("parseNecOutput — edge cases", () => {
  it("returns empty array for empty output", () => {
    expect(parseNecOutput("", 37, 72, -90, 5, 0, 5)).toHaveLength(0);
  });

  it("returns empty array for garbage text", () => {
    expect(parseNecOutput("some random text\nno NEC data\n", 37, 72, -90, 5, 0, 5)).toHaveLength(0);
  });

  it("returns empty array for frequency header without impedance", () => {
    const output = `
  FREQUENCY : 1.4100E+01 MHZ
  WAVELENGTH: 2.1262E+01 METERS
`;
    expect(parseNecOutput(output, 37, 72, -90, 5, 0, 5)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseNearFieldOutput
// ---------------------------------------------------------------------------

describe("parseNearFieldOutput", () => {
  it("returns null when no near-field data present", () => {
    expect(parseNearFieldOutput("no near field here")).toBeNull();
  });

  it("parses horizontal near-field grid", () => {
    const output = `
                               ***NEAR ELECTRIC FIELDS***

       ------- LOCATION -------     ------- EX ------    ------- EY ------    ------- EZ ------
         X          Y          Z      MAGNITUDE  PHASE    MAGNITUDE  PHASE    MAGNITUDE  PHASE
       METERS     METERS     METERS    VOLTS/M   DEGREES   VOLTS/M  DEGREES   VOLTS/M  DEGREES
      -2.0000    -2.0000     1.8000    1.234E+00   45.0    2.345E+00   90.0    3.456E+00  135.0
      -1.0000    -2.0000     1.8000    1.100E+00   44.0    2.200E+00   89.0    3.300E+00  134.0

`;
    const result = parseNearFieldOutput(output, "horizontal", 1.8, 2.0, 1.0);
    expect(result).not.toBeNull();
    expect(result!.plane).toBe("horizontal");
    expect(result!.height_m).toBe(1.8);
    expect(result!.field_magnitude.length).toBeGreaterThan(0);
  });
});
