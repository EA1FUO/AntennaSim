/**
 * Main Simulator page — the core UI of AntennaSim.
 *
 * Desktop layout:
 *   [Left Panel: Template + Params] [3D Viewport] [Right Panel: Results]
 *
 * Mobile layout:
 *   [3D Viewport (45%)] [Bottom Sheet: Antenna | Results tabs]
 */

import { useCallback, useEffect, useState } from "react";
import { useAntennaStore } from "../stores/antennaStore";
import { useSimulationStore } from "../stores/simulationStore";
import { useUIStore } from "../stores/uiStore";
import { SceneRoot } from "../components/three/SceneRoot";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { KeyboardShortcutsPanel } from "../components/common/KeyboardShortcutsPanel";
import { ViewToggleToolbar } from "../components/three/ViewToggleToolbar";
import { Navbar } from "../components/layout/Navbar";
import { StatusBar } from "../components/layout/StatusBar";
import { TemplatePicker } from "../components/editors/TemplatePicker";
import { ParameterPanel } from "../components/editors/ParameterPanel";
import { GroundEditor } from "../components/editors/GroundEditor";
import { BalunEditor } from "../components/editors/BalunEditor";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { ColorScale } from "../components/ui/ColorScale";
import { SimulationLoadingOverlay } from "../components/ui/SimulationLoadingOverlay";
import { ResultsPanel } from "../components/results/ResultsTabs";
import { PatternFrequencySlider } from "../components/results/PatternFrequencySlider";
import type { AntennaTemplate } from "../templates/types";
import type { ViewToggles } from "../components/three/types";

/** Mobile bottom sheet tabs */
const MOBILE_SEGMENTS = [
  { key: "antenna", label: "Antenna" },
  { key: "results", label: "Results" },
];

export function SimulatorPage() {
  // Antenna store
  const template = useAntennaStore((s) => s.template);
  const params = useAntennaStore((s) => s.params);
  const ground = useAntennaStore((s) => s.ground);
  const wireData = useAntennaStore((s) => s.wireData);
  const feedpoints = useAntennaStore((s) => s.feedpoints);
  const wireGeometry = useAntennaStore((s) => s.wireGeometry);
  const excitation = useAntennaStore((s) => s.excitation);
  const frequencyRange = useAntennaStore((s) => s.frequencyRange);
  const setTemplate = useAntennaStore((s) => s.setTemplate);
  const setParam = useAntennaStore((s) => s.setParam);
  const setGround = useAntennaStore((s) => s.setGround);

  // Simulation store
  const simStatus = useSimulationStore((s) => s.status);
  const simError = useSimulationStore((s) => s.error);
  const result = useSimulationStore((s) => s.result);
  const simulate = useSimulationStore((s) => s.simulate);
  const resetSimulation = useSimulationStore((s) => s.reset);
  const selectedFreqResult = useSimulationStore((s) =>
    s.getSelectedFrequencyResult()
  );

  // UI store
  const viewToggles = useUIStore((s) => s.viewToggles);
  const toggleView = useUIStore((s) => s.toggleView);
  const mobileTab = useUIStore((s) => s.mobileTab);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const matching = useUIStore((s) => s.matching);
  const setMatching = useUIStore((s) => s.setMatching);

  // Clear stale results on page entry (prevents cross-page state leaks)
  // and whenever antenna geometry or ground changes.
  useEffect(() => {
    resetSimulation();
  }, [wireGeometry, ground, resetSimulation]);

  // Handlers
  const handleTemplateSelect = useCallback(
    (t: AntennaTemplate) => setTemplate(t),
    [setTemplate]
  );

  const handleToggle = useCallback(
    (key: keyof ViewToggles) => toggleView(key),
    [toggleView]
  );

  // Pattern resolution
  const [patternStep, setPatternStep] = useState(5);

  const handleRunSimulation = useCallback(() => {
    simulate(wireGeometry, excitation, ground, frequencyRange, patternStep);
  }, [simulate, wireGeometry, excitation, ground, frequencyRange, patternStep]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const isLoading = simStatus === "loading";

  // Pattern data for 3D viewport
  const patternData = selectedFreqResult?.pattern ?? null;
  const currents = selectedFreqResult?.currents ?? null;
  const nearField = result?.near_field ?? null;

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Navbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-r border-border bg-surface overflow-y-auto shrink-0">
          <div className="p-3 space-y-4 flex-1">
            <TemplatePicker
              selectedId={template.id}
              onSelect={handleTemplateSelect}
            />

            <div className="border-t border-border" />

            <ParameterPanel
              parameters={template.parameters}
              values={params}
              onParamChange={setParam}
            />

            <div className="border-t border-border" />

            <GroundEditor ground={ground} onChange={setGround} />

            <div className="border-t border-border" />

            <BalunEditor matching={matching} onChange={setMatching} />

            <div className="border-t border-border" />

            {/* Pattern resolution */}
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
                Pattern Resolution
              </h3>
              <div className="flex items-center gap-2 px-1">
                <select
                  value={patternStep}
                  onChange={(e) => setPatternStep(parseInt(e.target.value, 10))}
                  className="flex-1 bg-background text-text-primary text-xs font-mono px-1.5 py-1 rounded border border-border outline-none"
                >
                  <option value="1">1° (very fine — slow)</option>
                  <option value="2">2° (fine)</option>
                  <option value="5">5° (standard)</option>
                  <option value="10">10° (fast)</option>
                </select>
              </div>
              {patternStep <= 2 && (
                <p className="text-[10px] text-swr-warning px-1 leading-tight">
                  Fine resolution increases computation time significantly.
                </p>
              )}
            </div>

            {/* Tips */}
            {template.tips.length > 0 && (
              <>
                <div className="border-t border-border" />
                <div className="space-y-1">
                  <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider px-1">
                    Tips
                  </h3>
                  <ul className="space-y-1">
                    {template.tips.slice(0, 3).map((tip, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-text-secondary leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-accent/40"
                      >
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Run button — bottom of left panel */}
          <div className="p-3 border-t border-border">
            <Button
              onClick={handleRunSimulation}
              loading={isLoading}
              disabled={isLoading}
              className="w-full"
              size="md"
            >
              {isLoading ? "Simulating..." : "Run Simulation"}
            </Button>
            {simError && (
              <p className="text-xs text-swr-bad mt-1.5 px-0.5">{simError}</p>
            )}
          </div>
        </aside>

        {/* === CENTER: 3D VIEWPORT === */}
        <main className="flex-1 relative min-w-0 min-h-0">
          <ErrorBoundary label="3D Viewport">
            <SceneRoot
              wires={wireData}
              feedpoints={feedpoints}
              viewToggles={viewToggles}
              patternData={patternData}
              currents={currents}
              nearField={nearField}
            />
          </ErrorBoundary>

          {/* Overlays */}
          <ViewToggleToolbar toggles={viewToggles} onToggle={handleToggle} />

          {/* Color scale legend (when pattern is visible) */}
          {(viewToggles.pattern || viewToggles.volumetric) && patternData && (
            <div className="absolute bottom-2 right-2 z-10">
              <ColorScale minLabel="Min" maxLabel="Max" unit="dBi" />
            </div>
          )}

          {/* Pattern frequency slider — bottom-right above dBi legend on mobile, centered on desktop */}
          {simStatus === "success" && result && result.frequency_data.length > 1 && (
            <>
              <div className="absolute bottom-8 right-2 z-10 w-36 lg:hidden">
                <PatternFrequencySlider compact />
              </div>
              <div className="hidden lg:block absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-64">
                <PatternFrequencySlider />
              </div>
            </>
          )}

          {/* Simulation loading overlay — blocks viewport interaction */}
          {isLoading && <SimulationLoadingOverlay />}
        </main>

        {/* === RIGHT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border bg-surface overflow-hidden shrink-0">
          <ErrorBoundary label="Results">
            <ResultsPanel />
          </ErrorBoundary>
        </aside>
      </div>

      {/* === MOBILE BOTTOM SHEET === */}
      <div className="lg:hidden border-t border-border bg-surface flex flex-col max-h-[50%]">
        <div className="px-3 pt-2 pb-1 shrink-0 flex items-center gap-2">
          <div className="flex-1">
            <SegmentedControl
              segments={MOBILE_SEGMENTS}
              activeKey={mobileTab}
              onChange={(key) => setMobileTab(key as typeof mobileTab)}
            />
          </div>
          <Button
            onClick={handleRunSimulation}
            loading={isLoading}
            disabled={isLoading}
            size="sm"
            className="shrink-0"
          >
            {isLoading ? "Running..." : "Run"}
          </Button>
        </div>
        {simError && (
          <p className="text-xs text-swr-bad px-3 pb-1">{simError}</p>
        )}
        <div className="px-3 py-2 flex-1 overflow-y-auto">
          {mobileTab === "antenna" && (
            <div className="space-y-3">
              <TemplatePicker
                selectedId={template.id}
                onSelect={handleTemplateSelect}
              />
              <ParameterPanel
                parameters={template.parameters}
                values={params}
                onParamChange={setParam}
              />
              <GroundEditor ground={ground} onChange={setGround} />
              <BalunEditor matching={matching} onChange={setMatching} />

              {/* Pattern resolution */}
              <div className="space-y-1">
                <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Pattern Resolution
                </h3>
                <select
                  value={patternStep}
                  onChange={(e) => setPatternStep(parseInt(e.target.value, 10))}
                  className="w-full bg-background text-text-primary text-xs font-mono px-1.5 py-1.5 rounded border border-border outline-none"
                >
                  <option value="1">1° (very fine — slow)</option>
                  <option value="2">2° (fine)</option>
                  <option value="5">5° (standard)</option>
                  <option value="10">10° (fast)</option>
                </select>
                {patternStep <= 2 && (
                  <p className="text-[11px] text-swr-warning leading-tight">
                    Fine resolution increases computation time significantly.
                  </p>
                )}
              </div>
            </div>
          )}
          {mobileTab === "results" && <ResultsPanel />}
        </div>
      </div>

      {/* StatusBar (desktop only — mobile has essential info in overlays) */}
      <div className="hidden lg:block">
        <StatusBar />
      </div>

      <KeyboardShortcutsPanel
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        mode="simulator"
      />
    </div>
  );
}
