# nec2c Emscripten Compatibility Patches

These patches make nec2c (from KJ7LNW/nec2c) compile with Emscripten for WebAssembly.

## What the patch does

### 1. `nec2c.h` — Guard unavailable headers
Wraps `#include <signal.h>`, `<unistd.h>`, `<fcntl.h>`, and `<sys/times.h>` with
`#ifndef __EMSCRIPTEN__`. These headers are not available (or not needed) in WASM.

### 2. `main.c` — Disable signal handlers
- Guards the `sig_handler` forward declaration with `#ifndef __EMSCRIPTEN__`
- Guards `sigaction()` setup (lines 82-97) with `#ifndef __EMSCRIPTEN__`
- Guards the `sig_handler()` function definition with `#ifndef __EMSCRIPTEN__`

Signal handling is not available in WASM. The `getopt()` CLI argument parsing is
kept as-is because Emscripten's `callMain()` passes args through standard
argc/argv, so it works without modification.

### 3. `misc.c` — Stub process timing
Provides an Emscripten stub for `secnds()` that returns 0.0, since `sys/times.h`
and `sysconf(_SC_CLK_TCK)` are not available in WASM. The timing is only used
for printing "TOTAL RUN TIME" in the output — not needed for simulation results.

## Applying patches

The `build.sh` script applies the patch automatically before building.
To apply manually:

```bash
cd nec2c
git apply ../patches/emscripten-compat.patch
```

## Patch target

Generated against KJ7LNW/nec2c commit `55be1e0`.
