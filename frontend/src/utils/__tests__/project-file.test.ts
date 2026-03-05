/**
 * Tests for project file save/load (.antennasim).
 *
 * Why these tests matter:
 * - A broken round-trip means users lose their antenna designs
 * - Schema validation prevents crashes when loading old or malformed files
 * - Version checking prevents silent data corruption from incompatible files
 */

import {
  PROJECT_SCHEMA_VERSION,
  validateProjectFile,
  createSimulatorProject,
  createEditorProject,
  estimateProjectSize,
} from "../project-file";
import type { ProjectFile } from "../project-file";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimProject(): ProjectFile {
  return createSimulatorProject(
    "dipole",
    { frequency: 14.1, length: 10.0, height: 10.0 },
    { type: "free_space" },
  );
}

function makeEditorProject(): ProjectFile {
  return createEditorProject(
    [{ tag: 1, segments: 21, x1: -5, y1: 0, z1: 10, x2: 5, y2: 0, z2: 10, radius: 0.001 }],
    [{ wire_tag: 1, segment: 11, voltage_real: 1, voltage_imag: 0 }],
    [],
    [],
    { type: "average" },
    { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 },
    14.1,
  );
}

// ---------------------------------------------------------------------------
// createSimulatorProject
// ---------------------------------------------------------------------------

describe("createSimulatorProject", () => {
  it("creates a valid project with correct metadata", () => {
    const project = makeSimProject();
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.mode).toBe("simulator");
    expect(project.simulator).toBeDefined();
    expect(project.simulator!.templateId).toBe("dipole");
    expect(project.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
  });

  it("deep-copies params (no shared references)", () => {
    const params = { frequency: 14.1 };
    const project = createSimulatorProject("dipole", params, { type: "free_space" });
    params.frequency = 7.0; // Mutate original
    expect(project.simulator!.params.frequency).toBe(14.1); // Project unchanged
  });
});

// ---------------------------------------------------------------------------
// createEditorProject
// ---------------------------------------------------------------------------

describe("createEditorProject", () => {
  it("creates a valid editor project", () => {
    const project = makeEditorProject();
    expect(project.mode).toBe("editor");
    expect(project.editor).toBeDefined();
    expect(project.editor!.wires).toHaveLength(1);
    expect(project.editor!.excitations).toHaveLength(1);
    expect(project.editor!.designFrequencyMhz).toBe(14.1);
  });

  it("deep-copies wires (no shared references)", () => {
    const wires = [{ tag: 1, segments: 21, x1: -5, y1: 0, z1: 10, x2: 5, y2: 0, z2: 10, radius: 0.001 }];
    const project = createEditorProject(
      wires, [], [], [], { type: "free_space" },
      { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 }, 14.1,
    );
    wires[0]!.x1 = 999; // Mutate original
    expect(project.editor!.wires[0]!.x1).toBe(-5); // Project unchanged
  });
});

// ---------------------------------------------------------------------------
// Round-trip: create → serialize → parse → validate
// ---------------------------------------------------------------------------

describe("Round-trip serialization", () => {
  it("simulator project survives JSON round-trip", () => {
    const original = makeSimProject();
    const json = JSON.stringify(original);
    const parsed = validateProjectFile(JSON.parse(json));

    expect(parsed.mode).toBe("simulator");
    expect(parsed.simulator!.templateId).toBe("dipole");
    expect(parsed.simulator!.params.frequency).toBe(14.1);
    expect(parsed.simulator!.ground.type).toBe("free_space");
  });

  it("editor project survives JSON round-trip", () => {
    const original = makeEditorProject();
    const json = JSON.stringify(original);
    const parsed = validateProjectFile(JSON.parse(json));

    expect(parsed.mode).toBe("editor");
    expect(parsed.editor!.wires).toHaveLength(1);
    expect(parsed.editor!.wires[0]!.tag).toBe(1);
    expect(parsed.editor!.excitations[0]!.segment).toBe(11);
    expect(parsed.editor!.frequencyRange.start_mhz).toBe(14.0);
  });
});

// ---------------------------------------------------------------------------
// validateProjectFile — error cases
// ---------------------------------------------------------------------------

describe("validateProjectFile — error cases", () => {
  it("rejects null", () => {
    expect(() => validateProjectFile(null)).toThrow("not an object");
  });

  it("rejects string", () => {
    expect(() => validateProjectFile("hello")).toThrow("not an object");
  });

  it("rejects object without version", () => {
    expect(() => validateProjectFile({ mode: "simulator" })).toThrow("missing 'version'");
  });

  it("rejects future schema version", () => {
    expect(() => validateProjectFile({
      version: PROJECT_SCHEMA_VERSION + 1,
      mode: "simulator",
      simulator: { templateId: "dipole", params: {} },
    })).toThrow("newer than supported");
  });

  it("rejects invalid mode", () => {
    expect(() => validateProjectFile({ version: 1, mode: "invalid" })).toThrow("'mode' must be");
  });

  it("rejects simulator mode without templateId", () => {
    expect(() => validateProjectFile({
      version: 1,
      mode: "simulator",
      simulator: { params: {} },
    })).toThrow("templateId");
  });

  it("rejects editor mode without wires", () => {
    expect(() => validateProjectFile({
      version: 1,
      mode: "editor",
      editor: {},
    })).toThrow("wires");
  });

  it("rejects editor mode with empty wires array", () => {
    expect(() => validateProjectFile({
      version: 1,
      mode: "editor",
      editor: { wires: [] },
    })).toThrow("at least one wire");
  });
});

// ---------------------------------------------------------------------------
// estimateProjectSize
// ---------------------------------------------------------------------------

describe("estimateProjectSize", () => {
  it("returns a positive number", () => {
    expect(estimateProjectSize(makeSimProject())).toBeGreaterThan(0);
  });

  it("editor project with result is larger than without", () => {
    const small = makeEditorProject();
    small.result = null;
    const large = makeEditorProject();
    large.result = { frequency_data: [{ frequency_mhz: 14.1 } as never] } as never;
    expect(estimateProjectSize(large)).toBeGreaterThan(estimateProjectSize(small));
  });
});
