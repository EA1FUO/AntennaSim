/**
 * SimulationEngine — abstraction layer for antenna simulation.
 *
 * Two implementations:
 * - BackendEngine: calls the FastAPI backend (Docker deployment)
 * - WasmEngine: runs nec2c locally in the browser via WebAssembly (GitHub Pages)
 *
 * Selected at build time via VITE_ENGINE env var.
 */

import type {
  WireGeometry,
  Excitation,
  GroundConfig,
  FrequencyRange,
  FrequencySegment,
} from "../templates/types";

// Re-export simulation result types from api/nec.ts so consumers can import from engine/types
export type {
  Impedance,
  PatternData,
  SegmentCurrent,
  LumpedLoad,
  WireArc,
  GeometryTransformDef,
  CylindricalSymmetryDef,
  TransmissionLine,
  FrequencyResult,
  NearFieldResult,
  SimulationResult,
} from "../api/nec";

import type { SimulationResult, LumpedLoad, TransmissionLine, WireArc, GeometryTransformDef, CylindricalSymmetryDef } from "../api/nec";

// ---- Simulation request types ----

/** V1: Basic simulation request (template mode, single excitation) */
export interface SimulateRequest {
  wires: WireGeometry[];
  excitation: Excitation;
  ground: GroundConfig;
  frequency: FrequencyRange;
  /** Optional multi-segment sweep — when present, overrides `frequency` */
  frequencySegments?: FrequencySegment[];
  patternStep?: number;
}

/** Near-field calculation configuration */
export interface NearFieldConfig {
  /** Plane orientation: "horizontal" (XY at fixed Z) or "vertical" (XZ at Y=0) */
  plane: "horizontal" | "vertical";
  /** Height of the horizontal plane in metres (e.g. 1.8 for eye level) */
  height_m: number;
  /** Half-extent of the grid in metres (grid spans -extent to +extent) */
  extent_m: number;
  /** Grid resolution in metres */
  resolution_m: number;
}

/** V2: Advanced simulation request (editor mode) */
export interface SimulateAdvancedRequest {
  wires: WireGeometry[];
  excitations: Excitation[];
  ground: GroundConfig;
  frequency: FrequencyRange;
  /** Optional multi-segment sweep — when present, overrides `frequency` */
  frequencySegments?: FrequencySegment[];
  loads?: LumpedLoad[];
  transmission_lines?: TransmissionLine[];
  arcs?: WireArc[];
  transforms?: GeometryTransformDef[];
  symmetry?: CylindricalSymmetryDef;
  compute_currents?: boolean;
  near_field?: NearFieldConfig;
  pattern_step?: number;
  comment?: string;
}

// ---- File import/export types ----

/** Result of importing a .nec or .maa file */
export interface ImportResult {
  title: string;
  wires: Array<{
    tag: number;
    segments: number;
    x1: number; y1: number; z1: number;
    x2: number; y2: number; z2: number;
    radius: number;
  }>;
  excitations: Array<{
    wire_tag: number;
    segment: number;
    voltage_real: number;
    voltage_imag: number;
  }>;
  ground_type: string;
  frequency_start_mhz: number;
  frequency_stop_mhz: number;
  frequency_steps: number;
}

/** Data needed for file export */
export interface ExportData {
  title: string;
  wires: WireGeometry[];
  excitations: Excitation[];
  loads?: LumpedLoad[];
  transmission_lines?: TransmissionLine[];
  ground: GroundConfig;
  frequency_start_mhz: number;
  frequency_stop_mhz: number;
  frequency_steps: number;
}

// ---- Optimizer types ----

export interface OptimizationVariable {
  wire_tag: number;
  field: string;
  min_value: number;
  max_value: number;
  initial_value?: number;
  linked_wire_tag?: number;
  linked_field?: string;
  link_factor?: number;
}

export type OptimizationObjective =
  | "min_swr"
  | "min_swr_band"
  | "max_gain"
  | "max_fb"
  | "combined";

export interface OptimizationRequest {
  wires: WireGeometry[];
  excitations: Excitation[];
  ground: GroundConfig;
  frequency_start_mhz: number;
  frequency_stop_mhz: number;
  frequency_steps: number;
  loads?: LumpedLoad[];
  transmission_lines?: TransmissionLine[];
  variables: OptimizationVariable[];
  objective: OptimizationObjective;
  method?: string;
  max_iterations: number;
  target_frequency_mhz?: number;
}

export interface OptimizationProgress {
  iteration: number;
  total_iterations: number;
  current_cost: number;
  best_cost: number;
  best_values: Record<string, number>;
  status: string;
}

export interface OptimizationResult {
  status: string;
  iterations_used: number;
  final_cost: number;
  optimized_values: Record<string, number>;
  optimized_wires: Array<{
    tag: number;
    segments: number;
    x1: number; y1: number; z1: number;
    x2: number; y2: number; z2: number;
    radius: number;
  }>;
  history: Array<{
    iteration: number;
    cost: number;
    values: Record<string, number>;
  }>;
  message: string;
}

// ---- The engine interface ----

/**
 * SimulationEngine — the abstraction over backend REST API or local WASM execution.
 *
 * All methods return promises. BackendEngine makes HTTP/WS calls.
 * WasmEngine runs everything locally in Web Workers.
 */
export interface SimulationEngine {
  /** V1: Run a basic simulation (template mode, single excitation) */
  simulate(request: SimulateRequest): Promise<SimulationResult>;

  /** V2: Run an advanced simulation (editor mode) */
  simulateAdvanced(request: SimulateAdvancedRequest): Promise<SimulationResult>;

  /** Import a .nec or .maa file */
  importFile(content: string, format: "nec" | "maa"): Promise<ImportResult>;

  /** Export to .nec or .maa format */
  exportFile(data: ExportData, format: "nec" | "maa"): Promise<string>;

  /** Run optimizer with progress callback. Returns a cancel function. */
  optimize(
    request: OptimizationRequest,
    onProgress: (progress: OptimizationProgress) => void,
  ): Promise<{ result: Promise<OptimizationResult>; cancel: () => void }>;
}
