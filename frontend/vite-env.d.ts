/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

/** App version injected by Vite from the root VERSION file at build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  /** Simulation engine: "backend" (default) or "wasm" (GitHub Pages) */
  readonly VITE_ENGINE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
