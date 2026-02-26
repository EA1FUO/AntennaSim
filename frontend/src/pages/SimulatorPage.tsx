import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { HealthResponse } from "../api/types";
import { SceneRoot } from "../components/three/SceneRoot";
import {
  CameraPresetsOverlay,
  getPresetCamera,
} from "../components/three/CameraPresets";
import { ViewToggleToolbar } from "../components/three/ViewToggleToolbar";
import type {
  WireData,
  FeedpointData,
  ViewToggles,
  CameraPreset,
} from "../components/three/types";

// Demo dipole wires for the 3D viewport
const DEMO_WIRES: WireData[] = [
  {
    tag: 1,
    segments: 21,
    x1: -5.1,
    y1: 0,
    z1: 10,
    x2: 0,
    y2: 0,
    z2: 10,
    radius: 0.001,
  },
  {
    tag: 2,
    segments: 21,
    x1: 0,
    y1: 0,
    z1: 10,
    x2: 5.1,
    y2: 0,
    z2: 10,
    radius: 0.001,
  },
];

const DEMO_FEEDPOINTS: FeedpointData[] = [
  { position: [0, 0, 10], wireTag: 1 },
];

const DEFAULT_TOGGLES: ViewToggles = {
  grid: true,
  wires: true,
  pattern: true,
  labels: false,
  compass: true,
  scale: false,
};

export function SimulatorPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewToggles, setViewToggles] = useState<ViewToggles>(DEFAULT_TOGGLES);
  const [activePreset, setActivePreset] = useState<CameraPreset | null>(
    "isometric"
  );

  useEffect(() => {
    api
      .get<HealthResponse>("/api/v1/health")
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  const handleToggle = useCallback((key: keyof ViewToggles) => {
    setViewToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePreset = useCallback((preset: CameraPreset) => {
    setActivePreset(preset);
    // Camera animation is handled by the controls
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Navbar */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold text-lg tracking-tight">
            AntSim
          </span>
          <span className="text-text-secondary text-xs">v0.1.0</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a
            href="/"
            className="text-text-primary hover:text-accent transition-colors"
          >
            Simulator
          </a>
          <a
            href="/about"
            className="text-text-secondary hover:text-accent transition-colors"
          >
            About
          </a>
        </nav>
      </header>

      {/* Main content — 3D viewport */}
      <main className="flex-1 relative">
        {/* 3D Canvas */}
        <SceneRoot
          wires={DEMO_WIRES}
          feedpoints={DEMO_FEEDPOINTS}
          viewToggles={viewToggles}
        />

        {/* Camera presets overlay */}
        <CameraPresetsOverlay
          onPreset={handlePreset}
          activePreset={activePreset}
        />

        {/* View toggles overlay */}
        <ViewToggleToolbar toggles={viewToggles} onToggle={handleToggle} />

        {/* Backend status badge */}
        <div className="absolute top-2 left-2 z-10">
          <div className="px-2 py-1 rounded text-xs bg-surface/80 backdrop-blur-sm border border-border/50">
            {error && (
              <span className="text-swr-bad">Backend offline</span>
            )}
            {health && (
              <span className="text-swr-excellent">
                NEC2 {health.nec2c_available ? "Ready" : "N/A"}
              </span>
            )}
            {!error && !health && (
              <span className="text-text-secondary animate-pulse">
                Connecting...
              </span>
            )}
          </div>
        </div>
      </main>

      {/* Status bar */}
      <footer className="flex items-center px-4 h-8 border-t border-border bg-surface text-xs text-text-secondary shrink-0 font-mono">
        <span>AntSim v0.1.0 | NEC2 | Demo: Half-wave dipole 20m @ 10m</span>
      </footer>
    </div>
  );
}
