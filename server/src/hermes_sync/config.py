"""Settings loaded from env vars."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HERMES_SYNC_", env_file=".env", extra="ignore")

    # SQLite path. Default to local file; tests override via env.
    database_url: str = "sqlite+aiosqlite:///./hermes_sync.db"

    # CORS for the browser variant of hermes-chat. V1 is permissive.
    cors_origins: list[str] = ["*"]


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
