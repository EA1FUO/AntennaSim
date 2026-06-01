<sub>[← README](../README.md) · [Usage](usage.md) · [Development](development.md) · **Deployment** · [API Reference](api.md) · [Contributing](../CONTRIBUTING.md)</sub>

# Deployment

AntennaSim runs two ways: self-hosted with Docker (backend + Redis) or fully static via WebAssembly on GitHub Pages.

## Table of Contents

- [GitHub Pages (WebAssembly)](#github-pages-webassembly)
- [Production Deployment](#production-deployment)

---

## GitHub Pages (WebAssembly)

AntennaSim can run entirely in the browser -- no backend server needed. The NEC2 engine (`nec2c`) is compiled to WebAssembly and executes locally in a Web Worker.

**Live demo:** https://EA1FUO.github.io/AntennaSim/

This mode is enabled by setting `VITE_ENGINE=wasm` at build time. The GitHub Pages deployment is fully automated via the `deploy-pages.yml` workflow, which:

1. Checks out the repo with the `nec2c` git submodule
2. Compiles nec2c to WebAssembly using Emscripten
3. Builds the frontend with `VITE_ENGINE=wasm`
4. Deploys to GitHub Pages

Both deployment modes (Docker and WASM) are functionally equivalent -- same simulation engine, same UI, same results.

| | Docker | WebAssembly |
|---|---|---|
| **Server required** | Yes | No |
| **Simulation runs on** | Backend (Python + nec2c) | Browser (Web Worker + WASM) |
| **Caching** | Redis | None |
| **Optimizer** | Backend (scipy) | Browser (TypeScript Nelder-Mead) |
| **Rate limiting** | Configurable | N/A |
| **Best for** | Self-hosted / multi-user | Static hosting / demos |

---

## Production Deployment

### Docker Compose (recommended)

```bash
# On your VPS/server:
git clone https://github.com/EA1FUO/AntennaSim.git
cd AntennaSim
cp .env.example .env

# Edit .env for production:
# - Set ENVIRONMENT=production
# - Set ALLOWED_ORIGINS to your domain
# - Adjust resource limits as needed

docker compose up -d --build
```

The production stack includes:
- **nginx** reverse proxy on ports 80/443 with gzip, security headers, and WebSocket support
- **Frontend** served as static files (Vite build)
- **Backend** with resource limits (2 CPU, 512MB RAM), read-only filesystem, `no-new-privileges`
- **Redis** with 128MB LRU cache

### SSL/HTTPS

The nginx config is ready for SSL. To enable:

1. Obtain certificates (e.g., via [Certbot](https://certbot.eff.org/) / Let's Encrypt)
2. Mount certificates into the nginx container
3. Uncomment the SSL server block in `nginx/nginx.conf`
4. Set port 443 in `docker-compose.yml`

### Resource Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 core | 2+ cores |
| RAM | 512 MB | 1 GB |
| Disk | 500 MB | 1 GB |
| OS | Any with Docker | Linux (amd64) |
