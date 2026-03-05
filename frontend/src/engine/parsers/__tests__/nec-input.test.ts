/**
 * Tests for NEC2 card deck generation (nec-input.ts).
 *
 * These tests matter because a wrong card deck means wrong physics:
 * - Wrong GE/GN flags = wrong ground model
 * - Wrong RP theta range = missing half the radiation pattern
 * - Wrong card order = nec2c rejects the input
 * - Missing cards = silent incorrect results
 */

import { buildCardDeck } from "../nec-input";
import type { SimulateAdvancedRequest } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(deck: string): string[] {
  return deck.split("\n").filter((l) => l.length > 0);
}

function findCards(deck: string, card: string): string[] {
  return lines(deck).filter((l) => l.startsWith(card + " ") || l === card);
}

function makeDipole(
  overrides?: Partial<SimulateAdvancedRequest>,
): SimulateAdvancedRequest {
  return {
    wires: [
      { tag: 1, segments: 21, x1: -5, y1: 0, z1: 10, x2: 5, y2: 0, z2: 10, radius: 0.001 },
    ],
    excitations: [
      { wire_tag: 1, segment: 11, voltage_real: 1.0, voltage_imag: 0.0 },
    ],
    ground: { type: "free_space" },
    frequency: { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ground model correctness — wrong flags = wrong physics
// ---------------------------------------------------------------------------

describe("Ground models", () => {
  it("free_space: GE -1, GN -1", () => {
    const deck = buildCardDeck(makeDipole({ ground: { type: "free_space" } }));
    expect(findCards(deck, "GE")).toEqual(["GE -1"]);
    expect(findCards(deck, "GN")).toEqual(["GN -1"]);
  });

  it("perfect ground: GE 0, GN 1", () => {
    const deck = buildCardDeck(makeDipole({ ground: { type: "perfect" } }));
    expect(findCards(deck, "GE")).toEqual(["GE 0"]);
    expect(findCards(deck, "GN")[0]).toMatch(/^GN 1/);
  });

  it("average ground: GN 2 with eps=13, sigma=0.005", () => {
    const deck = buildCardDeck(makeDipole({ ground: { type: "average" } }));
    const gn = findCards(deck, "GN")[0]!;
    expect(gn).toMatch(/^GN 2/);
    expect(gn).toContain("13.0000");
    expect(gn).toContain("0.005000");
  });

  it("salt_water ground: GN 2 with eps=80, sigma=5", () => {
    const deck = buildCardDeck(makeDipole({ ground: { type: "salt_water" } }));
    const gn = findCards(deck, "GN")[0]!;
    expect(gn).toContain("80.0000");
    expect(gn).toContain("5.000000");
  });

  it("custom ground: uses user-provided values", () => {
    const deck = buildCardDeck(makeDipole({
      ground: { type: "custom", custom_permittivity: 25.5, custom_conductivity: 0.02 },
    }));
    const gn = findCards(deck, "GN")[0]!;
    expect(gn).toContain("25.5000");
    expect(gn).toContain("0.020000");
  });
});

// ---------------------------------------------------------------------------
// RP card — wrong theta range was the PR #34 bug
// ---------------------------------------------------------------------------

describe("Radiation pattern (RP card)", () => {
  it("free space: full sphere theta -180 to 180", () => {
    const rp = findCards(buildCardDeck(makeDipole()), "RP")[0]!;
    expect(rp).toContain("-180.0");
    // nTheta = 360/5 + 1 = 73
    expect(rp).toContain("73 72");
  });

  it("with ground: upper hemisphere theta -90 to 90", () => {
    const rp = findCards(
      buildCardDeck(makeDipole({ ground: { type: "average" } })),
      "RP",
    )[0]!;
    expect(rp).toContain("-90.0");
    // nTheta = 180/5 + 1 = 37
    expect(rp).toContain("37 72");
  });

  it("respects custom pattern_step", () => {
    const rp = findCards(buildCardDeck(makeDipole({ pattern_step: 2 })), "RP")[0]!;
    expect(rp).toContain("2.0 2.0");
  });
});

// ---------------------------------------------------------------------------
// Excitations — phased arrays need correct complex voltage
// ---------------------------------------------------------------------------

describe("Excitations (EX cards)", () => {
  it("single excitation", () => {
    const exCards = findCards(buildCardDeck(makeDipole()), "EX");
    expect(exCards).toHaveLength(1);
    expect(exCards[0]).toMatch(/^EX 0 1 11 0 1\.0000 0\.0000$/);
  });

  it("multiple excitations with complex voltage", () => {
    const deck = buildCardDeck(makeDipole({
      wires: [
        { tag: 1, segments: 11, x1: -5, y1: 0, z1: 10, x2: 0, y2: 0, z2: 10, radius: 0.001 },
        { tag: 2, segments: 11, x1: 0, y1: 5, z1: 10, x2: 5, y2: 5, z2: 10, radius: 0.001 },
      ],
      excitations: [
        { wire_tag: 1, segment: 6, voltage_real: 1.0, voltage_imag: 0.0 },
        { wire_tag: 2, segment: 6, voltage_real: 0.707, voltage_imag: 0.707 },
      ],
    }));
    const exCards = findCards(deck, "EX");
    expect(exCards).toHaveLength(2);
    expect(exCards[1]).toContain("0.7070 0.7070");
  });
});

// ---------------------------------------------------------------------------
// Frequency sweep
// ---------------------------------------------------------------------------

describe("Frequency (FR card)", () => {
  it("computes correct step size", () => {
    const fr = findCards(buildCardDeck(makeDipole()), "FR")[0]!;
    // step = (14.35 - 14.0) / (15 - 1) = 0.025
    expect(fr).toContain("0.025000");
  });

  it("single frequency: step = 0", () => {
    const deck = buildCardDeck(makeDipole({
      frequency: { start_mhz: 14.1, stop_mhz: 14.1, steps: 1 },
    }));
    expect(findCards(deck, "FR")[0]).toMatch(/0\.000000$/);
  });
});

// ---------------------------------------------------------------------------
// Multi-segment frequency sweep
// ---------------------------------------------------------------------------

describe("Multi-segment frequency (frequencySegments)", () => {
  it("emits one FR+RP pair per segment", () => {
    const deck = buildCardDeck(makeDipole({
      frequencySegments: [
        { start_mhz: 14.0, stop_mhz: 14.35, steps: 15, label: "20m" },
        { start_mhz: 21.0, stop_mhz: 21.45, steps: 20, label: "15m" },
      ],
    }));
    const frCards = findCards(deck, "FR");
    const rpCards = findCards(deck, "RP");
    expect(frCards).toHaveLength(2);
    expect(rpCards).toHaveLength(2);
  });

  it("computes correct step size for each segment", () => {
    const deck = buildCardDeck(makeDipole({
      frequencySegments: [
        { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 },
        { start_mhz: 28.0, stop_mhz: 29.7, steps: 51 },
      ],
    }));
    const frCards = findCards(deck, "FR");
    // Segment 1: step = (14.35 - 14.0) / 14 = 0.025
    expect(frCards[0]).toContain("14.000000");
    expect(frCards[0]).toContain("0.025000");
    // Segment 2: step = (29.7 - 28.0) / 50 = 0.034
    expect(frCards[1]).toContain("28.000000");
    expect(frCards[1]).toContain("0.034000");
  });

  it("each FR is followed by RP (correct interleaving)", () => {
    const deck = buildCardDeck(makeDipole({
      frequencySegments: [
        { start_mhz: 7.0, stop_mhz: 7.2, steps: 11 },
        { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 },
        { start_mhz: 21.0, stop_mhz: 21.45, steps: 20 },
      ],
    }));
    const allLines = lines(deck);
    const cardTypes = allLines.map((l) => l.split(" ")[0]);

    // Find all FR positions and verify each is followed by RP
    const frIndices = cardTypes.reduce<number[]>((acc, c, i) => c === "FR" ? [...acc, i] : acc, []);
    expect(frIndices).toHaveLength(3);
    for (const frIdx of frIndices) {
      expect(cardTypes[frIdx + 1]).toBe("RP");
    }
  });

  it("falls back to single frequency when segments is empty", () => {
    const deck = buildCardDeck(makeDipole({ frequencySegments: [] }));
    expect(findCards(deck, "FR")).toHaveLength(1);
    expect(findCards(deck, "RP")).toHaveLength(1);
  });

  it("falls back to single frequency when segments is undefined", () => {
    const deck = buildCardDeck(makeDipole());
    expect(findCards(deck, "FR")).toHaveLength(1);
    expect(findCards(deck, "RP")).toHaveLength(1);
  });

  it("includes NE card after each FR when near_field is set", () => {
    const deck = buildCardDeck(makeDipole({
      frequencySegments: [
        { start_mhz: 14.0, stop_mhz: 14.35, steps: 15 },
        { start_mhz: 21.0, stop_mhz: 21.45, steps: 20 },
      ],
      near_field: { plane: "horizontal", height_m: 1.8, extent_m: 20.0, resolution_m: 0.5 },
    }));
    const neCards = findCards(deck, "NE");
    expect(neCards).toHaveLength(2);

    // Verify order: FR NE RP FR NE RP
    const allLines2 = lines(deck);
    const cardTypes = allLines2.map((l) => l.split(" ")[0]);
    const frIndices = cardTypes.reduce<number[]>((acc, c, i) => c === "FR" ? [...acc, i] : acc, []);
    for (const frIdx of frIndices) {
      expect(cardTypes[frIdx + 1]).toBe("NE");
      expect(cardTypes[frIdx + 2]).toBe("RP");
    }
  });
});

// ---------------------------------------------------------------------------
// Optional cards: LD, TL, NE, GA, GM, GR
// ---------------------------------------------------------------------------

describe("Optional cards", () => {
  it("no LD/TL/NE/GA/GM/GR when not specified", () => {
    const deck = buildCardDeck(makeDipole());
    for (const card of ["LD", "TL", "NE", "GA", "GM", "GR"]) {
      expect(findCards(deck, card)).toHaveLength(0);
    }
  });

  it("generates LD cards for loads", () => {
    const deck = buildCardDeck(makeDipole({
      loads: [
        { load_type: 0, wire_tag: 1, segment_start: 1, segment_end: 1, param1: 50, param2: 0, param3: 0 },
      ],
    }));
    expect(findCards(deck, "LD")).toHaveLength(1);
    expect(findCards(deck, "LD")[0]).toMatch(/^LD 0 1 1 1 /);
  });

  it("generates TL card for transmission line", () => {
    const deck = buildCardDeck(makeDipole({
      wires: [
        { tag: 1, segments: 11, x1: -5, y1: 0, z1: 10, x2: 0, y2: 0, z2: 10, radius: 0.001 },
        { tag: 2, segments: 11, x1: 0, y1: 0, z1: 10, x2: 5, y2: 0, z2: 10, radius: 0.001 },
      ],
      transmission_lines: [
        { wire_tag1: 1, segment1: 6, wire_tag2: 2, segment2: 6, impedance: 75, length: 10.5 },
      ],
    }));
    expect(findCards(deck, "TL")[0]).toMatch(/^TL 1 6 2 6 75\.0000/);
  });

  it("generates GR card for cylindrical symmetry", () => {
    const deck = buildCardDeck(makeDipole({ symmetry: { tag_increment: 1, n_copies: 4 } }));
    expect(findCards(deck, "GR")[0]).toBe("GR 1 4");
  });
});

// ---------------------------------------------------------------------------
// Current output control
// ---------------------------------------------------------------------------

describe("Current control (PT card)", () => {
  it("enabled by default", () => {
    expect(findCards(buildCardDeck(makeDipole()), "PT")).toEqual(["PT 0 0 0 0"]);
  });

  it("suppressed when compute_currents=false", () => {
    expect(findCards(buildCardDeck(makeDipole({ compute_currents: false })), "PT"))
      .toEqual(["PT -1 0 0 0"]);
  });
});

// ---------------------------------------------------------------------------
// Card ordering — nec2c is order-sensitive
// ---------------------------------------------------------------------------

describe("Card ordering", () => {
  it("follows NEC2 required order: CM CE GW GE GN ... EX FR RP EN", () => {
    const deck = buildCardDeck(makeDipole({
      loads: [{ load_type: 0, wire_tag: 1, segment_start: 1, segment_end: 1, param1: 50, param2: 0, param3: 0 }],
    }));
    const order = lines(deck).map((l) => l.split(" ")[0]);
    const idx = (card: string) => order.indexOf(card);

    // Geometry section first, then program control, then output
    expect(idx("CM")).toBeLessThan(idx("CE"));
    expect(idx("CE")).toBeLessThan(idx("GW"));
    expect(idx("GW")).toBeLessThan(idx("GE"));
    expect(idx("GE")).toBeLessThan(idx("GN"));
    expect(idx("GN")).toBeLessThan(idx("EX"));
    expect(idx("EX")).toBeLessThan(idx("FR"));
    expect(idx("FR")).toBeLessThan(idx("RP"));
    expect(idx("RP")).toBeLessThan(idx("EN"));
  });
});
