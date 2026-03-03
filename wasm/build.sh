#!/bin/bash
# Build nec2c to WebAssembly using Emscripten
#
# Prerequisites:
#   - Emscripten SDK installed and activated (source emsdk_env.sh)
#   - nec2c submodule initialized (git submodule update --init)
#
# Output:
#   build/nec2c.js    — JavaScript loader/glue code
#   build/nec2c.wasm  — WebAssembly binary
#
# Usage:
#   cd wasm && ./build.sh
#
# Or from project root:
#   ./wasm/build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verify emscripten is available
if ! command -v emcmake &> /dev/null; then
    echo "ERROR: Emscripten not found. Install emsdk and run 'source emsdk_env.sh' first."
    echo "  See: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Verify nec2c submodule is present
if [ ! -f "nec2c/nec2c.c" ]; then
    echo "ERROR: nec2c submodule not found. Run: git submodule update --init --recursive"
    exit 1
fi

# Apply patches if not already applied
if [ -f "patches/emscripten-compat.patch" ]; then
    echo "Checking if patches need to be applied..."
    cd nec2c
    if git apply --check ../patches/emscripten-compat.patch 2>/dev/null; then
        echo "Applying Emscripten compatibility patches..."
        git apply ../patches/emscripten-compat.patch
    else
        echo "Patches already applied or not applicable (skipping)."
    fi
    cd ..
fi

# Build
echo "Building nec2c to WebAssembly..."
mkdir -p build
cd build

emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo ""
echo "Build complete!"
echo "  JS loader:  $(pwd)/nec2c.js"
echo "  WASM binary: $(pwd)/nec2c.wasm"
ls -lh nec2c.js nec2c.wasm 2>/dev/null || echo "(files not found — check build output above)"
