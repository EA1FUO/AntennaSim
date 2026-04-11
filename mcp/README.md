# AntennaSim MCP Server

This MCP server exposes **AntennaSim's NEC2-based antenna simulation capabilities** as tools that LLM clients can call over **stdio** or **HTTP (SSE)**.

It is designed to let agents and chat assistants:

- list and inspect antenna templates
- pick ham bands and sweep ranges
- generate NEC2 geometry from **21 predefined antenna templates**
- design custom wire antennas from a compact endpoint-based string format
- inspect/export the raw NEC2 card deck for a template configuration
- run `nec2c`
- compare antennas side by side
- analyze one design for a specific amateur band
- simulate arbitrary custom wire geometries

The server is **standalone** and **does not require Redis**.

**Two deployment modes:**

| | Local (stdio) | Docker (SSE over HTTP) |
|---|---|---|
| **Transport** | Standard I/O | HTTP + Server-Sent Events |
| **Best for** | Claude Desktop, Cursor, CLI | Remote access, multi-user, docker-compose |
| **Port** | N/A (subprocess) | 8080 (configurable) |
| **nec2c** | Must be installed locally | Bundled in Docker image |
| **Config** | `python server.py` | `MCP_TRANSPORT=sse` |

---

## What it does

The server provides these tool families:

1. **Discovery and documentation**
   - `list_antenna_templates`
   - `get_template_info`
   - `list_ham_bands`

2. **Template-driven simulation**
   - `create_and_simulate_antenna`
   - `compare_antennas`
   - `analyze_antenna_for_band`

3. **Guided custom wire design**
   - `design_wire_antenna`

4. **Raw geometry and export**
   - `simulate_custom_antenna`
   - `get_nec2_card_deck`

Internally, the MCP server:

- ports the frontend antenna template math to Python
- adds `AntennaSim/backend` to `sys.path`
- imports the backend NEC request models and parser directly
- builds NEC2 geometry and feed definitions from template or custom inputs
- runs `nec2c` for simulation tools
- can emit the raw NEC2 card deck for exporting, learning, and debugging
- parses impedance, SWR, gain, pattern, and related metrics
- returns LLM-friendly text summaries and tables

---

## Built-in templates

The server currently includes **21** built-in templates:

- **Wire:** `dipole`, `inverted-v`, `efhw`, `efhw-inverted-l`, `efhw-inverted-v`, `random-wire`
- **Vertical:** `vertical`, `inverted-l`, `j-pole`, `slim-jim`
- **Multiband:** `off-center-fed`, `fan-dipole`, `g5rv`
- **Loop:** `delta-loop`, `horizontal-delta-loop`, `magnetic-loop`
- **Directional:** `quad`, `yagi`, `moxon`, `hex-beam`, `log-periodic`

Use `list_antenna_templates` for descriptions, bands, and difficulty, or `get_template_info(template_id)` for the full parameter list for one design.

---

## Prerequisites

You need:

- **Python 3.12+**
- **`nec2c` installed and available on your PATH**
- this repository checked out so the MCP code can find the backend

Expected repository layout:

```text
AntennaSim/
  backend/
  frontend/
  mcp/
```

If your layout is different, set:

```bash
ANTENNASIM_BACKEND_DIR=/full/path/to/AntennaSim/backend
```

### `nec2c` requirement

The simulation tools call the external `nec2c` executable.

Make sure this works before using the MCP server:

```bash
nec2c -h
```

If your platform package manager does not provide `nec2c`, build/install it from source and ensure the executable is on `PATH`.

---

## Installation

From the `AntennaSim/mcp` directory:

```bash
cd AntennaSim/mcp
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

On Windows PowerShell:

```powershell
cd AntennaSim\mcp
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
```

After install, you can launch the server either as:

```bash
python server.py
```

or:

```bash
antsim-mcp
```

---

## Docker deployment

The MCP server is integrated into the project's `docker-compose.yml` and runs as a separate service with SSE transport, accessible via HTTP.

### With docker-compose (recommended)

The MCP service is included in both the production and development stacks:

```bash
# Production (all services including MCP)
docker compose up --build

# Development (with hot-reload volume mounts)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

| Service | URL | Description |
|---|---|---|
| MCP (production) | `http://mcp:8080/mcp` (internal) | Via nginx at `/mcp` |
| MCP (dev) | `http://localhost:8080/mcp` | Direct access |
| MCP via nginx | `http://localhost/mcp` | Proxied through nginx |

### Standalone Docker run

Build and run the MCP service independently:

```bash
# Build
docker build -f mcp/Dockerfile -t antennasim-mcp .

# Run
docker run -p 8080:8080 antennasim-mcp
```

The server starts on `http://0.0.0.0:8080` with SSE transport.

### Connecting an MCP client to the Docker SSE endpoint

For OpenCode or any streamable HTTP-capable MCP client, configure the MCP URL:

```
http://localhost:8080/mcp
```

Or if running behind nginx:

```
http://your-host/mcp
```

### Validating with the MCP Inspector

```bash
# Start the MCP container
docker run -d -p 9090:8080 --name mcp antennasim-mcp

# Run the Inspector pointing at the MCP endpoint
npx @modelcontextprotocol/inspector

# In the Inspector UI:
#   1. Change transport from STDIO to SSE
#   2. Enter URL: http://localhost:9090/mcp
#   3. Click Connect
#   4. Navigate to Tools → List Tools
```

---

## Environment variables

The server can use these useful environment variables:

- `MCP_TRANSPORT`  
  Transport mode: `"stdio"` (default) for local CLI clients, `"sse"` for HTTP/Docker.

- `MCP_HOST`  
  Listen address for SSE mode. Default `"0.0.0.0"` (all interfaces).

- `MCP_PORT`  
  Listen port for SSE mode. Default `8080`.

- `ANTENNASIM_BACKEND_DIR`  
  Full path to `AntennaSim/backend` if it is not in the default sibling location.

- `SIM_TIMEOUT_SECONDS`  
  Passed through the backend settings loader. Controls the `nec2c` timeout.

- `NEC_WORKDIR`  
  Passed through the backend settings loader. Controls where temporary NEC files are written.

Example (local stdio):

```bash
export ANTENNASIM_BACKEND_DIR=/full/path/to/AntennaSim/backend
python server.py
```

Example (SSE for Docker):

```bash
export MCP_TRANSPORT=sse
export MCP_HOST=0.0.0.0
export MCP_PORT=8080
export ANTENNASIM_BACKEND_DIR=/app/backend
python server.py
```

---

## MCP client configuration

### Claude Desktop

Example config using the virtualenv Python interpreter and the source file directly:

```json
{
  "mcpServers": {
    "antsim": {
      "command": "/full/path/to/AntennaSim/mcp/.venv/bin/python",
      "args": ["/full/path/to/AntennaSim/mcp/server.py"],
      "env": {
        "ANTENNASIM_BACKEND_DIR": "/full/path/to/AntennaSim/backend"
      }
    }
  }
}
```

If you prefer the installed console script, use:

```json
{
  "mcpServers": {
    "antsim": {
      "command": "/full/path/to/AntennaSim/mcp/.venv/bin/antsim-mcp",
      "args": [],
      "env": {
        "ANTENNASIM_BACKEND_DIR": "/full/path/to/AntennaSim/backend"
      }
    }
  }
}
```

### Cursor

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "antsim": {
      "command": "/full/path/to/AntennaSim/mcp/.venv/bin/python",
      "args": ["/full/path/to/AntennaSim/mcp/server.py"],
      "env": {
        "ANTENNASIM_BACKEND_DIR": "/full/path/to/AntennaSim/backend"
      }
    }
  }
}
```

### Generic stdio MCP clients

Any stdio-based MCP client can launch:

```bash
/full/path/to/AntennaSim/mcp/.venv/bin/python /full/path/to/AntennaSim/mcp/server.py
```

---

## Available tools

## 1) `list_antenna_templates`

Lists all **21** built-in templates with:

- template ID
- name
- category
- difficulty
- typical bands
- one-line description

Use this first when you want to discover what the server can simulate.

---

## 2) `get_template_info`

Returns detailed info for a specific template:

- full description
- parameter list
- parameter ranges
- defaults
- default sweep range
- tips
- related templates

Example:

- `template_id = "dipole"`
- `template_id = "moxon"`
- `template_id = "inverted-l"`
- `template_id = "random-wire"`

---

## 3) `list_ham_bands`

Lists amateur bands for an ITU region (`r1`, `r2`, `r3`) with:

- label
- name
- start/stop frequencies
- center frequency
- suggested sweep point count

Example:

- `region = "r1"`
- `region = "r2"`

---

## 4) `create_and_simulate_antenna`

Creates a template antenna from parameters and runs a NEC2 sweep.

Arguments:

- `template_id` — required
- `params` — JSON object string, optional
- `ground_type` — preset string, optional
- `freq_start_mhz` — optional
- `freq_stop_mhz` — optional
- `freq_steps` — optional

If frequency arguments are omitted, the template's default sweep is used.

### Example `params` JSON

```json
{"frequency": 14.1, "height": 10, "wire_diameter": 2.0}
```

### Ground presets

Supported preset names:

- `free_space`
- `perfect`
- `salt_water`
- `fresh_water`
- `pastoral`
- `average`
- `rocky`
- `city`
- `dry_sandy`
- `custom`

You can also pass **custom ground values** in this compact string form:

```text
custom:13,0.005
```

which means:

- relative dielectric constant `εr = 13`
- conductivity `σ = 0.005 S/m`

---

## 5) `compare_antennas`

Simulates two antennas on the same sweep and returns side-by-side comparisons of:

- best SWR
- impedance
- gain
- front-to-back
- beamwidth summary
- efficiency
- per-frequency comparison table

Arguments:

- `antenna1_template`
- `antenna2_template`
- `antenna1_params`
- `antenna2_params`
- `freq_start_mhz`
- `freq_stop_mhz`
- `freq_steps`
- `ground_type`

If the sweep range is omitted, the server builds one from the two templates' defaults.

---

## 6) `analyze_antenna_for_band`

Runs a simulation specifically across one ham band and returns band-focused metrics such as:

- minimum SWR in the band
- best frequency
- usable bandwidth where SWR <= 2.0
- average gain
- peak gain
- center-of-band impedance
- quality rating

Arguments:

- `template_id`
- `band` (example: `20m`, `40m`, `2m`)
- `params`
- `ground_type`

Band definitions currently use the Region 1 table for band-targeted analysis.

---

## 7) `design_wire_antenna`

Simulates a custom wire antenna from a compact semicolon-separated wire list instead of raw JSON.

This tool is meant to be easier for an LLM to construct than `simulate_custom_antenna` when the antenna can be described as a set of wire endpoints plus a feed location.

Arguments:

- `wires`
- `feed_wire_tag`
- `feed_segment`
- `freq_start_mhz`
- `freq_stop_mhz`
- `freq_steps`
- `ground_type`
- `antenna_name`

### `wires` format

The `wires` value is a semicolon-separated list where each wire is:

```text
tag,segments,x1,y1,z1,x2,y2,z2,radius
```

All coordinates and the radius are in **meters**.

Example:

```text
1,21,0,0,10,-5,0,10,0.001;2,21,0,0,10,5,0,10,0.001
```

That example describes two wires starting from the same feedpoint at 10 m height, one extending 5 m left and one 5 m right, each with radius `0.001 m`.

### Feed definition

- `feed_wire_tag` must match a unique wire tag in the design
- `feed_segment` selects the segment on that wire where the source is applied

---

## 8) `simulate_custom_antenna`

Advanced raw geometry simulation.

Arguments:

- `wires_json`
- `excitation_json`
- `freq_start_mhz`
- `freq_stop_mhz`
- `freq_steps`
- `ground_type`

### `wires_json` format

A JSON array of wire objects matching the backend wire schema:

```json
[
  {
    "tag": 1,
    "segments": 11,
    "x1": -5.0,
    "y1": 0.0,
    "z1": 10.0,
    "x2": 0.0,
    "y2": 0.0,
    "z2": 10.0,
    "radius": 0.001
  },
  {
    "tag": 2,
    "segments": 11,
    "x1": 0.0,
    "y1": 0.0,
    "z1": 10.0,
    "x2": 5.0,
    "y2": 0.0,
    "z2": 10.0,
    "radius": 0.001
  }
]
```

### `excitation_json` format

Single excitation object:

```json
{
  "wire_tag": 1,
  "segment": 11,
  "voltage_real": 1.0,
  "voltage_imag": 0.0
}
```

Or an array of excitations:

```json
[
  {
    "wire_tag": 1,
    "segment": 11,
    "voltage_real": 1.0,
    "voltage_imag": 0.0
  }
]
```

---

## 9) `get_nec2_card_deck`

Returns the raw NEC2 card deck for a **template configuration** without running `nec2c`.

This is useful for:

- exporting a template design into a standalone NEC2 deck
- learning what cards a given antenna template produces
- debugging geometry, feed, ground, and sweep setup

Arguments:

- `template_id`
- `params`
- `ground_type`
- `freq_start_mhz`
- `freq_stop_mhz`
- `freq_steps`

If frequency arguments are omitted, the template's default sweep is used.

The returned text is plain NEC2 input, including comment cards and cards such as:

- `CM`
- `GW`
- `GE`
- `GN`
- `EX`
- `FR`
- `RP`
- `EN`

Unlike the simulation tools, this tool does **not** invoke `nec2c`.

---

## Example prompts

Here are good prompts to try in an MCP-capable client.

### Discovery

- “List the available antenna templates and recommend good options for a 20 meter portable antenna.”
- “Show me the details for the `inverted-l` template.”
- “Show me the details for the `random-wire` template.”
- “List Region 2 ham bands with frequencies.”

### Simple template simulations

- “Simulate a 20 meter dipole at 10 meters over average ground.”
- “Create a 40 meter inverted-V with a 12 meter apex and a 120 degree included angle.”
- “Simulate a 40 meter inverted-L with a 6 meter vertical section, 4 radials, and average ground.”
- “Model a 25 meter random wire with the feed at 8 m, far end at 3 m, and a 5 m counterpoise.”
- “Simulate a 2 meter J-pole at 145 MHz.”

### Comparisons

- “Compare a 20 meter dipole at 10 m with a 20 meter vertical with 4 radials over average ground.”
- “Compare a 3-element Yagi and a 2-element quad for 14.15 MHz at 12 m height.”
- “Which is better on 10 meters: a Moxon or a Hex Beam?”

### Band-specific analysis

- “Analyze a 40 meter EFHW for the 40m band.”
- “Check how well a G5RV covers the 20 meter band.”
- “Analyze an off-center-fed dipole for 80 meters.”

### Advanced custom geometry and export

- “Design a custom wire antenna using `1,21,0,0,10,-5,0,10,0.001;2,21,0,0,10,5,0,10,0.001`, feed wire 1 segment 1, and sweep 14.0 to 14.35 MHz.”
- “Simulate this custom two-wire dipole geometry over salt water.”
- “Take this raw NEC wire geometry and tell me the SWR sweep from 14.0 to 14.35 MHz.”
- “Show me the raw NEC2 card deck for an inverted-L on 7.1 MHz with a 6 meter vertical section.”
- “Export the NEC2 card deck for a random-wire template so I can study the `GW`, `GN`, `EX`, and `FR` cards.”

---

## Notes and implementation details

- The MCP server imports the **backend's NEC request models, card-deck builder inputs, runner, and parser directly**.
- It does **not** require Redis.
- The new **Inverted-L** template models a quarter-wave total wire length with a vertical section plus a horizontal top wire and base radials.
- The new **Random Wire** template models a non-resonant end-fed wire with a short counterpoise at the feedpoint.
- The `design_wire_antenna` tool accepts a compact semicolon-separated wire syntax that is easier for LLMs to produce than raw JSON arrays.
- The `get_nec2_card_deck` tool returns exportable NEC2 text without running `nec2c`.
- The magnetic loop template uses a **36-segment straight-wire approximation**, matching the frontend preview geometry logic.
- Template parameter math, segmentation, Yagi dimensions, Moxon formulas, LPDA math, and band-selection logic are ported from the frontend TypeScript source where applicable.
- Results are formatted as readable text so LLMs can summarize them cleanly for users.

---

## Troubleshooting

### “nec2c executable not found”

Install `nec2c` and ensure it is on your shell PATH:

```bash
nec2c -h
```

### “Could not locate AntennaSim/backend”

Set:

```bash
export ANTENNASIM_BACKEND_DIR=/full/path/to/AntennaSim/backend
```

### MCP client starts, but simulation tools fail

Check:

1. `nec2c` is installed
2. the backend directory is accessible
3. your Python environment includes:
   - `mcp`
   - `pydantic`
   - `pydantic-settings`

---

## Quick start summary

### Local (stdio)

```bash
cd AntennaSim/mcp
python -m venv .venv
source .venv/bin/activate
pip install -e .
export ANTENNASIM_BACKEND_DIR=/full/path/to/AntennaSim/backend
python server.py
```

Then connect your MCP client to that stdio process and start calling the tools.

### Docker (SSE over HTTP)

```bash
cd AntennaSim
docker build -f mcp/Dockerfile -t antennasim-mcp .
docker run -p 8080:8080 antennasim-mcp
```

Then point your MCP client at `http://localhost:8080/mcp`.

### Full stack with docker-compose

```bash
cd AntennaSim
docker compose up --build
```

MCP is available at `http://localhost/mcp` (via nginx) or directly at `http://mcp:8080/mcp` (internal).
