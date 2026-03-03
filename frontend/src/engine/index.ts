/**
 * Engine factory — returns the appropriate SimulationEngine based on VITE_ENGINE.
 *
 * - "backend" (default): BackendEngine using REST API + WebSocket
 * - "wasm": WasmEngine using nec2c compiled to WebAssembly (GitHub Pages)
 */

import type { SimulationEngine } from "./types";
import { BackendEngine } from "./backend";
import { WasmEngine } from "./wasm";

let _engine: SimulationEngine | null = null;

/** Get the singleton SimulationEngine instance */
export function getEngine(): SimulationEngine {
  if (!_engine) {
    const mode = import.meta.env.VITE_ENGINE as string | undefined;
    if (mode === "wasm") {
      _engine = new WasmEngine();
    } else {
      _engine = new BackendEngine();
    }
  }
  return _engine;
}

// Re-export types for convenience
export type {
  SimulationEngine,
  SimulateRequest,
  SimulateAdvancedRequest,
  ImportResult,
  ExportData,
  OptimizationRequest,
  OptimizationProgress,
  OptimizationResult,
} from "./types";
