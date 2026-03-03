/**
 * Export antenna geometry to MMANA-GAL .maa format.
 *
 * Generates a .maa file that can be opened in MMANA-GAL, MMANA-GAL basic, etc.
 */

import type { WireGeometry, Excitation } from "../../templates/types";
import type { LumpedLoad } from "../../api/nec";

export function exportMaa(
  title: string,
  wires: WireGeometry[],
  excitations: Excitation[],
  loads?: LumpedLoad[],
  frequencyMhz?: number,
): string {
  const freq = frequencyMhz ?? 14.0;
  const loadList = loads ?? [];
  const lines: string[] = [];

  // Line 0: Title
  lines.push(title || "AntennaSim export");

  // Line 1: Frequency info
  lines.push(freq.toFixed(6));

  // Line 2: Counts: N_wires N_loads N_sources
  lines.push(`${wires.length} ${loadList.length} ${excitations.length}`);

  // Wire geometry lines
  // Format: X1 Y1 Z1 X2 Y2 Z2 Radius N_segments
  for (const wire of wires) {
    lines.push(
      `${wire.x1.toFixed(6)}, ${wire.y1.toFixed(6)}, ${wire.z1.toFixed(6)}, ` +
      `${wire.x2.toFixed(6)}, ${wire.y2.toFixed(6)}, ${wire.z2.toFixed(6)}, ` +
      `${wire.radius.toFixed(6)}, ${wire.segments}`,
    );
  }

  // Load lines
  // Format: Wire_num Seg_num R X L C
  for (const load of loadList) {
    if (load.load_type === 0) {
      // Series RLC
      lines.push(
        `${load.wire_tag}, ${load.segment_start}, ` +
        `${toPrecision(load.param1)}, 0, ${toPrecision(load.param2)}, ${toPrecision(load.param3)}`,
      );
    } else if (load.load_type === 4) {
      // Fixed impedance
      lines.push(
        `${load.wire_tag}, ${load.segment_start}, ` +
        `${toPrecision(load.param1)}, ${toPrecision(load.param2)}, 0, 0`,
      );
    } else {
      // Wire conductivity / parallel RLC — don't map cleanly to .maa
      lines.push(
        `${load.wire_tag}, ${load.segment_start}, ` +
        `${toPrecision(load.param1)}, ${toPrecision(load.param2)}, ${toPrecision(load.param3)}, 0`,
      );
    }
  }

  // Source lines
  // Format: Wire_num Seg_num Voltage_mag Voltage_phase
  for (const ex of excitations) {
    const vMag = Math.sqrt(ex.voltage_real ** 2 + ex.voltage_imag ** 2);
    const vPhaseDeg = (Math.atan2(ex.voltage_imag, ex.voltage_real) * 180) / Math.PI;
    lines.push(
      `${ex.wire_tag}, ${ex.segment}, ${vMag.toFixed(6)}, ${vPhaseDeg.toFixed(2)}`,
    );
  }

  // Ground section (hardcoded: real ground with average parameters)
  lines.push("1");
  lines.push("13.0, 0.005");

  // End marker
  lines.push("");

  return lines.join("\n") + "\n";
}

/** Format a number with up to 6 significant digits, like Python's :.6g */
function toPrecision(n: number): string {
  return Number(n.toPrecision(6)).toString();
}
