/**
 * Simulation state store — results, loading state, history.
 *
 * Manages the lifecycle of simulation requests: idle -> loading -> results/error.
 * Stores the most recent result for display in charts and 3D pattern.
 *
 * V1: simulate() for template-based (single excitation)
 * V2: simulateAdvanced() for editor (loads, TL, multiple excitations, currents)
 *
 * Uses the SimulationEngine abstraction — backend REST API or local WASM,
 * selected at build time via VITE_ENGINE.
 */

import { create } from "zustand";
import type { SimulationResult, FrequencyResult } from "../api/nec";
import type { WireGeometry, Excitation, GroundConfig, FrequencyRange, FrequencySegment } from "../templates/types";
import type { SimulateAdvancedRequest } from "../engine/types";
import { getEngine } from "../engine";

export type SimulationStatus = "idle" | "loading" | "success" | "error";

/** V2 advanced simulation options (matches SimulateAdvancedRequest without wires/excitations/ground/frequency duplication) */
export type AdvancedSimulationOptions = SimulateAdvancedRequest;

interface SimulationState {
  /** Current simulation status */
  status: SimulationStatus;
  /** Latest simulation result */
  result: SimulationResult | null;
  /** Error message if status is "error" */
  error: string | null;
  /** Currently selected frequency index for pattern display */
  selectedFreqIndex: number;

  // Derived convenience getters
  /** Get the frequency result at the selected index */
  getSelectedFrequencyResult: () => FrequencyResult | null;
  /** Is a simulation currently running? */
  isLoading: () => boolean;

  // Actions
  /** V1: Run a simulation with template parameters */
  simulate: (
    wires: WireGeometry[],
    excitation: Excitation,
    ground: GroundConfig,
    frequency: FrequencyRange,
    patternStep?: number,
    frequencySegments?: FrequencySegment[]
  ) => Promise<void>;
  /** V2: Run an advanced simulation with all V2 features */
  simulateAdvanced: (options: AdvancedSimulationOptions) => Promise<void>;
  /** Set the selected frequency index for pattern display */
  setSelectedFreqIndex: (index: number) => void;
  /** Clear results and reset to idle */
  reset: () => void;
}

/** Find the frequency index with the lowest SWR */
function findBestSwrIndex(result: SimulationResult): number {
  let bestIdx = 0;
  let bestSwr = Infinity;
  for (let i = 0; i < result.frequency_data.length; i++) {
    const swr = result.frequency_data[i]!.swr_50;
    if (swr < bestSwr) {
      bestSwr = swr;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  status: "idle",
  result: null,
  error: null,
  selectedFreqIndex: 0,

  getSelectedFrequencyResult: () => {
    const { result, selectedFreqIndex } = get();
    if (!result || result.frequency_data.length === 0) return null;
    const idx = Math.min(selectedFreqIndex, result.frequency_data.length - 1);
    return result.frequency_data[idx] ?? null;
  },

  isLoading: () => get().status === "loading",

  simulate: async (wires, excitation, ground, frequency, patternStep, frequencySegments) => {
    set({ status: "loading", error: null });

    try {
      const engine = getEngine();
      const result = await engine.simulate({
        wires,
        excitation,
        ground,
        frequency,
        frequencySegments: frequencySegments?.length ? frequencySegments : undefined,
        patternStep,
      });
      set({ status: "success", result, selectedFreqIndex: findBestSwrIndex(result) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Simulation failed";
      set({ status: "error", error: message, result: null });
    }
  },

  simulateAdvanced: async (options) => {
    set({ status: "loading", error: null });

    try {
      const engine = getEngine();
      const result = await engine.simulateAdvanced(options);
      set({ status: "success", result, selectedFreqIndex: findBestSwrIndex(result) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Simulation failed";
      set({ status: "error", error: message, result: null });
    }
  },

  setSelectedFreqIndex: (index) => {
    set({ selectedFreqIndex: index });
  },

  reset: () => {
    set({ status: "idle", result: null, error: null, selectedFreqIndex: 0 });
  },
}));
