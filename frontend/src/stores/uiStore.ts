/**
 * UI state store — theme, sidebar, layout preferences, view toggles.
 */

import { create } from "zustand";
import type { ViewToggles } from "../components/three/types";
import type { S1PFile } from "../utils/s1p-parser";
import type { MatchingConfig } from "../utils/units";
import { DEFAULT_MATCHING } from "../utils/units";

export type Theme = "dark" | "light";
export type ResultsTab = "swr" | "impedance" | "pattern" | "gain" | "smith";
export type MobileTab = "antenna" | "results";

interface UIState {
  /** Current color theme */
  theme: Theme;
  /** Whether sidebar is collapsed (desktop) */
  sidebarCollapsed: boolean;
  /** Unit system */
  imperial: boolean;
  /** 3D viewport view toggles */
  viewToggles: ViewToggles;
  /** Active results tab */
  resultsTab: ResultsTab;
  /** Active mobile bottom sheet tab */
  mobileTab: MobileTab;
  /** Imported .s1p file for SWR overlay */
  s1pFile: S1PFile | null;
  /** Impedance matching (balun/unun) configuration */
  matching: MatchingConfig;
  /** Show feedpoint marker at exact NEC2 segment center (true) or snapped to wire edge (false) */
  accurateFeedpoint: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setImperial: (imperial: boolean) => void;
  toggleUnits: () => void;
  setViewToggle: (key: keyof ViewToggles, value: boolean) => void;
  toggleView: (key: keyof ViewToggles) => void;
  setResultsTab: (tab: ResultsTab) => void;
  setMobileTab: (tab: MobileTab) => void;
  setS1PFile: (file: S1PFile | null) => void;
  setMatching: (matching: MatchingConfig) => void;
  setAccurateFeedpoint: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "dark",
  sidebarCollapsed: false,
  imperial: false,
  viewToggles: {
    grid: true,
    wires: true,
    pattern: true,
    labels: false,
    compass: true,
    scale: false,
    current: false,
    reflection: false,
    volumetric: false,
    nearField: false,
    currentFlow: false,
    slice: false,
  },
  resultsTab: "swr",
  mobileTab: "antenna",
  s1pFile: null,
  matching: { ...DEFAULT_MATCHING },
  accurateFeedpoint: false,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setImperial: (imperial) => set({ imperial }),
  toggleUnits: () => set((s) => ({ imperial: !s.imperial })),
  setViewToggle: (key, value) =>
    set((s) => ({ viewToggles: { ...s.viewToggles, [key]: value } })),
  toggleView: (key) =>
    set((s) => ({
      viewToggles: { ...s.viewToggles, [key]: !s.viewToggles[key] },
    })),
  setResultsTab: (tab) => set({ resultsTab: tab }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setS1PFile: (file) => set({ s1pFile: file }),
  setMatching: (matching) => set({ matching }),
  setAccurateFeedpoint: (value) => set({ accurateFeedpoint: value }),
}));
