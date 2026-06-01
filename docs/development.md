<sub>[← README](../README.md) · [Usage](usage.md) · **Development** · [Deployment](deployment.md) · [API Reference](api.md) · [Contributing](../CONTRIBUTING.md)</sub>

# Development

How to run AntennaSim with hot-reload, how the pieces fit together, and where everything lives.

## Table of Contents

- [Development Setup](#development-setup)
- [Local WASM Development](#local-wasm-development)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## Development Setup

For active development with hot-reload on both frontend and backend:

```bash
# Clone (--recursive fetches the nec2c submodule for WASM builds)
git clone --recursive https://github.com/EA1FUO/AntennaSim.git
cd AntennaSim
cp .env.example .env

# Start with base + dev overrides (same behavior as ./scripts/dev.sh)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Or use the dev script:

```bash
./scripts/dev.sh
```

| Service | URL | Hot-reload |
|---|---|---|
| Frontend | http://localhost:5173 | Yes (Vite HMR) |
| Backend API | http://localhost:8000 | Yes (Uvicorn --reload) |
| API Docs (Swagger) | http://localhost:8000/docs | -- |
| Redis | localhost:6379 | -- |

Source directories are volume-mounted so changes are reflected immediately:
- `frontend/src/` -- React components, pages, stores
- `backend/src/` -- FastAPI endpoints, simulation runner, parsers

### Local WASM Development

To run the WASM engine locally (no Docker needed):

```bash
git clone --recursive https://github.com/EA1FUO/AntennaSim.git
cd AntennaSim

# Build nec2c to WebAssembly (requires Emscripten SDK)
cd wasm && ./build.sh && cd ..
cp wasm/build/nec2c.js wasm/build/nec2c.wasm frontend/public/wasm/

# Start the frontend in WASM mode
cd frontend
npm install
npm run dev:wasm
```

> **Note:** If you already cloned without `--recursive`, fetch the submodule with: `git submodule update --init`

---

## Architecture

```
                         +----------+
                         |  Browser |
                         +----+-----+
                              |
                         HTTP / WS
                              |
                    +---------+---------+
                    |      nginx        |
                    |   reverse proxy   |
                    |   :80 / :443      |
                    +---------+---------+
                         /          \
                        /            \
              +--------+--+    +-----+------+
              | Frontend  |    |  Backend   |
              | React SPA |    |  FastAPI   |
              | :80 (prod)|    |  :8000     |
              | :5173(dev)|    +-----+------+
              +-----------+          |
                                     |    +--------+
                                     +----+ Redis  |
                                     |    | :6379  |
                                     |    +--------+
                                     |
                                +----+----+
                                | nec2c   |
                                | engine  |
                                +---------+
```

**Data flow (Docker):** User configures antenna in the browser -> React generates NEC2 card deck -> POST to FastAPI -> backend writes `.nec` file, runs `nec2c` subprocess -> output parsed into structured JSON -> results cached in Redis -> response sent to frontend -> charts and 3D viewport update.

**Data flow (WebAssembly):** Same frontend, but simulations run locally: React generates card deck -> Web Worker writes to WASM virtual filesystem -> `nec2c.wasm` executes -> TypeScript parser extracts results -> charts and 3D viewport update. No network requests.

---

## Project Structure

```
AntennaSim/
|-- frontend/                   # React 19 + TypeScript + Vite
|   |-- src/
|   |   |-- components/
|   |   |   |-- three/          # 3D viewport (R3F): antenna, pattern, current, NF, raycaster
|   |   |   |-- editors/        # Template parameter editor, wire editor, balun editor
|   |   |   |-- results/        # Charts: SWR, impedance, Smith, polar, gain table
|   |   |   |-- ui/             # Reusable primitives: tabs, modals, chart popups
|   |   |   |-- layout/         # App shell, panels, responsive wrappers
|   |   |   +-- common/         # Shared utilities, keyboard shortcuts
|   |   |-- hooks/              # Custom hooks (chart theme, debounce, etc.)
|   |   |-- stores/             # Zustand stores (antenna, simulation, editor, UI, compare)
|   |   |-- templates/          # 17 antenna template definitions
|   |   |-- engine/             # Simulation engine abstraction (backend + WASM)
|   |   |   |-- backend/       # BackendEngine: REST API + WebSocket
|   |   |   |-- wasm/          # WasmEngine: Web Workers + nec2c.wasm
|   |   |   |-- parsers/       # TypeScript ports of NEC2 input/output parsers
|   |   |   +-- optimizer/     # TypeScript Nelder-Mead optimizer
|   |   |-- utils/              # Units, formatting, .s1p parser, matching
|   |   |-- pages/              # Route pages (Simulator, Editor, Library, Learn, About)
|   |   +-- api/                # API client (fetch + WebSocket)
|   |-- Dockerfile              # Production: multi-stage build -> nginx static
|   +-- Dockerfile.dev          # Development: Vite dev server with HMR
|
|-- backend/                    # Python 3.12 + FastAPI
|   |-- src/
|   |   |-- api/v1/             # REST + WebSocket endpoints
|   |   |-- simulation/         # NEC runner, output parser, optimizer, cache
|   |   |-- models/             # Pydantic models (antenna, simulation, results)
|   |   +-- converters/         # .maa / .nec import and export
|   |-- Dockerfile              # Production: python:3.12-slim + nec2c
|   +-- Dockerfile.dev          # Development: uvicorn --reload
|
|-- nginx/                      # Reverse proxy
|   |-- nginx.conf              # Proxy rules, gzip, security headers, WebSocket
|   +-- Dockerfile              # nginx:alpine
|
|-- deploy/
|   +-- allinone/               # All-in-one Docker image support files
|       |-- supervisord.conf    # Manages redis, uvicorn, nginx processes
|       +-- nginx.conf          # Serves frontend + proxies /api/ to uvicorn
|
|-- wasm/                       # WebAssembly build infrastructure
|   |-- nec2c/                  # nec2c git submodule (KJ7LNW/nec2c)
|   |-- patches/                # Emscripten compatibility patches
|   |-- CMakeLists.txt          # Emscripten build config
|   +-- build.sh                # Build script (emcmake + emmake)
|
|-- .github/workflows/
|   |-- ci.yml                  # Lint, type-check, build on PRs and pushes to main
|   |-- pr-title.yml            # Validates Conventional Commits format on PR titles
|   |-- docker-publish.yml      # Builds and pushes Docker images on version tags
|   +-- deploy-pages.yml        # Build WASM + deploy to GitHub Pages
|
|-- scripts/
|   +-- dev.sh                  # Start development environment
|
|-- VERSION                     # Single source of truth for app version (e.g. 0.6.0)
|-- Dockerfile                  # All-in-one image: frontend + backend + redis + nginx
|-- docker-compose.yml          # Production stack (4 services)
|-- docker-compose.dev.yml      # Development overrides (hot-reload, exposed ports)
|-- .env.example                # Environment variable template
|-- LICENSE                     # GPL-3.0
+-- README.md                   # You are here
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| [React](https://react.dev) | 19 | UI framework |
| [TypeScript](https://www.typescriptlang.org) | 5.9 | Type safety (strict mode) |
| [Vite](https://vite.dev) | 7 | Build tool with HMR |
| [Tailwind CSS](https://tailwindcss.com) | 4 | Utility-first styling |
| [React Three Fiber](https://r3f.docs.pmnd.rs) | 9.5 | Declarative Three.js |
| [Three.js](https://threejs.org) | 0.183 | 3D rendering engine |
| [Zustand](https://zustand.docs.pmnd.rs) | 5.0 | State management |
| [Recharts](https://recharts.org) | 3.7 | Chart library |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| [Python](https://python.org) | 3.12 | Runtime |
| [FastAPI](https://fastapi.tiangolo.com) | 0.115+ | Web framework |
| [Pydantic](https://docs.pydantic.dev) | 2.10+ | Data validation |
| [nec2c](https://www.pa3fwm.nl/software/nec2c/) | -- | NEC2 engine (C port) |
| [SciPy](https://scipy.org) | 1.14+ | Nelder-Mead optimizer |
| [Redis](https://redis.io) | 7 | Result caching |

### Infrastructure

| Technology | Purpose |
|---|---|
| [Docker](https://docker.com) | Containerization |
| [Docker Compose](https://docs.docker.com/compose/) | Multi-service orchestration |
| [nginx](https://nginx.org) | Reverse proxy, SSL termination, security headers |
