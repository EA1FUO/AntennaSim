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

/** All available templates, in display order */
export const templates: AntennaTemplate[] = [
  dipoleTemplate,
  invertedVTemplate,
  verticalTemplate,
  efhwTemplate,
  yagiTemplate,
  quadTemplate,
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
