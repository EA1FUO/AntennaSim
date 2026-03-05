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
import { SimulationLoadingOverlay } from "../components/ui/SimulationLoadingOverlay";
import { BandPresets } from "../components/ui/BandPresets";
import { ProjectActions } from "../components/ui/ProjectActions";
import { ValidationWarnings } from "../components/ui/ValidationWarnings";
import { Button } from "../components/ui/Button";
import { Slider } from "../components/ui/Slider";
import { NumberInput } from "../components/ui/NumberInput";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { createEditorProject } from "../utils/project-file";
import { validateSimulationRequest } from "../engine/validation";
import { templates } from "../templates";
import { getDefaultParams } from "../templates/types";
import type { ProjectFile } from "../utils/project-file";
import type { AntennaTemplate, FrequencyRange } from "../templates/types";
import { computeSteps } from "../utils/ham-bands";
import type { HamBand } from "../utils/ham-bands";
import type { ViewToggles } from "../components/three/types";

/** Mobile tab options */
const MOBILE_SEGMENTS = [
  { key: "wires", label: "Wires" },
  { key: "properties", label: "Props" },
  { key: "settings", label: "Settings" },
  { key: "tools", label: "Tools" },
  { key: "results", label: "Results" },
];

type MobileEditorTab = "wires" | "properties" | "settings" | "tools" | "results";

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
  const verticalDrag = useEditorStore((s) => s.verticalDrag);
  const setVerticalDrag = useEditorStore((s) => s.setVerticalDrag);
  const snapSize = useEditorStore((s) => s.snapSize);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const selectedTags = useEditorStore((s) => s.selectedTags);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const selectAll = useEditorStore((s) => s.selectAll);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
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
  const resetSimulation = useSimulationStore((s) => s.reset);
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
  const matching = useUIStore((s) => s.matching);
  const setMatching = useUIStore((s) => s.setMatching);

  // Right panel tab state: editor tools vs simulation results
  const [rightPanelTab, setRightPanelTab] = useState<"editor" | "results">("editor");

  // Editor section dropdown: replaces 6 individual accordion toggles
  type EditorSection = "wires" | "templates" | "tools" | "settings";
  const [editorSection, setEditorSection] = useState<EditorSection>("wires");

  // Tools sub-section accordion state (only used within "tools" section)
  const [toolsImportOpen, setToolsImportOpen] = useState(false);
  const [toolsCompareOpen, setToolsCompareOpen] = useState(false);
  const [toolsOptimizerOpen, setToolsOptimizerOpen] = useState(false);

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
      setMobileTab("results");
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

      if ((e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey) setMode("select");
      else if (e.key === "a" && !e.ctrlKey && !e.metaKey) setMode("add");
      else if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey) setMode("move");
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        copySelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v" && !e.shiftKey) {
        // Only intercept Ctrl+V when not also pressing shift (which some browsers use for paste-as-text)
        e.preventDefault();
        paste();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMode, deselectAll, deleteSelected, undo, redo, selectAll, copySelected, paste, duplicateSelected]);

  // Clear stale results on page entry (prevents cross-page state leaks)
  // and whenever antenna geometry or config changes.
  useEffect(() => {
    resetSimulation();
  }, [wires, excitations, loads, transmissionLines, ground, resetSimulation]);

  // Handlers
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
      near_field: {
        plane: "horizontal",
        height_m: 1.8,
        extent_m: 20.0,
        resolution_m: 0.5,
      },
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

    // Switch to wires section after loading
    setEditorSection("wires");
  }, [selectedTemplate, templateParams, clearAll, setWires, setDesignFrequency, setFrequencyRange, setGround]);

  const handleBandSelect = useCallback(
    (range: FrequencyRange, _band: HamBand) => {
      setFrequencyRange(range);
      const center = (range.start_mhz + range.stop_mhz) / 2;
      setDesignFrequency(center);
    },
    [setFrequencyRange, setDesignFrequency]
  );

  const handleProjectSave = useCallback((): ProjectFile => {
    const wireGeometry = getWireGeometry();
    return createEditorProject(
      wireGeometry,
      excitations,
      loads,
      transmissionLines,
      ground,
      frequencyRange,
      designFrequencyMhz,
      simResult ?? null,
    );
  }, [getWireGeometry, excitations, loads, transmissionLines, ground, frequencyRange, designFrequencyMhz, simResult]);

  const handleProjectLoad = useCallback(
    (project: ProjectFile) => {
      if (project.mode !== "editor" || !project.editor) {
        alert("This project was saved from the Simulator. Open it there instead.");
        return;
      }
      const ed = project.editor;
      clearAll();
      setWires(
        ed.wires.map((w) => ({ ...w, selected: false })),
        ed.excitations,
      );
      setGround(ed.ground);
      setFrequencyRange(ed.frequencyRange);
      setDesignFrequency(ed.designFrequencyMhz);
    },
    [clearAll, setWires, setGround, setFrequencyRange, setDesignFrequency]
  );

  const isLoading = simStatus === "loading";
  const canRun = wires.length > 0 && excitations.length > 0;

  // Pre-simulation validation
  // wires is intentionally used as the dep trigger — getWireGeometry() reads from the store
  const wireGeometry = useMemo(() => {
    void wires; // trigger re-computation when wires change
    return getWireGeometry();
  }, [wires, getWireGeometry]);
  const validation = useMemo(
    () => validateSimulationRequest(wireGeometry, excitations, ground, frequencyRange),
    [wireGeometry, excitations, ground, frequencyRange]
  );

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
    <div className="flex flex-col h-dvh bg-background">
      <Navbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT: TOOLBAR (desktop only) === */}
        <div className="hidden lg:block">
          <EditorToolbar />
        </div>

        {/* === CENTER: 3D VIEWPORT === */}
        <main className="flex-1 relative min-w-0 min-h-0">
          <ErrorBoundary label="3D Viewport">
            <EditorScene viewToggles={viewToggles} patternData={patternData} currents={currentData} nearField={nearFieldData} />
          </ErrorBoundary>

          {/* Overlays */}
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
                  <span className="hidden lg:inline">(Shift = vertical)</span>
                  <span className="lg:hidden">{verticalDrag ? "(vertical)" : "(horizontal)"}</span>
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

          {/* Pattern frequency slider — bottom-right above dBi legend on mobile, centered on desktop */}
          {simStatus === "success" && simResult && simResult.frequency_data.length > 1 && (
            <>
              <div className="absolute bottom-8 right-2 z-10 w-36 lg:hidden">
                <PatternFrequencySlider compact />
              </div>
              <div className="hidden lg:block absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-56">
                <PatternFrequencySlider />
              </div>
            </>
          )}

          {/* Empty-state hint */}
          {wires.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg px-4 py-3 max-w-[240px] text-center pointer-events-auto">
                <p className="text-sm text-text-primary font-medium mb-1">No wires yet</p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Switch to <span className="text-accent font-medium">Add</span> mode and click the viewport to place wires, or go to <span className="text-accent font-medium">Tools</span> to import a file or load a template.
                </p>
              </div>
            </div>
          )}

          {/* Mobile toolbar (floating, below mode indicator) */}
          <div className="lg:hidden absolute top-10 left-2 z-10 flex gap-1">
            {(["select", "add", "move"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-xs rounded-md font-mono ${
                  mode === m
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "bg-surface/80 text-text-secondary border border-border"
                }`}
              >
                {m[0]!.toUpperCase()}
              </button>
            ))}
            {/* Vertical drag toggle — only in move mode */}
            {mode === "move" && (
              <button
                onClick={() => setVerticalDrag(!verticalDrag)}
                className={`px-3 py-2 text-xs rounded-md font-mono ${
                  verticalDrag
                    ? "bg-orange-500/20 text-orange-400 border border-orange-400/50"
                    : "bg-surface/80 text-text-secondary border border-border"
                }`}
                title="Toggle vertical (Z-axis) drag"
              >
                Z
              </button>
            )}
          </div>

        </main>

        {/* === RIGHT PANEL (desktop only) === */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border bg-surface overflow-hidden shrink-0">
          {/* Tab switcher: Editor vs Results + project actions */}
          <div className="p-2 border-b border-border shrink-0 space-y-1.5">
            <SegmentedControl
              segments={[
                { key: "editor", label: "Editor" },
                { key: "results", label: "Results" },
              ]}
              activeKey={rightPanelTab}
              onChange={(key) => setRightPanelTab(key as "editor" | "results")}
            />
            <ProjectActions
              onSave={handleProjectSave}
              onLoad={handleProjectLoad}
            />
          </div>

          {rightPanelTab === "editor" ? (
            <>
              {/* Section selector dropdown */}
              <div className="px-2 py-1.5 border-b border-border shrink-0">
                <select
                  value={editorSection}
                  onChange={(e) => setEditorSection(e.target.value as EditorSection)}
                  className="w-full bg-background text-text-primary text-xs font-medium px-2 py-1 rounded border border-border focus:border-accent/50 outline-none"
                >
                  <option value="wires">Wires ({wires.length})</option>
                  <option value="templates">Templates</option>
                  <option value="tools">Tools</option>
                  <option value="settings">Settings</option>
                </select>
              </div>

              {/* Section content — scrollable */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* === Wires section: table + properties, both always visible === */}
                {editorSection === "wires" && (
                  <div className="flex flex-col">
                    <div className="min-h-[150px] max-h-[300px] overflow-y-auto">
                      <WireTable />
                    </div>
                    <div className="border-t border-border">
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        Properties {selectedTags.size > 0 ? `(${selectedTags.size} selected)` : ""}
                      </div>
                      <div className="min-h-[150px] overflow-y-auto">
                        <WirePropertiesPanel />
                      </div>
                    </div>
                  </div>
                )}

                {/* === Templates section: picker + params + load button === */}
                {editorSection === "templates" && (
                  <div className="px-2 pb-2 pt-1.5 space-y-2">
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

                {/* === Tools section: collapsible sub-sections === */}
                {editorSection === "tools" && (
                  <div className="flex flex-col">
                    {/* Import/Export */}
                    <button
                      onClick={() => setToolsImportOpen(!toolsImportOpen)}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors"
                    >
                      <span>Import / Export</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${toolsImportOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {toolsImportOpen && (
                      <div className="px-2 pb-2 pt-1 min-h-[150px]">
                        <ImportExportPanel />
                      </div>
                    )}

                    {/* Compare */}
                    <button
                      onClick={() => setToolsCompareOpen(!toolsCompareOpen)}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
                    >
                      <span>Compare</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${toolsCompareOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {toolsCompareOpen && (
                      <div className="px-2 pb-2 pt-1 min-h-[150px]">
                        <CompareOverlay />
                      </div>
                    )}

                    {/* Optimizer */}
                    <button
                      onClick={() => setToolsOptimizerOpen(!toolsOptimizerOpen)}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-surface-hover transition-colors border-t border-border"
                    >
                      <span>Optimizer</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${toolsOptimizerOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {toolsOptimizerOpen && (
                      <div className="px-2 pb-2 pt-1 min-h-[150px]">
                        <OptimizerPanel />
                      </div>
                    )}
                  </div>
                )}

                {/* === Settings section: height, snap, ground, balun, pattern res === */}
                {editorSection === "settings" && (
                  <div className="px-2 py-2 space-y-3">
                    {/* Snap size */}
                    <div>
                      <label className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider block mb-1">
                        Snap Size
                      </label>
                      <select
                        value={snapSize}
                        onChange={(e) => setSnapSize(parseFloat(e.target.value))}
                        className="w-full bg-background text-text-primary text-[10px] font-mono px-1.5 py-1 rounded border border-border outline-none"
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

                    {/* Matching / Balun */}
                    <BalunEditor matching={matching} onChange={setMatching} />

                    {/* Pattern resolution */}
                    <div>
                      <label className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider block mb-1">
                        Pattern Resolution
                      </label>
                      <select
                        value={patternStep}
                        onChange={(e) => setPatternStep(parseInt(e.target.value, 10))}
                        className="w-full bg-background text-text-primary text-[10px] font-mono px-1.5 py-1 rounded border border-border outline-none"
                      >
                        <option value="1">1° (very fine)</option>
                        <option value="2">2° (fine)</option>
                        <option value="5">5° (standard)</option>
                        <option value="10">10° (fast)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Results panel — same as the simulator's */
            <div className="flex-1 overflow-hidden flex flex-col">
              <ErrorBoundary label="Results">
                <ResultsPanel />
              </ErrorBoundary>
            </div>
          )}

          {/* Bottom: Frequency, Sweep, Run button (always visible) */}
          <div className="p-2 space-y-2 shrink-0 border-t border-border">
            {/* Design frequency */}
            <NumberInput
              label="Design freq:"
              value={designFrequencyMhz}
              onChange={setDesignFrequency}
              min={0.1}
              max={500}
              decimals={1}
              unit="MHz"
            />

            {/* Frequency sweep range */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary shrink-0">Sweep:</span>
              <NumberInput
                value={frequencyRange.start_mhz}
                onChange={(v) => setFrequencyRange({ start_mhz: v, stop_mhz: frequencyRange.stop_mhz, steps: computeSteps(v, frequencyRange.stop_mhz) })}
                min={0.1}
                max={frequencyRange.stop_mhz - 0.1}
                decimals={1}
              />
              <span className="text-[10px] text-text-secondary">-</span>
              <NumberInput
                value={frequencyRange.stop_mhz}
                onChange={(v) => setFrequencyRange({ start_mhz: frequencyRange.start_mhz, stop_mhz: v, steps: computeSteps(frequencyRange.start_mhz, v) })}
                min={frequencyRange.start_mhz + 0.1}
                max={500}
                decimals={1}
                unit="MHz"
              />
              <NumberInput
                value={frequencyRange.steps}
                onChange={(v) => setFrequencyRange({ ...frequencyRange, steps: v })}
                min={1}
                max={201}
                decimals={0}
                unit="pts"
              />
            </div>

            {/* Band presets */}
            <BandPresets
              currentRange={frequencyRange}
              onSelectBand={handleBandSelect}
              hfOnly
            />

            {/* Antenna height */}
            {wires.length > 0 && (
              <Slider
                label="Antenna Height"
                value={antennaMinZ}
                min={0}
                max={100}
                step={0.5}
                unit="m"
                decimals={1}
                description={`Lowest point: ${antennaMinZ}m, Highest: ${antennaMaxZ}m`}
                onChange={handleHeightChange}
              />
            )}

            {/* Validation warnings */}
            <ValidationWarnings validation={validation} />

            {/* Run */}
            <Button
              onClick={handleRunSimulation}
              loading={isLoading}
              disabled={isLoading || !canRun || !validation.valid}
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
      <div className="lg:hidden border-t border-border bg-surface flex flex-col max-h-[50%]">
        {/* Tab bar + Run button + quick actions */}
        <div className="px-2 pt-2 pb-1 shrink-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 overflow-x-auto">
              <SegmentedControl
                segments={MOBILE_SEGMENTS}
                activeKey={mobileTab}
                onChange={(key) => setMobileTab(key as MobileEditorTab)}
              />
            </div>
            <Button
              onClick={handleRunSimulation}
              loading={isLoading}
              disabled={isLoading || !canRun}
              size="sm"
              className="shrink-0"
            >
              {isLoading ? "..." : "Run"}
            </Button>
          </div>
          {/* Quick operations bar */}
          <div className="flex items-center gap-1">
            <button onClick={undo} className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:bg-surface-hover" title="Undo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h13a4 4 0 010 8H7" /><path d="M3 10l4-4M3 10l4 4" /></svg>
            </button>
            <button onClick={redo} className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:bg-surface-hover" title="Redo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H8a4 4 0 000 8h10" /><path d="M21 10l-4-4M21 10l-4 4" /></svg>
            </button>
            <button onClick={deleteSelected} disabled={selectedTags.size === 0} className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-30" title="Delete selected">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" /></svg>
            </button>
            <button onClick={selectAll} className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:bg-surface-hover" title="Select all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
            </button>
            <div className="flex-1" />
            <span className="text-[11px] text-text-secondary font-mono">
              {wires.length}W {totalSegments}S
            </span>
          </div>
        </div>
        {simError && (
          <p className="text-xs text-swr-bad px-3 pb-1">{simError}</p>
        )}
        {/* Tab content */}
        <div className="px-3 py-2 flex-1 overflow-y-auto">
          {mobileTab === "wires" && <WireTable />}
          {mobileTab === "properties" && <WirePropertiesPanel />}
          {mobileTab === "settings" && (
            <div className="space-y-3">
              {/* Antenna height */}
              {wires.length > 0 && (
                <Slider
                  label="Antenna Height"
                  value={antennaMinZ}
                  min={0}
                  max={100}
                  step={0.5}
                  unit="m"
                  decimals={1}
                  description={`Lowest point: ${antennaMinZ}m, Highest: ${antennaMaxZ}m`}
                  onChange={handleHeightChange}
                />
              )}
              {/* Design frequency */}
              <NumberInput
                label="Design freq:"
                value={designFrequencyMhz}
                onChange={setDesignFrequency}
                min={0.1}
                max={500}
                decimals={1}
                unit="MHz"
                size="sm"
              />
              {/* Frequency sweep */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] text-text-secondary shrink-0">Sweep:</span>
                <NumberInput
                  value={frequencyRange.start_mhz}
                  onChange={(v) => setFrequencyRange({ start_mhz: v, stop_mhz: frequencyRange.stop_mhz, steps: computeSteps(v, frequencyRange.stop_mhz) })}
                  min={0.1}
                  max={frequencyRange.stop_mhz - 0.1}
                  decimals={1}
                  size="sm"
                />
                <span className="text-[11px] text-text-secondary">-</span>
                <NumberInput
                  value={frequencyRange.stop_mhz}
                  onChange={(v) => setFrequencyRange({ start_mhz: frequencyRange.start_mhz, stop_mhz: v, steps: computeSteps(frequencyRange.start_mhz, v) })}
                  min={frequencyRange.start_mhz + 0.1}
                  max={500}
                  decimals={1}
                  unit="MHz"
                  size="sm"
                />
                <NumberInput
                  value={frequencyRange.steps}
                  onChange={(v) => setFrequencyRange({ ...frequencyRange, steps: v })}
                  min={1}
                  max={201}
                  decimals={0}
                  unit="pts"
                  size="sm"
                />
              </div>
              {/* Band presets */}
              <BandPresets
                currentRange={frequencyRange}
                onSelectBand={handleBandSelect}
                hfOnly
              />
              {/* Snap size */}
              <div>
                <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider block mb-1">Snap Size</label>
                <select value={snapSize} onChange={(e) => setSnapSize(parseFloat(e.target.value))}
                  className="w-full bg-background text-text-primary text-xs font-mono px-1.5 py-1.5 rounded border border-border outline-none">
                  <option value="0">Off</option>
                  <option value="0.01">0.01 m</option>
                  <option value="0.05">0.05 m</option>
                  <option value="0.1">0.1 m</option>
                  <option value="0.25">0.25 m</option>
                  <option value="0.5">0.5 m</option>
                  <option value="1">1.0 m</option>
                </select>
              </div>
              {/* Pattern resolution */}
              <div>
                <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider block mb-1">Pattern Resolution</label>
                <select value={patternStep} onChange={(e) => setPatternStep(parseInt(e.target.value, 10))}
                  className="w-full bg-background text-text-primary text-xs font-mono px-1.5 py-1.5 rounded border border-border outline-none">
                  <option value="1">1 deg (very fine)</option>
                  <option value="2">2 deg (fine)</option>
                  <option value="5">5 deg (standard)</option>
                  <option value="10">10 deg (fast)</option>
                </select>
              </div>
              <GroundEditor ground={ground} onChange={setGround} />
              <BalunEditor matching={matching} onChange={setMatching} />
            </div>
          )}
          {mobileTab === "tools" && (
            <div className="space-y-3">
              {/* Templates */}
              <div>
                <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Load Template</h4>
                <TemplatePicker selectedId={selectedTemplate.id} onSelect={handleTemplateSelect} />
                <div className="mt-2">
                  <ParameterPanel parameters={selectedTemplate.parameters} values={templateParams} onParamChange={handleTemplateParamChange} />
                </div>
                {wires.length > 0 && (
                  <p className="text-[11px] text-swr-warning leading-tight mt-1.5">Replaces all current wires.</p>
                )}
                <Button onClick={handleLoadTemplate} className="w-full mt-2" size="sm">Load into Editor</Button>
              </div>
              <div className="border-t border-border" />
              {/* Import/Export */}
              <div>
                <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Import / Export</h4>
                <ImportExportPanel />
              </div>
              <div className="border-t border-border" />
              {/* Compare */}
              <div>
                <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Compare</h4>
                <CompareOverlay />
              </div>
              <div className="border-t border-border" />
              {/* Optimizer */}
              <div>
                <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Optimizer</h4>
                <OptimizerPanel />
              </div>
            </div>
          )}
          {mobileTab === "results" && <ResultsPanel />}
        </div>
      </div>

      {/* Status bar (desktop only) */}
      <div className="hidden lg:flex items-center justify-between px-3 h-6 border-t border-border bg-surface text-[10px] font-mono text-text-secondary shrink-0">
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

      {/* Full-page simulation loading overlay — blocks all interaction */}
      {isLoading && <SimulationLoadingOverlay />}
    </div>
  );
}
