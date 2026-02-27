# AntSim

Web-based amateur radio antenna simulator powered by the NEC2 engine. Design, simulate, and visualize antenna performance with an interactive 3D viewport, real-time SWR/impedance charts, Smith chart, radiation patterns, and more.

## Features

- **16 antenna templates** -- dipole, Yagi, vertical, quad loop, magnetic loop, Moxon, LPDA, and more
- **3D interactive viewport** -- pan, rotate, zoom; radiation pattern visualization with surface and volumetric modes
- **Full NEC2 pipeline** -- geometry to simulation to results, powered by `nec2c`
- **Wire editor** -- build custom antennas from scratch with click-to-add, drag-to-move, snap grid
- **Charts** -- SWR vs. frequency, impedance (R + jX), Smith chart, polar radiation pattern
- **Chart popups** -- click any chart to expand to full-screen for detailed analysis
- **Near-field visualization** -- heatmap of E-field magnitude in 3D
- **Current animation** -- animated particles showing current flow on wires
- **Pattern slice** -- animated cutting plane sweeping through 3D radiation pattern
- **Import/Export** -- load and save `.nec` and `.maa` files
- **Optimizer** -- Nelder-Mead optimization with real-time WebSocket progress streaming
- **Compare mode** -- overlay results from different configurations
- **Loads & transmission lines** -- add lumped loads and TL models
- **Mobile responsive** -- usable on phones and tablets
- **Caching** -- Redis-backed simulation result caching
- **Rate limiting** -- prevents abuse of compute resources

## Quick Start

```bash
git clone https://github.com/your-username/antsim.git
cd antsim
cp .env.example .env
docker compose up
```

Open `http://localhost` in your browser.

For development with hot-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

Frontend will be at `http://localhost:5173`, backend API at `http://localhost:8000`.

## Architecture

| Component | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Three Fiber, Zustand, Recharts |
| Backend | Python, FastAPI, nec2c (NEC2 engine), scipy (optimizer) |
| Cache | Redis |
| Proxy | nginx (production) |

## Project Structure

```
antsim/
  frontend/          # React SPA
    src/
      components/    # UI components (3D, editors, results, layout)
      stores/        # Zustand state management
      templates/     # Antenna template definitions
      engine/        # Client-side NEC card generation
      pages/         # Route pages
  backend/           # FastAPI service
    src/
      api/v1/        # REST + WebSocket endpoints
      simulation/    # NEC runner, parser, optimizer, cache
      models/        # Pydantic data models
      converters/    # .maa/.nec import/export
  nginx/             # Reverse proxy config
  docker-compose.yml # Production deployment
```

## License

GPL-3.0. See [LICENSE](LICENSE).
