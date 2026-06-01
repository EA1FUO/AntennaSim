<sub>[← README](../README.md) · **Usage** · [Development](development.md) · [Deployment](deployment.md) · [API Reference](api.md) · [Contributing](../CONTRIBUTING.md)</sub>

# Usage

Everything you can do once AntennaSim is running: the antenna templates it ships with, the full feature set, and the keyboard shortcuts.

## Table of Contents

- [Antenna Templates](#antenna-templates)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Antenna Templates

AntennaSim ships with **17 ready-to-simulate templates** organized by category:

| Category | Templates |
|---|---|
| **Wire** | Half-Wave Dipole, Inverted V, End-Fed Half-Wave |
| **Vertical** | Ground Plane Vertical, J-Pole, Slim Jim |
| **Multiband** | Off-Center Fed Dipole, G5RV, Fan Dipole |
| **Loop** | Delta Loop, Horizontal Delta Loop, Cubical Quad, Small Magnetic Loop |
| **Directional** | Yagi-Uda (2-6 el.), Moxon Rectangle, Hex Beam, Log-Periodic Dipole Array |

Every template includes configurable parameters (frequency, height, element lengths, spacing, wire diameter, etc.) with sensible defaults and validation ranges.

---

## Features

<details open>
<summary><strong>Simulation Engine</strong></summary>

<br>

- **Full NEC2 pipeline** -- geometry definition to card deck generation to `nec2c` execution to parsed results, all automated
- **Frequency sweep** -- simulate across any frequency range with configurable step size
- **10 ground models** -- free space, perfect ground, salt water, fresh water, pastoral, average, rocky, city, dry/sandy, and custom (user-defined dielectric constant and conductivity)
- **Lumped loads** -- series RLC, parallel RLC, fixed impedance, and wire conductivity (copper, aluminum, steel, stainless steel)
- **Transmission lines** -- characteristic impedance, length, velocity factor, and shunt admittance
- **GA/GM/GR cards** -- wire arcs, coordinate transformations, and cylindrical symmetry for complex geometries
- **Redis caching** -- simulation results cached with SHA-256 keys and zlib compression (1h TTL)
- **Rate limiting** -- opt-in, configurable (default: 30/hour, 5 concurrent per IP when enabled)
- **Sandboxed execution** -- `subprocess.run(shell=False, timeout=180)`, isolated temp dirs, non-root container

</details>

<details>
<summary><strong>Interactive 3D Viewport</strong></summary>

<br>

- **Real-time 3D rendering** -- pan, rotate, zoom with orbit controls
- **Radiation pattern** -- 3D surface mesh with perceptually uniform colormap (gain in dBi)
- **Volumetric shells** -- alternative multi-shell pattern visualization
- **Current distribution** -- wire segments colored by current magnitude with hot colormap
- **Animated current flow** -- luminous particles traveling along wires proportional to current
- **Near-field heatmap** -- E-field magnitude as a semi-transparent plane in 3D
- **Pattern slice** -- animated cutting plane sweeping through the radiation pattern
- **Ground reflection** -- ghost mirror showing antenna image below ground plane
- **Hover measurements** -- tooltip follows cursor over any 3D object showing gain, wire dimensions, current magnitude, or field strength
- **Auto-framing** -- camera automatically fits to antenna bounding box on load and template change
- **3D orientation gizmo** -- interactive axis cube in the viewport corner; click any face/edge/corner to snap to that camera angle
- **Compass rose** for spatial orientation

</details>

<details>
<summary><strong>Charts &amp; Analysis</strong></summary>

<br>

- **SWR vs. Frequency** -- color-coded zones (green/amber/red), ham band markers, resonance annotation, crosshair tooltips
- **Impedance (R + jX)** -- resistance and reactance curves, reference impedance line, resonance crossings where jX=0
- **Smith Chart** -- impedance locus with frequency markers, constant SWR circles (1.5, 2.0, 3.0), click-to-inspect tooltip showing Z, SWR, and reflection coefficient
- **Polar Radiation Pattern** -- azimuth (H-plane) and elevation (E-plane) cuts, -3dB beamwidth arc, max gain marker, concentric dBi grid
- **Chart popups** -- click any chart to expand to a full-screen modal for detailed analysis
- **Legends** -- every chart includes a clear legend explaining all colors, lines, and markers
- **Balun/Unun matching** -- client-side impedance transformation with 10 presets (1:1 to 49:1) for viewing SWR relative to transformed impedance
- **.s1p overlay** -- import NanoVNA measurement data and overlay on simulation SWR for comparison

</details>

<details>
<summary><strong>Wire Editor</strong></summary>

<br>

- **Build from scratch** -- click-to-add wires, drag endpoints, snap grid
- **Move mode** -- drag endpoints or entire wires; Shift+drag for vertical-only movement
- **Undo/Redo** -- full history with Ctrl+Z / Ctrl+Shift+Z
- **Wire properties** -- edit coordinates, radius, segments per wire
- **Excitations** -- set feed points with magnitude and phase
- **Loads & transmission lines** -- add lumped RLC loads and TL models to any segment
- **Templates** -- load any built-in template into the editor and modify it
- **Import/Export** -- open and save `.nec` (NEC2 card deck) and `.maa` (MMANA-GAL) files

</details>

<details>
<summary><strong>Optimizer</strong></summary>

<br>

- **Nelder-Mead** algorithm (scipy, adaptive mode)
- **5 objective functions** -- minimize SWR (single freq), minimize SWR (band average), maximize gain, maximize front-to-back ratio, weighted combined
- **Up to 10 variables** with min/max bounds
- **Real-time progress** -- WebSocket streaming of iteration count, current best SWR, convergence chart
- **Cancel** -- abort optimization mid-run

</details>

<details>
<summary><strong>Other</strong></summary>

<br>

- **17 antenna templates** spanning wire, vertical, multiband, loop, and directional categories
- **Template library page** -- browse and compare all templates with descriptions and difficulty ratings
- **Learn page** -- educational content on NEC2, SWR, impedance, radiation patterns, and simulation tips
- **Mobile responsive** -- usable on phones and tablets with touch-friendly controls
- **Dark/Light theme** -- system-aware with manual toggle
- **Keyboard shortcuts** -- 17 bindings for fast workflow (press `?` to see them all)

</details>

---

## Keyboard Shortcuts

Press `?` anywhere in the app to see the full shortcuts panel.

### Simulator

| Key | Action |
|---|---|
| `Ctrl + Enter` | Run simulation |
| `Scroll` | Zoom |
| `Left drag` | Rotate |
| `Right drag` | Pan |

### Wire Editor

| Key | Action |
|---|---|
| `V` | Select mode |
| `A` | Add wire mode |
| `M` | Move mode |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + A` | Select all |
| `Delete` | Delete selected |
| `Escape` | Deselect all |
