/**
 * Loads antenna template metadata from shared/antenna-templates.json.
 *
 * This is the single source of truth for template metadata (names, descriptions,
 * parameters, tips, etc.) consumed by both the TypeScript frontend and the Python
 * MCP server. Geometry generation logic stays language-specific in each template file.
 */

import type { AntennaTemplate, ParameterDef, GroundConfig } from "./types";
import rawData from "../../../shared/antenna-templates.json";

// ---------------------------------------------------------------------------
// Raw JSON shapes (before TypeScript narrowing)
// ---------------------------------------------------------------------------

interface RawParameterDef {
  key: string;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  decimals?: number;
}

interface RawGroundConfig {
  type: string;
  custom_permittivity?: number;
  custom_conductivity?: number;
}

interface RawTemplateMetadata {
  id: string;
  name: string;
  nameShort: string;
  description: string;
  longDescription: string;
  icon: string;
  category: string;
  difficulty: string;
  bands: string[];
  parameters: RawParameterDef[];
  defaultGround: RawGroundConfig;
  tips: string[];
  relatedTemplates: string[];
}

// ---------------------------------------------------------------------------
// TemplateMetadata: all fields except the four geometry functions
// ---------------------------------------------------------------------------

export type TemplateMetadata = Omit<
  AntennaTemplate,
  "generateGeometry" | "generateExcitation" | "generateFeedpoints" | "defaultFrequencyRange"
>;

// ---------------------------------------------------------------------------
// Build the cache at module load time
// ---------------------------------------------------------------------------

const _metadataCache = new Map<string, TemplateMetadata>();

for (const raw of rawData as RawTemplateMetadata[]) {
  const parameters: ParameterDef[] = raw.parameters.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    unit: p.unit,
    min: p.min,
    max: p.max,
    step: p.step,
    defaultValue: p.defaultValue,
    ...(p.decimals !== undefined ? { decimals: p.decimals } : {}),
  }));

  const defaultGround: GroundConfig = {
    type: raw.defaultGround.type as GroundConfig["type"],
    ...(raw.defaultGround.custom_permittivity !== undefined
      ? { custom_permittivity: raw.defaultGround.custom_permittivity }
      : {}),
    ...(raw.defaultGround.custom_conductivity !== undefined
      ? { custom_conductivity: raw.defaultGround.custom_conductivity }
      : {}),
  };

  const meta: TemplateMetadata = {
    id: raw.id,
    name: raw.name,
    nameShort: raw.nameShort,
    description: raw.description,
    longDescription: raw.longDescription,
    icon: raw.icon,
    category: raw.category as AntennaTemplate["category"],
    difficulty: raw.difficulty as AntennaTemplate["difficulty"],
    bands: raw.bands,
    parameters,
    defaultGround,
    tips: raw.tips,
    relatedTemplates: raw.relatedTemplates,
  };

  _metadataCache.set(raw.id, meta);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up template metadata by ID.
 * Throws if the ID is not found in the shared JSON.
 */
export function getTemplateMetadata(id: string): TemplateMetadata {
  const meta = _metadataCache.get(id);
  if (!meta) {
    throw new Error(
      `Template metadata not found in shared/antenna-templates.json: "${id}". ` +
      `Known IDs: ${[..._metadataCache.keys()].join(", ")}`
    );
  }
  return meta;
}