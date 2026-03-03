/**
 * Objective function evaluators for antenna optimization.
 *
 * Each objective maps simulation results to a scalar cost value that the
 * Nelder-Mead optimizer tries to minimize. Maximization objectives (gain,
 * front-to-back ratio) are negated.
 */

import type { FrequencyResult } from "../../api/nec";
import type { OptimizationObjective } from "../types";

/** Penalty value returned when simulation data is missing or invalid. */
const PENALTY = 1e6;

/**
 * Evaluate an optimization objective against simulation results.
 *
 * @param objective - Which objective to compute.
 * @param freqData - Array of per-frequency simulation results.
 * @param targetFreqMhz - Target frequency in MHz (used for point objectives).
 * @param weights - Weights for the "combined" objective.
 * @returns Scalar cost value (lower is better).
 */
export function evaluateObjective(
  objective: OptimizationObjective,
  freqData: FrequencyResult[],
  targetFreqMhz: number,
  weights?: { swr_weight: number; gain_weight: number; fb_weight: number },
): number {
  if (freqData.length === 0) {
    return PENALTY;
  }

  if (objective === "min_swr") {
    const closest = findClosestFrequency(freqData, targetFreqMhz);
    return closest.swr_50;
  }

  if (objective === "min_swr_band") {
    let sum = 0;
    for (const d of freqData) {
      sum += d.swr_50;
    }
    return sum / freqData.length;
  }

  if (objective === "max_gain") {
    const closest = findClosestFrequency(freqData, targetFreqMhz);
    return -closest.gain_max_dbi;
  }

  if (objective === "max_fb") {
    const closest = findClosestFrequency(freqData, targetFreqMhz);
    const fb = closest.front_to_back_db ?? 0;
    return -fb;
  }

  if (objective === "combined") {
    const w = weights ?? { swr_weight: 1, gain_weight: 0, fb_weight: 0 };
    const closest = findClosestFrequency(freqData, targetFreqMhz);
    let cost = 0;
    if (w.swr_weight > 0) {
      cost += w.swr_weight * closest.swr_50;
    }
    if (w.gain_weight > 0) {
      cost -= w.gain_weight * closest.gain_max_dbi;
    }
    if (w.fb_weight > 0) {
      const fb = closest.front_to_back_db ?? 0;
      cost -= w.fb_weight * fb;
    }
    return cost;
  }

  return PENALTY;
}

/**
 * Find the frequency result closest to the target frequency.
 */
function findClosestFrequency(
  freqData: FrequencyResult[],
  targetMhz: number,
): FrequencyResult {
  let best = freqData[0]!;
  let bestDist = Math.abs(best.frequency_mhz - targetMhz);

  for (let i = 1; i < freqData.length; i++) {
    const d = freqData[i]!;
    const dist = Math.abs(d.frequency_mhz - targetMhz);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }

  return best;
}
