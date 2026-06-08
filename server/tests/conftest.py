"""Shared pytest fixtures."""
import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def per_test_db(monkeypatch: pytest.MonkeyPatch):
    """Override DB URL, reset cached settings, rebuild engine, create tables — all
    in one fixture so the env var is set BEFORE anything reads it.

    Previous version split this into `tmp_db_url` + `reset_settings` autouse
    fixtures. Pytest ran them in declaration order, but the engine was being
    created in `db.py` at import time with the default `./hermes_sync.db` URL,
    so the second fixture's env override was applied after the engine was
    already built. Consolidating into one fixture fixes the ordering and the
    data-leakage between tests.
    """
    from hermes_sync import config as cfg
    from hermes_sync import db
    from hermes_sync.models import Base
    import asyncio

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite+aiosqlite:///{path}"
    monkeypatch.setenv("HERMES_SYNC_DATABASE_URL", url)
    cfg._settings = None
    db.engine = db.create_async_engine(url, echo=False)
    db.SessionLocal = db.async_sessionmaker(db.engine, expire_on_commit=False)

    async def _create() -> None:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(_create())

    yield url

    Path(path).unlink(missing_ok=True)
    Path(path + "-journal").unlink(missing_ok=True)


@pytest.fixture
def app():
    from hermes_sync.main import create_app
    return create_app()


@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c
