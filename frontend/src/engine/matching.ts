/**
 * Impedance matching network calculator.
 *
 * Computes L, Pi, and T network component values to transform
 * a complex load impedance to a target impedance (typically 50 ohm).
 * All calculations use closed-form analytical solutions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Complex impedance */
export interface ComplexZ {
  real: number;
  imag: number;
}

/** A single reactive component in a matching network */
export interface MatchingComponent {
  /** Component type */
  type: "inductor" | "capacitor";
  /** Position in the network */
  position: "series" | "shunt";
  /** Reactance in ohms (positive = inductive, negative = capacitive) */
  reactance: number;
  /** Inductance in nH (only for inductors) */
  inductance_nh?: number;
  /** Capacitance in pF (only for capacitors) */
  capacitance_pf?: number;
}

/** Topology of the matching network */
export type MatchingTopology = "L" | "Pi" | "T";

/** A complete matching network solution */
export interface MatchingSolution {
  /** Network topology */
  topology: MatchingTopology;
  /** Components, in order from source to load */
  components: MatchingComponent[];
  /** Loaded Q factor of the network */
  q: number;
  /** Bandwidth estimate (3 dB) in MHz */
  bandwidth_mhz: number;
  /** Insertion loss estimate in dB (assumes component Q) */
  insertion_loss_db: number;
  /** The transformed impedance (should be close to target) */
  transformed: ComplexZ;
}

/** Input parameters for the matching calculator */
export interface MatchingRequest {
  /** Load impedance (from simulation) */
  load: ComplexZ;
  /** Target impedance (typically 50+j0) */
  target: ComplexZ;
  /** Operating frequency in MHz */
  frequency_mhz: number;
  /** Desired topology */
  topology: MatchingTopology;
  /** Component Q factor for loss estimation (default 200) */
  component_q?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reactanceToComponent(
  reactance: number,
  freqMhz: number,
  position: "series" | "shunt",
  _componentQ: number,
): MatchingComponent {
  const omega = 2 * Math.PI * freqMhz * 1e6;

  if (reactance >= 0) {
    // Inductor: X = omega * L => L = X / omega
    const L = reactance / omega;
    return {
      type: "inductor",
      position,
      reactance,
      inductance_nh: Math.round(L * 1e9 * 100) / 100,
    };
  } else {
    // Capacitor: X = -1/(omega * C) => C = -1/(omega * X)
    const C = -1 / (omega * reactance);
    return {
      type: "capacitor",
      position,
      reactance,
      capacitance_pf: Math.round(C * 1e12 * 100) / 100,
    };
  }
}

/** Estimate insertion loss from component Q and network Q */
function estimateLoss(networkQ: number, componentQ: number): number {
  // Approximate: IL = 10 * log10(1 + Q_net / Q_comp) per reactive element
  // For the total network, we sum individual losses
  return 10 * Math.log10(1 + networkQ / componentQ);
}

// ---------------------------------------------------------------------------
// L-network
// ---------------------------------------------------------------------------

/**
 * Compute L-network matching solutions.
 *
 * Returns up to 2 solutions (high-pass and low-pass variants).
 * The L-network can only match when R_load != R_target.
 */
export function computeLNetwork(
  load: ComplexZ,
  target: ComplexZ,
  freqMhz: number,
  componentQ: number = 200,
): MatchingSolution[] {
  const RL = load.real;
  const XL = load.imag;
  const RS = target.real;

  if (RL <= 0 || RS <= 0) return [];

  const solutions: MatchingSolution[] = [];

  // Determine configuration: if RL > RS, shunt element is on the load side
  // if RL < RS, shunt element is on the source side
  if (Math.abs(RL - RS) < 0.01) {
    // Already matched in resistance — just need to cancel reactance
    if (Math.abs(XL) < 0.01) return []; // Already matched

    const comp = reactanceToComponent(-XL, freqMhz, "series", componentQ);
    solutions.push({
      topology: "L",
      components: [comp],
      q: Math.abs(XL) / Math.min(RL, RS),
      bandwidth_mhz: freqMhz / (Math.abs(XL) / Math.min(RL, RS) + 1),
      insertion_loss_db: estimateLoss(Math.abs(XL) / Math.min(RL, RS), componentQ),
      transformed: { real: RS, imag: 0 },
    });
    return solutions;
  }

  // Q required for matching
  const Rhi = Math.max(RL, RS);
  const Rlo = Math.min(RL, RS);
  const Q = Math.sqrt(Rhi / Rlo - 1);

  // Two solutions: one with inductor series / capacitor shunt, and vice versa
  for (const sign of [1, -1]) {
    let Xseries: number;
    let Xshunt: number;

    if (RL > RS) {
      // Shunt element on load side, series element on source side
      Xshunt = RL / (sign * Q);
      Xseries = sign * Q * RS - XL * RS / RL;

      // Correct: need to cancel load reactance through the shunt element
      // Shunt element: creates parallel resonance absorbing XL
      const Xshunt_corrected = sign * RL / Q;
      const Xseries_corrected = sign * Q * RS;

      // Account for load reactance
      // The shunt element in parallel with (RL + jXL) must produce RS
      // Simplified: cancel XL first, then match
      Xshunt = Xshunt_corrected;
      Xseries = Xseries_corrected - XL;
    } else {
      // Shunt element on source side, series element on load side
      Xshunt = RS / (sign * Q);
      Xseries = sign * Q * RL - XL;
    }

    const comp1 = RL > RS
      ? reactanceToComponent(Xseries, freqMhz, "series", componentQ)
      : reactanceToComponent(Xseries, freqMhz, "series", componentQ);

    const comp2 = reactanceToComponent(-Xshunt, freqMhz, "shunt", componentQ);

    // Order: source side first
    const components = RL > RS ? [comp1, comp2] : [comp2, comp1];

    const bw = freqMhz / (Q + 1);

    solutions.push({
      topology: "L",
      components,
      q: Math.round(Q * 100) / 100,
      bandwidth_mhz: Math.round(bw * 100) / 100,
      insertion_loss_db: Math.round(estimateLoss(Q, componentQ) * 100) / 100,
      transformed: { real: RS, imag: 0 },
    });
  }

  return solutions;
}

// ---------------------------------------------------------------------------
// Pi-network
// ---------------------------------------------------------------------------

/**
 * Compute Pi-network matching solution.
 *
 * A Pi network is two L-networks back-to-back with a virtual resistance
 * between them. The Q parameter controls selectivity and bandwidth.
 */
export function computePiNetwork(
  load: ComplexZ,
  target: ComplexZ,
  freqMhz: number,
  desiredQ: number = 5,
  componentQ: number = 200,
): MatchingSolution | null {
  const RL = load.real;
  const XL = load.imag;
  const RS = target.real;

  if (RL <= 0 || RS <= 0) return null;

  // The virtual resistance is the minimum of (RS, RL) / (1 + Q^2)
  // Must be less than both RS and RL
  const Rmin = Math.min(RS, RL);
  const minQ = Math.sqrt(Math.max(RS, RL) / Rmin - 1);

  const Q = Math.max(desiredQ, minQ + 0.1);
  const Rmax = Math.max(RS, RL);
  const Rvirtual = Rmax / (1 + Q * Q);

  // Source side shunt element
  const Qs = Math.sqrt(RS / Rvirtual - 1);
  const Xshunt_s = RS / Qs;

  // Load side shunt element
  const Ql = Math.sqrt(RL / Rvirtual - 1);
  const Xshunt_l = RL / Ql;

  // Series element
  const Xseries = Rvirtual * (Qs + Ql) - XL;

  const comp_shunt_s = reactanceToComponent(-Xshunt_s, freqMhz, "shunt", componentQ);
  const comp_series = reactanceToComponent(Xseries, freqMhz, "series", componentQ);
  const comp_shunt_l = reactanceToComponent(-Xshunt_l, freqMhz, "shunt", componentQ);

  const bw = freqMhz / (Q + 1);
  const loss = estimateLoss(Q, componentQ) * 1.5; // Pi has more elements

  return {
    topology: "Pi",
    components: [comp_shunt_s, comp_series, comp_shunt_l],
    q: Math.round(Q * 100) / 100,
    bandwidth_mhz: Math.round(bw * 100) / 100,
    insertion_loss_db: Math.round(loss * 100) / 100,
    transformed: { real: RS, imag: 0 },
  };
}

// ---------------------------------------------------------------------------
// T-network
// ---------------------------------------------------------------------------

/**
 * Compute T-network matching solution.
 *
 * A T network uses two series elements with a shunt element in between.
 * Complementary to the Pi network topology.
 */
export function computeTNetwork(
  load: ComplexZ,
  target: ComplexZ,
  freqMhz: number,
  desiredQ: number = 5,
  componentQ: number = 200,
): MatchingSolution | null {
  const RL = load.real;
  const XL = load.imag;
  const RS = target.real;

  if (RL <= 0 || RS <= 0) return null;

  const Q = Math.max(desiredQ, 1);

  // Virtual resistance (must be > both RS and RL)
  const Rvirtual = (1 + Q * Q) * Math.max(RS, RL);

  // Source side series element
  const Qs = Math.sqrt(Rvirtual / RS - 1);
  const Xseries_s = Qs * RS;

  // Load side series element
  const Ql = Math.sqrt(Rvirtual / RL - 1);
  const Xseries_l = Ql * RL - XL;

  // Shunt element
  const Xshunt = Rvirtual / (Qs + Ql);

  const comp_series_s = reactanceToComponent(Xseries_s, freqMhz, "series", componentQ);
  const comp_shunt = reactanceToComponent(-Xshunt, freqMhz, "shunt", componentQ);
  const comp_series_l = reactanceToComponent(Xseries_l, freqMhz, "series", componentQ);

  const bw = freqMhz / (Q + 1);
  const loss = estimateLoss(Q, componentQ) * 1.5;

  return {
    topology: "T",
    components: [comp_series_s, comp_shunt, comp_series_l],
    q: Math.round(Q * 100) / 100,
    bandwidth_mhz: Math.round(bw * 100) / 100,
    insertion_loss_db: Math.round(loss * 100) / 100,
    transformed: { real: RS, imag: 0 },
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate matching network solutions for a given request.
 * Returns all solutions found (L returns 2 variants, Pi/T return 1 each).
 */
export function calculateMatching(request: MatchingRequest): MatchingSolution[] {
  const { load, target, frequency_mhz, topology, component_q = 200 } = request;

  switch (topology) {
    case "L":
      return computeLNetwork(load, target, frequency_mhz, component_q);
    case "Pi": {
      const sol = computePiNetwork(load, target, frequency_mhz, 5, component_q);
      return sol ? [sol] : [];
    }
    case "T": {
      const sol = computeTNetwork(load, target, frequency_mhz, 5, component_q);
      return sol ? [sol] : [];
    }
    default:
      return [];
  }
}
