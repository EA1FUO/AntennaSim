from pathlib import Path

from pydantic_settings import BaseSettings

# Read version from VERSION file (lives at project root or /app in Docker)
_VERSION_PATHS = [
    Path(__file__).resolve().parent.parent / "VERSION",      # backend/VERSION (copied by Docker)
    Path(__file__).resolve().parent.parent.parent / "VERSION",  # ../../VERSION (local dev)
]
_APP_VERSION = "0.0.0"
for _vp in _VERSION_PATHS:
    if _vp.is_file():
        _APP_VERSION = _vp.read_text().strip()
        break


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    environment: str = "development"
    allowed_origins: str = "http://localhost:5173"
    redis_url: str = "redis://redis:6379"
    log_level: str = "info"
    max_concurrent_sims: int = 4
    sim_timeout_seconds: int = 180
    nec_workdir: str = "/tmp/nec_workdir"

    @property
    def version(self) -> str:
        return _APP_VERSION

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


settings = Settings()
