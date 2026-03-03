/**
 * Web Worker for running NEC2 simulations via the nec2c WASM module.
 *
 * Communication protocol (postMessage):
 *   Main → Worker: WorkerRequest  (simulate or simulateAdvanced)
 *   Worker → Main: WorkerResponse (success with SimulationResult, or error)
 *
 * Each simulation:
 *   1. Build NEC2 card deck from the request
 *   2. Load a fresh nec2c WASM module
 *   3. Write card deck to MEMFS, call main(), read output
 *   4. Parse output with the TS output parser
 *   5. Post result back to main thread
 */

import type { SimulationResult, NearFieldResult } from "../../api/nec";
import type { SimulateAdvancedRequest } from "../types";
import type { Nec2cModule } from "./nec2c-module";
import { buildCardDeck } from "../parsers/nec-input";
import { parseNecOutput, parseNearFieldOutput } from "../parsers/nec-output";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface SimulateMessage {
  type: "simulate";
  id: string;
  request: SimulateAdvancedRequest;
}

export type WorkerRequest = SimulateMessage;

export interface WorkerSuccessResponse {
  type: "success";
  id: string;
  result: SimulationResult;
}

export interface WorkerErrorResponse {
  type: "error";
  id: string;
  message: string;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

// ---------------------------------------------------------------------------
// WASM module management within the worker
// ---------------------------------------------------------------------------

let createNec2cFactory:
  | ((opts?: Record<string, unknown>) => Promise<Nec2cModule>)
  | null = null;

/**
 * Ensure the nec2c factory is loaded inside the worker.
 *
 * Module workers don't support importScripts, so we fetch the Emscripten
 * glue code as text and evaluate it. The script defines `createNec2c`
 * on globalThis (self in a worker context).
 *
 * Uses `import.meta.env.BASE_URL` (statically replaced by Vite at build time)
 * to resolve WASM assets under the correct base path (e.g. `/AntennaSim/`).
 */
async function ensureFactory(): Promise<void> {
  if (createNec2cFactory) return;

  // Fetch and evaluate the Emscripten glue code
  const wasmBase = import.meta.env.BASE_URL;
  const url = `${wasmBase}wasm/nec2c.js`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch nec2c.js (${response.status}). Ensure WASM artifacts are in public/wasm/.`,
    );
  }
  const scriptText = await response.text();

  // Evaluate in worker scope — Emscripten sets createNec2c on globalThis
  (0, eval)(scriptText);

  const factory = (self as unknown as Record<string, unknown>)
    .createNec2c as typeof createNec2cFactory;
  if (!factory) {
    throw new Error(
      "nec2c.js loaded but createNec2c not found on globalThis.",
    );
  }
  createNec2cFactory = factory;
}

/**
 * Load a fresh nec2c module instance within the worker.
 */
async function loadModule(): Promise<Nec2cModule> {
  await ensureFactory();

  const wasmBase = import.meta.env.BASE_URL;

  const noop = () => {};
  return createNec2cFactory!({
    locateFile: (path: string) => {
      if (path.endsWith(".wasm")) {
        return `${wasmBase}wasm/nec2c.wasm`;
      }
      return path;
    },
    print: noop,
    printErr: noop,
  });
}

// ---------------------------------------------------------------------------
// Simulation execution
// ---------------------------------------------------------------------------

async function runSimulationAsync(
  request: SimulateAdvancedRequest,
): Promise<SimulationResult> {
  const t0 = performance.now();

  // 1. Build card deck
  const cardDeck = buildCardDeck(request);

  // 2. Load WASM module
  const nec2c = await loadModule();

  // 3. Run nec2c
  nec2c.FS.writeFile("/input.nec", cardDeck);
  try {
    nec2c.callMain(["-i", "/input.nec", "-o", "/output.out"]);
  } catch (e: unknown) {
    // nec2c calls exit() on errors, which throws in Emscripten
    const msg = e instanceof Error ? e.message : String(e);
    // Emscripten exit(0) also throws — check for success exit
    if (!msg.includes("exit(0)") && !msg.includes("status = 0")) {
      throw new Error(`nec2c execution failed: ${msg}`);
    }
  }

  // 4. Read output
  let output: string;
  try {
    output = nec2c.FS.readFile("/output.out", { encoding: "utf8" });
  } catch {
    throw new Error(
      "nec2c did not produce output. The antenna geometry may be invalid.",
    );
  }

  // 5. Parse output
  const patternStep = request.pattern_step ?? 5;
  const nTheta = Math.floor(180 / patternStep) + 1;
  const nPhi = Math.floor(360 / patternStep);
  const thetaStart = -90;
  const thetaStep = patternStep;
  const phiStart = 0;
  const phiStep = patternStep;

  const frequencyData = parseNecOutput(
    output,
    nTheta,
    nPhi,
    thetaStart,
    thetaStep,
    phiStart,
    phiStep,
    request.compute_currents ?? true,
  );

  if (frequencyData.length === 0) {
    throw new Error(
      "No frequency data parsed from nec2c output. Check antenna geometry.",
    );
  }

  // 6. Parse near-field if requested
  let nearField: NearFieldResult | null = null;
  if (request.near_field) {
    const nf = request.near_field;
    nearField = parseNearFieldOutput(output, nf.plane, nf.height_m, nf.extent_m, nf.resolution_m);
  }

  // 7. Compute total segments
  let totalSegments = 0;
  for (const wire of request.wires) {
    totalSegments += wire.segments;
  }

  const elapsed = Math.round(performance.now() - t0);

  return {
    simulation_id: `wasm-${Date.now().toString(36)}`,
    engine: "wasm-nec2c",
    computed_in_ms: elapsed,
    total_segments: totalSegments,
    cached: false,
    frequency_data: frequencyData,
    near_field: nearField,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === "simulate") {
    try {
      const result = await runSimulationAsync(msg.request);
      const response: WorkerSuccessResponse = {
        type: "success",
        id: msg.id,
        result,
      };
      self.postMessage(response);
    } catch (e: unknown) {
      const response: WorkerErrorResponse = {
        type: "error",
        id: msg.id,
        message: e instanceof Error ? e.message : String(e),
      };
      self.postMessage(response);
    }
  }
};
