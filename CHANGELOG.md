# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.7] - 2026-03-05

### Added

- CHANGELOG.md with full release history back to v0.2.0

### Changed

- Upgraded all frontend dependencies to latest versions:
  - Tailwind CSS 3.4 -> 4.2 (migrated to CSS-first config with @tailwindcss/vite plugin)
  - Vite 6 -> 7.3
  - TypeScript 5.7 -> 5.9
  - Three.js 0.170 -> 0.183
  - Recharts 2.14 -> 3.7 (updated tooltip/formatter type signatures)
  - React 19.2.0 -> 19.2.4
  - React Router 7.1 -> 7.13
  - @vitejs/plugin-react 4 -> 5
  - eslint-plugin-react-hooks 5 -> 7 (new strict rules set to warn)
  - eslint-plugin-react-refresh 0.4 -> 0.5
  - Zustand 5.0.0 -> 5.0.11
  - All @types/* packages updated
- Removed postcss.config.js and autoprefixer (handled by @tailwindcss/vite)
- Removed tailwind.config.ts (migrated to CSS @theme in index.css)
- Added root .dockerignore to reduce Docker build context size (node_modules, .git, build artifacts were being sent unnecessarily)

## [0.7.6] - 2026-03-05

### Fixed

- Full-sphere radiation pattern in free space -- RP card was hardcoded to upper hemisphere only; now computes full sphere (theta -180 to +180) when no ground plane is present
- Stale raycaster targets after template switch -- SceneRaycaster cached targets by top-level child count, missing deep scene graph changes; now collects fresh targets via scene.traverse() on each raycast

## [0.7.5] - 2026-03-04

### Fixed

- Light mode 3D scene rendering -- corrected lighting, material properties, and background colors for the light theme
- Editor current distribution display in light mode

## [0.7.4] - 2026-03-04

### Fixed

- Axis labels on 3D viewport corrected for NEC2-to-Three.js coordinate mapping
- Elevation radiation pattern polar chart rendering
- Beamwidth arc calculation for multi-lobe patterns (each lobe now gets its own -3dB arc)

## [0.7.3] - 2026-03-03

### Added

- Animated loading overlay during simulation -- pulsing antenna icon with progress message replaces blank viewport while waiting for results

## [0.7.2] - 2026-03-03

### Fixed

- Mobile layout polish -- touch targets, spacing, and overflow issues on small screens
- Screenshot export now respects the current theme (dark/light) instead of always using dark

## [0.7.1] - 2026-03-03

### Fixed

- Comprehensive mobile layout overhaul -- panels, charts, and 3D viewport properly adapt to phone and tablet screen sizes
- Touch-friendly controls for sliders and parameter editors

## [0.7.0] - 2026-03-03

### Added

- WebAssembly engine for serverless deployment -- nec2c compiled to WASM runs entirely in the browser via Web Workers, no backend server required
- GitHub Pages deployment workflow (deploy-pages.yml) -- automated WASM build + static site deploy
- TypeScript ports of all backend Python modules: NEC2 card deck builder, output parser, .nec/.maa importers and exporters, Nelder-Mead optimizer
- Engine abstraction layer (`SimulationEngine` interface) with `BackendEngine` and `WasmEngine` implementations
- `VITE_ENGINE` env var to select engine at build time (`backend` or `wasm`)

### Fixed

- SPA routing on GitHub Pages with base path support
- WASM workers now use Vite `BASE_URL` for correct asset loading on subpath deployments
- Stale results cleared when switching between Simulator and Editor pages
- NE card generation in WASM engine for near-field computation
- Compare overlay color index tracking

## [0.6.1] - 2026-03-03

### Fixed

- Symbolic NEC file import -- SY card expressions (variables, arithmetic) now evaluated correctly during .nec import
- Dense NEC files with many wires/segments no longer timeout during simulation

### Changed

- Updated README and .env.example to reflect current architecture and deployment options

## [0.6.0] - 2026-03-01

### Changed

- Decluttered viewport controls -- consolidated toolbar with cleaner layout
- Redesigned wire editor panel -- improved organization of wire table, tools, and property editors

## [0.5.1] - 2026-03-01

### Fixed

- Rate limiting is now opt-in (disabled by default) -- previously it was always active, breaking single-user self-hosted setups
- Rate limit parameters configurable via environment variables (`RATE_LIMIT_ENABLED`, `RATE_LIMIT_PER_HOUR`, `MAX_CONCURRENT_PER_IP`)

## [0.5.0] - 2026-03-01

### Added

- Docker Hub publishing -- automated CI builds and pushes images on version tags
- All-in-one Docker image (`ea1fuo/antennasim`) bundling frontend, backend, Redis, and nginx in a single container
- `docker run -p 80:80 ea1fuo/antennasim` one-liner deployment

## [0.4.0] - 2026-03-01

### Added

- Horizontal delta loop (skyloop) antenna template
- CI workflow (ci.yml) -- runs TypeScript type-check, ESLint, and Vite build on all PRs and pushes to main
- PR title validation workflow enforcing Conventional Commits format
- Contributing guidelines

### Fixed

- Excitation placement now works on any wire segment (was restricted to center segment)
- Frequency controls and slider UX improvements -- better step snapping, debounce, and text input handling

### Changed

- Renamed project from AntSim to AntennaSim
- Centralized version management in a single `VERSION` file at the project root

## [0.3.2] - 2026-02-27

### Fixed

- Production API routing -- switched to relative URLs and fixed tmpfs permissions in the Docker container

## [0.3.1] - 2026-02-27

### Added

- Screenshots to README

### Changed

- Renamed project to AntennaSim in documentation

## [0.3.0] - 2026-02-27

### Added

- Chart legends on all charts -- SWR zones, impedance lines, Smith chart markers, polar pattern
- 3D hover measurements -- gain, wire dimensions, current magnitude, and near-field tooltips
- Balun/unun impedance matching with 10 presets (1:1 to 49:1)
- Custom ground model with user-defined dielectric constant and conductivity

### Fixed

- Smith chart popup clipping -- unique clipPath IDs per instance
- Chart popup sizing -- responsive SVG, proper height fill, tooltip positioning
- Current segment positions converted from wavelengths to meters
- Chart margins increased to prevent annotation clipping
- Stale simulation results now cleared when antenna parameters change

### Changed

- 3D tooltip performance -- deferred raycasting with requestIdleCallback, no React re-renders during hover
- NEC2 simulation timeout increased from 30s to 180s
- Docker production stack -- fixed nginx startup, CORS configuration, and build pipeline

## [0.2.0] - 2026-02-27

### Added

- Wire editor -- click-to-add wires, drag endpoints, move mode, undo/redo, snap grid
- 17 antenna templates: dipole, inverted V, EFHW, vertical, J-pole, slim jim, delta loop, horizontal delta loop, cubical quad, magnetic loop, Yagi-Uda, Moxon, hex beam, LPDA, off-center fed, G5RV, fan dipole
- Nelder-Mead optimizer with 5 objective functions and real-time WebSocket progress
- Import/export for .nec (NEC2 card deck) and .maa (MMANA-GAL) files
- Compare mode -- overlay multiple simulation results for A/B comparison
- Screenshot export
- CSV data export
- Advanced 3D visualization -- current distribution with animated flow particles, volumetric radiation shells, near-field heatmap, ground reflection, pattern slice animation
- Smith chart with frequency markers, constant SWR circles, and click-to-inspect tooltips
- Lumped loads (series/parallel RLC, fixed impedance, wire conductivity)
- Transmission lines (impedance, length, velocity factor, shunt admittance)
- GA/GM/GR NEC2 cards for wire arcs, coordinate transforms, and cylindrical symmetry
- .s1p NanoVNA overlay on SWR chart
- Library page for browsing all templates
- Learn page with educational content on NEC2, SWR, impedance, and radiation patterns
- Error boundaries and keyboard shortcuts (17 bindings)
- Dark/light theme with system-aware detection
- Redis caching with SHA-256 keys and zlib compression
- Rate limiting (configurable per-IP)
- Sandboxed NEC2 execution in isolated temp directories

This was the initial public release -- a complete rewrite of the original prototype into a production-quality application with React 19, TypeScript, FastAPI, and Docker.

[0.7.7]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/EA1FUO/AntennaSim/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/EA1FUO/AntennaSim/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/EA1FUO/AntennaSim/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/EA1FUO/AntennaSim/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/EA1FUO/AntennaSim/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/EA1FUO/AntennaSim/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/EA1FUO/AntennaSim/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/EA1FUO/AntennaSim/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/EA1FUO/AntennaSim/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/EA1FUO/AntennaSim/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/EA1FUO/AntennaSim/releases/tag/v0.2.0
