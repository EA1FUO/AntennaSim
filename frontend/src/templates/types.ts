/**
 * Antenna template system type definitions.
 *
 * Templates define parameterized antenna geometries that users can
 * customize via sliders, generating NEC2 wire geometry in real-time.
 */

import type { WireData, FeedpointData } from "../components/three/types";

/** Ground type enum matching backend GroundConfig */
export type GroundType =
  | "free_space"
  | "perfect"
  | "salt_water"
  | "fresh_water"
  | "pastoral"
  | "average"
  | "rocky"
  | "city"
  | "dry_sandy"
  | "custom";

/** Ground configuration for simulation */
export interface GroundConfig {
  type: GroundType;
  custom_permittivity?: number;
  custom_conductivity?: number;
}

/** Parameter definition for template sliders */
export interface ParameterDef {
  /** Unique key for this parameter */
  key: string;
  /** Display label */
  label: string;
  /** Short description / tooltip */
  description: string;
  /** Unit string (MHz, m, mm, deg, etc.) */
  unit: string;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step size for slider */
  step: number;
  /** Default value */
  defaultValue: number;
  /** Number of decimal places to display */
  decimals?: number;
}

/** Generated wire geometry for NEC2 simulation */
export interface WireGeometry {
  tag: number;
  segments: number;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  radius: number;
}

/** Excitation source definition */
export interface Excitation {
  wire_tag: number;
  segment: number;
  voltage_real: number;
  voltage_imag: number;
}

/** Frequency range for default sweep */
export interface FrequencyRange {
  start_mhz: number;
  stop_mhz: number;
  steps: number;
}

/** Template category */
export type TemplateCategory =
  | "wire"
  | "vertical"
  | "directional"
  | "loop"
  | "multiband";

/** Template difficulty */
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

/** Complete antenna template definition */
export interface AntennaTemplate {
  /** Unique identifier (slug) */
  id: string;
  /** Full display name */
  name: string;
  /** Short name for compact UI */
  nameShort: string;
  /** One-line description */
  description: string;
  /** Multi-line description for template detail view */
  longDescription: string;
  /** SVG icon or emoji */
  icon: string;
  /** Category for filtering */
  category: TemplateCategory;
  /** Difficulty level */
  difficulty: TemplateDifficulty;
  /** Typical bands this antenna works on */
  bands: string[];
  /** Adjustable parameters */
  parameters: ParameterDef[];
  /** Default ground configuration */
  defaultGround: GroundConfig;
  /** Generate NEC2 wire geometry from parameter values */
  generateGeometry: (params: Record<string, number>) => WireGeometry[];
  /** Generate excitation source(s) from parameter values and wires */
  generateExcitation: (
    params: Record<string, number>,
    wires: WireGeometry[]
  ) => Excitation;
  /** Generate feedpoint position(s) for 3D visualization */
  generateFeedpoints: (
    params: Record<string, number>,
    wires: WireGeometry[]
  ) => FeedpointData[];
  /** Compute default frequency sweep range based on parameters */
  defaultFrequencyRange: (params: Record<string, number>) => FrequencyRange;
  /** Usage tips shown below the parameter panel */
  tips: string[];
  /** IDs of related templates for "see also" */
  relatedTemplates: string[];
}

/** Extract current parameter values from a template's defaults */
export function getDefaultParams(
  template: AntennaTemplate
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const p of template.parameters) {
    params[p.key] = p.defaultValue;
  }
  return params;
}

/** Convert WireGeometry[] to WireData[] for the 3D viewport */
export function wireGeometryToWireData(wires: WireGeometry[]): WireData[] {
  return wires.map((w) => ({
    tag: w.tag,
    segments: w.segments,
    x1: w.x1,
    y1: w.y1,
    z1: w.z1,
    x2: w.x2,
    y2: w.y2,
    z2: w.z2,
    radius: w.radius,
  }));
}
