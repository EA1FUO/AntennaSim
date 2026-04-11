FROM python:3.12-slim

# Install nec2c (the NEC2 simulation engine)
RUN apt-get update && \
    apt-get install -y --no-install-recommends nec2c && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN which nec2c

WORKDIR /app

# Install Python dependencies for the MCP server
# (mcp pulls in uvicorn, starlette, etc. for HTTP transports)
RUN pip install --no-cache-dir \
    "mcp>=1.0.0" \
    "pydantic>=2.10.0" \
    "pydantic-settings>=2.6.0"

# Copy backend source (the MCP server imports it at runtime)
COPY backend/src/ ./backend/src/
COPY backend/pyproject.toml ./backend/

# Copy MCP server source into /opt/antsim_mcp/ to avoid
# shadowing the installed 'mcp' Python package
COPY mcp/server.py mcp/simulator.py mcp/templates.py mcp/ham_bands.py /opt/antsim_mcp/

# Copy shared VERSION file
COPY VERSION ./VERSION
COPY VERSION ./backend/VERSION

# Non-root user
RUN useradd -m -r -s /bin/false appuser && \
    mkdir -p /tmp/nec_workdir && \
    chown -R appuser:appuser /app /tmp/nec_workdir /opt/antsim_mcp
USER appuser

ENV ANTENNASIM_BACKEND_DIR=/app/backend
ENV NEC_WORKDIR=/tmp/nec_workdir
ENV MCP_TRANSPORT=streamable-http
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8080
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "/opt/antsim_mcp/server.py"]
