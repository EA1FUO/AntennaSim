/**
 * Unit conversion and formatting utilities.
 */

// ---- Matching / Balun / Unun types ----

export type MatchingType = "none" | "balun" | "unun";

export interface MatchingConfig {
  type: MatchingType;
  /** Impedance transformation ratio (e.g. 4 for a 4:1 balun) */
  ratio: number;
  /** Feedline characteristic impedance (typically 50 or 75 ohms) */
  feedlineZ0: number;
}

export const DEFAULT_MATCHING: MatchingConfig = {
  type: "none",
  ratio: 1,
  feedlineZ0: 50,
};

/** Common balun/unun presets used in amateur radio */
export const MATCHING_PRESETS: { label: string; description: string; config: MatchingConfig }[] = [
  { label: "None (Direct 50\u03A9)", description: "No matching, 50\u03A9 coax", config: { type: "none", ratio: 1, feedlineZ0: 50 } },
  { label: "1:1 Balun (50\u03A9)", description: "Choke balun, balanced to unbalanced", config: { type: "balun", ratio: 1, feedlineZ0: 50 } },
  { label: "1:1 Balun (75\u03A9)", description: "Choke balun for 75\u03A9 coax", config: { type: "balun", ratio: 1, feedlineZ0: 75 } },
  { label: "4:1 Balun (200\u03A9\u219250\u03A9)", description: "Folded dipole, delta loop, OCFD", config: { type: "balun", ratio: 4, feedlineZ0: 50 } },
  { label: "6:1 Balun (300\u03A9\u219250\u03A9)", description: "Folded dipole to 50\u03A9", config: { type: "balun", ratio: 6, feedlineZ0: 50 } },
  { label: "9:1 Balun (450\u03A9\u219250\u03A9)", description: "Ladder-line to coax, end-fed", config: { type: "balun", ratio: 9, feedlineZ0: 50 } },
  { label: "4:1 Unun (200\u03A9\u219250\u03A9)", description: "End-fed, off-center antennas", config: { type: "unun", ratio: 4, feedlineZ0: 50 } },
  { label: "9:1 Unun (450\u03A9\u219250\u03A9)", description: "End-fed half-wave antennas", config: { type: "unun", ratio: 9, feedlineZ0: 50 } },
  { label: "16:1 Unun (800\u03A9\u219250\u03A9)", description: "Long-wire, end-fed antennas", config: { type: "unun", ratio: 16, feedlineZ0: 50 } },
  { label: "49:1 Unun (2450\u03A9\u219250\u03A9)", description: "EFHW, random-wire antennas", config: { type: "unun", ratio: 49, feedlineZ0: 50 } },
];

/** Apply matching transformation to raw feedpoint impedance.
 *  A balun/unun with ratio N:1 transforms Z_antenna to Z_transformed = Z_antenna / N.
 *  Then SWR is computed against the feedline Z0. */
export function applyMatching(
  rawReal: number,
  rawImag: number,
  matching: MatchingConfig
): { real: number; imag: number; swr: number } {
  const ratio = matching.ratio > 0 ? matching.ratio : 1;
  const real = rawReal / ratio;
  const imag = rawImag / ratio;
  const swr = computeSwr(real, imag, matching.feedlineZ0);
  return { real, imag, swr };
}

/** Compute SWR from complex impedance relative to Z0 */
export function computeSwr(zReal: number, zImag: number, z0 = 50): number {
  const numR = zReal - z0;
  const numI = zImag;
  const denR = zReal + z0;
  const denI = zImag;
  const denMagSq = denR * denR + denI * denI;
  if (denMagSq < 1e-30) return 999;
  const gammaR = (numR * denR + numI * denI) / denMagSq;
  const gammaI = (numI * denR - numR * denI) / denMagSq;
  const gammaMag = Math.sqrt(gammaR * gammaR + gammaI * gammaI);
  if (gammaMag >= 1) return 999;
  return (1 + gammaMag) / (1 - gammaMag);
}

/** Convert frequency in MHz to wavelength in meters */
export function mhzToWavelength(mhz: number): number {
  return 300.0 / mhz;
}

/** Convert wavelength in meters to frequency in MHz */
export function wavelengthToMhz(meters: number): number {
  return 300.0 / meters;
}

/** Convert meters to feet */
export function metersToFeet(m: number): number {
  return m * 3.28084;
}

/** Convert feet to meters */
export function feetToMeters(ft: number): number {
  return ft / 3.28084;
}

/** Convert dBi to dBd (dBi = dBd + 2.15) */
export function dbiToDbD(dbi: number): number {
  return dbi - 2.15;
}

/** Convert dBd to dBi */
export function dbdToDbi(dbd: number): number {
  return dbd + 2.15;
}

/** Format frequency with appropriate decimals: "14.100 MHz" */
export function formatFrequency(mhz: number): string {
  return `${mhz.toFixed(3)} MHz`;
}

/** Format SWR with 2 decimals: "1.45" */
export function formatSwr(swr: number): string {
  if (swr > 99) return ">99";
  return swr.toFixed(2);
}

/** Format impedance: "72.3 + j1.2 Ω" or "72.3 - j1.2 Ω" */
export function formatImpedance(real: number, imag: number): string {
  const sign = imag >= 0 ? "+" : "-";
  return `${real.toFixed(1)} ${sign} j${Math.abs(imag).toFixed(1)} \u03A9`;
}

/** Format gain in dBi: "7.21 dBi" */
export function formatGain(dbi: number): string {
  return `${dbi.toFixed(2)} dBi`;
}

/** Format length with unit: "10.2 m" or "33.5 ft" */
export function formatLength(meters: number, imperial = false): string {
  if (imperial) {
    return `${metersToFeet(meters).toFixed(1)} ft`;
  }
  return `${meters.toFixed(1)} m`;
}

/** SWR quality category */
export type SwrQuality = "excellent" | "good" | "warning" | "bad";

/** Get SWR quality category for color coding */
export function swrQuality(swr: number): SwrQuality {
  if (swr < 1.5) return "excellent";
  if (swr < 2.0) return "good";
  if (swr < 3.0) return "warning";
  return "bad";
}

/** Get tailwind color class for SWR value */
export function swrColorClass(swr: number): string {
  const quality = swrQuality(swr);
  return `text-swr-${quality}`;
}
