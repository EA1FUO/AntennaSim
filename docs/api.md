<sub>[← README](../README.md) · [Usage](usage.md) · [Development](development.md) · [Deployment](deployment.md) · **API Reference** · [Contributing](../CONTRIBUTING.md)</sub>

# API Reference

REST and WebSocket endpoints exposed by the backend, plus the environment variables that configure it.

## Table of Contents

- [Endpoints](#endpoints)
- [Configuration](#configuration)

---

## Endpoints

All endpoints are under `/api/v1/`. Interactive Swagger docs available at `/docs` when the backend is running.

### `POST /api/v1/simulate`

Run a NEC2 simulation.

**Request body:**
```json
{
  "wires": [
    { "tag": 1, "segments": 21, "x1": 0, "y1": -5.05, "z1": 10,
      "x2": 0, "y2": 5.05, "z2": 10, "radius": 0.001 }
  ],
  "excitations": [
    { "wire_tag": 1, "segment": 11, "voltage_real": 1.0, "voltage_imag": 0.0 }
  ],
  "ground": { "ground_type": "average" },
  "frequency": { "start_mhz": 13.5, "stop_mhz": 15.0, "steps": 31 },
  "compute_currents": true,
  "near_field": {
    "enabled": true,
    "plane": "horizontal",
    "height_m": 1.8,
    "extent_m": 20,
    "resolution_m": 0.5
  }
}
```

Unknown keys are rejected with a `422` validation error, so a misspelled or wrong field (for example `ground.type` instead of `ground_type`) fails loudly instead of being silently ignored.

**Response:** Full simulation results including impedance, SWR, gain, radiation pattern, per-segment currents, and near-field data for every frequency point.

### `POST /api/v1/optimize`

Run parameter optimization (synchronous).

### `WebSocket /api/v1/ws/optimize`

Real-time optimizer progress streaming. Sends JSON frames with iteration number, current best SWR, parameter values, and convergence status.

### `POST /api/v1/convert/import`

Import antenna definitions from `.maa` or `.nec` files. Upload the file as form data, receive structured JSON.

### `POST /api/v1/convert/export`

Export antenna data to `.maa` or `.nec` format. Send JSON, receive the file.

### `GET /api/v1/health`

Health check. Returns nec2c availability, Redis status, app version, and environment.

---

## Configuration

Copy `.env.example` to `.env` and adjust:

```bash
# Backend
ENVIRONMENT=development          # development | production
ALLOWED_ORIGINS=http://localhost:5173  # CORS origins (comma-separated)
REDIS_URL=redis://redis:6379     # Redis connection
LOG_LEVEL=debug                  # debug | info | warning | error
SIM_TIMEOUT_SECONDS=180          # Per-simulation timeout (seconds)
NEC_WORKDIR=/tmp/nec_workdir     # Temp directory for .nec files

# Rate limiting (opt-in, disabled by default)
RATE_LIMIT_ENABLED=false         # Set to true for public deployments
RATE_LIMIT_PER_HOUR=30           # Max simulations per IP per hour
MAX_CONCURRENT_PER_IP=5          # Max concurrent simulations per IP

# Frontend (Vite)
VITE_API_URL=http://localhost:8000   # Backend URL
VITE_WS_URL=ws://localhost:8000      # WebSocket URL
# VITE_ENGINE=backend               # "backend" (default) or "wasm" (GitHub Pages)
```
