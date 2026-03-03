/**
 * Nelder-Mead simplex optimization algorithm.
 *
 * A derivative-free optimizer for unconstrained minimization. This is a
 * pure TypeScript implementation matching the behaviour of scipy's
 * `minimize(..., method="Nelder-Mead")`.
 */

export interface NelderMeadOptions {
  maxIter: number;
  xatol: number;
  fatol: number;
  adaptive: boolean;
}

export interface NelderMeadResult {
  x: number[];
  fun: number;
  iterations: number;
  success: boolean;
  message: string;
}

const DEFAULT_OPTIONS: NelderMeadOptions = {
  maxIter: 200,
  xatol: 1e-4,
  fatol: 1e-4,
  adaptive: false,
};

/**
 * Minimize a scalar function of one or more variables using the Nelder-Mead
 * simplex algorithm.
 *
 * The objective function may be async (e.g. for WASM module instantiation).
 *
 * @param fn - Objective function to minimize. Takes a number[] and returns a scalar (or Promise).
 * @param x0 - Initial guess (starting point).
 * @param options - Algorithm options (maxIter, xatol, fatol, adaptive).
 * @returns Optimization result containing the best point, value, and metadata.
 */
export async function nelderMead(
  fn: (x: number[]) => number | Promise<number>,
  x0: number[],
  options?: Partial<NelderMeadOptions>,
): Promise<NelderMeadResult> {
  const opts: NelderMeadOptions = { ...DEFAULT_OPTIONS, ...options };
  const n = x0.length;

  if (n === 0) {
    return {
      x: [],
      fun: await fn([]),
      iterations: 0,
      success: true,
      message: "Optimization terminated successfully.",
    };
  }

  // Reflection / expansion / contraction / shrink coefficients
  let alpha: number;
  let beta: number;
  let gamma: number;
  let delta: number;

  if (opts.adaptive) {
    alpha = 1;
    beta = 1 + 2 / n;
    gamma = 0.75 - 1 / (2 * n);
    delta = 1 - 1 / n;
  } else {
    alpha = 1;
    beta = 2;
    gamma = 0.5;
    delta = 0.5;
  }

  // ---- Build initial simplex: n+1 vertices ----
  const simplex: number[][] = new Array(n + 1);
  const fValues: number[] = new Array(n + 1);

  // Vertex 0 = x0
  simplex[0] = x0.slice();
  fValues[0] = await fn(simplex[0]);

  for (let i = 0; i < n; i++) {
    const vertex = x0.slice();
    const xi = vertex[i]!;
    const step = xi === 0 ? 0.00025 : 0.05 * xi;
    vertex[i] = xi + step;
    simplex[i + 1] = vertex;
    fValues[i + 1] = await fn(vertex);
  }

  // Indices sorted by function value
  const indices = Array.from({ length: n + 1 }, (_, i) => i);

  let iterations = 0;

  while (iterations < opts.maxIter) {
    iterations++;

    // ---- Sort simplex by function value ----
    indices.sort((a, b) => fValues[a]! - fValues[b]!);

    const bestIdx = indices[0]!;
    const secondWorstIdx = indices[n - 1]!;
    const worstIdx = indices[n]!;

    const fBest = fValues[bestIdx]!;
    const fSecondWorst = fValues[secondWorstIdx]!;
    const fWorst = fValues[worstIdx]!;

    // ---- Convergence check ----
    let converged = true;

    // Check fatol: max |f_i - f_best| < fatol for all i != best
    for (let i = 1; i <= n; i++) {
      if (Math.abs(fValues[indices[i]!]! - fBest) >= opts.fatol) {
        converged = false;
        break;
      }
    }

    if (converged) {
      // Check xatol: max |x_i[j] - x_best[j]| < xatol for all i, j
      const xBest = simplex[bestIdx]!;
      for (let i = 1; i <= n; i++) {
        const xi = simplex[indices[i]!]!;
        for (let j = 0; j < n; j++) {
          if (Math.abs(xi[j]! - xBest[j]!) >= opts.xatol) {
            converged = false;
            break;
          }
        }
        if (!converged) break;
      }
    }

    if (converged) {
      return {
        x: simplex[bestIdx]!.slice(),
        fun: fBest,
        iterations,
        success: true,
        message: "Optimization terminated successfully.",
      };
    }

    // ---- Compute centroid of all points except worst ----
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      // n best vertices (all except worst)
      const idx = indices[i]!;
      const vertex = simplex[idx]!;
      for (let j = 0; j < n; j++) {
        centroid[j] = centroid[j]! + vertex[j]!;
      }
    }
    for (let j = 0; j < n; j++) {
      centroid[j] = centroid[j]! / n;
    }

    const worst = simplex[worstIdx]!;

    // ---- Reflect ----
    const xr = new Array<number>(n);
    for (let j = 0; j < n; j++) {
      xr[j] = centroid[j]! + alpha * (centroid[j]! - worst[j]!);
    }
    const fr = await fn(xr);

    if (fr < fSecondWorst && fr >= fBest) {
      // Accept reflection
      simplex[worstIdx] = xr;
      fValues[worstIdx] = fr;
      continue;
    }

    // ---- Expand ----
    if (fr < fBest) {
      const xe = new Array<number>(n);
      for (let j = 0; j < n; j++) {
        xe[j] = centroid[j]! + beta * (xr[j]! - centroid[j]!);
      }
      const fe = await fn(xe);

      if (fe < fr) {
        simplex[worstIdx] = xe;
        fValues[worstIdx] = fe;
      } else {
        simplex[worstIdx] = xr;
        fValues[worstIdx] = fr;
      }
      continue;
    }

    // ---- Contract (fr >= fSecondWorst) ----
    if (fr < fWorst) {
      // Outside contraction
      const xc = new Array<number>(n);
      for (let j = 0; j < n; j++) {
        xc[j] = centroid[j]! + gamma * (xr[j]! - centroid[j]!);
      }
      const fc = await fn(xc);

      if (fc <= fr) {
        simplex[worstIdx] = xc;
        fValues[worstIdx] = fc;
        continue;
      }
      // else fall through to shrink
    } else {
      // Inside contraction (fr >= fWorst)
      const xc = new Array<number>(n);
      for (let j = 0; j < n; j++) {
        xc[j] = centroid[j]! - gamma * (centroid[j]! - worst[j]!);
      }
      const fc = await fn(xc);

      if (fc < fWorst) {
        simplex[worstIdx] = xc;
        fValues[worstIdx] = fc;
        continue;
      }
      // else fall through to shrink
    }

    // ---- Shrink ----
    const best = simplex[bestIdx]!;
    for (let i = 1; i <= n; i++) {
      const idx = indices[i]!;
      const vertex = simplex[idx]!;
      for (let j = 0; j < n; j++) {
        vertex[j] = best[j]! + delta * (vertex[j]! - best[j]!);
      }
      fValues[idx] = await fn(vertex);
    }
  }

  // Max iterations reached
  indices.sort((a, b) => fValues[a]! - fValues[b]!);
  const bestIdx = indices[0]!;

  return {
    x: simplex[bestIdx]!.slice(),
    fun: fValues[bestIdx]!,
    iterations,
    success: false,
    message: "Maximum number of iterations reached.",
  };
}
