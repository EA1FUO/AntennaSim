/** Health check response */
export interface HealthResponse {
  status: string;
  version: string;
  nec2c_available: boolean;
  environment: string;
}

// Simulation types are in ./nec.ts to keep concerns separated
export type {
  SimulationResult,
  FrequencyResult,
  PatternData,
  Impedance,
} from "./nec";
