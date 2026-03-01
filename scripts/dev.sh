#!/usr/bin/env bash
set -euo pipefail

# AntennaSim Development Environment
# Usage: ./scripts/dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Copy env if not exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

echo "Starting AntennaSim development environment..."
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000/docs"
echo "  Redis:    localhost:6379"
echo ""

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build "$@"
