/**
 * Pre-simulation validation for antenna geometry.
 *
 * Checks NEC2 modelling rules and common mistakes before sending
 * a geometry to the simulation engine, giving users actionable
 * warnings instead of cryptic NEC2 failures or bad results.
 */

import type { WireGeometry, Excitation, GroundConfig, FrequencyRange } from "../templates/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  /** Severity: errors prevent simulation, warnings are advisory */
  severity: ValidationSeverity;
  /** Short machine-readable code */
  code: string;
  /** Human-readable explanation */
  message: string;
  /** Wire tag(s) involved, if applicable */
  wireTags?: number[];
}

export interface ValidationResult {
  /** All issues found */
  issues: ValidationIssue[];
  /** True if there are no errors (warnings are OK) */
  valid: boolean;
  /** Convenience: number of errors */
  errorCount: number;
  /** Convenience: number of warnings */
  warningCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wireLength(w: WireGeometry): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const dz = w.z2 - w.z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a simulation request before submission.
 * Returns issues sorted by severity (errors first).
 */
export function validateSimulationRequest(
  wires: WireGeometry[],
  excitations: Excitation[],
  ground: GroundConfig,
  frequency: FrequencyRange,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. No wires
  if (wires.length === 0) {
    issues.push({
      severity: "error",
      code: "no_wires",
      message: "No wires defined. Add at least one wire to simulate.",
    });
  }

  // 2. No excitation
  if (excitations.length === 0) {
    issues.push({
      severity: "error",
      code: "no_excitation",
      message: "No excitation source defined. Add a feedpoint to at least one wire.",
    });
  }

  // 3. Excitation references non-existent wire
  const wireTags = new Set(wires.map((w) => w.tag));
  for (const exc of excitations) {
    if (!wireTags.has(exc.wire_tag)) {
      issues.push({
        severity: "error",
        code: "excitation_orphan",
        message: `Excitation references wire tag ${exc.wire_tag} which does not exist.`,
        wireTags: [exc.wire_tag],
      });
    }
  }

  // 4. Excitation segment out of range
  for (const exc of excitations) {
    const wire = wires.find((w) => w.tag === exc.wire_tag);
    if (wire && exc.segment > wire.segments) {
      issues.push({
        severity: "error",
        code: "excitation_segment_range",
        message: `Excitation on wire ${exc.wire_tag} references segment ${exc.segment}, but wire only has ${wire.segments} segments.`,
        wireTags: [exc.wire_tag],
      });
    }
  }

  // 5. Zero-length wires
  for (const w of wires) {
    if (wireLength(w) < 1e-6) {
      issues.push({
        severity: "error",
        code: "zero_length_wire",
        message: `Wire ${w.tag} has zero or near-zero length. Remove it or adjust endpoints.`,
        wireTags: [w.tag],
      });
    }
  }

  // 6. Lambda/10 segmentation check
  const maxFreq = Math.max(frequency.start_mhz, frequency.stop_mhz);
  const wavelength = 300 / maxFreq; // metres
  const maxSegLen = wavelength / 10;
  for (const w of wires) {
    const len = wireLength(w);
    if (len < 1e-6) continue; // already flagged
    const segLen = len / w.segments;
    if (segLen > maxSegLen * 1.5) {
      // Allow 50% over before warning
      issues.push({
        severity: "warning",
        code: "segment_too_long",
        message: `Wire ${w.tag} segments are ${segLen.toFixed(3)}m long, exceeding lambda/10 (${maxSegLen.toFixed(3)}m) at ${maxFreq} MHz. Increase segments for accurate results.`,
        wireTags: [w.tag],
      });
    }
  }

  // 7. Wire radius ratio check (NEC2 guideline: radius < segment_length / 2)
  for (const w of wires) {
    const len = wireLength(w);
    if (len < 1e-6) continue;
    const segLen = len / w.segments;
    if (w.radius > segLen / 2) {
      issues.push({
        severity: "warning",
        code: "radius_too_large",
        message: `Wire ${w.tag} radius (${(w.radius * 1000).toFixed(1)}mm) exceeds half its segment length (${(segLen * 500).toFixed(1)}mm). This may cause inaccurate results.`,
        wireTags: [w.tag],
      });
    }
  }

  // 8. Wires below ground with non-free-space ground
  if (ground.type !== "free_space") {
    const belowGround: number[] = [];
    for (const w of wires) {
      if (w.z1 < -0.001 || w.z2 < -0.001) {
        belowGround.push(w.tag);
      }
    }
    if (belowGround.length > 0) {
      issues.push({
        severity: "error",
        code: "wires_below_ground",
        message: `${belowGround.length} wire(s) extend below ground (Z<0). NEC2 does not support buried wires with this ground model. Raise them above Z=0 or use free space.`,
        wireTags: belowGround,
      });
    }
  }

  // 9. All wires at Z=0 with ground model (likely produces no radiation)
  if (ground.type !== "free_space" && wires.length > 0) {
    const allAtGround = wires.every(
      (w) => Math.abs(w.z1) < 0.001 && Math.abs(w.z2) < 0.001
    );
    if (allAtGround) {
      issues.push({
        severity: "warning",
        code: "all_wires_at_ground",
        message: "All wires are at ground level (Z=0). The antenna may show no radiation. Raise it above ground.",
      });
    }
  }

  // 10. Total segment count
  const totalSegments = wires.reduce((sum, w) => sum + w.segments, 0);
  if (totalSegments > 2000) {
    issues.push({
      severity: "warning",
      code: "high_segment_count",
      message: `Total segment count is ${totalSegments}. Simulations with >2000 segments may be slow.`,
    });
  }
  if (totalSegments > 10000) {
    issues.push({
      severity: "error",
      code: "segment_limit",
      message: `Total segment count is ${totalSegments}, exceeding the 10000-segment limit. Reduce wire count or segment density.`,
    });
  }

  // 11. Frequency range validation
  if (frequency.start_mhz >= frequency.stop_mhz) {
    issues.push({
      severity: "error",
      code: "frequency_range_invalid",
      message: "Start frequency must be less than stop frequency.",
    });
  }
  if (frequency.steps < 1) {
    issues.push({
      severity: "error",
      code: "frequency_steps_invalid",
      message: "Number of frequency steps must be at least 1.",
    });
  }

  // 12. Overlapping wires (identical endpoints)
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i]!;
      const b = wires[j]!;
      const sameForward =
        Math.abs(a.x1 - b.x1) < 1e-4 && Math.abs(a.y1 - b.y1) < 1e-4 && Math.abs(a.z1 - b.z1) < 1e-4 &&
        Math.abs(a.x2 - b.x2) < 1e-4 && Math.abs(a.y2 - b.y2) < 1e-4 && Math.abs(a.z2 - b.z2) < 1e-4;
      const sameReverse =
        Math.abs(a.x1 - b.x2) < 1e-4 && Math.abs(a.y1 - b.y2) < 1e-4 && Math.abs(a.z1 - b.z2) < 1e-4 &&
        Math.abs(a.x2 - b.x1) < 1e-4 && Math.abs(a.y2 - b.y1) < 1e-4 && Math.abs(a.z2 - b.z1) < 1e-4;
      if (sameForward || sameReverse) {
        issues.push({
          severity: "warning",
          code: "overlapping_wires",
          message: `Wires ${a.tag} and ${b.tag} have identical endpoints (overlapping). This may cause NEC2 errors.`,
          wireTags: [a.tag, b.tag],
        });
      }
    }
  }

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    valid: errorCount === 0,
    errorCount,
    warningCount,
  };
}
