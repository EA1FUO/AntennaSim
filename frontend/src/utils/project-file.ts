/**
 * Save/Load project files (.antennasim).
 *
 * A .antennasim file is a JSON document that captures the complete state
 * of either a simulator-mode or editor-mode session, so users don't lose
 * their work.
 */

import type { GroundConfig, FrequencyRange, Excitation, WireGeometry } from "../templates/types";
import type { LumpedLoad, TransmissionLine, SimulationResult } from "../api/nec";
import type { EditorJunction } from "./editor-junctions";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Current schema version. Increment when the format changes. */
export const PROJECT_SCHEMA_VERSION = 2;

/** File extension (without dot) */
export const PROJECT_FILE_EXTENSION = "antennasim";

export interface ProjectFile {
  /** Schema version for forward compatibility */
  version: number;
  /** AntennaSim version that created this file */
  app_version: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** Which mode the project was saved from */
  mode: "simulator" | "editor";

  /** Simulator mode state */
  simulator?: {
    templateId: string;
    params: Record<string, number>;
    ground: GroundConfig;
  };

  /** Editor mode state */
  editor?: {
    wires: WireGeometry[];
    excitations: Excitation[];
    loads: LumpedLoad[];
    transmissionLines: TransmissionLine[];
    /** Editor-only endpoint groups that move as one connection */
    junctions: EditorJunction[];
    ground: GroundConfig;
    frequencyRange: FrequencyRange;
    designFrequencyMhz: number;
  };

  /** Cached simulation result (optional — can be large) */
  result?: SimulationResult | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a parsed object looks like a ProjectFile. Throws on invalid. */
export function validateProjectFile(data: unknown): ProjectFile {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid project file: not an object");
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new Error("Invalid project file: missing 'version' field");
  }
  if (obj.version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project file version ${obj.version} is newer than supported (${PROJECT_SCHEMA_VERSION}). Please update AntennaSim.`,
    );
  }
  if (obj.mode !== "simulator" && obj.mode !== "editor") {
    throw new Error("Invalid project file: 'mode' must be 'simulator' or 'editor'");
  }

  if (obj.mode === "simulator") {
    const sim = obj.simulator as Record<string, unknown> | undefined;
    if (!sim || typeof sim.templateId !== "string") {
      throw new Error("Invalid project file: simulator mode requires 'simulator.templateId'");
    }
    if (!sim.params || typeof sim.params !== "object") {
      throw new Error("Invalid project file: simulator mode requires 'simulator.params'");
    }
  }

  if (obj.mode === "editor") {
    const ed = obj.editor as Record<string, unknown> | undefined;
    if (!ed || !Array.isArray(ed.wires)) {
      throw new Error("Invalid project file: editor mode requires 'editor.wires' array");
    }
    if (ed.wires.length === 0) {
      throw new Error("Invalid project file: editor must have at least one wire");
    }

    // Junctions were introduced in schema v2. Treat their absence in v1 as
    // an unlocked project so existing user files remain fully compatible.
    if (obj.version < 2 && ed.junctions === undefined) {
      ed.junctions = [];
    }
    if (!Array.isArray(ed.junctions)) {
      throw new Error("Invalid project file: editor mode requires 'editor.junctions' array");
    }

    const wireTags = new Set(
      ed.wires.flatMap((wire) => {
        if (typeof wire !== "object" || wire === null) return [];
        const tag = (wire as Record<string, unknown>).tag;
        return typeof tag === "number" ? [tag] : [];
      }),
    );
    const junctionIds = new Set<number>();
    const connectedEndpoints = new Set<string>();
    for (const rawJunction of ed.junctions) {
      if (typeof rawJunction !== "object" || rawJunction === null) {
        throw new Error("Invalid project file: junction must be an object");
      }
      const junction = rawJunction as Record<string, unknown>;
      if (!Number.isInteger(junction.id) || (junction.id as number) < 1) {
        throw new Error("Invalid project file: junction requires a positive integer 'id'");
      }
      if (junctionIds.has(junction.id as number)) {
        throw new Error("Invalid project file: junction IDs must be unique");
      }
      junctionIds.add(junction.id as number);
      if (!Array.isArray(junction.endpoints) || junction.endpoints.length < 2) {
        throw new Error("Invalid project file: junction requires at least two endpoints");
      }
      for (const rawEndpoint of junction.endpoints) {
        if (typeof rawEndpoint !== "object" || rawEndpoint === null) {
          throw new Error("Invalid project file: junction endpoint must be an object");
        }
        const endpoint = rawEndpoint as Record<string, unknown>;
        if (!wireTags.has(endpoint.wireTag as number)) {
          throw new Error("Invalid project file: junction references a missing wire");
        }
        if (endpoint.endpoint !== "start" && endpoint.endpoint !== "end") {
          throw new Error("Invalid project file: junction endpoint must be 'start' or 'end'");
        }
        const key = `${endpoint.wireTag}:${endpoint.endpoint}`;
        if (connectedEndpoints.has(key)) {
          throw new Error("Invalid project file: an endpoint cannot belong to multiple junctions");
        }
        connectedEndpoints.add(key);
      }
    }
  }

  return data as ProjectFile;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Create a ProjectFile from simulator mode state.
 */
export function createSimulatorProject(
  templateId: string,
  params: Record<string, number>,
  ground: GroundConfig,
  result?: SimulationResult | null,
): ProjectFile {
  return {
    version: PROJECT_SCHEMA_VERSION,
    app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    created_at: new Date().toISOString(),
    mode: "simulator",
    simulator: { templateId, params: { ...params }, ground: { ...ground } },
    result: result ?? null,
  };
}

/**
 * Create a ProjectFile from editor mode state.
 */
export function createEditorProject(
  wires: WireGeometry[],
  excitations: Excitation[],
  loads: LumpedLoad[],
  transmissionLines: TransmissionLine[],
  ground: GroundConfig,
  frequencyRange: FrequencyRange,
  designFrequencyMhz: number,
  junctions: EditorJunction[] = [],
  result?: SimulationResult | null,
): ProjectFile {
  return {
    version: PROJECT_SCHEMA_VERSION,
    app_version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    created_at: new Date().toISOString(),
    mode: "editor",
    editor: {
      wires: wires.map((w) => ({ ...w })),
      excitations: excitations.map((e) => ({ ...e })),
      loads: loads.map((l) => ({ ...l })),
      transmissionLines: transmissionLines.map((t) => ({ ...t })),
      junctions: junctions.map((junction) => ({
        ...junction,
        endpoints: junction.endpoints.map((endpoint) => ({ ...endpoint })),
      })),
      ground: { ...ground },
      frequencyRange: { ...frequencyRange },
      designFrequencyMhz,
    },
    result: result ?? null,
  };
}

/**
 * Serialize a project to JSON and trigger a browser download.
 */
export function downloadProject(project: ProjectFile, filename?: string): void {
  const name = filename ?? `antenna-${project.mode}-${Date.now()}.${PROJECT_FILE_EXTENSION}`;
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Parse and validate a project file from a File object.
 * Returns the validated ProjectFile or throws with a user-friendly message.
 */
export async function loadProjectFile(file: File): Promise<ProjectFile> {
  if (!file.name.endsWith(`.${PROJECT_FILE_EXTENSION}`) && !file.name.endsWith(".json")) {
    throw new Error(`Expected a .${PROJECT_FILE_EXTENSION} or .json file, got "${file.name}"`);
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid project file: not valid JSON");
  }

  return validateProjectFile(parsed);
}

/**
 * Estimate the size of a project file in bytes (for UI hints).
 */
export function estimateProjectSize(project: ProjectFile): number {
  return JSON.stringify(project).length;
}
