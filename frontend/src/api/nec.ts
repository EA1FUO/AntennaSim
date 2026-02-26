/**
 * NEC2 simulation API endpoint.
 * Calls POST /api/v1/simulate on the backend.
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
}

/** Complete simulation response */
export interface SimulationResult {
  simulation_id: string;
  engine: string;
  computed_in_ms: number;
  total_segments: number;
  cached: boolean;
  frequency_data: FrequencyResult[];
  warnings: string[];
}

/** Build and send simulation request to backend */
export async function runSimulation(
  wires: WireGeometry[],
  excitation: Excitation,
  ground: GroundConfig,
  frequency: FrequencyRange
): Promise<SimulationResult> {
  // Build ground config for backend
  let groundPayload: Record<string, unknown>;
  if (ground.type === "free_space") {
    groundPayload = { type: "free_space" };
  } else if (ground.type === "perfect") {
    groundPayload = { type: "perfect" };
  } else if (ground.type === "custom") {
    groundPayload = {
      type: "custom",
      custom_permittivity: ground.custom_permittivity ?? 13,
      custom_conductivity: ground.custom_conductivity ?? 0.005,
    };
  } else {
    const params = GROUND_PARAMS[ground.type] ?? GROUND_PARAMS.average!;
    groundPayload = {
      type: ground.type,
      custom_permittivity: params.permittivity,
      custom_conductivity: params.conductivity,
    };
  }

  const body = {
    wires: wires.map((w) => ({
      tag: w.tag,
      segments: w.segments,
      x1: w.x1,
      y1: w.y1,
      z1: w.z1,
      x2: w.x2,
      y2: w.y2,
      z2: w.z2,
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
    ground: groundPayload,
    frequency: {
      start_mhz: frequency.start_mhz,
      stop_mhz: frequency.stop_mhz,
      steps: frequency.steps,
    },
    comment: "AntSim simulation",
  };

  return api.post<SimulationResult>("/api/v1/simulate", body, {
    timeout: 60000, // 60s for large sweeps
  });
}
