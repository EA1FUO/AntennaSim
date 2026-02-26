/**
 * Unit conversion and formatting utilities.
 */

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
