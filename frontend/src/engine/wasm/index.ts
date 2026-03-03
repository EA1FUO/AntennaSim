/**
 * WasmEngine — SimulationEngine implementation using nec2c compiled to WebAssembly.
 *
 * Runs simulations entirely in the browser via Web Workers:
 * - `simulate` / `simulateAdvanced` → worker.ts
 * - `optimize` → worker-optimizer.ts
 * - `importFile` / `exportFile` → inline (no WASM needed, pure TS parsers)
 *
 * Used when VITE_ENGINE=wasm (GitHub Pages / static deployment).
 */

import type { SimulationResult } from "../../api/nec";
import type {
  SimulationEngine,
  SimulateRequest,
  SimulateAdvancedRequest,
  ImportResult,
  ExportData,
  OptimizationRequest,
  OptimizationProgress,
  OptimizationResult,
} from "../types";
import { parseNecFile } from "../parsers/nec-file";
import { parseMaa } from "../parsers/maa-import";
import { exportMaa } from "../parsers/maa-export";
import { buildCardDeck } from "../parsers/nec-input";
import type {
  WorkerRequest,
  WorkerResponse,
} from "./worker";
import type {
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
} from "./worker-optimizer";

// ---------------------------------------------------------------------------
// Worker pool (single worker per type, lazy-initialized)
// ---------------------------------------------------------------------------

let simWorker: Worker | null = null;
let optWorker: Worker | null = null;

function getSimWorker(): Worker {
  if (!simWorker) {
    simWorker = new Worker(
      new URL("./worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return simWorker;
}

function getOptWorker(): Worker {
  if (!optWorker) {
    optWorker = new Worker(
      new URL("./worker-optimizer.ts", import.meta.url),
      { type: "module" },
    );
  }
  return optWorker;
}

// ---------------------------------------------------------------------------
// Pending request tracking
// ---------------------------------------------------------------------------

/** Map from request ID to { resolve, reject } for pending simulation requests. */
const pendingRequests = new Map<
  string,
  { resolve: (r: SimulationResult) => void; reject: (e: Error) => void }
>();

/** Counter for generating unique request IDs */
let nextRequestId = 0;

function generateId(): string {
  return `req-${++nextRequestId}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Worker message handlers (set up lazily)
// ---------------------------------------------------------------------------

let simWorkerListenerAttached = false;

function ensureSimWorkerListener(): void {
  if (simWorkerListenerAttached) return;
  simWorkerListenerAttached = true;

  getSimWorker().addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;

    pendingRequests.delete(msg.id);

    if (msg.type === "success") {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.message));
    }
  });

  getSimWorker().addEventListener("error", (event) => {
    // If the worker crashes, reject all pending requests
    const error = new Error(`Simulation worker error: ${event.message}`);
    for (const [id, pending] of pendingRequests) {
      pending.reject(error);
      pendingRequests.delete(id);
    }
    // Reset worker so it can be re-created
    simWorker = null;
    simWorkerListenerAttached = false;
  });
}

// ---------------------------------------------------------------------------
// WasmEngine
// ---------------------------------------------------------------------------

export class WasmEngine implements SimulationEngine {
  /**
   * V1: Basic simulation (template mode, single excitation).
   *
   * Converts to a SimulateAdvancedRequest and delegates to simulateAdvanced.
   */
  async simulate(request: SimulateRequest): Promise<SimulationResult> {
    const advancedRequest: SimulateAdvancedRequest = {
      wires: request.wires,
      excitations: [
        {
          wire_tag: request.excitation.wire_tag,
          segment: request.excitation.segment,
          voltage_real: request.excitation.voltage_real,
          voltage_imag: request.excitation.voltage_imag,
        },
      ],
      ground: request.ground,
      frequency: request.frequency,
      compute_currents: true,
      pattern_step: request.patternStep,
      comment: "AntennaSim simulation",
    };

    return this.simulateAdvanced(advancedRequest);
  }

  /**
   * V2: Advanced simulation (editor mode).
   *
   * Sends the request to the simulation Web Worker and awaits the result.
   */
  async simulateAdvanced(
    request: SimulateAdvancedRequest,
  ): Promise<SimulationResult> {
    ensureSimWorkerListener();

    const id = generateId();

    const message: WorkerRequest = {
      type: "simulate",
      id,
      request,
    };

    return new Promise<SimulationResult>((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      getSimWorker().postMessage(message);
    });
  }

  /**
   * Import a .nec or .maa file.
   *
   * Runs entirely on the main thread using the TS parsers (no WASM needed).
   */
  async importFile(
    content: string,
    format: "nec" | "maa",
  ): Promise<ImportResult> {
    if (format === "nec") {
      return parseNecFile(content);
    } else {
      return parseMaa(content);
    }
  }

  /**
   * Export to .nec or .maa format.
   *
   * Runs entirely on the main thread using the TS generators.
   */
  async exportFile(data: ExportData, format: "nec" | "maa"): Promise<string> {
    if (format === "maa") {
      const centerFreq =
        (data.frequency_start_mhz + data.frequency_stop_mhz) / 2;
      return exportMaa(
        data.title,
        data.wires,
        data.excitations,
        data.loads,
        centerFreq,
      );
    }

    // NEC format: use buildCardDeck to generate the card deck
    const cardDeck = buildCardDeck({
      wires: data.wires,
      excitations: data.excitations,
      ground: data.ground,
      frequency: {
        start_mhz: data.frequency_start_mhz,
        stop_mhz: data.frequency_stop_mhz,
        steps: data.frequency_steps,
      },
      loads: data.loads,
      transmission_lines: data.transmission_lines,
      compute_currents: true,
      comment: data.title || "AntennaSim export",
    });
    return cardDeck;
  }

  /**
   * Run optimizer with progress callback.
   *
   * Spawns a dedicated Web Worker that runs Nelder-Mead with WASM simulations.
   * Returns a cancel function and a result promise.
   */
  async optimize(
    request: OptimizationRequest,
    onProgress: (progress: OptimizationProgress) => void,
  ): Promise<{ result: Promise<OptimizationResult>; cancel: () => void }> {
    // Create a fresh optimizer worker for each run
    // (we terminate the old one if present to free resources)
    if (optWorker) {
      optWorker.terminate();
      optWorker = null;
    }

    const worker = getOptWorker();
    const id = generateId();

    let cancel = () => {
      const cancelMsg: OptimizerWorkerRequest = { type: "cancel", id };
      worker.postMessage(cancelMsg);
    };

    const resultPromise = new Promise<OptimizationResult>(
      (resolve, reject) => {
        const handleMessage = (event: MessageEvent<OptimizerWorkerResponse>) => {
          const msg = event.data;
          if (msg.id !== id) return;

          switch (msg.type) {
            case "progress":
              onProgress(msg.data);
              break;
            case "result":
              cleanup();
              resolve(msg.data);
              break;
            case "error":
              cleanup();
              reject(new Error(msg.message));
              break;
          }
        };

        const handleError = (event: ErrorEvent) => {
          cleanup();
          reject(new Error(`Optimizer worker error: ${event.message}`));
        };

        const cleanup = () => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
        };

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);

        cancel = () => {
          const cancelMsg: OptimizerWorkerRequest = { type: "cancel", id };
          worker.postMessage(cancelMsg);
          cleanup();
          reject(new Error("Optimization cancelled"));
        };
      },
    );

    // Send the start message
    const startMsg: OptimizerWorkerRequest = {
      type: "start",
      id,
      request,
    };
    worker.postMessage(startMsg);

    return { result: resultPromise, cancel };
  }
}
