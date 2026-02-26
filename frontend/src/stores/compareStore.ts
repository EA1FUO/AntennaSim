/**
 * Compare store — stores multiple simulation results for overlay comparison.
 *
 * Users can save the current simulation result, then run another simulation
 * and overlay the two results in charts and 3D pattern.
 */

import { create } from "zustand";
import type { SimulationResult } from "../api/nec";

export interface SavedResult {
  id: string;
  label: string;
  timestamp: number;
  result: SimulationResult;
  color: string;
}

const COMPARE_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
];

interface CompareState {
  /** Saved simulation results for comparison */
  savedResults: SavedResult[];
  /** Whether compare mode is active */
  isComparing: boolean;
  /** Maximum saved results */
  maxResults: number;

  // Actions
  /** Save current result for comparison */
  saveResult: (result: SimulationResult, label?: string) => void;
  /** Remove a saved result */
  removeResult: (id: string) => void;
  /** Clear all saved results */
  clearAll: () => void;
  /** Toggle compare mode */
  setComparing: (comparing: boolean) => void;
}

let nextId = 1;

export const useCompareStore = create<CompareState>((set, get) => ({
  savedResults: [],
  isComparing: false,
  maxResults: 6,

  saveResult: (result, label) => {
    const { savedResults, maxResults } = get();
    if (savedResults.length >= maxResults) {
      // Remove oldest
      set({ savedResults: savedResults.slice(1) });
    }
    const id = `compare-${nextId++}`;
    const colorIdx = savedResults.length % COMPARE_COLORS.length;
    const saved: SavedResult = {
      id,
      label: label ?? `Run ${nextId - 1}`,
      timestamp: Date.now(),
      result,
      color: COMPARE_COLORS[colorIdx]!,
    };
    set((s) => ({ savedResults: [...s.savedResults, saved] }));
  },

  removeResult: (id) => {
    set((s) => ({
      savedResults: s.savedResults.filter((r) => r.id !== id),
    }));
  },

  clearAll: () => {
    set({ savedResults: [], isComparing: false });
  },

  setComparing: (comparing) => {
    set({ isComparing: comparing });
  },
}));
