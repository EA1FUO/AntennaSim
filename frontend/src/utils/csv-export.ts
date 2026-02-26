/**
 * CSV export utility for simulation results.
 *
 * Exports frequency sweep data as CSV with columns:
 * Frequency (MHz), SWR, R (Ohms), X (Ohms), Gain (dBi), F/B (dB), etc.
 */

import type { FrequencyResult } from "../api/nec";

/** Export simulation results to CSV string */
export function exportResultsCSV(data: FrequencyResult[]): string {
  const headers = [
    "Frequency (MHz)",
    "SWR",
    "R (Ohms)",
    "X (Ohms)",
    "Gain Max (dBi)",
    "Gain Theta (deg)",
    "Gain Phi (deg)",
    "F/B (dB)",
    "Beamwidth E (deg)",
    "Beamwidth H (deg)",
    "Efficiency (%)",
  ];

  const rows = data.map((d) => [
    d.frequency_mhz.toFixed(4),
    d.swr_50.toFixed(4),
    d.impedance.real.toFixed(2),
    d.impedance.imag.toFixed(2),
    d.gain_max_dbi.toFixed(2),
    d.gain_max_theta.toFixed(1),
    d.gain_max_phi.toFixed(1),
    d.front_to_back_db?.toFixed(1) ?? "",
    d.beamwidth_e_deg?.toFixed(1) ?? "",
    d.beamwidth_h_deg?.toFixed(1) ?? "",
    d.efficiency_percent?.toFixed(1) ?? "",
  ]);

  const csvLines = [headers.join(","), ...rows.map((r) => r.join(","))];
  return csvLines.join("\n") + "\n";
}

/** Trigger download of a text file */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string = "text/csv"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export and download simulation results as CSV */
export function downloadResultsCSV(
  data: FrequencyResult[],
  filename: string = "antsim-results.csv"
): void {
  const csv = exportResultsCSV(data);
  downloadTextFile(csv, filename, "text/csv");
}
