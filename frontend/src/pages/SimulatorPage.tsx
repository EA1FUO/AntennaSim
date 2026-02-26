/**
 * Main Simulator page — the core UI of AntSim.
 *
 * Desktop layout:
 *   [Left Panel: Template + Params] [3D Viewport] [Right Panel: Results]
 *
 * Mobile layout:
 *   [3D Viewport (45%)] [Bottom Sheet: Antenna | Results tabs]
 */

import { useCallback } from "react";
import { useAntennaStore } from "../stores/antennaStore";
import { useSimulationStore } from "../stores/simulationStore";
import { useUIStore } from "../stores/uiStore";
import { SceneRoot } from "../components/three/SceneRoot";
import {
  CameraPresetsOverlay,
} from "../components/three/CameraPresets";
import { ViewToggleToolbar } from "../components/three/ViewToggleToolbar";
import { Navbar } from "../components/layout/Navbar";
import { StatusBar } from "../components/layout/StatusBar";
import { TemplatePicker } from "../components/editors/TemplatePicker";
import { ParameterPanel } from "../components/editors/ParameterPanel";
import { GroundEditor } from "../components/editors/GroundEditor";
import { Button } from "../components/ui/Button";
import { Tabs } from "../components/ui/Tabs";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { formatSwr, formatImpedance, formatGain, swrColorClass } from "../utils/units";
import type { AntennaTemplate } from "../templates/types";
import type { CameraPreset, ViewToggles } from "../components/three/types";

/** Right panel results tabs */
const RESULTS_TABS = [
  { key: "swr", label: "SWR" },
  { key: "impedance", label: "Z" },
  { key: "pattern", label: "Pattern" },
  { key: "gain", label: "Gain" },
];

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
  const simResult = useSimulationStore((s) => s.result);
  const simError = useSimulationStore((s) => s.error);
  const simulate = useSimulationStore((s) => s.simulate);
  const selectedFreqResult = useSimulationStore((s) =>
    s.getSelectedFrequencyResult()
  );

  // UI store
  const viewToggles = useUIStore((s) => s.viewToggles);
  const toggleView = useUIStore((s) => s.toggleView);
  const activePreset = useUIStore((s) => s.activePreset);
  const setActivePreset = useUIStore((s) => s.setActivePreset);
  const resultsTab = useUIStore((s) => s.resultsTab);
  const setResultsTab = useUIStore((s) => s.setResultsTab);
  const mobileTab = useUIStore((s) => s.mobileTab);
  const setMobileTab = useUIStore((s) => s.setMobileTab);

  // Handlers
  const handleTemplateSelect = useCallback(
    (t: AntennaTemplate) => setTemplate(t),
    [setTemplate]
  );

  const handlePreset = useCallback(
    (preset: CameraPreset) => setActivePreset(preset),
    [setActivePreset]
  );

  const handleToggle = useCallback(
    (key: keyof ViewToggles) => toggleView(key),
    [toggleView]
  );

  const handleRunSimulation = useCallback(() => {
    simulate(wireGeometry, excitation, ground, frequencyRange);
  }, [simulate, wireGeometry, excitation, ground, frequencyRange]);

  const isLoading = simStatus === "loading";

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 border-r border-border bg-surface overflow-y-auto shrink-0">
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
        <main className="flex-1 relative min-w-0">
          <SceneRoot
            wires={wireData}
            feedpoints={feedpoints}
            viewToggles={viewToggles}
          />

          {/* Overlays */}
          <CameraPresetsOverlay
            onPreset={handlePreset}
            activePreset={activePreset}
          />
          <ViewToggleToolbar toggles={viewToggles} onToggle={handleToggle} />

          {/* Mobile run button (floating) */}
          <div className="lg:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
            <Button
              onClick={handleRunSimulation}
              loading={isLoading}
              disabled={isLoading}
              size="md"
              className="shadow-lg shadow-accent/20"
            >
              {isLoading ? "Simulating..." : "Run Simulation"}
            </Button>
          </div>
        </main>

        {/* === RIGHT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 border-l border-border bg-surface overflow-hidden shrink-0">
          <Tabs
            tabs={RESULTS_TABS}
            activeKey={resultsTab}
            onChange={(key) => setResultsTab(key as typeof resultsTab)}
          />

          <div className="flex-1 overflow-y-auto p-3">
            {simStatus === "idle" && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-text-secondary text-center px-4">
                  Run a simulation to see results here.
                </p>
              </div>
            )}

            {simStatus === "loading" && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-text-secondary">
                    Running NEC2 simulation...
                  </p>
                </div>
              </div>
            )}

            {simStatus === "error" && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-swr-bad text-center px-4">
                  {simError}
                </p>
              </div>
            )}

            {simStatus === "success" && simResult && (
              <div className="space-y-3">
                {/* Quick summary always visible */}
                <div className="grid grid-cols-2 gap-2">
                  {selectedFreqResult && (
                    <>
                      <div className="bg-background rounded-md p-2">
                        <div className="text-[10px] text-text-secondary">SWR</div>
                        <div
                          className={`text-lg font-mono font-bold ${swrColorClass(selectedFreqResult.swr_50)}`}
                        >
                          {formatSwr(selectedFreqResult.swr_50)}
                        </div>
                      </div>
                      <div className="bg-background rounded-md p-2">
                        <div className="text-[10px] text-text-secondary">Gain</div>
                        <div className="text-lg font-mono font-bold text-text-primary">
                          {formatGain(selectedFreqResult.gain_max_dbi)}
                        </div>
                      </div>
                      <div className="bg-background rounded-md p-2 col-span-2">
                        <div className="text-[10px] text-text-secondary">
                          Impedance
                        </div>
                        <div className="text-sm font-mono text-text-primary">
                          {formatImpedance(
                            selectedFreqResult.impedance.real,
                            selectedFreqResult.impedance.imag
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Tab-specific content placeholder (Phase 5 charts go here) */}
                <div className="border-t border-border pt-3">
                  {resultsTab === "swr" && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-text-secondary">
                        SWR vs Frequency
                      </h4>
                      {/* SWR Chart component will go here in Phase 5 */}
                      <div className="space-y-0.5">
                        {simResult.frequency_data.map((fd, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-[11px] font-mono"
                          >
                            <span className="text-text-secondary">
                              {fd.frequency_mhz.toFixed(3)}
                            </span>
                            <span className={swrColorClass(fd.swr_50)}>
                              {formatSwr(fd.swr_50)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resultsTab === "impedance" && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-medium text-text-secondary">
                        Impedance vs Frequency
                      </h4>
                      <div className="space-y-0.5">
                        {simResult.frequency_data.map((fd, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-[11px] font-mono"
                          >
                            <span className="text-text-secondary">
                              {fd.frequency_mhz.toFixed(3)}
                            </span>
                            <span className="text-text-primary">
                              {formatImpedance(
                                fd.impedance.real,
                                fd.impedance.imag
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {resultsTab === "gain" && selectedFreqResult && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-text-secondary">
                        Gain Summary
                      </h4>
                      <div className="space-y-1 text-[11px] font-mono">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Max Gain</span>
                          <span className="text-text-primary">
                            {formatGain(selectedFreqResult.gain_max_dbi)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">
                            Direction
                          </span>
                          <span className="text-text-primary">
                            {selectedFreqResult.gain_max_theta.toFixed(1)}
                            {"\u00B0"} el,{" "}
                            {selectedFreqResult.gain_max_phi.toFixed(1)}
                            {"\u00B0"} az
                          </span>
                        </div>
                        {selectedFreqResult.front_to_back_db != null && (
                          <div className="flex justify-between">
                            <span className="text-text-secondary">F/B</span>
                            <span className="text-text-primary">
                              {selectedFreqResult.front_to_back_db.toFixed(1)} dB
                            </span>
                          </div>
                        )}
                        {selectedFreqResult.beamwidth_e_deg != null && (
                          <div className="flex justify-between">
                            <span className="text-text-secondary">BW (E)</span>
                            <span className="text-text-primary">
                              {selectedFreqResult.beamwidth_e_deg.toFixed(1)}
                              {"\u00B0"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {resultsTab === "pattern" && (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-xs text-text-secondary">
                        Pattern charts coming in Phase 5.
                      </p>
                    </div>
                  )}
                </div>

                {/* Warnings */}
                {simResult.warnings.length > 0 && (
                  <div className="border-t border-border pt-2 space-y-1">
                    {simResult.warnings.map((w, i) => (
                      <p
                        key={i}
                        className="text-[10px] text-swr-warning leading-relaxed"
                      >
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* === MOBILE BOTTOM SHEET === */}
      <div className="lg:hidden border-t border-border bg-surface">
        <div className="px-3 pt-2 pb-1">
          <SegmentedControl
            segments={MOBILE_SEGMENTS}
            activeKey={mobileTab}
            onChange={(key) => setMobileTab(key as typeof mobileTab)}
          />
        </div>
        <div className="px-3 py-2 max-h-48 overflow-y-auto">
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
            </div>
          )}
          {mobileTab === "results" && (
            <div>
              {simStatus === "idle" && (
                <p className="text-xs text-text-secondary text-center py-4">
                  Run a simulation to see results.
                </p>
              )}
              {simStatus === "success" && selectedFreqResult && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-background rounded-md p-2">
                    <div className="text-[10px] text-text-secondary">SWR</div>
                    <div
                      className={`text-base font-mono font-bold ${swrColorClass(selectedFreqResult.swr_50)}`}
                    >
                      {formatSwr(selectedFreqResult.swr_50)}
                    </div>
                  </div>
                  <div className="bg-background rounded-md p-2">
                    <div className="text-[10px] text-text-secondary">Gain</div>
                    <div className="text-base font-mono font-bold text-text-primary">
                      {formatGain(selectedFreqResult.gain_max_dbi)}
                    </div>
                  </div>
                  <div className="bg-background rounded-md p-2">
                    <div className="text-[10px] text-text-secondary">Z</div>
                    <div className="text-[10px] font-mono text-text-primary">
                      {formatImpedance(
                        selectedFreqResult.impedance.real,
                        selectedFreqResult.impedance.imag
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
