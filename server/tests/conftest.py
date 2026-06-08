"""Shared pytest fixtures."""
import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def tmp_db_url(monkeypatch: pytest.MonkeyPatch) -> Generator[str, None, None]:
    """Override HERMES_SYNC_DATABASE_URL to a tempfile SQLite for the test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite+aiosqlite:///{path}"
    monkeypatch.setenv("HERMES_SYNC_DATABASE_URL", url)
    yield url
    Path(path).unlink(missing_ok=True)
    Path(path + "-journal").unlink(missing_ok=True)


@pytest.fixture
def app(tmp_db_url: str):  # noqa: ARG001 — env side effect
    """Build a fresh FastAPI app for each test."""
    # Reset the cached settings so the env override takes effect.
    from hermes_sync import config as cfg
    cfg._settings = None
    from hermes_sync.main import create_app
    return create_app()


@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c
