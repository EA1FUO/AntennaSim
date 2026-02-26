/**
 * UI state store — theme, sidebar, layout preferences, view toggles.
 */

import { create } from "zustand";
import type { ViewToggles, CameraPreset } from "../components/three/types";

export type Theme = "dark" | "light";
export type ResultsTab = "swr" | "impedance" | "pattern" | "gain";
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
  /** Active camera preset (null = user-manipulated) */
  activePreset: CameraPreset | null;
  /** Active results tab */
  resultsTab: ResultsTab;
  /** Active mobile bottom sheet tab */
  mobileTab: MobileTab;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setImperial: (imperial: boolean) => void;
  toggleUnits: () => void;
  setViewToggle: (key: keyof ViewToggles, value: boolean) => void;
  toggleView: (key: keyof ViewToggles) => void;
  setActivePreset: (preset: CameraPreset | null) => void;
  setResultsTab: (tab: ResultsTab) => void;
  setMobileTab: (tab: MobileTab) => void;
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
  },
  activePreset: "isometric" as CameraPreset,
  resultsTab: "swr",
  mobileTab: "antenna",

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
  setActivePreset: (preset) => set({ activePreset: preset }),
  setResultsTab: (tab) => set({ resultsTab: tab }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
}));
