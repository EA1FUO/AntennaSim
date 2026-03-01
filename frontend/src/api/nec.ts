/**
 * NEC2 simulation API endpoint.
 * Calls POST /api/v1/simulate on the backend.
 *
 * V1: Basic wires + single excitation
 * V2: Loads, transmission lines, multiple excitations, current distribution
 */

import { api } from "./client";
import type {
  WireGeometry,
  Excitation,
  GroundConfig,
  FrequencyRange,
} from "../templates/types";

/** Ground type to backend ground parameters mapping */
const GROUND_PARAMS: Record<string, { permittivity: number; conductivity: number }> = {
  salt_water: { permittivity: 80, conductivity: 5.0 },
  fresh_water: { permittivity: 80, conductivity: 0.001 },
  pastoral: { permittivity: 14, conductivity: 0.01 },
  average: { permittivity: 13, conductivity: 0.005 },
  rocky: { permittivity: 12, conductivity: 0.002 },
  city: { permittivity: 5, conductivity: 0.001 },
  dry_sandy: { permittivity: 3, conductivity: 0.0001 },
};

/** Impedance result */
export interface Impedance {
  real: number;
  imag: number;
}

/** Pattern data for a single frequency */
export interface PatternData {
  theta_start: number;
  theta_step: number;
  theta_count: number;
  phi_start: number;
  phi_step: number;
  phi_count: number;
  gain_dbi: number[][];
}

/** V2: Per-segment current data */
export interface SegmentCurrent {
  tag: number;
  segment: number;
  x: number;
  y: number;
  z: number;
  current_real: number;
  current_imag: number;
  current_magnitude: number;
  current_phase_deg: number;
}

/** V2: Lumped load definition */
export interface LumpedLoad {
  load_type: number; // 0=series RLC, 1=parallel RLC, 4=fixed Z, 5=conductivity
  wire_tag: number;
  segment_start: number;
  segment_end: number;
  param1: number; // R (Ohms) or conductivity (S/m)
  param2: number; // L (H) or X (Ohms)
  param3: number; // C (F) or 0
}

/** V2: Wire arc definition (GA card) */
export interface WireArc {
  tag: number;
  segments: number;
  arc_radius: number;
  start_angle: number;
  end_angle: number;
  wire_radius: number;
}

/** V2: Geometry transform (GM card) */
export interface GeometryTransformDef {
  tag_increment: number;
  n_new_structures: number;
  rot_x?: number;
  rot_y?: number;
  rot_z?: number;
  trans_x?: number;
  trans_y?: number;
  trans_z?: number;
  start_tag?: number;
}

/** V2: Cylindrical symmetry (GR card) */
export interface CylindricalSymmetryDef {
  tag_increment: number;
  n_copies: number;
}

/** V2: Transmission line definition */
export interface TransmissionLine {
  wire_tag1: number;
  segment1: number;
  wire_tag2: number;
  segment2: number;
  impedance: number; // Z0
  length: number; // 0 = auto
  shunt_admittance_real1?: number;
  shunt_admittance_imag1?: number;
  shunt_admittance_real2?: number;
  shunt_admittance_imag2?: number;
}

/** Simulation result for a single frequency */
export interface FrequencyResult {
  frequency_mhz: number;
  impedance: Impedance;
  swr_50: number;
  gain_max_dbi: number;
  gain_max_theta: number;
  gain_max_phi: number;
  front_to_back_db: number | null;
  beamwidth_e_deg: number | null;
  beamwidth_h_deg: number | null;
  efficiency_percent: number | null;
  pattern: PatternData | null;
  currents: SegmentCurrent[] | null;
}

/** Near-field calculation result */
export interface NearFieldResult {
  plane: string;
  height_m: number;
  nx: number;
  ny: number;
  x_start: number;
  y_start: number;
  dx: number;
  dy: number;
  field_magnitude: number[][];
}

/** Complete simulation response */
export interface SimulationResult {
  simulation_id: string;
  engine: string;
  computed_in_ms: number;
  total_segments: number;
  cached: boolean;
  frequency_data: FrequencyResult[];
  near_field?: NearFieldResult | null;
  warnings: string[];
}

/** Build ground payload for the backend */
function buildGroundPayload(ground: GroundConfig): Record<string, unknown> {
  if (ground.type === "free_space") {
    return { ground_type: "free_space" };
  } else if (ground.type === "perfect") {
    return { ground_type: "perfect" };
  } else if (ground.type === "custom") {
    return {
      ground_type: "custom",
      dielectric_constant: ground.custom_permittivity ?? 13,
      conductivity: ground.custom_conductivity ?? 0.005,
    };
  } else {
    const params = GROUND_PARAMS[ground.type] ?? GROUND_PARAMS.average!;
    return {
      ground_type: ground.type,
      dielectric_constant: params.permittivity,
      conductivity: params.conductivity,
    };
  }
}

/** V1: Basic simulation with single excitation */
export async function runSimulation(
  wires: WireGeometry[],
  excitation: Excitation,
  ground: GroundConfig,
  frequency: FrequencyRange,
  patternStep?: number
): Promise<SimulationResult> {
  const step = patternStep ?? 5;
  const body: Record<string, unknown> = {
    wires: wires.map((w) => ({
      tag: w.tag,
      segments: w.segments,
      x1: w.x1, y1: w.y1, z1: w.z1,
      x2: w.x2, y2: w.y2, z2: w.z2,
      radius: w.radius,
    })),
    excitations: [
      {
        wire_tag: excitation.wire_tag,
        segment: excitation.segment,
        voltage_real: excitation.voltage_real,
        voltage_imag: excitation.voltage_imag,
      },
    ],
    ground: buildGroundPayload(ground),
    frequency: {
      start_mhz: frequency.start_mhz,
      stop_mhz: frequency.stop_mhz,
      steps: frequency.steps,
    },
    pattern: {
      theta_start: -90,
      theta_stop: 90,
      theta_step: step,
      phi_start: 0,
      phi_stop: 360 - step,
      phi_step: step,
    },
    compute_currents: true,
    near_field: {
      enabled: true,
      plane: "horizontal",
      height_m: 1.8,
      extent_m: 20.0,
      resolution_m: 0.5,
    },
    comment: "AntennaSim simulation",
  };

  return api.post<SimulationResult>("/api/v1/simulate", body, {
    timeout: 60000,
  });
}

/** V2: Advanced simulation options */
export interface AdvancedSimulationOptions {
  wires: WireGeometry[];
  excitations: Excitation[];
  ground: GroundConfig;
  frequency: FrequencyRange;
  loads?: LumpedLoad[];
  transmission_lines?: TransmissionLine[];
  arcs?: WireArc[];
  transforms?: GeometryTransformDef[];
  symmetry?: CylindricalSymmetryDef;
  compute_currents?: boolean;
  pattern_step?: number;
  comment?: string;
}

/** V2: Advanced simulation with loads, TL, multiple excitations, currents */
export async function runAdvancedSimulation(
  options: AdvancedSimulationOptions
): Promise<SimulationResult> {
  const step = options.pattern_step ?? 5;
  const body: Record<string, unknown> = {
    wires: options.wires.map((w) => ({
      tag: w.tag,
      segments: w.segments,
      x1: w.x1, y1: w.y1, z1: w.z1,
      x2: w.x2, y2: w.y2, z2: w.z2,
      radius: w.radius,
    })),
    excitations: options.excitations.map((e) => ({
      wire_tag: e.wire_tag,
      segment: e.segment,
      voltage_real: e.voltage_real,
      voltage_imag: e.voltage_imag,
    })),
    ground: buildGroundPayload(options.ground),
    frequency: {
      start_mhz: options.frequency.start_mhz,
      stop_mhz: options.frequency.stop_mhz,
      steps: options.frequency.steps,
    },
    pattern: {
      theta_start: -90,
      theta_stop: 90,
      theta_step: step,
      phi_start: 0,
      phi_stop: 360 - step,
      phi_step: step,
    },
    loads: options.loads ?? [],
    transmission_lines: options.transmission_lines ?? [],
    arcs: options.arcs ?? [],
    transforms: options.transforms ?? [],
    ...(options.symmetry ? { symmetry: options.symmetry } : {}),
    compute_currents: options.compute_currents ?? true,
    near_field: {
      enabled: true,
      plane: "horizontal",
      height_m: 1.8,
      extent_m: 20.0,
      resolution_m: 0.5,
    },
    comment: options.comment ?? "AntennaSim V2 simulation",
  };

  return api.post<SimulationResult>("/api/v1/simulate", body, {
    timeout: 60000,
  });
}
