from pydantic_settings import BaseSettings


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
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


settings = Settings()
