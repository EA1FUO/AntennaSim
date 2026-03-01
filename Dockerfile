# =============================================================================
# AntennaSim — All-in-one Docker image
# Usage: docker run -p 80:80 ea1fuo/antennasim
# =============================================================================

# --- Stage 1: Build frontend ---
FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY VERSION /VERSION
COPY frontend/ .
RUN npm run build

# --- Stage 2: Runtime ---
FROM python:3.12-slim

# Install system dependencies: nec2c, nginx, redis, supervisor
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nec2c \
        nginx \
        redis-server \
        supervisor && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.32.0" \
    "pydantic>=2.10.0" \
    "pydantic-settings>=2.6.0" \
    "redis>=5.2.0" \
    "httpx>=0.28.0" \
    "scipy>=1.14.0"

# Copy backend
WORKDIR /app/backend
COPY VERSION /app/backend/VERSION
COPY backend/src/ ./src/

# Copy frontend build output
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Copy configs
COPY deploy/allinone/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/allinone/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Remove default nginx site
RUN rm -f /etc/nginx/sites-enabled/default

# Create NEC2 workdir
RUN mkdir -p /tmp/nec_workdir

EXPOSE 80

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
