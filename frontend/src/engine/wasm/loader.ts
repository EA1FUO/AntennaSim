/**
 * Lazy WASM module loader with caching.
 *
 * Loads the nec2c.js + nec2c.wasm from /wasm/ (in the public directory)
 * on first use, then caches the factory for subsequent calls.
 *
 * Each call to `loadNec2c()` creates a fresh module instance so that
 * internal state (MEMFS, globals) is clean for every simulation run.
 */

import type { Nec2cModule } from "./nec2c-module";

/** The dynamically-imported createNec2c factory function. */
let createNec2cFactory: ((opts?: Record<string, unknown>) => Promise<Nec2cModule>) | null = null;

/** Whether we are currently loading the factory for the first time. */
let loadingPromise: Promise<void> | null = null;

/**
 * Ensure the nec2c.js glue code is loaded.
 *
 * Uses a dynamic `<script>` tag to load the Emscripten-generated JS from
 * the public directory. The script defines `createNec2c` on `globalThis`.
 */
async function ensureFactory(): Promise<void> {
  if (createNec2cFactory) return;

  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}wasm/nec2c.js`;
    script.async = true;

    script.onload = () => {
      const factory = (globalThis as unknown as Record<string, unknown>)
        .createNec2c as typeof createNec2cFactory;
      if (!factory) {
        reject(
          new Error("nec2c.js loaded but createNec2c not found on globalThis"),
        );
        return;
      }
      createNec2cFactory = factory;
      resolve();
    };

    script.onerror = () => {
      loadingPromise = null;
      reject(
        new Error(
          "Failed to load nec2c.js. Ensure WASM artifacts are in public/wasm/.",
        ),
      );
    };

    document.head.appendChild(script);
  });

  await loadingPromise;
}

/**
 * Load a fresh nec2c WASM module instance.
 *
 * Each call returns a new module with clean internal state (fresh MEMFS).
 * The JS glue code is loaded once and cached; only instantiation is repeated.
 *
 * @param options.quiet - Suppress nec2c stdout/stderr (default: true)
 */
export async function loadNec2c(
  options: { quiet?: boolean } = {},
): Promise<Nec2cModule> {
  await ensureFactory();

  const quiet = options.quiet ?? true;
  const noop = () => {};

  const module = await createNec2cFactory!({
    // Resolve the .wasm file relative to the JS glue code
    locateFile: (path: string) => {
      if (path.endsWith(".wasm")) {
        return `${import.meta.env.BASE_URL}wasm/nec2c.wasm`;
      }
      return path;
    },
    // Suppress or capture console output
    print: quiet ? noop : (text: string) => console.log("[nec2c]", text),
    printErr: quiet ? noop : (text: string) => console.warn("[nec2c]", text),
  });

  return module;
}
