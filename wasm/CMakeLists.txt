cmake_minimum_required(VERSION 3.13)
project(nec2c-wasm C)

# nec2c source files (flat layout — all .c files in submodule root)
set(NEC2C_DIR ${CMAKE_CURRENT_SOURCE_DIR}/nec2c)

set(NEC2C_SOURCES
  ${NEC2C_DIR}/main.c
  # nec2c.c is the OLD monolithic file — do NOT include it.
  # The refactored code lives in the separate .c files below.
  ${NEC2C_DIR}/calculations.c
  ${NEC2C_DIR}/fields.c
  ${NEC2C_DIR}/geometry.c
  ${NEC2C_DIR}/ground.c
  ${NEC2C_DIR}/input.c
  ${NEC2C_DIR}/matrix.c
  ${NEC2C_DIR}/misc.c
  ${NEC2C_DIR}/network.c
  ${NEC2C_DIR}/radiation.c
  ${NEC2C_DIR}/shared.c
  ${NEC2C_DIR}/somnec.c
)

add_executable(nec2c ${NEC2C_SOURCES})

target_include_directories(nec2c PRIVATE ${NEC2C_DIR})
target_link_libraries(nec2c m)

# Define PACKAGE_STRING (normally set by autoconf's config.h)
target_compile_definitions(nec2c PRIVATE
  PACKAGE_STRING="nec2c"
)

# Emscripten-specific flags
set_target_properties(nec2c PROPERTIES
  SUFFIX ".js"
)

target_link_options(nec2c PRIVATE
  # Module system
  -sEXPORT_NAME=createNec2c
  -sMODULARIZE=1
  # Memory
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432
  # Exported functions — we call main() programmatically
  -sEXPORTED_FUNCTIONS=_main
  -sEXPORTED_RUNTIME_METHODS=FS,callMain
  # Environment support
  -sENVIRONMENT=web,worker
  # Don't exit the runtime after main() returns
  -sEXIT_RUNTIME=0
  # Optimization
  -O3
)
