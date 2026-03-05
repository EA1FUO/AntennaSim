/**
 * Tests for impedance matching network calculator.
 */

import { describe, it, expect } from "vitest";
import {
  computeLNetwork,
  computePiNetwork,
  computeTNetwork,
  calculateMatching,
} from "../matching";
// Types used for inline type annotations where needed

describe("L-network", () => {
  it("produces solutions for a resistive load > 50 ohm", () => {
    const solutions = computeLNetwork(
      { real: 200, imag: 0 },
      { real: 50, imag: 0 },
      14.175,
    );
    expect(solutions.length).toBe(2);
    for (const sol of solutions) {
      expect(sol.topology).toBe("L");
      expect(sol.components.length).toBeGreaterThanOrEqual(1);
      expect(sol.q).toBeGreaterThan(0);
      expect(sol.bandwidth_mhz).toBeGreaterThan(0);
    }
  });

  it("produces solutions for a resistive load < 50 ohm", () => {
    const solutions = computeLNetwork(
      { real: 12, imag: 0 },
      { real: 50, imag: 0 },
      7.1,
    );
    expect(solutions.length).toBe(2);
  });

  it("handles complex load impedance", () => {
    const solutions = computeLNetwork(
      { real: 35, imag: -20 },
      { real: 50, imag: 0 },
      14.175,
    );
    expect(solutions.length).toBe(2);
    // All components should have valid values
    for (const sol of solutions) {
      for (const comp of sol.components) {
        if (comp.type === "inductor") {
          expect(comp.inductance_nh).toBeDefined();
          expect(comp.inductance_nh).toBeGreaterThan(0);
        } else {
          expect(comp.capacitance_pf).toBeDefined();
          expect(comp.capacitance_pf).toBeGreaterThan(0);
        }
      }
    }
  });

  it("returns empty for zero/negative resistance", () => {
    expect(computeLNetwork({ real: 0, imag: 10 }, { real: 50, imag: 0 }, 14).length).toBe(0);
    expect(computeLNetwork({ real: -5, imag: 0 }, { real: 50, imag: 0 }, 14).length).toBe(0);
  });

  it("component reactance signs are consistent with type", () => {
    const solutions = computeLNetwork(
      { real: 100, imag: 0 },
      { real: 50, imag: 0 },
      14.175,
    );
    for (const sol of solutions) {
      for (const comp of sol.components) {
        if (comp.type === "inductor") {
          expect(comp.reactance).toBeGreaterThanOrEqual(0);
        } else {
          expect(comp.reactance).toBeLessThan(0);
        }
      }
    }
  });
});

describe("Pi-network", () => {
  it("produces a valid solution", () => {
    const sol = computePiNetwork(
      { real: 200, imag: 30 },
      { real: 50, imag: 0 },
      14.175,
    );
    expect(sol).not.toBeNull();
    expect(sol!.topology).toBe("Pi");
    expect(sol!.components.length).toBe(3);
    // Pi: shunt-series-shunt
    expect(sol!.components[0]!.position).toBe("shunt");
    expect(sol!.components[1]!.position).toBe("series");
    expect(sol!.components[2]!.position).toBe("shunt");
  });

  it("returns null for invalid input", () => {
    expect(computePiNetwork({ real: 0, imag: 0 }, { real: 50, imag: 0 }, 14)).toBeNull();
  });
});

describe("T-network", () => {
  it("produces a valid solution", () => {
    const sol = computeTNetwork(
      { real: 200, imag: -50 },
      { real: 50, imag: 0 },
      14.175,
    );
    expect(sol).not.toBeNull();
    expect(sol!.topology).toBe("T");
    expect(sol!.components.length).toBe(3);
    // T: series-shunt-series
    expect(sol!.components[0]!.position).toBe("series");
    expect(sol!.components[1]!.position).toBe("shunt");
    expect(sol!.components[2]!.position).toBe("series");
  });

  it("returns null for invalid input", () => {
    expect(computeTNetwork({ real: -10, imag: 0 }, { real: 50, imag: 0 }, 14)).toBeNull();
  });
});

describe("calculateMatching", () => {
  it("dispatches to L-network", () => {
    const solutions = calculateMatching({
      load: { real: 100, imag: 20 },
      target: { real: 50, imag: 0 },
      frequency_mhz: 14.175,
      topology: "L",
    });
    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions[0]!.topology).toBe("L");
  });

  it("dispatches to Pi-network", () => {
    const solutions = calculateMatching({
      load: { real: 100, imag: 20 },
      target: { real: 50, imag: 0 },
      frequency_mhz: 14.175,
      topology: "Pi",
    });
    expect(solutions.length).toBe(1);
    expect(solutions[0]!.topology).toBe("Pi");
  });

  it("dispatches to T-network", () => {
    const solutions = calculateMatching({
      load: { real: 100, imag: 20 },
      target: { real: 50, imag: 0 },
      frequency_mhz: 14.175,
      topology: "T",
    });
    expect(solutions.length).toBe(1);
    expect(solutions[0]!.topology).toBe("T");
  });

  it("uses custom component Q", () => {
    const highQ = calculateMatching({
      load: { real: 200, imag: 0 },
      target: { real: 50, imag: 0 },
      frequency_mhz: 14.175,
      topology: "L",
      component_q: 500,
    });
    const lowQ = calculateMatching({
      load: { real: 200, imag: 0 },
      target: { real: 50, imag: 0 },
      frequency_mhz: 14.175,
      topology: "L",
      component_q: 50,
    });
    // Lower component Q means higher insertion loss
    expect(lowQ[0]!.insertion_loss_db).toBeGreaterThan(highQ[0]!.insertion_loss_db);
  });
});
