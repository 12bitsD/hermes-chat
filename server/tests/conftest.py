"""Shared pytest fixtures."""
import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def tmp_db_url(monkeypatch: pytest.MonkeyPatch) -> Generator[str, None, None]:
    """Override HERMES_SYNC_DATABASE_URL to a tempfile SQLite for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite+aiosqlite:///{path}"
    monkeypatch.setenv("HERMES_SYNC_DATABASE_URL", url)
    yield url
    Path(path).unlink(missing_ok=True)
    Path(path + "-journal").unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def reset_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset cached settings so env overrides take effect, and create tables."""
    from hermes_sync import config as cfg
    from hermes_sync import db
    from hermes_sync.models import Base
    import asyncio

    cfg._settings = None
    db.engine.dispose()  # dispose old engine bound to default URL
    db.engine = db.create_async_engine(cfg.get_settings().database_url, echo=False)
    db.SessionLocal = db.async_sessionmaker(db.engine, expire_on_commit=False)

    # Create tables directly (faster than running alembic per test).
    async def _create() -> None:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create())


@pytest.fixture
def app():
    from hermes_sync.main import create_app
    return create_app()


@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c
