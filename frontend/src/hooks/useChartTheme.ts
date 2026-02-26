/**
 * Returns Recharts-compatible color values based on current theme.
 * Recharts requires direct color strings (not CSS variables),
 * so we provide theme-appropriate values here.
 */

import { useMemo } from "react";
import { useUIStore } from "../stores/uiStore";

export interface ChartTheme {
  grid: string;
  axis: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipLabel: string;
  cursor: string;
}

const DARK: ChartTheme = {
  grid: "#2A2A35",
  axis: "#2A2A35",
  tick: "#8888A0",
  tooltipBg: "#13131A",
  tooltipBorder: "#2A2A35",
  tooltipLabel: "#8888A0",
  cursor: "#3B82F6",
};

const LIGHT: ChartTheme = {
  grid: "#D4D4D8",
  axis: "#D4D4D8",
  tick: "#71717A",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#D4D4D8",
  tooltipLabel: "#71717A",
  cursor: "#3B82F6",
};

export function useChartTheme(): ChartTheme {
  const theme = useUIStore((s) => s.theme);
  return useMemo(() => (theme === "dark" ? DARK : LIGHT), [theme]);
}
