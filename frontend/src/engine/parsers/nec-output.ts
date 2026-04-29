/**
 * Parse nec2c output into structured result data.
 *
 * This is a faithful TypeScript port of backend/src/simulation/nec_output.py.
 * All regex patterns, state-machine logic, and numerical computations are
 * preserved exactly.
 */

import type {
  Impedance,
  PatternData,
  FrequencyResult,
  SegmentCurrent,
  NearFieldResult,
} from "../../api/nec";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Floating-point in scientific notation: 1.4000E+01, -3.7469E+01 */
const SCI = "[+-]?\\d+\\.\\d+E[+-]\\d+";

/** General number (integer, decimal, or scientific) */
const NUM = "[+-]?\\d+\\.?\\d*(?:E[+-]?\\d+)?";

/** Frequency header: "FREQUENCY : 1.4000E+01 MHz" */
const FREQUENCY_RE = new RegExp(
  "FREQUENCY\\s*:\\s*(" + SCI + ")\\s*MHZ",
  "i",
);

/** Antenna input parameters section header */
const INPUT_PARAMS_RE = /ANTENNA INPUT PARAMETERS/;

/**
 * Impedance data line (scientific notation):
 * TAG SEG V_REAL V_IMAG I_REAL I_IMAG Z_REAL Z_IMAG Y_REAL Y_IMAG POWER
 */
const IMPEDANCE_RE = new RegExp(
  "\\s*(\\d+)\\s+(\\d+)\\s+" +                     // tag, segment
  "(" + SCI + ")\\s+(" + SCI + ")\\s+" +            // voltage real, imag
  "(" + SCI + ")\\s+(" + SCI + ")\\s+" +            // current real, imag
  "(" + SCI + ")\\s+(" + SCI + ")\\s+" +            // impedance real, imag
  "(" + SCI + ")\\s+(" + SCI + ")\\s+" +            // admittance real, imag
  "(" + SCI + ")",                                   // power
);

/** Radiation pattern section header */
const PATTERN_HEADER_RE = /RADIATION PATTERNS/;

/**
 * Pattern data line:
 * THETA PHI VERTC_DB HORIZ_DB TOTAL_DB AXIAL_RATIO TILT SENSE
 */
const PATTERN_LINE_RE = new RegExp(
  "\\s*(" + NUM + ")\\s+(" + NUM + ")\\s+" +        // theta, phi
  "(" + NUM + ")\\s+(" + NUM + ")\\s+" +            // vert_db, horiz_db
  "(" + NUM + ")\\s+" +                              // total_db
  "(" + NUM + ")\\s+(" + NUM + ")\\s+" +            // axial_ratio, tilt
  "(\\w+)",                                          // sense (LINEAR, etc.)
);

/** Power budget: radiated power */
const POWER_RADIATED_RE = new RegExp(
  "RADIATED\\s+POWER\\s*=\\s*(" + NUM + ")\\s*WATTS",
  "i",
);

/** Power budget: input power */
const POWER_INPUT_RE = new RegExp(
  "INPUT\\s+POWER\\s*=\\s*(" + NUM + ")\\s*WATTS",
  "i",
);

/** Current distribution section header */
const CURRENT_HEADER_RE = /CURRENTS AND LOCATION/;

/**
 * Current data line:
 * SEG TAG X Y Z LENGTH REAL IMAG MAG PHASE
 */
const CURRENT_LINE_RE = new RegExp(
  "\\s*(\\d+)\\s+(\\d+)\\s+" +                                    // seg, tag
  "(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+" +         // x, y, z
  "(" + NUM + ")\\s+" +                                            // length
  "(" + NUM + ")\\s+(" + NUM + ")\\s+" +                          // real, imag
  "(" + NUM + ")\\s+(" + NUM + ")",                                // magnitude, phase
);

/** Near electric field section header */
const NEAR_FIELD_HEADER_RE = /NEAR ELECTRIC FIELDS/;

/**
 * Near field data line:
 * X Y Z EX_MAG EX_PHASE EY_MAG EY_PHASE EZ_MAG EZ_PHASE
 */
const NEAR_FIELD_LINE_RE = new RegExp(
  "\\s*(" + NUM + ")\\s+(" + NUM + ")\\s+(" + NUM + ")\\s+" +    // x, y, z
  "(" + NUM + ")\\s+(" + NUM + ")\\s+" +                          // ex_mag, ex_phase
  "(" + NUM + ")\\s+(" + NUM + ")\\s+" +                          // ey_mag, ey_phase
  "(" + NUM + ")\\s+(" + NUM + ")",                                // ez_mag, ez_phase
);

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Round a number to `decimals` decimal places. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// SWR computation
// ---------------------------------------------------------------------------

/**
 * Compute SWR from complex impedance relative to Z0.
 *
 * Uses manual complex division to compute the reflection coefficient gamma,
 * then derives SWR = (1 + |gamma|) / (1 - |gamma|).
 *
 * Returns 999.0 when |gamma| >= 1 or the denominator is effectively zero.
 */
export function computeSwr(
  zReal: number,
  zImag: number,
  z0: number = 50.0,
): number {
  const numReal = zReal - z0;
  const numImag = zImag;
  const denReal = zReal + z0;
  const denImag = zImag;

  const denMagSq = denReal * denReal + denImag * denImag;
  if (denMagSq < 1e-30) {
    return 999.0;
  }

  const gammaReal =
    (numReal * denReal + numImag * denImag) / denMagSq;
  const gammaImag =
    (numImag * denReal - numReal * denImag) / denMagSq;
  const gammaMag = Math.sqrt(
    gammaReal * gammaReal + gammaImag * gammaImag,
  );

  if (gammaMag >= 1.0) {
    return 999.0;
  }

  const swr = (1.0 + gammaMag) / (1.0 - gammaMag);
  return round(swr, 4);
}

// ---------------------------------------------------------------------------
// Near-field output parser
// ---------------------------------------------------------------------------

/**
 * Parse the NE output section for near electric field data.
 *
 * Returns a NearFieldResult with a 2D grid of E-field magnitudes, or null
 * if no near-field data was found in the output.
 */
export function parseNearFieldOutput(
  output: string,
  plane: string = "horizontal",
  heightM: number = 0.0,
  extentM: number = 20.0,
  resolutionM: number = 0.5,
): NearFieldResult | null {
  const lines = output.split("\n");
  let inNearField = false;
  let skipLines = 0;
  const rawData: Array<[number, number, number, number]> = []; // x, y, z, |E|

  for (const line of lines) {
    if (NEAR_FIELD_HEADER_RE.test(line)) {
      inNearField = true;
      skipLines = 3; // Skip column headers
      continue;
    }

    if (inNearField) {
      if (skipLines > 0) {
        skipLines -= 1;
        continue;
      }

      const m = NEAR_FIELD_LINE_RE.exec(line);
      if (m) {
        const x = parseFloat(m[1]!);
        const y = parseFloat(m[2]!);
        const z = parseFloat(m[3]!);
        const exMag = parseFloat(m[4]!);
        const eyMag = parseFloat(m[6]!);
        const ezMag = parseFloat(m[8]!);
        const eTotal = Math.sqrt(
          exMag * exMag + eyMag * eyMag + ezMag * ezMag,
        );
        rawData.push([x, y, z, eTotal]);
        continue;
      }

      if (line.trim() === "") {
        if (rawData.length > 0) {
          inNearField = false;
        }
      }
    }
  }

  if (rawData.length === 0) {
    return null;
  }

  // Organize into 2D grid
  if (plane === "horizontal") {
    // Grid is in XY plane at fixed Z = heightM
    const nx = Math.floor(2 * extentM / resolutionM) + 1;
    const ny = nx;
    const grid: number[][] = Array.from({ length: nx }, () =>
      new Array<number>(ny).fill(0.0),
    );

    for (const [x, y, _z, eMag] of rawData) {
      const xi = Math.round((x + extentM) / resolutionM);
      const yi = Math.round((y + extentM) / resolutionM);
      if (xi >= 0 && xi < nx && yi >= 0 && yi < ny) {
        grid[xi]![yi] = eMag;
      }
    }

    return {
      plane,
      height_m: heightM,
      nx,
      ny,
      x_start: -extentM,
      y_start: -extentM,
      dx: resolutionM,
      dy: resolutionM,
      field_magnitude: grid,
    };
  } else {
    // Vertical plane: grid is in XZ
    const nx = Math.floor(2 * extentM / resolutionM) + 1;
    const nz = Math.floor(extentM / resolutionM) + 1;
    const grid: number[][] = Array.from({ length: nx }, () =>
      new Array<number>(nz).fill(0.0),
    );

    for (const [x, _y, z, eMag] of rawData) {
      const xi = Math.round((x + extentM) / resolutionM);
      const zi = Math.round(z / resolutionM);
      if (xi >= 0 && xi < nx && zi >= 0 && zi < nz) {
        grid[xi]![zi] = eMag;
      }
    }

    return {
      plane,
      height_m: 0.0,
      nx,
      ny: nz,
      x_start: -extentM,
      y_start: 0.0,
      dx: resolutionM,
      dy: resolutionM,
      field_magnitude: grid,
    };
  }
}

// ---------------------------------------------------------------------------
// Beamwidth computation
// ---------------------------------------------------------------------------

/**
 * Find the -3dB beamwidth from a sorted list of (angle, gainDB) pairs.
 *
 * Searches for crossings of the threshold on either side of the peak,
 * using linear interpolation for sub-step accuracy.
 */
function findBeamwidthFromCut(
  sortedGains: Array<[number, number]>,
  threshold: number,
): number | null {
  if (sortedGains.length < 3) {
    return null;
  }

  // Find the index of the peak
  let peakIdx = 0;
  let peakGain = sortedGains[0]![1];
  for (let i = 1; i < sortedGains.length; i++) {
    if (sortedGains[i]![1] > peakGain) {
      peakGain = sortedGains[i]![1];
      peakIdx = i;
    }
  }
  if (peakGain <= -999.0) {
    return null;
  }

  // Search left from peak for -3dB crossing
  let leftAngle: number | null = null;
  for (let i = peakIdx; i > 0; i--) {
    if (
      sortedGains[i - 1]![1] < threshold &&
      sortedGains[i]![1] >= threshold
    ) {
      const [a0, g0] = sortedGains[i - 1]!;
      const [a1, g1] = sortedGains[i]!;
      const dg = g1 - g0;
      if (Math.abs(dg) > 1e-6) {
        const frac = (threshold - g0) / dg;
        leftAngle = a0 + frac * (a1 - a0);
      } else {
        leftAngle = a0;
      }
      break;
    }
  }

  // Search right from peak for -3dB crossing
  let rightAngle: number | null = null;
  for (let i = peakIdx; i < sortedGains.length - 1; i++) {
    if (
      sortedGains[i + 1]![1] < threshold &&
      sortedGains[i]![1] >= threshold
    ) {
      const [a0, g0] = sortedGains[i]!;
      const [a1, g1] = sortedGains[i + 1]!;
      const dg = g1 - g0;
      if (Math.abs(dg) > 1e-6) {
        const frac = (threshold - g0) / dg;
        rightAngle = a0 + frac * (a1 - a0);
      } else {
        rightAngle = a1;
      }
      break;
    }
  }

  if (leftAngle !== null && rightAngle !== null) {
    const bw = Math.abs(rightAngle - leftAngle);
    return round(bw, 1);
  }

  return null;
}

/**
 * Compute -3dB beamwidth in E-plane and H-plane.
 *
 * E-plane: cut at phi = gainMaxPhi, sweep theta.
 * H-plane: cut at theta = gainMaxTheta, sweep phi.
 */
function computeBeamwidth(
  patternData: Array<[number, number, number]>,
  gainMaxDbi: number,
  gainMaxTheta: number,
  gainMaxPhi: number,
  thetaStep: number,
  phiStep: number,
): [number | null, number | null] {
  if (gainMaxDbi <= -999.0) {
    return [null, null];
  }

  const threshold = gainMaxDbi - 3.0;

  // Build lookup: (theta, phi) -> gain
  const gainMap = new Map<string, number>();
  for (const [theta, phi, gainDb] of patternData) {
    const key = `${round(theta, 2)},${round(phi, 2)}`;
    gainMap.set(key, gainDb);
  }

  // E-plane beamwidth: fixed phi = gainMaxPhi, sweep theta
  const ePlaneGains: Array<[number, number]> = [];
  for (const [theta, phi, gain] of patternData) {
    if (Math.abs(phi - gainMaxPhi) < phiStep * 0.6) {
      ePlaneGains.push([theta, gain]);
    }
  }
  ePlaneGains.sort((a, b) => a[0] - b[0]);
  const beamwidthE = findBeamwidthFromCut(ePlaneGains, threshold);

  // H-plane beamwidth: fixed theta = gainMaxTheta, sweep phi
  const hPlaneGains: Array<[number, number]> = [];
  for (const [theta, phi, gain] of patternData) {
    if (Math.abs(theta - gainMaxTheta) < thetaStep * 0.6) {
      hPlaneGains.push([phi, gain]);
    }
  }
  hPlaneGains.sort((a, b) => a[0] - b[0]);
  const beamwidthH = findBeamwidthFromCut(hPlaneGains, threshold);

  return [beamwidthE, beamwidthH];
}

// ---------------------------------------------------------------------------
// Build a single FrequencyResult
// ---------------------------------------------------------------------------

function buildFrequencyResult(
  freqMhz: number,
  impedance: Impedance,
  patternData: Array<[number, number, number]>,
  nTheta: number,
  nPhi: number,
  thetaStart: number,
  thetaStep: number,
  phiStart: number,
  phiStep: number,
  powerRadiated: number | null,
  powerInput: number | null,
  currents: SegmentCurrent[] | null,
): FrequencyResult {
  const swr = computeSwr(impedance.real, impedance.imag);

  let pattern: PatternData | null = null;
  let gainMaxDbi = -999.99;
  let gainMaxTheta = 0.0;
  let gainMaxPhi = 0.0;

  if (patternData.length > 0) {
    // Initialize gain grid with -999.99
    const gainGrid: number[][] = Array.from({ length: nTheta }, () =>
      new Array<number>(nPhi).fill(-999.99),
    );

    for (const [theta, phi, gainDb] of patternData) {
      const ti = Math.round((theta - thetaStart) / thetaStep);
      const pi = Math.round((phi - phiStart) / phiStep);
      if (ti >= 0 && ti < nTheta && pi >= 0 && pi < nPhi) {
        gainGrid[ti]![pi] = gainDb;
        if (gainDb > gainMaxDbi) {
          gainMaxDbi = gainDb;
          gainMaxTheta = theta;
          gainMaxPhi = phi;
        }
      }
    }

    pattern = {
      theta_start: thetaStart,
      theta_step: thetaStep,
      theta_count: nTheta,
      phi_start: phiStart,
      phi_step: phiStep,
      phi_count: nPhi,
      gain_dbi: gainGrid,
    };
  }

  // Front-to-back ratio
  let frontToBack: number | null = null;
  if (patternData.length > 0 && gainMaxDbi > -999.0) {
    const backPhi = (gainMaxPhi + 180.0) % 360.0;
    let backGain = -999.99;
    for (const [theta, phi, gainDb] of patternData) {
      if (
        Math.abs(theta - gainMaxTheta) < thetaStep * 0.6 &&
        Math.abs(phi - backPhi) < phiStep * 0.6
      ) {
        backGain = Math.max(backGain, gainDb);
      }
    }
    if (backGain > -999.0) {
      frontToBack = round(gainMaxDbi - backGain, 2);
    }
  }

  // Beamwidth (E-plane and H-plane)
  let beamwidthE: number | null = null;
  let beamwidthH: number | null = null;
  if (patternData.length > 0 && gainMaxDbi > -999.0) {
    [beamwidthE, beamwidthH] = computeBeamwidth(
      patternData,
      gainMaxDbi,
      gainMaxTheta,
      gainMaxPhi,
      thetaStep,
      phiStep,
    );
  }

  // Efficiency from pattern integration: η = (1/4π) ∫∫ G(θ,φ) sinθ dθ dφ.
  // For a lossless antenna this integral equals 4π → η = 1.0 (100%).
  // Ground absorption reduces the integral → η < 1.0.
  // Uses exact solid angle elements: ΔΩ = |cos(θ-dθ/2) - cos(θ+dθ/2)| × dφ
  // instead of the midpoint approximation sin(θ)×dθ×dφ for better accuracy.
  let efficiency: number | null = null;
  if (patternData.length > 0) {
    const halfDth = ((thetaStep / 2) * Math.PI) / 180.0;
    const dph = (phiStep * Math.PI) / 180.0;
    let weightedGain = 0;
    let totalWeight = 0;
    for (const [theta, _phi, gainDb] of patternData) {
      const thetaRad = (theta * Math.PI) / 180.0;
      const gainLinear = gainDb > -999.0 ? Math.pow(10, gainDb / 10.0) : 0;
      // Exact solid angle of this cell
      const w = Math.abs(Math.cos(thetaRad - halfDth) - Math.cos(thetaRad + halfDth)) * dph;
      weightedGain += gainLinear * w;
      totalWeight += w;
    }
    if (totalWeight > 1e-30) {
      const avgGain = weightedGain / totalWeight;
      efficiency = round(Math.min(avgGain * 100.0, 100.0), 1);
    }
  }
  if (
    efficiency === null &&
    powerRadiated !== null &&
    powerInput !== null &&
    powerInput > 1e-30
  ) {
    const eff = (powerRadiated / powerInput) * 100.0;
    efficiency = round(Math.min(eff, 100.0), 1);
  }

  return {
    frequency_mhz: round(freqMhz, 6),
    impedance,
    swr_50: swr,
    gain_max_dbi:
      gainMaxDbi > -999.0 ? round(gainMaxDbi, 2) : -999.99,
    gain_max_theta: gainMaxTheta,
    gain_max_phi: gainMaxPhi,
    front_to_back_db: frontToBack,
    beamwidth_e_deg: beamwidthE,
    beamwidth_h_deg: beamwidthH,
    efficiency_percent: efficiency,
    pattern,
    currents: currents && currents.length > 0 ? currents : null,
  };
}

// ---------------------------------------------------------------------------
// Main NEC2 output parser
// ---------------------------------------------------------------------------

/**
 * Parse the complete nec2c stdout into a list of FrequencyResult.
 *
 * Implements a state machine that scans line-by-line for section headers
 * (FREQUENCY, ANTENNA INPUT PARAMETERS, RADIATION PATTERNS, CURRENTS AND
 * LOCATION) and accumulates data per frequency. When a new frequency header
 * is encountered (or EOF is reached) the accumulated data is finalized into
 * a FrequencyResult.
 */
export function parseNecOutput(
  output: string,
  nTheta: number,
  nPhi: number,
  thetaStart: number,
  thetaStep: number,
  phiStart: number,
  phiStep: number,
  computeCurrents: boolean = false,
): FrequencyResult[] {
  const results: FrequencyResult[] = [];
  const lines = output.split("\n");

  let currentFreq: number | null = null;
  let currentImpedance: Impedance | null = null;
  let currentPatternData: Array<[number, number, number]> = [];
  let currentPowerRadiated: number | null = null;
  let currentPowerInput: number | null = null;
  let currentCurrents: SegmentCurrent[] = [];
  let inInputParams = false;
  let inPatternSection = false;
  let inCurrentSection = false;
  let skipHeaderLines = 0;

  for (const line of lines) {
    // Check for frequency header
    const freqMatch = FREQUENCY_RE.exec(line);
    if (freqMatch) {
      // Save previous frequency data
      if (currentFreq !== null && currentImpedance !== null) {
        const result = buildFrequencyResult(
          currentFreq,
          currentImpedance,
          currentPatternData,
          nTheta,
          nPhi,
          thetaStart,
          thetaStep,
          phiStart,
          phiStep,
          currentPowerRadiated,
          currentPowerInput,
          computeCurrents ? currentCurrents : null,
        );
        results.push(result);
      }

      currentFreq = parseFloat(freqMatch[1]!);
      currentImpedance = null;
      currentPatternData = [];
      currentPowerRadiated = null;
      currentPowerInput = null;
      currentCurrents = [];
      inInputParams = false;
      inPatternSection = false;
      inCurrentSection = false;
      continue;
    }

    // Check for antenna input parameters section
    if (INPUT_PARAMS_RE.test(line)) {
      inInputParams = true;
      inPatternSection = false;
      inCurrentSection = false;
      skipHeaderLines = 2; // Skip the 2 header lines after the section title
      continue;
    }

    // Parse impedance data
    if (inInputParams) {
      if (skipHeaderLines > 0) {
        skipHeaderLines -= 1;
        continue;
      }
      const impMatch = IMPEDANCE_RE.exec(line);
      if (impMatch) {
        const zReal = parseFloat(impMatch[7]!);
        const zImag = parseFloat(impMatch[8]!);
        currentImpedance = {
          real: round(zReal, 4),
          imag: round(zImag, 4),
        };
        inInputParams = false;
        continue;
      }
      // If we hit a blank line, just skip it (keep looking)
      if (line.trim() === "") {
        continue;
      }
    }

    // Check for current distribution section
    if (computeCurrents && CURRENT_HEADER_RE.test(line)) {
      inCurrentSection = true;
      inPatternSection = false;
      inInputParams = false;
      skipHeaderLines = 3; // Skip column header lines
      continue;
    }

    // Parse current data
    if (inCurrentSection) {
      if (skipHeaderLines > 0) {
        skipHeaderLines -= 1;
        continue;
      }
      const curMatch = CURRENT_LINE_RE.exec(line);
      if (curMatch) {
        const segNum = parseInt(curMatch[1]!, 10);
        const tagNum = parseInt(curMatch[2]!, 10);
        // NEC2 reports segment positions in wavelengths - convert to meters
        const cxWl = parseFloat(curMatch[3]!);
        const cyWl = parseFloat(curMatch[4]!);
        const czWl = parseFloat(curMatch[5]!);
        const wavelengthM =
          currentFreq && currentFreq > 0
            ? 299.792458 / currentFreq
            : 1.0;
        const cx = cxWl * wavelengthM;
        const cy = cyWl * wavelengthM;
        const cz = czWl * wavelengthM;
        // group(6) is segment length, skip
        const cReal = parseFloat(curMatch[7]!);
        const cImag = parseFloat(curMatch[8]!);
        const cMag = parseFloat(curMatch[9]!);
        const cPhase = parseFloat(curMatch[10]!);
        currentCurrents.push({
          tag: tagNum,
          segment: segNum,
          x: round(cx, 6),
          y: round(cy, 6),
          z: round(cz, 6),
          current_real: round(cReal, 8),
          current_imag: round(cImag, 8),
          current_magnitude: round(cMag, 8),
          current_phase_deg: round(cPhase, 2),
        });
        continue;
      }
      if (line.trim() === "") {
        inCurrentSection = false;
      }
    }

    // Check for radiation pattern section
    if (PATTERN_HEADER_RE.test(line)) {
      inPatternSection = true;
      inInputParams = false;
      inCurrentSection = false;
      skipHeaderLines = 3; // Skip header lines (column headers)
      continue;
    }

    // Parse pattern data
    if (inPatternSection) {
      if (skipHeaderLines > 0) {
        skipHeaderLines -= 1;
        continue;
      }
      const patMatch = PATTERN_LINE_RE.exec(line);
      if (patMatch) {
        const theta = parseFloat(patMatch[1]!);
        const phi = parseFloat(patMatch[2]!);
        const totalDb = parseFloat(patMatch[5]!);
        currentPatternData.push([theta, phi, totalDb]);
        continue;
      }
      // If the line is blank or doesn't match, end pattern section
      if (line.trim() === "") {
        inPatternSection = false;
      }
    }

    // Parse power budget lines (can appear anywhere in output)
    const pwrRadMatch = POWER_RADIATED_RE.exec(line);
    if (pwrRadMatch) {
      currentPowerRadiated = parseFloat(pwrRadMatch[1]!);
      continue;
    }

    const pwrInMatch = POWER_INPUT_RE.exec(line);
    if (pwrInMatch) {
      currentPowerInput = parseFloat(pwrInMatch[1]!);
      continue;
    }

  }

  // Don't forget the last frequency
  if (currentFreq !== null && currentImpedance !== null) {
    const result = buildFrequencyResult(
      currentFreq,
      currentImpedance,
      currentPatternData,
      nTheta,
      nPhi,
      thetaStart,
      thetaStep,
      phiStart,
      phiStep,
      currentPowerRadiated,
      currentPowerInput,
      computeCurrents ? currentCurrents : null,
    );
    results.push(result);
  }

  return results;
}
