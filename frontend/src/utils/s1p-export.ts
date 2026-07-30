/**
 * Touchstone .s1p export for simulation results.
 *
 * Writes S11 (reflection coefficient) vs frequency in RI format, referenced
 * to the feedline impedance, i.e. the same values shown in the results
 * summary panel (post-matching, if a balun/unun is configured).
 */

import type { FrequencyResult } from "../api/nec";
import { applyMatching, type MatchingConfig, DEFAULT_MATCHING } from "./units";
import { downloadTextFile } from "./csv-export";

/** Convert complex impedance to S11 relative to a reference impedance. */
function impedanceToS11(
  zReal: number,
  zImag: number,
  z0: number
): { real: number; imag: number } {
  const numReal = zReal - z0;
  const numImag = zImag;
  const denReal = zReal + z0;
  const denImag = zImag;
  const denMagSq = denReal * denReal + denImag * denImag;
  if (denMagSq < 1e-30) return { real: 1, imag: 0 };
  return {
    real: (numReal * denReal + numImag * denImag) / denMagSq,
    imag: (numImag * denReal - numReal * denImag) / denMagSq,
  };
}

/** Build a Touchstone .s1p file (RI format) from simulation results. */
export function exportResultsS1P(
  data: FrequencyResult[],
  matching: MatchingConfig = DEFAULT_MATCHING
): string {
  const z0 = matching.feedlineZ0;
  const lines = [
    "! Touchstone S1P export",
    `! Frequency (MHz), S11 real, S11 imag, reference impedance ${z0} ohms`,
    `# MHZ S RI R ${z0}`,
  ];

  for (const d of data) {
    const m = applyMatching(d.impedance.real, d.impedance.imag, matching);
    const s11 = impedanceToS11(m.real, m.imag, z0);
    lines.push(
      `${d.frequency_mhz.toFixed(6)} ${s11.real.toFixed(6)} ${s11.imag.toFixed(6)}`
    );
  }

  return lines.join("\n") + "\n";
}

/** Export and download simulation results as a Touchstone .s1p file */
export function downloadResultsS1P(
  data: FrequencyResult[],
  matching: MatchingConfig = DEFAULT_MATCHING,
  filename: string = "antsim-results.s1p"
): void {
  const s1p = exportResultsS1P(data, matching);
  downloadTextFile(s1p, filename, "text/plain");
}
