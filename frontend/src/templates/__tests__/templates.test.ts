/**
 * Structural and boundary tests for all antenna templates.
 *
 * Focused on catching real bugs:
 * - Excitations referencing non-existent wires (NEC2 crash)
 * - Excitation segments out of range (NEC2 crash)
 * - Zero-length wires (NEC2 crash)
 * - Templates crashing at parameter extremes (slider edge cases)
 * - Invalid frequency ranges (infinite loops in NEC2)
 */

import { templates, getTemplate, getDefaultTemplate } from "../index";
import { getDefaultParams } from "../types";
import type { WireGeometry } from "../types";

function wireLength(w: WireGeometry): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const dz = w.z2 - w.z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("Template registry", () => {
  it("has 17 templates with unique IDs", () => {
    expect(templates).toHaveLength(17);
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(17);
  });

  it("getTemplate throws for unknown ID", () => {
    expect(() => getTemplate("nonexistent")).toThrow("Unknown template");
  });

  it("default template is dipole", () => {
    expect(getDefaultTemplate().id).toBe("dipole");
  });
});

// ---------------------------------------------------------------------------
// Per-template: things that cause NEC2 crashes if wrong
// ---------------------------------------------------------------------------

describe.each(templates.map((t) => [t.id, t]))(
  "Template %s",
  (_id, template) => {
    const t = template as (typeof templates)[0];
    const params = getDefaultParams(t);
    const wires = t.generateGeometry(params);
    const ex = t.generateExcitation(params, wires);
    const freq = t.defaultFrequencyRange(params);
    const fps = t.generateFeedpoints(params, wires);
    const wireTags = new Set(wires.map((w) => w.tag));

    it("generates wires with non-zero length, positive segments and radius", () => {
      expect(wires.length).toBeGreaterThan(0);
      for (const w of wires) {
        expect(wireLength(w)).toBeGreaterThan(0);
        expect(w.segments).toBeGreaterThan(0);
        expect(w.radius).toBeGreaterThan(0);
      }
    });

    it("excitation references a valid wire and segment", () => {
      expect(wireTags.has(ex.wire_tag)).toBe(true);
      const wire = wires.find((w) => w.tag === ex.wire_tag)!;
      expect(ex.segment).toBeGreaterThanOrEqual(1);
      expect(ex.segment).toBeLessThanOrEqual(wire.segments);
    });

    it("frequency range is valid (start < stop, steps > 0)", () => {
      expect(freq.start_mhz).toBeGreaterThan(0);
      expect(freq.stop_mhz).toBeGreaterThan(freq.start_mhz);
      expect(freq.steps).toBeGreaterThan(0);
    });

    it("feedpoints reference existing wires", () => {
      expect(fps.length).toBeGreaterThan(0);
      for (const fp of fps) {
        expect(wireTags.has(fp.wireTag)).toBe(true);
      }
    });

    it("parameter defaults are within min/max bounds", () => {
      for (const p of t.parameters) {
        expect(p.defaultValue).toBeGreaterThanOrEqual(p.min);
        expect(p.defaultValue).toBeLessThanOrEqual(p.max);
        expect(p.min).toBeLessThan(p.max);
      }
    });
  },
);

// ---------------------------------------------------------------------------
// Boundary: templates must not crash at slider extremes
// ---------------------------------------------------------------------------

describe("Parameter boundary tests", () => {
  it.each(templates.map((t) => [t.id, t]))(
    "%s: min params produce valid geometry",
    (_id, template) => {
      const t = template as (typeof templates)[0];
      const minParams: Record<string, number> = {};
      for (const p of t.parameters) minParams[p.key] = p.min;

      const wires = t.generateGeometry(minParams);
      expect(wires.length).toBeGreaterThan(0);
      for (const w of wires) {
        expect(wireLength(w)).toBeGreaterThan(0);
        expect(Number.isFinite(w.x1)).toBe(true);
        expect(Number.isFinite(w.z2)).toBe(true);
      }
    },
  );

  it.each(templates.map((t) => [t.id, t]))(
    "%s: max params produce valid geometry",
    (_id, template) => {
      const t = template as (typeof templates)[0];
      const maxParams: Record<string, number> = {};
      for (const p of t.parameters) maxParams[p.key] = p.max;

      const wires = t.generateGeometry(maxParams);
      expect(wires.length).toBeGreaterThan(0);
      for (const w of wires) {
        expect(wireLength(w)).toBeGreaterThan(0);
        expect(Number.isFinite(w.x1)).toBe(true);
        expect(Number.isFinite(w.z2)).toBe(true);
      }
    },
  );
});
