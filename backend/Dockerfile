FROM python:3.12-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends nec2c && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN which nec2c

WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.32.0" \
    "pydantic>=2.10.0" \
    "pydantic-settings>=2.6.0" \
    "redis>=5.2.0" \
    "httpx>=0.28.0" \
    "scipy>=1.14.0"

COPY VERSION ./VERSION
COPY backend/src/ ./src/

RUN useradd -m -r -s /bin/false appuser && \
    mkdir -p /tmp/nec_workdir && \
    chown -R appuser:appuser /app /tmp/nec_workdir
USER appuser

ENV NEC_WORKDIR=/tmp/nec_workdir
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
