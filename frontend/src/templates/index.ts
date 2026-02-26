/**
 * Template registry — central access to all antenna templates.
 */

import type { AntennaTemplate } from "./types";
import { dipoleTemplate } from "./dipole";
import { invertedVTemplate } from "./inverted-v";
import { verticalTemplate } from "./vertical";
import { efhwTemplate } from "./efhw";
import { yagiTemplate } from "./yagi";
import { quadTemplate } from "./quad";
import { moxonTemplate } from "./moxon";
import { jPoleTemplate } from "./j-pole";
import { slimJimTemplate } from "./slim-jim";
import { deltaLoopTemplate } from "./delta-loop";
import { g5rvTemplate } from "./g5rv";
import { logPeriodicTemplate } from "./log-periodic";
import { hexBeamTemplate } from "./hex-beam";
import { fanDipoleTemplate } from "./fan-dipole";
import { offCenterFedTemplate } from "./off-center-fed";

/** All available templates, in display order */
export const templates: AntennaTemplate[] = [
  // Wire antennas
  dipoleTemplate,
  invertedVTemplate,
  offCenterFedTemplate,
  // Verticals
  verticalTemplate,
  jPoleTemplate,
  slimJimTemplate,
  // End-fed / multiband
  efhwTemplate,
  g5rvTemplate,
  fanDipoleTemplate,
  // Loops
  deltaLoopTemplate,
  quadTemplate,
  // Directional
  yagiTemplate,
  moxonTemplate,
  hexBeamTemplate,
  logPeriodicTemplate,
];

/** Map from template ID to template */
export const templateMap = new Map<string, AntennaTemplate>(
  templates.map((t) => [t.id, t])
);

/** Get a template by ID, throws if not found */
export function getTemplate(id: string): AntennaTemplate {
  const t = templateMap.get(id);
  if (!t) {
    throw new Error(`Unknown template: ${id}`);
  }
  return t;
}

/** Get the default template */
export function getDefaultTemplate(): AntennaTemplate {
  return dipoleTemplate;
}

// Re-export types
export type { AntennaTemplate, ParameterDef, GroundConfig, GroundType } from "./types";
export { getDefaultParams, wireGeometryToWireData } from "./types";
