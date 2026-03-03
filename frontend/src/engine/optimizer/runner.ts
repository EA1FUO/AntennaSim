/**
 * Optimization runner — orchestrates Nelder-Mead with NEC2 simulations.
 *
 * Mirrors the Python backend optimizer but runs entirely in the frontend.
 * The caller supplies a `SimulateFn` that performs the actual NEC2 simulation
 * (either via the backend API or the WASM engine).
 */

import type { FrequencyResult } from "../../api/nec";
import type { WireGeometry } from "../../templates/types";
import type {
  OptimizationRequest,
  OptimizationProgress,
  OptimizationResult,
} from "../types";
import { nelderMead } from "./nelder-mead";
import { evaluateObjective } from "./objectives";

/** Penalty cost for failed / invalid simulations. */
const PENALTY = 1e6;

/**
 * A function that runs a NEC2 simulation and returns frequency results,
 * or null if the simulation fails. May be async (e.g. for WASM module creation).
 */
export type SimulateFn = (
  wires: WireGeometry[],
  request: OptimizationRequest,
) => FrequencyResult[] | null | Promise<FrequencyResult[] | null>;

/**
 * Apply optimization variable values to a wire array, returning a new copy.
 *
 * Variable names follow the pattern `{wire_tag}.{field}`. Linked variables
 * (for symmetry) are also applied with an optional scaling factor.
 */
export function applyVariables(
  wires: WireGeometry[],
  variables: OptimizationRequest["variables"],
  values: number[],
): WireGeometry[] {
  // Deep-clone wires so we don't mutate the originals
  const cloned: WireGeometry[] = wires.map((w) => ({ ...w }));

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i]!;
    const val = values[i]!;

    // Apply to primary wire
    for (const w of cloned) {
      if (w.tag === variable.wire_tag) {
        (w as unknown as Record<string, unknown>)[variable.field] = val;
        break;
      }
    }

    // Apply linked variable (symmetry)
    if (variable.linked_wire_tag != null && variable.linked_field != null) {
      const factor = variable.link_factor ?? 1;
      for (const w of cloned) {
        if (w.tag === variable.linked_wire_tag) {
          (w as unknown as Record<string, unknown>)[variable.linked_field] =
            val * factor;
          break;
        }
      }
    }
  }

  return cloned;
}

/**
 * Run the Nelder-Mead optimizer.
 *
 * Each objective-function evaluation calls `simulateFn` to run a full NEC2
 * simulation, then scores the result using `evaluateObjective`.
 *
 * @param request - Full optimization configuration (wires, variables, objective, etc.)
 * @param simulateFn - Function to run a single simulation.
 * @param onProgress - Optional callback invoked after each evaluation.
 * @returns Optimization result with optimized wires and history.
 */
export async function runOptimization(
  request: OptimizationRequest,
  simulateFn: SimulateFn,
  onProgress?: (progress: OptimizationProgress) => void,
): Promise<OptimizationResult> {
  const { variables } = request;

  const history: Array<{
    iteration: number;
    cost: number;
    values: Record<string, number>;
  }> = [];

  let bestCost = Infinity;
  let bestValues: Record<string, number> = {};
  let iterationCount = 0;

  // ---- Build initial values, bounds, and variable names ----
  const x0: number[] = [];
  const bounds: Array<[number, number]> = [];
  const varNames: string[] = [];

  for (const variable of variables) {
    if (variable.initial_value != null) {
      x0.push(variable.initial_value);
    } else {
      // Try to read the current value from the wire list
      let found = false;
      for (const w of request.wires) {
        if (w.tag === variable.wire_tag) {
          const currentVal = (w as unknown as Record<string, unknown>)[
            variable.field
          ];
          if (typeof currentVal === "number") {
            x0.push(currentVal);
          } else {
            x0.push((variable.min_value + variable.max_value) / 2);
          }
          found = true;
          break;
        }
      }
      if (!found) {
        x0.push((variable.min_value + variable.max_value) / 2);
      }
    }

    bounds.push([variable.min_value, variable.max_value]);
    varNames.push(`${variable.wire_tag}.${variable.field}`);
  }

  // Target frequency: explicit or center of band
  const targetFreqMhz =
    request.target_frequency_mhz ??
    (request.frequency_start_mhz + request.frequency_stop_mhz) / 2;

  // ---- Objective function wrapper ----
  async function objectiveFn(x: number[]): Promise<number> {
    iterationCount++;

    // Clamp values to bounds
    const xClamped = x.map((v, i) => {
      const [lo, hi] = bounds[i]!;
      return Math.max(lo, Math.min(hi, v));
    });

    // Apply variables to wires
    const modifiedWires = applyVariables(request.wires, variables, xClamped);

    // Run simulation
    let freqData: FrequencyResult[] | null;
    try {
      freqData = await simulateFn(modifiedWires, request);
    } catch {
      freqData = null;
    }

    if (!freqData || freqData.length === 0) {
      return PENALTY;
    }

    // Evaluate objective
    const cost = evaluateObjective(
      request.objective,
      freqData,
      targetFreqMhz,
    );

    // Track history and best
    const currentValues: Record<string, number> = {};
    for (let i = 0; i < varNames.length; i++) {
      currentValues[varNames[i]!] = round6(xClamped[i]!);
    }

    if (cost < bestCost) {
      bestCost = cost;
      bestValues = { ...bestValues, ...currentValues };
    }

    history.push({
      iteration: iterationCount,
      cost: round4(cost),
      values: currentValues,
    });

    // Emit progress
    if (onProgress) {
      try {
        onProgress({
          iteration: iterationCount,
          total_iterations: request.max_iterations,
          current_cost: round4(cost),
          best_cost: round4(bestCost),
          best_values: { ...bestValues },
          status: "running",
        });
      } catch {
        // Don't let callback errors break optimization
      }
    }

    return cost;
  }

  // ---- Run Nelder-Mead ----
  try {
    const result = await nelderMead(objectiveFn, x0, {
      maxIter: request.max_iterations,
      xatol: 0.001,
      fatol: 0.001,
      adaptive: true,
    });

    // Clamp final values to bounds
    const finalValues = result.x.map((v, i) => {
      const [lo, hi] = bounds[i]!;
      return Math.max(lo, Math.min(hi, v));
    });

    const optimizedWires = applyVariables(
      request.wires,
      variables,
      finalValues,
    );

    const optimizedValues: Record<string, number> = {};
    for (let i = 0; i < varNames.length; i++) {
      optimizedValues[varNames[i]!] = round6(finalValues[i]!);
    }

    const status = result.success ? "success" : "max_iterations";

    return {
      status,
      iterations_used: iterationCount,
      final_cost: round4(result.fun),
      optimized_values: optimizedValues,
      optimized_wires: optimizedWires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1,
        y1: w.y1,
        z1: w.z1,
        x2: w.x2,
        y2: w.y2,
        z2: w.z2,
        radius: w.radius,
      })),
      history,
      message: result.message,
    };
  } catch (e: unknown) {
    // On any error, return the original wires with error status
    const errorValues: Record<string, number> = {};
    for (let i = 0; i < varNames.length; i++) {
      errorValues[varNames[i]!] = round6(x0[i]!);
    }

    return {
      status: "error",
      iterations_used: iterationCount,
      final_cost: bestCost < PENALTY ? round4(bestCost) : 0,
      optimized_values: errorValues,
      optimized_wires: request.wires.map((w) => ({
        tag: w.tag,
        segments: w.segments,
        x1: w.x1,
        y1: w.y1,
        z1: w.z1,
        x2: w.x2,
        y2: w.y2,
        z2: w.z2,
        radius: w.radius,
      })),
      history,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Round to 4 decimal places. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Round to 6 decimal places. */
function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}
