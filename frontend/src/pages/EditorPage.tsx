/**
 * EditorPage — V2 full wire editor mode.
 *
 * Desktop layout:
 *   [Toolbar] [3D Viewport] [Wire Table + Properties]
 *
 * Mobile layout:
 *   [3D Viewport (45%)] [Bottom Sheet: Wires | Properties | Results]
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../stores/editorStore";
import { useSimulationStore } from "../stores/simulationStore";
import { useUIStore } from "../stores/uiStore";
import { EditorScene } from "../components/three/EditorScene";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { CameraPresetsOverlay } from "../components/three/CameraPresets";
import { ViewToggleToolbar } from "../components/three/ViewToggleToolbar";
import { Navbar } from "../components/layout/Navbar";
import { EditorToolbar } from "../components/editors/EditorToolbar";
import { WireTable } from "../components/editors/WireTable";
import { WirePropertiesPanel } from "../components/editors/WirePropertiesPanel";
import { GroundEditor } from "../components/editors/GroundEditor";
import { BalunEditor } from "../components/editors/BalunEditor";
import { TemplatePicker } from "../components/editors/TemplatePicker";
import { ParameterPanel } from "../components/editors/ParameterPanel";
import { ResultsPanel } from "../components/results/ResultsTabs";
import { PatternFrequencySlider } from "../components/results/PatternFrequencySlider";
import { CompareOverlay } from "../components/results/CompareOverlay";
import { ImportExportPanel } from "../components/editors/ImportExportPanel";
import { OptimizerPanel } from "../components/editors/OptimizerPanel";
import { ColorScale } from "../components/ui/ColorScale";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { templates } from "../templates";
import { getDefaultParams } from "../templates/types";
import type { AntennaTemplate } from "../templates/types";
import type { CameraPreset, ViewToggles } from "../components/three/types";

/** Mobile tab options */
const MOBILE_SEGMENTS = [
  { key: "wires", label: "Wires" },
  { key: "properties", label: "Props" },
  { key: "results", label: "Results" },
];

type MobileEditorTab = "wires" | "properties" | "results";

export function EditorPage() {
  // Editor store
  const wires = useEditorStore((s) => s.wires);
  const excitations = useEditorStore((s) => s.excitations);
  const ground = useEditorStore((s) => s.ground);
  const setGround = useEditorStore((s) => s.setGround);
  const frequencyRange = useEditorStore((s) => s.frequencyRange);
  const setFrequencyRange = useEditorStore((s) => s.setFrequencyRange);
  const designFrequencyMhz = useEditorStore((s) => s.designFrequencyMhz);
  const setDesignFrequency = useEditorStore((s) => s.setDesignFrequency);
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const snapSize = useEditorStore((s) => s.snapSize);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const selectAll = useEditorStore((s) => s.selectAll);
  const getWireGeometry = useEditorStore((s) => s.getWireGeometry);
  const getTotalSegments = useEditorStore((s) => s.getTotalSegments);
  const moveAllWiresZ = useEditorStore((s) => s.moveAllWiresZ);
  const clearAll = useEditorStore((s) => s.clearAll);
  const setWires = useEditorStore((s) => s.setWires);

  // Simulation store
  const simStatus = useSimulationStore((s) => s.status);
  const simResult = useSimulationStore((s) => s.result);
  const simError = useSimulationStore((s) => s.error);
  const simulateAdvanced = useSimulationStore((s) => s.simulateAdvanced);
  const selectedFreqResult = useSimulationStore((s) =>
    s.getSelectedFrequencyResult()
  );

  // V2 features from editor store
  const loads = useEditorStore((s) => s.loads);
  const transmissionLines = useEditorStore((s) => s.transmissionLines);
  const computeCurrents = useEditorStore((s) => s.computeCurrents);

  // UI store
  const viewToggles = useUIStore((s) => s.viewToggles);
  const toggleView = useUIStore((s) => s.toggleView);
  const activePreset = useUIStore((s) => s.activePreset);
  const setActivePreset = useUIStore((s) => s.setActivePreset);
  const matching = useUIStore((s) => s.matching);
  const setMatching = useUIStore((s) => s.setMatching);

  // Right panel tab state: editor tools vs simulation results
  const [rightPanelTab, setRightPanelTab] = useState<"editor" | "results">("editor");

  // Collapsible panel sections — wire table and properties open by default
  const [wireTableOpen, setWireTableOpen] = useState(true);
  const [wirePropsOpen, setWirePropsOpen] = useState(true);
  const [templateLoaderOpen, setTemplateLoaderOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);

  // Template loader state
  const [selectedTemplate, setSelectedTemplate] = useState<AntennaTemplate>(templates[0]!);
  const [templateParams, setTemplateParams] = useState<Record<string, number>>(
    () => getDefaultParams(templates[0]!)
  );

  // Pattern resolution
  const [patternStep, setPatternStep] = useState(5);

  // Mobile tab state (local to editor)
  const [mobileTab, setMobileTab] = useState<MobileEditorTab>("wires");

  // Auto-switch to results tab when simulation completes
  useEffect(() => {
    if (simStatus === "success") {
      setRightPanelTab("results");
    }
  }, [simStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "v" || e.key === "V") setMode("select");
      else if (e.key === "a" && !e.ctrlKey && !e.metaKey) setMode("add");
      else if (e.key === "m" || e.key === "M") setMode("move");
      else if (e.key === "Escape") {
        deselectAll();
        setMode("select");
      } else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "Z" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMode, deselectAll, deleteSelected, undo, redo, selectAll]);

  // Handlers
  const handlePreset = useCallback(
    (preset: CameraPreset) => setActivePreset(preset),
    [setActivePreset]
  );

  const handleToggle = useCallback(
    (key: keyof ViewToggles) => toggleView(key),
    [toggleView]
  );

  const handleRunSimulation = useCallback(() => {
    if (wires.length === 0 || excitations.length === 0) return;
    const wireGeometry = getWireGeometry();
    simulateAdvanced({
      wires: wireGeometry,
      excitations,
      ground,
      frequency: frequencyRange,
      loads: loads.length > 0 ? loads : undefined,
      transmission_lines: transmissionLines.length > 0 ? transmissionLines : undefined,
      compute_currents: computeCurrents,
      pattern_step: patternStep,
    });
  }, [wires, excitations, ground, frequencyRange, loads, transmissionLines, computeCurrents, patternStep, simulateAdvanced, getWireGeometry]);

  // Template loader handlers
  const handleTemplateSelect = useCallback((t: AntennaTemplate) => {
    setSelectedTemplate(t);
    setTemplateParams(getDefaultParams(t));
  }, []);

  const handleTemplateParamChange = useCallback((key: string, value: number) => {
    setTemplateParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleLoadTemplate = useCallback(() => {
    const geom = selectedTemplate.generateGeometry(templateParams);
    const exc = selectedTemplate.generateExcitation(templateParams, geom);
    const freqRange = selectedTemplate.defaultFrequencyRange(templateParams);
    const freqParam = templateParams.frequency ?? templateParams.freq ?? 14.15;

    // Clear editor and load template wires
    clearAll();
    setWires(
      geom.map((w) => ({ ...w, selected: false })),
      [exc]
    );

    // Update design frequency and sweep range
    setDesignFrequency(freqParam);
    setFrequencyRange(freqRange);

    // Set ground from template default
    setGround(selectedTemplate.defaultGround);

    // Collapse the template loader
    setTemplateLoaderOpen(false);
  }, [selectedTemplate, templateParams, clearAll, setWires, setDesignFrequency, setFrequencyRange, setGround]);

  const isLoading = simStatus === "loading";
  const canRun = wires.length > 0 && excitations.length > 0;
  const patternData = selectedFreqResult?.pattern ?? null;
  const currentData = selectedFreqResult?.currents ?? null;
  const nearFieldData = simResult?.near_field ?? null;
  const totalSegments = getTotalSegments();

  // Compute current antenna height (min Z across all wire endpoints)
  const antennaMinZ = useMemo(() => {
    if (wires.length === 0) return 0;
    let minZ = Infinity;
    for (const w of wires) {
      minZ = Math.min(minZ, w.z1, w.z2);
    }
    return Math.round(minZ * 100) / 100;
  }, [wires]);

  const antennaMaxZ = useMemo(() => {
    if (wires.length === 0) return 0;
    let maxZ = -Infinity;
    for (const w of wires) {
      maxZ = Math.max(maxZ, w.z1, w.z2);
    }
    return Math.round(maxZ * 100) / 100;
  }, [wires]);

  // Warning: all wires at ground level
  const allWiresAtGround = useMemo(() => {
    if (wires.length === 0) return false;
    return wires.every((w) => Math.abs(w.z1) < 0.001 && Math.abs(w.z2) < 0.001);
  }, [wires]);

  // Height adjustment handler — shifts all wires so that the lowest point is at the target height
  const handleHeightChange = useCallback(
    (targetMinZ: number) => {
      const dz = targetMinZ - antennaMinZ;
      if (Math.abs(dz) > 0.001) {
        moveAllWiresZ(dz);
      }
    },
    [antennaMinZ, moveAllWiresZ]
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT: TOOLBAR (desktop only) === */}
        <div className="hidden lg:block">
          <EditorToolbar />
        </div>

        {/* === CENTER: 3D VIEWPORT === */}
        <main className="flex-1 relative min-w-0">
          <ErrorBoundary label="3D Viewport">
            <EditorScene viewToggles={viewToggles} patternData={patternData} currents={currentData} nearField={nearFieldData} />
          </ErrorBoundary>

          {/* Overlays */}
          <CameraPresetsOverlay
            onPreset={handlePreset}
            activePreset={activePreset}
          />
          <ViewToggleToolbar toggles={viewToggles} onToggle={handleToggle} />

          {/* Mode indicator */}
          <div className="absolute top-2 left-2 z-10">
            <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-md px-2 py-1 text-[10px] font-mono text-text-secondary">
              Mode:{" "}
              <span className="text-accent font-bold uppercase">{mode}</span>
              {mode === "add" && (
                <span className="text-text-secondary ml-1">
                  (click to place)
                </span>
              )}
              {mode === "move" && (
                <span className="text-text-secondary ml-1">
                  (Shift = vertical)
                </span>
              )}
            </div>
          </div>

          {/* Color scale */}
          {(viewToggles.pattern || viewToggles.volumetric) && patternData && (
            <div className="absolute bottom-2 right-2 z-10">
              <ColorScale minLabel="Min" maxLabel="Max" unit="dBi" />
            </div>
          )}

          {/* Pattern frequency slider */}
          {simStatus === "success" && simResult && simResult.frequency_data.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-56 hidden lg:block">
              <PatternFrequencySlider />
            </div>
          )}

          {/* Mobile toolbar (floating) */}
          <div className="lg:hidden absolute top-2 right-14 z-10 flex gap-1">
            {(["select", "add", "move"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[10px] rounded-md font-mono ${
                  mode === m
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "bg-surface/80 text-text-secondary border border-border"
                }`}
              >
                {m[0]!.toUpperCase()}
              </button>
            ))}
          </div>
        </main>

        {/* === RIGHT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border bg-surface overflow-hidden shrink-0">
          {/* Tab switcher: Editor vs Results */}
          <div className="p-2 border-b border-border shrink-0">
            <SegmentedControl
              segments={[
                { key: "editor", label: "Editor" },
                { key: "results", label: "Results" },
              ]}
              activeKey={rightPanelTab}
              onChange={(key) => setRightPanelTab(key as "editor" | "results")}
            />
          </div>

          {rightPanelTab === "editor" ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Wires */}
              <button
                onClick={() => setWireTableOpen(!wireTableOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors"
              >
                <span>Wires ({wires.length})</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${wireTableOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {wireTableOpen && (
                <div className="min-h-[150px] max-h-[300px] overflow-y-auto">
                  <WireTable />
                </div>
              )}

              {/* Properties */}
              <button
                onClick={() => setWirePropsOpen(!wirePropsOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
              >
                <span>Properties {selectedTags.size > 0 ? `(${selectedTags.size} selected)` : ""}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${wirePropsOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {wirePropsOpen && (
                <div className="min-h-[150px] max-h-[300px] overflow-y-auto">
                  <WirePropertiesPanel />
                </div>
              )}

              {/* Load Template */}
              <button
                onClick={() => setTemplateLoaderOpen(!templateLoaderOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
              >
                <span>Load Template</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${templateLoaderOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {templateLoaderOpen && (
                <div className="px-2 pb-2 pt-1 space-y-2 min-h-[150px]">
                  <TemplatePicker
                    selectedId={selectedTemplate.id}
                    onSelect={handleTemplateSelect}
                  />
                  <ParameterPanel
                    parameters={selectedTemplate.parameters}
                    values={templateParams}
                    onParamChange={handleTemplateParamChange}
                  />
                  {wires.length > 0 && (
                    <p className="text-[10px] text-swr-warning leading-tight px-0.5">
                      Loading a template will replace all current wires.
                    </p>
                  )}
                  <Button
                    onClick={handleLoadTemplate}
                    className="w-full"
                    size="sm"
                  >
                    Load into Editor
                  </Button>
                </div>
              )}

              {/* Import/Export */}
              <button
                onClick={() => setImportExportOpen(!importExportOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
              >
                <span>Import / Export</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${importExportOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {importExportOpen && (
                <div className="px-2 pb-2 pt-1 min-h-[150px]">
                  <ImportExportPanel />
                </div>
              )}

              {/* Compare */}
              <button
                onClick={() => setCompareOpen(!compareOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
              >
                <span>Compare</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${compareOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {compareOpen && (
                <div className="px-2 pb-2 pt-1 min-h-[150px]">
                  <CompareOverlay />
                </div>
              )}

              {/* Optimizer */}
              <button
                onClick={() => setOptimizerOpen(!optimizerOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
              >
                <span>Optimizer</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${optimizerOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {optimizerOpen && (
                <div className="px-2 pb-2 pt-1 min-h-[150px]">
                  <OptimizerPanel />
                </div>
              )}
            </div>
          ) : (
            /* Results panel — same as the simulator's */
            <div className="flex-1 overflow-hidden flex flex-col">
              <ErrorBoundary label="Results">
                <ResultsPanel />
              </ErrorBoundary>
            </div>
          )}

          {/* Bottom: Frequency, Ground, Run button (always visible) */}
          <div className="p-2 space-y-2 shrink-0 border-t border-border">
            {/* Design frequency */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-secondary shrink-0">
                Design freq:
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="500"
                value={designFrequencyMhz}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setDesignFrequency(v);
                }}
                className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1.5 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
              />
              <span className="text-[10px] text-text-secondary">MHz</span>
            </div>

            {/* Antenna height — raise/lower all wires */}
            {wires.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-text-secondary shrink-0">
                  Height:
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={antennaMinZ}
                  onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-accent"
                  title={`Lowest point: ${antennaMinZ}m, Highest: ${antennaMaxZ}m`}
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="200"
                  value={antennaMinZ}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0) handleHeightChange(v);
                  }}
                  className="w-14 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
                />
                <span className="text-[10px] text-text-secondary">m</span>
              </div>
            )}

            {/* Frequency sweep range */}
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-text-secondary shrink-0">
                Sweep:
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="500"
                value={frequencyRange.start_mhz}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0 && v < frequencyRange.stop_mhz)
                    setFrequencyRange({ ...frequencyRange, start_mhz: v });
                }}
                className="w-16 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
                title="Sweep start (MHz)"
              />
              <span className="text-[10px] text-text-secondary">-</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="500"
                value={frequencyRange.stop_mhz}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0 && v > frequencyRange.start_mhz)
                    setFrequencyRange({ ...frequencyRange, stop_mhz: v });
                }}
                className="w-16 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
                title="Sweep stop (MHz)"
              />
              <span className="text-[10px] text-text-secondary">MHz</span>
              <input
                type="number"
                step="1"
                min="1"
                max="201"
                value={frequencyRange.steps}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 201)
                    setFrequencyRange({ ...frequencyRange, steps: v });
                }}
                className="w-10 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border focus:border-accent/50 outline-none text-right"
                title="Number of sweep steps"
              />
              <span className="text-[10px] text-text-secondary">pts</span>
            </div>

            {/* Snap size */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-secondary shrink-0">
                Snap:
              </label>
              <select
                value={snapSize}
                onChange={(e) => setSnapSize(parseFloat(e.target.value))}
                className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border outline-none"
              >
                <option value="0">Off</option>
                <option value="0.01">0.01 m</option>
                <option value="0.05">0.05 m</option>
                <option value="0.1">0.1 m</option>
                <option value="0.25">0.25 m</option>
                <option value="0.5">0.5 m</option>
                <option value="1">1.0 m</option>
              </select>
            </div>

            {/* Ground */}
            <GroundEditor ground={ground} onChange={setGround} />

            {/* Matching */}
            <BalunEditor matching={matching} onChange={setMatching} />

            {/* Pattern resolution */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-secondary shrink-0">
                Pattern:
              </label>
              <select
                value={patternStep}
                onChange={(e) => setPatternStep(parseInt(e.target.value, 10))}
                className="flex-1 bg-background text-text-primary text-[10px] font-mono px-1 py-0.5 rounded border border-border outline-none"
              >
                <option value="1">1° (very fine)</option>
                <option value="2">2° (fine)</option>
                <option value="5">5° (standard)</option>
                <option value="10">10° (fast)</option>
              </select>
            </div>

            {/* Warning: wires at ground level */}
            {allWiresAtGround && (
              <div className="flex items-start gap-1.5 p-1.5 rounded-md bg-swr-warning/10 border border-swr-warning/30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-swr-warning shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-[10px] text-swr-warning leading-tight">
                  All wires are at ground level (Z=0). Use the height slider above to raise the antenna, or results will show no radiation.
                </p>
              </div>
            )}

            {/* Run */}
            <Button
              onClick={handleRunSimulation}
              loading={isLoading}
              disabled={isLoading || !canRun}
              className="w-full"
              size="sm"
            >
              {isLoading ? "Simulating..." : "Run Simulation"}
            </Button>
            {simError && (
              <p className="text-[10px] text-swr-bad px-0.5">{simError}</p>
            )}
          </div>
        </aside>
      </div>

      {/* === MOBILE BOTTOM SHEET === */}
      <div className="lg:hidden border-t border-border bg-surface flex flex-col max-h-[55vh]">
        <div className="flex justify-center py-1.5 shrink-0">
          <div className="w-8 h-1 rounded-full bg-border" />
        </div>

        <div className="px-3 pb-1 shrink-0">
          <SegmentedControl
            segments={MOBILE_SEGMENTS}
            activeKey={mobileTab}
            onChange={(key) => setMobileTab(key as MobileEditorTab)}

          />
        </div>

        <div className="px-3 py-2 flex-1 overflow-y-auto">
          {mobileTab === "wires" && <WireTable />}
          {mobileTab === "properties" && <WirePropertiesPanel />}
          {mobileTab === "results" && <ResultsPanel />}
        </div>

        {/* Sticky run button */}
        <div className="p-2 border-t border-border shrink-0">
          <Button
            onClick={handleRunSimulation}
            loading={isLoading}
            disabled={isLoading || !canRun}
            className="w-full"
            size="sm"
          >
            {isLoading ? "Simulating..." : "Run Simulation"}
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 h-6 border-t border-border bg-surface text-[10px] font-mono text-text-secondary shrink-0">
        <div className="flex items-center gap-3">
          <span>
            Mode: <span className="text-accent">{mode}</span>
          </span>
          <span>Wires: {wires.length}</span>
          <span>Segments: {totalSegments}</span>
          {wires.length > 0 && <span>Height: {antennaMinZ}–{antennaMaxZ}m</span>}
          <span>
            Snap: {snapSize > 0 ? `${snapSize}m` : "Off"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Design: {designFrequencyMhz} MHz | Sweep: {frequencyRange.start_mhz}–{frequencyRange.stop_mhz} MHz
          </span>
          {selectedTags.size > 0 && (
            <span className="text-accent">
              {selectedTags.size} selected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
