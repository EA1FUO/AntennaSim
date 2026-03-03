/**
 * Parse MMANA-GAL .maa files into ImportResult.
 *
 * MMANA-GAL .maa file format:
 *   Line 0: Comment/title
 *   Then a counts line: N_wires N_loads N_sources (space or comma separated)
 *   Then N_wires lines: X1 Y1 Z1 X2 Y2 Z2 Radius N_segments
 *   Then N_loads lines: Wire_num Seg_num R X L C
 *   Then N_sources lines: Wire_num Seg_num Voltage_mag Voltage_phase
 *   Then ground info lines...
 *   Then frequency info...
 *
 * Note: MMANA uses coordinates in meters with the same axis convention as NEC2.
 */

import type { ImportResult } from "../types";

function lineAt(lines: string[], i: number): string {
  return i < lines.length ? lines[i]! : "";
}

function partAt(parts: string[], i: number): string {
  return i < parts.length ? parts[i]! : "";
}

export function parseMaa(content: string): ImportResult {
  const lines = content.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length < 3) {
    throw new Error("File too short — expected at least title, counts, and geometry");
  }

  // Line 0: Title / comment
  const title = lineAt(lines, 0).trim();

  // Find the counts line (N_wires N_loads N_sources)
  let idx = 1;
  let nWires = 0;
  let nLoads = 0;
  let nSources = 0;

  while (idx < lines.length) {
    const line = lineAt(lines, idx).trim();
    const parts = line.split(/\s+/);

    if (parts.length >= 3) {
      const cleaned = parts.slice(0, 3).map((p) => p.replace(/[,*]/g, ""));
      const w = parseInt(cleaned[0]!, 10);
      const l = parseInt(cleaned[1]!, 10);
      const s = parseInt(cleaned[2]!, 10);
      if (!isNaN(w) && !isNaN(l) && !isNaN(s)) {
        nWires = w;
        nLoads = l;
        nSources = s;
        idx++;
        break;
      }
    }
    idx++;
  }

  if (nWires === 0) {
    throw new Error("Could not find wire count line in .maa file");
  }

  // Parse wire geometry
  const wires: ImportResult["wires"] = [];
  for (let i = 0; i < nWires; i++) {
    if (idx >= lines.length) {
      throw new Error(`Unexpected end of file at wire ${i + 1}`);
    }

    const line = lineAt(lines, idx).trim();
    idx++;

    const parts = line.replace(/,/g, " ").split(/\s+/);
    if (parts.length < 8) {
      throw new Error(`Wire ${i + 1}: expected 8 values, got ${parts.length}: ${line}`);
    }

    const x1 = parseFloat(partAt(parts, 0));
    const y1 = parseFloat(partAt(parts, 1));
    const z1 = parseFloat(partAt(parts, 2));
    const x2 = parseFloat(partAt(parts, 3));
    const y2 = parseFloat(partAt(parts, 4));
    const z2 = parseFloat(partAt(parts, 5));
    let radius = parseFloat(partAt(parts, 6));
    let segments = Math.floor(parseFloat(partAt(parts, 7)));

    if ([x1, y1, z1, x2, y2, z2, radius].some((v) => isNaN(v)) || isNaN(segments)) {
      throw new Error(`Wire ${i + 1}: invalid data in: ${line}`);
    }

    segments = Math.max(1, Math.min(200, segments));
    radius = Math.max(0.0001, Math.min(0.1, radius));

    wires.push({
      tag: i + 1,
      segments,
      x1,
      y1,
      z1,
      x2,
      y2,
      z2,
      radius,
    });
  }

  // Parse loads (skip — ImportResult has no loads field, but advance idx)
  for (let i = 0; i < nLoads; i++) {
    if (idx >= lines.length) break;
    idx++;
  }

  // Parse sources (excitations)
  const excitations: ImportResult["excitations"] = [];
  for (let i = 0; i < nSources; i++) {
    if (idx >= lines.length) break;

    const line = lineAt(lines, idx).trim();
    idx++;

    const parts = line.replace(/,/g, " ").split(/\s+/);
    if (parts.length < 2) continue;

    try {
      const wireNum = Math.floor(parseFloat(partAt(parts, 0)));
      const segNum = Math.floor(parseFloat(partAt(parts, 1)));
      const vMag = parts.length > 2 ? parseFloat(partAt(parts, 2)) : 1.0;
      const vPhaseDeg = parts.length > 3 ? parseFloat(partAt(parts, 3)) : 0.0;

      // Convert magnitude/phase to real/imag
      const vPhaseRad = (vPhaseDeg * Math.PI) / 180;
      const vReal = vMag * Math.cos(vPhaseRad);
      const vImag = vMag * Math.sin(vPhaseRad);

      excitations.push({
        wire_tag: wireNum,
        segment: segNum,
        voltage_real: vReal,
        voltage_imag: vImag,
      });
    } catch {
      continue;
    }
  }

  // Default excitation if none found: center segment of first wire
  if (excitations.length === 0 && wires.length > 0) {
    const firstWire = wires[0]!;
    const centerSeg = Math.floor((firstWire.segments + 1) / 2);
    excitations.push({
      wire_tag: 1,
      segment: centerSeg,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    });
  }

  // Try to parse ground and frequency hints from remaining lines
  let groundType = "free_space";
  let frequencyMhz = 14.0;

  while (idx < lines.length) {
    const line = lineAt(lines, idx).trim().toLowerCase();
    idx++;

    // Look for frequency info
    if (line.includes("mhz") || /^[-\d.]+$/.test(line.replace(/[,\s]/g, ""))) {
      try {
        const firstToken = line.split(/\s+/)[0]!.replace(/,/g, "");
        const freq = parseFloat(firstToken);
        if (freq >= 0.1 && freq <= 500) {
          frequencyMhz = freq;
        }
      } catch {
        // ignore
      }
    }

    // Look for ground type hints
    if (line.includes("free") && line.includes("space")) {
      groundType = "free_space";
    } else if (line.includes("perfect")) {
      groundType = "perfect";
    } else if (line.includes("real") || line.includes("average")) {
      groundType = "average";
    }
  }

  return {
    title,
    wires,
    excitations,
    ground_type: groundType,
    frequency_start_mhz: frequencyMhz,
    frequency_stop_mhz: frequencyMhz,
    frequency_steps: 1,
  };
}
