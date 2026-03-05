/**
 * Integration tests for the simulation pipeline.
 *
 * Why these tests matter:
 * - Round-trip test (build card deck → parse it back) catches drift between
 *   the builder and parser — if one changes format without the other updating,
 *   imported files silently lose data.
 * - All-templates × all-grounds test catches templates that produce invalid
 *   NEC2 structures (missing EN, wrong GE flag, etc.) which nec2c would reject.
 */

import { buildCardDeck } from "../parsers/nec-input";
import { parseNecFile } from "../parsers/nec-file";
import type { SimulateAdvancedRequest } from "../types";
import { templates } from "../../templates/index";
import { getDefaultParams } from "../../templates/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(deck: string): string[] {
  return deck.split("\n").filter((l) => l.length > 0);
}

function makeRequest(templateId: string, groundType: string): SimulateAdvancedRequest {
  const t = templates.find((tmpl) => tmpl.id === templateId)!;
  const params = getDefaultParams(t);
  const wires = t.generateGeometry(params);
  const ex = t.generateExcitation(params, wires);
  const freq = t.defaultFrequencyRange(params);
  return {
    wires,
    excitations: [ex],
    ground: { type: groundType as "free_space" | "average" | "perfect" },
    frequency: freq,
  };
}

// ---------------------------------------------------------------------------
// Round-trip: buildCardDeck → parseNecFile
// ---------------------------------------------------------------------------

describe("Round-trip: build card deck then parse it back", () => {
  const testCases = [
    { id: "dipole", ground: "free_space" },
    { id: "yagi", ground: "average" },
    { id: "vertical", ground: "perfect" },
    { id: "quad", ground: "free_space" },
  ];

  it.each(testCases)(
    "$id ($ground): wire geometry survives round-trip",
    ({ id, ground }) => {
      const req = makeRequest(id, ground);
      const deck = buildCardDeck(req);
      const parsed = parseNecFile(deck);

      // Same number of wires
      expect(parsed.wires.length).toBe(req.wires.length);

      // Wire positions match (within .nec format precision)
      for (let i = 0; i < req.wires.length; i++) {
        const orig = req.wires[i]!;
        const back = parsed.wires[i]!;
        expect(back.tag).toBe(orig.tag);
        expect(back.segments).toBe(orig.segments);
        expect(back.x1).toBeCloseTo(orig.x1, 4);
        expect(back.y1).toBeCloseTo(orig.y1, 4);
        expect(back.z1).toBeCloseTo(orig.z1, 4);
        expect(back.x2).toBeCloseTo(orig.x2, 4);
        expect(back.y2).toBeCloseTo(orig.y2, 4);
        expect(back.z2).toBeCloseTo(orig.z2, 4);
      }
    },
  );

  it.each(testCases)(
    "$id ($ground): excitation survives round-trip",
    ({ id, ground }) => {
      const req = makeRequest(id, ground);
      const deck = buildCardDeck(req);
      const parsed = parseNecFile(deck);

      expect(parsed.excitations.length).toBe(req.excitations.length);
      for (let i = 0; i < req.excitations.length; i++) {
        const orig = req.excitations[i]!;
        const back = parsed.excitations[i]!;
        expect(back.wire_tag).toBe(orig.wire_tag);
        expect(back.segment).toBe(orig.segment);
      }
    },
  );

  it.each(testCases)(
    "$id ($ground): frequency range survives round-trip",
    ({ id, ground }) => {
      const req = makeRequest(id, ground);
      const deck = buildCardDeck(req);
      const parsed = parseNecFile(deck);

      expect(parsed.frequency_start_mhz).toBeCloseTo(req.frequency.start_mhz, 2);
      expect(parsed.frequency_steps).toBe(req.frequency.steps);
      // Stop frequency may have slight rounding from step calculation
      expect(parsed.frequency_stop_mhz).toBeCloseTo(req.frequency.stop_mhz, 1);
    },
  );
});

// ---------------------------------------------------------------------------
// All 17 templates × 3 ground types produce valid NEC2 structure
// ---------------------------------------------------------------------------

describe("All templates produce valid NEC2 card decks", () => {
  const groundTypes = [
    { type: "free_space" as const },
    { type: "average" as const },
    { type: "perfect" as const },
  ];

  for (const t of templates) {
    for (const ground of groundTypes) {
      it(`${t.id} + ${ground.type}: valid NEC2 structure`, () => {
        const params = getDefaultParams(t);
        const wires = t.generateGeometry(params);
        const ex = t.generateExcitation(params, wires);
        const freq = t.defaultFrequencyRange(params);

        const req: SimulateAdvancedRequest = {
          wires,
          excitations: [ex],
          ground,
          frequency: freq,
        };

        const deck = buildCardDeck(req);
        const deckLines = lines(deck);

        // Must start with CM/CE
        expect(deckLines[0]).toMatch(/^CM /);
        expect(deckLines[1]).toBe("CE");

        // Must end with EN
        expect(deckLines[deckLines.length - 1]).toBe("EN");

        // Must have GW cards matching wire count
        const gwCount = deckLines.filter((l) => l.startsWith("GW ")).length;
        expect(gwCount).toBe(req.wires.length);

        // Must have exactly one EX card
        expect(deckLines.filter((l) => l.startsWith("EX ")).length).toBe(1);

        // Must have exactly one FR card
        expect(deckLines.filter((l) => l.startsWith("FR ")).length).toBe(1);

        // Must have exactly one RP card
        expect(deckLines.filter((l) => l.startsWith("RP ")).length).toBe(1);

        // Ground flags must be consistent
        const geLine = deckLines.find((l) => l.startsWith("GE "))!;
        if (ground.type === "free_space") {
          expect(geLine).toBe("GE -1");
        } else {
          expect(geLine).toBe("GE 0");
        }

        // Card deck must be parseable without throwing
        const parsed = parseNecFile(deck);
        expect(parsed.wires.length).toBe(req.wires.length);
      });
    }
  }
});
