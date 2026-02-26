/**
 * Touchstone .s1p file parser for NanoVNA / VNA data.
 *
 * Parses S1P (1-port Touchstone) files and extracts frequency + SWR data
 * for overlay on the SWR chart. Supports RI, MA, and DB formats.
 *
 * Touchstone format reference:
 *   # <freq_unit> <param> <format> R <Z0>
 *   <freq> <S11_data1> <S11_data2>
 */

export interface S1PDataPoint {
  frequency_mhz: number;
  swr: number;
  impedance_real: number;
  impedance_imag: number;
}

export interface S1PFile {
  /** Reference impedance (typically 50 ohms) */
  z0: number;
  /** Parsed data points */
  data: S1PDataPoint[];
  /** Original filename */
  filename: string;
}

type S1PFormat = "RI" | "MA" | "DB";

function parseFreqMultiplier(unit: string): number {
  switch (unit.toUpperCase()) {
    case "HZ":
      return 1e-6;
    case "KHZ":
      return 1e-3;
    case "MHZ":
      return 1;
    case "GHZ":
      return 1e3;
    default:
      return 1; // assume MHz
  }
}

/**
 * Convert S11 (reflection coefficient) to impedance and SWR.
 */
function s11ToResults(
  gammaReal: number,
  gammaImag: number,
  z0: number
): { swr: number; zReal: number; zImag: number } {
  const gammaMag = Math.sqrt(gammaReal * gammaReal + gammaImag * gammaImag);

  // SWR
  const swr = gammaMag >= 1.0 ? 999.0 : (1 + gammaMag) / (1 - gammaMag);

  // Impedance: Z = Z0 * (1 + Gamma) / (1 - Gamma)
  const denomReal = 1 - gammaReal;
  const denomImag = -gammaImag;
  const denomMagSq = denomReal * denomReal + denomImag * denomImag;

  let zReal: number;
  let zImag: number;

  if (denomMagSq < 1e-20) {
    zReal = 99999;
    zImag = 0;
  } else {
    const numReal = 1 + gammaReal;
    const numImag = gammaImag;
    zReal = z0 * (numReal * denomReal + numImag * denomImag) / denomMagSq;
    zImag = z0 * (numImag * denomReal - numReal * denomImag) / denomMagSq;
  }

  return { swr: Math.min(swr, 999), zReal, zImag };
}

/**
 * Parse a Touchstone .s1p file content string.
 */
export function parseS1P(content: string, filename: string): S1PFile {
  const lines = content.split(/\r?\n/);
  const data: S1PDataPoint[] = [];

  let freqMultiplier = 1; // default MHz
  let format: S1PFormat = "RI";
  let z0 = 50;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines
    if (line === "") continue;

    // Skip comments (lines starting with !)
    if (line.startsWith("!")) continue;

    // Option line: # <freq_unit> S <format> R <Z0>
    if (line.startsWith("#")) {
      const parts = line.substring(1).trim().toUpperCase().split(/\s+/);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (["HZ", "KHZ", "MHZ", "GHZ"].includes(part)) {
          freqMultiplier = parseFreqMultiplier(part);
        } else if (part === "RI" || part === "MA" || part === "DB") {
          format = part;
        } else if (part === "R" && i + 1 < parts.length) {
          z0 = parseFloat(parts[i + 1]!);
          if (isNaN(z0)) z0 = 50;
        }
      }
      continue;
    }

    // Data line: <freq> <val1> <val2>
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const freq = parseFloat(parts[0]!);
    const val1 = parseFloat(parts[1]!);
    const val2 = parseFloat(parts[2]!);

    if (isNaN(freq) || isNaN(val1) || isNaN(val2)) continue;

    const freqMhz = freq * freqMultiplier;

    // Convert to Gamma (real, imag) based on format
    let gammaReal: number;
    let gammaImag: number;

    switch (format) {
      case "RI":
        // val1 = Re(S11), val2 = Im(S11)
        gammaReal = val1;
        gammaImag = val2;
        break;
      case "MA":
        // val1 = |S11|, val2 = angle in degrees
        gammaReal = val1 * Math.cos((val2 * Math.PI) / 180);
        gammaImag = val1 * Math.sin((val2 * Math.PI) / 180);
        break;
      case "DB":
        // val1 = 20*log10(|S11|), val2 = angle in degrees
        {
          const mag = Math.pow(10, val1 / 20);
          gammaReal = mag * Math.cos((val2 * Math.PI) / 180);
          gammaImag = mag * Math.sin((val2 * Math.PI) / 180);
        }
        break;
    }

    const { swr, zReal, zImag } = s11ToResults(gammaReal, gammaImag, z0);

    data.push({
      frequency_mhz: freqMhz,
      swr: Math.round(swr * 100) / 100,
      impedance_real: Math.round(zReal * 10) / 10,
      impedance_imag: Math.round(zImag * 10) / 10,
    });
  }

  return { z0, data, filename };
}
