/**
 * Web Worker for running the Nelder-Mead optimizer with NEC2 WASM.
 *
 * Each optimization iteration:
 *   1. Apply variable values to wires
 *   2. Build card deck → run nec2c WASM → parse output
 *   3. Evaluate objective function
 *   4. Post progress to main thread
 *
 * Communication protocol (postMessage):
 *   Main → Worker: OptimizerWorkerRequest
 *   Worker → Main: OptimizerProgressMessage | OptimizerResultMessage | OptimizerErrorMessage
 */

import type { FrequencyResult } from "../../api/nec";
import type { WireGeometry } from "../../templates/types";
import type {
  OptimizationRequest,
  OptimizationProgress,
  OptimizationResult,
} from "../types";
import type { Nec2cModule } from "./nec2c-module";
import { buildCardDeck } from "../parsers/nec-input";
import { parseNecOutput } from "../parsers/nec-output";
import { runOptimization, type SimulateFn } from "../optimizer/runner";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface OptimizerStartMessage {
  type: "start";
  id: string;
  request: OptimizationRequest;
}

export interface OptimizerCancelMessage {
  type: "cancel";
  id: string;
}

export type OptimizerWorkerRequest =
  | OptimizerStartMessage
  | OptimizerCancelMessage;

export interface OptimizerProgressMessage {
  type: "progress";
  id: string;
  data: OptimizationProgress;
}

export interface OptimizerResultMessage {
  type: "result";
  id: string;
  data: OptimizationResult;
}

export interface OptimizerErrorMessage {
  type: "error";
  id: string;
  message: string;
}

export type OptimizerWorkerResponse =
  | OptimizerProgressMessage
  | OptimizerResultMessage
  | OptimizerErrorMessage;

// ---------------------------------------------------------------------------
// WASM module management
// ---------------------------------------------------------------------------

let createNec2cFactory:
  | ((opts?: Record<string, unknown>) => Promise<Nec2cModule>)
  | null = null;

/**
 * Ensure the nec2c factory is loaded inside the optimizer worker.
 *
 * Module workers don't support importScripts, so we fetch the Emscripten
 * glue code as text and evaluate it.
 *
 * Uses `import.meta.env.BASE_URL` (statically replaced by Vite at build time)
 * to resolve WASM assets under the correct base path (e.g. `/AntennaSim/`).
 */
async function ensureFactory(): Promise<void> {
  if (createNec2cFactory) return;

  const wasmBase = import.meta.env.BASE_URL;
  const url = `${wasmBase}wasm/nec2c.js`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch nec2c.js (${response.status}). Ensure WASM artifacts are in public/wasm/.`,
    );
  }
  const scriptText = await response.text();

  (0, eval)(scriptText);

  const factory = (self as unknown as Record<string, unknown>)
    .createNec2c as typeof createNec2cFactory;
  if (!factory) {
    throw new Error("nec2c.js loaded but createNec2c not found on globalThis.");
  }
  createNec2cFactory = factory;
}

/**
 * Create a fresh nec2c WASM module instance.
 *
 * A fresh module is needed for each simulation because nec2c calls exit()
 * at the end of main(), which corrupts the module state in Emscripten's
 * EXIT_RUNTIME=0 mode.
 */
async function createModule(): Promise<Nec2cModule> {
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
// Simulation function for the optimizer
// ---------------------------------------------------------------------------

/**
 * Create a SimulateFn that runs each simulation in a fresh WASM module.
 *
 * A fresh module is needed per iteration because nec2c calls exit() which
 * corrupts the module state. The factory is already cached, so only
 * instantiation is repeated (fast).
 */
function createSimulateFn(): SimulateFn {
  return async (
    wires: WireGeometry[],
    request: OptimizationRequest,
  ): Promise<FrequencyResult[] | null> => {
    // Build a SimulateAdvancedRequest for the card deck builder
    const advRequest = {
      wires,
      excitations: request.excitations,
      ground: request.ground,
      frequency: {
        start_mhz: request.frequency_start_mhz,
        stop_mhz: request.frequency_stop_mhz,
        steps: Math.min(request.frequency_steps, 21),
      },
      loads: request.loads,
      transmission_lines: request.transmission_lines,
      compute_currents: false,
      // Hardcoded pattern config for optimizer (matching backend)
      pattern_step: 5,
      comment: "AntennaSim optimizer iteration",
    };

    try {
      const cardDeck = buildCardDeck(advRequest);

      // Create a fresh WASM module for this iteration
      const nec2c = await createModule();

      nec2c.FS.writeFile("/input.nec", cardDeck);
      try {
        nec2c.callMain(["-i", "/input.nec", "-o", "/output.out"]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("exit(0)") && !msg.includes("status = 0")) {
          return null;
        }
      }

      let output: string;
      try {
        output = nec2c.FS.readFile("/output.out", { encoding: "utf8" });
      } catch {
        return null;
      }

      // Pattern config matching the RP card from nec-input.ts
      // (full sphere for free space, upper hemisphere for ground)
      const patternStep = 5;
      const isFreeSpace = request.ground.type === "free_space";
      const thetaStart = isFreeSpace ? -180 : -90;
      const thetaRange = isFreeSpace ? 360 : 180;
      const nTheta = Math.floor(thetaRange / patternStep) + 1;
      const nPhi = Math.floor(360 / patternStep);

      const results = parseNecOutput(
        output,
        nTheta,
        nPhi,
        thetaStart,
        patternStep,
        0,
        patternStep,
        false,
      );

      return results.length > 0 ? results : null;
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Cancellation support
// ---------------------------------------------------------------------------

let cancelled = false;

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<OptimizerWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }

  if (msg.type === "start") {
    cancelled = false;

    try {
      await ensureFactory();
      const simulateFn = createSimulateFn();

      const onProgress = (progress: OptimizationProgress) => {
        if (cancelled) {
          throw new Error("Optimization cancelled");
        }
        const response: OptimizerProgressMessage = {
          type: "progress",
          id: msg.id,
          data: progress,
        };
        self.postMessage(response);
      };

      const result = await runOptimization(msg.request, simulateFn, onProgress);

      if (cancelled) {
        const response: OptimizerErrorMessage = {
          type: "error",
          id: msg.id,
          message: "Optimization cancelled",
        };
        self.postMessage(response);
        return;
      }

      const response: OptimizerResultMessage = {
        type: "result",
        id: msg.id,
        data: result,
      };
      self.postMessage(response);
    } catch (e: unknown) {
      const response: OptimizerErrorMessage = {
        type: "error",
        id: msg.id,
        message: e instanceof Error ? e.message : String(e),
      };
      self.postMessage(response);
    } finally {
      // No cleanup needed — each iteration creates a fresh module
    }
  }
};
