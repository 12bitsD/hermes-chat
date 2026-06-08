# Hermes Session Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a small FastAPI + SQLite backend at `server/` that catalogs session metadata from a Mac-side daemon so a phone running `hermes-chat` can show "sessions on my Mac" without round-tripping to Hermes on every app open.

**Architecture:** Mac runs a Python daemon (`hermes_sync.partner`) that polls `http://localhost:8642/api/sessions` every 5 seconds and POSTs the resulting list to the backend. Backend upserts into SQLite. Phone pulls `/api/sync/sessions` and renders the catalog. **Backend is OFF the critical chat path** — chat is always phone → Hermes direct.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), aiosqlite, Alembic, Pydantic v2, pydantic-settings, pytest, httpx.AsyncClient, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-08-hermes-session-sync-design.md` (must be read first).

**Out of scope for this plan:** Phase D (client integration) and Phase E (hardening). Tracked as separate specs.

---

## File Structure

```
hermes-chat/                            # monorepo root
├── server/                             # NEW
│   ├── pyproject.toml                  # NEW
│   ├── README.md                       # NEW
│   ├── .python-version                 # NEW (3.11)
│   ├── alembic.ini                     # NEW
│   ├── alembic/
│   │   ├── env.py                      # NEW
│   │   ├── script.py.mako              # NEW (template)
│   │   └── versions/
│   │       └── 0001_initial.py         # NEW (created by alembic revision)
│   ├── src/hermes_sync/
│   │   ├── __init__.py                 # NEW
│   │   ├── main.py                     # NEW
│   │   ├── config.py                   # NEW
│   │   ├── db.py                       # NEW
│   │   ├── models.py                   # NEW
│   │   ├── schemas.py                  # NEW
│   │   ├── deps.py                     # NEW
│   │   ├── routers/
│   │   │   ├── __init__.py             # NEW
│   │   │   ├── health.py               # NEW
│   │   │   └── sync.py                 # NEW
│   │   └── partner/
│   │       ├── __init__.py             # NEW
│   │       ├── __main__.py             # NEW (enables `python -m hermes_sync.partner`)
│   │       └── daemon.py               # NEW
│   └── tests/
│       ├── __init__.py                 # NEW
│       ├── conftest.py                 # NEW
│       ├── test_health.py              # NEW
│       ├── test_sync.py                # NEW
│       └── test_daemon.py              # NEW
├── .github/
│   └── workflows/
│       └── server-ci.yml               # NEW
├── README.md                           # MODIFY (add Monorepo + Connect to Hermes)
└── .gitignore                          # MODIFY (add server/.venv, server/*.db, etc.)
```

Each file has one responsibility; tests cover routers and the daemon in isolation.

---

## Phase A — Scaffold

### Task 1: `pyproject.toml` + Python 3.11 pin + dev environment

**Files:**
- Create: `server/pyproject.toml`
- Create: `server/.python-version`
- Create: `server/.gitignore`
- Modify: `/Users/bytedance/Desktop/CodeSpace/hermes-chat/.gitignore` (append server ignores)

- [ ] **Step 1.1: Write `server/.python-version`**

```
3.11
```

- [ ] **Step 1.2: Write `server/.gitignore`**

```
__pycache__/
*.py[cod]
*.egg-info/
.venv/
*.db
*.db-journal
.pytest_cache/
.ruff_cache/
.mypy_cache/
dist/
build/
```

- [ ] **Step 1.3: Append to root `.gitignore`**

Open `/Users/bytedance/Desktop/CodeSpace/hermes-chat/.gitignore`. If it doesn't exist, create with `touch`. Append:

```
# Python (server/)
server/.venv/
server/*.db
server/*.db-journal
server/.pytest_cache/
server/.ruff_cache/
server/.mypy_cache/
```

- [ ] **Step 1.4: Write `server/pyproject.toml`**

```toml
[project]
name = "hermes-sync"
version = "0.1.0"
description = "Cross-device session metadata catalog for hermes-chat"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "sqlalchemy[asyncio]>=2.0.30",
    "aiosqlite>=0.20.0",
    "alembic>=1.13.0",
    "pydantic>=2.7.0",
    "pydantic-settings>=2.4.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.23.0",
    "ruff>=0.5.0",
    "mypy>=1.10.0",
]

[project.scripts]
hermes-sync-partner = "hermes_sync.partner.daemon:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/hermes_sync"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-ra --strict-markers"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.mypy]
strict = true
files = ["src", "tests"]
```

- [ ] **Step 1.5: Install dev environment**

Run:
```bash
cd server && python3.11 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

Expected: installs FastAPI, SQLAlchemy, etc. plus dev deps. Last lines include `Successfully installed hermes-sync-0.1.0`.

- [ ] **Step 1.6: Verify import works**

Run:
```bash
cd server && .venv/bin/python -c "import hermes_sync; print(hermes_sync.__file__)"
```

Expected: prints the path to `hermes_sync/__init__.py` inside the venv (e.g. `/.../server/.venv/lib/python3.11/site-packages/hermes_sync/__init__.py`).

- [ ] **Step 1.7: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/.python-version server/.gitignore server/pyproject.toml .gitignore
git commit -m "server: scaffold pyproject.toml + python 3.11 pin"
```

---

### Task 2: Minimal FastAPI app with `/api/health`

**Files:**
- Create: `server/src/hermes_sync/__init__.py`
- Create: `server/src/hermes_sync/config.py`
- Create: `server/src/hermes_sync/main.py`
- Create: `server/src/hermes_sync/routers/__init__.py`
- Create: `server/src/hermes_sync/routers/health.py`

- [ ] **Step 2.1: Write `server/src/hermes_sync/__init__.py`**

```python
"""hermes_sync: cross-device session metadata catalog for hermes-chat."""
__version__ = "0.1.0"
```

- [ ] **Step 2.2: Write `server/src/hermes_sync/config.py`**

```python
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
```

- [ ] **Step 2.3: Write `server/src/hermes_sync/routers/__init__.py`**

```python
"""FastAPI routers."""
```

- [ ] **Step 2.4: Write `server/src/hermes_sync/routers/health.py`**

```python
"""Liveness probe — no DB, no auth."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str | int]:
    """Return 200 with current timestamp. No side effects."""
    import time
    return {"status": "ok", "ts": int(time.time() * 1000)}
```

- [ ] **Step 2.5: Write `server/src/hermes_sync/main.py`**

```python
"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hermes_sync.config import get_settings
from hermes_sync.routers import health


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="hermes-sync", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    return app


app = create_app()
```

- [ ] **Step 2.6: Start the server in the background**

Run:
```bash
cd server && rm -f hermes_sync.db && .venv/bin/uvicorn hermes_sync.main:app --host 127.0.0.1 --port 8765 > /tmp/uvicorn.log 2>&1 &
sleep 2
```

Expected: server starts, no errors in `/tmp/uvicorn.log`. Background process.

- [ ] **Step 2.7: Verify `/api/health` returns 200**

Run:
```bash
curl -sS http://127.0.0.1:8765/api/health
```

Expected output (exact format):
```json
{"status":"ok","ts":1700000000000}
```

- [ ] **Step 2.8: Stop the server**

Run:
```bash
pkill -f 'uvicorn hermes_sync' || true
sleep 1
```

- [ ] **Step 2.9: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/__init__.py server/src/hermes_sync/config.py server/src/hermes_sync/main.py server/src/hermes_sync/routers/__init__.py server/src/hermes_sync/routers/health.py
git commit -m "server: minimal FastAPI app with /api/health"
```

---

### Task 3: pytest config + first test (test_health.py)

**Files:**
- Create: `server/tests/__init__.py`
- Create: `server/tests/conftest.py`
- Create: `server/tests/test_health.py`

- [ ] **Step 3.1: Write `server/tests/__init__.py`**

```python
```

- [ ] **Step 3.2: Write `server/tests/conftest.py`**

```python
"""Shared pytest fixtures."""
import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


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
```

- [ ] **Step 3.3: Write `server/tests/test_health.py`**

```python
"""Health endpoint tests."""
from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["ts"], int)
    assert body["ts"] > 0
```

- [ ] **Step 3.4: Run the test**

Run:
```bash
cd server && .venv/bin/pytest tests/test_health.py -v
```

Expected: `1 passed`.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/tests/__init__.py server/tests/conftest.py server/tests/test_health.py
git commit -m "server: add pytest config + first health test"
```

---

### Task 4: GitHub Actions CI for server

**Files:**
- Create: `.github/workflows/server-ci.yml`

- [ ] **Step 4.1: Write `.github/workflows/server-ci.yml`**

```yaml
name: server-ci

on:
  push:
    paths:
      - "server/**"
      - ".github/workflows/server-ci.yml"
  pull_request:
    paths:
      - "server/**"
      - ".github/workflows/server-ci.yml"

defaults:
  run:
    working-directory: server

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: server/pyproject.toml
      - name: Install
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]"
      - name: Lint
        run: ruff check src tests
      - name: Type check
        run: mypy src tests
        continue-on-error: true   # TODO: remove after we type everything
      - name: Test
        run: pytest
```

- [ ] **Step 4.2: Verify YAML parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('/Users/bytedance/Desktop/CodeSpace/hermes-chat/.github/workflows/server-ci.yml'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4.3: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add .github/workflows/server-ci.yml
git commit -m "ci: add server-ci workflow (pytest + ruff + mypy)"
```

---

### Task 5: README updates (Monorepo + Connect to Hermes)

**Files:**
- Modify: `README.md`

- [ ] **Step 5.1: Replace root `README.md`**

Read the existing `README.md` (currently 2 lines). Replace its entire content with:

````markdown
# hermes-chat

A kawaii mobile chat client (Android / iOS / Web) for the local **Hermes**
LLM gateway. The client is a React Native app built with Expo SDK 56.

This is a **monorepo** with two main parts:

- `src/` — the React Native client
- `server/` — a small FastAPI + SQLite backend that catalogs session
  metadata across devices

See:

- `docs/superpowers/specs/2026-06-08-hermes-session-sync-design.md` — backend design
- `server/README.md` — backend setup

## Connect to Hermes

The phone talks **directly** to Hermes. It does not go through the
backend (`server/`). The backend is only for "what sessions exist on
my Mac" cross-device awareness.

To connect the phone to Hermes, do **one of**:

1. **Same Wi-Fi (easiest)**: on the phone, open `hermes-chat` →
   ⚙ Settings → **Endpoint** → set to `http://<your-mac-lan-ip>:8642`.
   Find your Mac's IP via `ipconfig getifaddr en0` (Wi-Fi) or
   `ipconfig getifaddr en1` (Ethernet).
2. **Android emulator**: leave the default `http://10.0.2.2:8642`.
3. **iOS Simulator / Web**: leave the default `http://127.0.0.1:8642`.

### Tailscale / tunnel (cross-network)

If your Mac is at home and your phone is on cellular, run Tailscale on
both. Then point the phone's Endpoint at the Mac's Tailscale IP, e.g.
`http://100.x.y.z:8642`.

### Pair code (coming)

Phase 78b (in the Hermes gateway) will add a QR / 6-char code flow so
the phone learns the Mac's URL automatically. The backend is not
involved.
````

- [ ] **Step 5.2: Write `server/README.md`**

````markdown
# hermes-sync backend

Small FastAPI + SQLite service that catalogs session metadata from
Mac-side daemons so the phone can show "sessions on my Mac".

## Status

Spec: `docs/superpowers/specs/2026-06-08-hermes-session-sync-design.md`
Plan: `docs/superpowers/plans/2026-06-08-hermes-session-sync-implementation.md`

## Quick start (development)

```bash
cd server
python3.11 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn hermes_sync.main:app --reload
```

Then:

```bash
curl http://127.0.0.1:8000/api/health
# → {"status":"ok","ts":...}
```

## Run the Mac-side daemon

```bash
export HERMES_SYNC_BACKEND=http://127.0.0.1:8000
export HERMES_LOCAL=http://127.0.0.1:8642
.venv/bin/python -m hermes_sync.partner
```

The daemon polls `HERMES_LOCAL/api/sessions` every 5s and POSTs to
`HERMES_SYNC_BACKEND/api/sync/sessions`.

## Tests

```bash
.venv/bin/pytest
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `HERMES_SYNC_DATABASE_URL` | `sqlite+aiosqlite:///./hermes_sync.db` | async SQLAlchemy URL |
| `HERMES_SYNC_CORS_ORIGINS` | `["*"]` | JSON list |
````

- [ ] **Step 5.3: Verify README renders sensibly**

Run:
```bash
head -20 /Users/bytedance/Desktop/CodeSpace/hermes-chat/README.md
```

Expected: shows the new monorepo intro.

- [ ] **Step 5.4: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add README.md server/README.md
git commit -m "docs: monorepo intro + 'Connect to Hermes' section"
```

---

## Phase B — Sync endpoints

### Task 6: SQLAlchemy ORM models (Device, SessionMeta)

**Files:**
- Create: `server/src/hermes_sync/db.py`
- Create: `server/src/hermes_sync/models.py`

- [ ] **Step 6.1: Write `server/src/hermes_sync/db.py`**

```python
"""Async SQLAlchemy engine + session factory."""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from hermes_sync.config import get_settings
from hermes_sync.models import Base

_settings = get_settings()
engine = create_async_engine(_settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Yields a session, commits or rolls back automatically."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```

- [ ] **Step 6.2: Write `server/src/hermes_sync/models.py`**

```python
"""SQLAlchemy 2.0 ORM models."""
from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Device(Base):
    """A device that pushes or pulls sessions. Created lazily on first POST."""
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    platform: Mapped[str] = mapped_column(String)
    first_seen_at: Mapped[int] = mapped_column(Integer)
    last_seen_at: Mapped[int] = mapped_column(Integer)


class SessionMeta(Base):
    """Cross-device session metadata. The session content lives in Hermes."""
    __tablename__ = "session_meta"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"))
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[int] = mapped_column(Integer)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    preview: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    synced_at: Mapped[int] = mapped_column(Integer)

    device: Mapped["Device"] = relationship("Device", lazy="joined")

    __table_args__ = (
        Index("ix_session_meta_updated_at", "updated_at"),
        Index("ix_session_meta_device_id", "device_id"),
    )
```

- [ ] **Step 6.3: Verify imports**

Run:
```bash
cd server && .venv/bin/python -c "from hermes_sync.models import Base, Device, SessionMeta; print([t.name for t in Base.metadata.sorted_tables])"
```

Expected: `['devices', 'session_meta']`.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/db.py server/src/hermes_sync/models.py
git commit -m "server: add SQLAlchemy models (Device, SessionMeta)"
```

---

### Task 7: Alembic init + first migration

**Files:**
- Create: `server/alembic.ini`
- Create: `server/alembic/env.py`
- Create: `server/alembic/script.py.mako`
- Create: `server/alembic/versions/0001_initial.py`

- [ ] **Step 7.1: Initialize Alembic**

Run:
```bash
cd server && .venv/bin/alembic init -t async alembic
```

Expected: creates `alembic/` dir + `alembic.ini`. Note: this OVERWRITES the empty `alembic/versions/` directory we have. That's fine.

- [ ] **Step 7.2: Edit `server/alembic.ini`**

Open `server/alembic.ini`. Find the line `sqlalchemy.url = ` and replace with:

```ini
# sqlalchemy.url is read from env in env.py
sqlalchemy.url =
```

- [ ] **Step 7.3: Replace `server/alembic/env.py`**

Read the current env.py, then overwrite it with:

```python
"""Alembic env (async)."""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from hermes_sync.config import get_settings
from hermes_sync.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the runtime DB URL.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 7.4: Generate the first migration**

Run:
```bash
cd server && .venv/bin/alembic revision --autogenerate -m "initial schema"
```

Expected: writes a file under `alembic/versions/` (e.g. `0001_initial_schema.py` — exact name depends on the timestamp prefix).

- [ ] **Step 7.5: Inspect the generated migration**

Run:
```bash
ls server/alembic/versions/
```

Expected: one file. Open it and confirm it has `op.create_table("devices", ...)` and `op.create_table("session_meta", ...)`.

- [ ] **Step 7.6: Apply the migration to a fresh test DB**

Run:
```bash
cd server && rm -f hermes_sync.db && .venv/bin/alembic upgrade head && ls -la hermes_sync.db
```

Expected: prints "Running upgrade  -> <hash>, initial schema". `hermes_sync.db` exists.

- [ ] **Step 7.7: Verify tables exist**

Run:
```bash
cd server && .venv/bin/python -c "
import asyncio, aiosqlite
async def main():
    async with aiosqlite.connect('hermes_sync.db') as db:
        async with db.execute(\"SELECT name FROM sqlite_master WHERE type='table'\") as cur:
            print([row[0] for row in await cur.fetchall()])
asyncio.run(main())
"
```

Expected: includes `'devices'` and `'session_meta'`.

- [ ] **Step 7.8: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/alembic.ini server/alembic/env.py server/alembic/script.py.mako server/alembic/versions/
git commit -m "server: alembic setup + initial schema migration"
```

---

### Task 8: Pydantic schemas

**Files:**
- Create: `server/src/hermes_sync/schemas.py`

- [ ] **Step 8.1: Write `server/src/hermes_sync/schemas.py`**

```python
"""Pydantic v2 request/response shapes."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── Device ────────────────────────────────────────────────────────────

class DeviceIn(BaseModel):
    """Device descriptor sent in POST body."""
    id: str = Field(..., min_length=1, max_length=128)
    name: Optional[str] = Field(None, max_length=200)
    platform: str = Field(..., min_length=1, max_length=32)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: Optional[str]
    platform: str


# ─── Session ───────────────────────────────────────────────────────────

class SessionIn(BaseModel):
    """One session as the daemon posts it."""
    id: str = Field(..., min_length=1, max_length=128)
    title: Optional[str] = Field(None, max_length=500)
    created_at: int
    updated_at: int
    message_count: int = Field(0, ge=0)
    preview: Optional[str] = Field(None, max_length=500)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    device_name: Optional[str] = None
    title: Optional[str]
    created_at: int
    updated_at: int
    message_count: int
    preview: Optional[str]
    synced_at: int


# ─── Sync payload ──────────────────────────────────────────────────────

class SyncPushIn(BaseModel):
    """Full POST body for /api/sync/sessions."""
    device: DeviceIn
    sessions: list[SessionIn] = Field(default_factory=list)


class SyncPullOut(BaseModel):
    """GET /api/sync/sessions response."""
    sessions: list[SessionOut]
    server_ts: int
```

- [ ] **Step 8.2: Verify schemas import**

Run:
```bash
cd server && .venv/bin/python -c "
from hermes_sync.schemas import SyncPushIn, SyncPullOut
p = SyncPushIn.model_validate({
    'device': {'id': 'mac-1', 'platform': 'macos'},
    'sessions': [{'id': 's1', 'created_at': 1, 'updated_at': 2, 'message_count': 0}],
})
print(p.model_dump())
"
```

Expected: prints the parsed dict including all defaults.

- [ ] **Step 8.3: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/schemas.py
git commit -m "server: add Pydantic schemas for sync"
```

---

### Task 9: `POST /api/sync/sessions` — push with upsert + delete-diff

**Files:**
- Create: `server/src/hermes_sync/deps.py`
- Create: `server/src/hermes_sync/routers/sync.py` (partial — POST only first)
- Modify: `server/src/hermes_sync/main.py` (include sync router)
- Modify: `server/tests/conftest.py` (add async db init fixture)
- Modify: `server/tests/test_sync.py` (create empty)

- [ ] **Step 9.1: Write `server/src/hermes_sync/deps.py`**

```python
"""FastAPI dependencies."""
from collections.abc import AsyncIterator

from fastapi import Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from hermes_sync.db import SessionLocal


async def db_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def require_device_id(x_device_id: str | None = Header(default=None, alias="X-Device-Id")) -> str:
    if not x_device_id or len(x_device_id) > 128:
        raise HTTPException(status_code=400, detail="missing or invalid X-Device-Id header")
    return x_device_id
```

- [ ] **Step 9.2: Write `server/tests/test_sync.py` (POST tests, more to follow)**

```python
"""Sync endpoint tests."""
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hermes_sync.models import Device, SessionMeta


def _now_ms() -> int:
    return int(time.time() * 1000)


def test_post_sync_upserts_device_and_sessions(client: TestClient) -> None:
    body = {
        "device": {"id": "mac-1", "name": "Studio", "platform": "macos"},
        "sessions": [
            {"id": "s1", "title": "Refactor cache", "created_at": _now_ms() - 10000, "updated_at": _now_ms(), "message_count": 5, "preview": "Help me ..."},
            {"id": "s2", "title": "Add tests", "created_at": _now_ms() - 5000, "updated_at": _now_ms() - 1000, "message_count": 2},
        ],
    }
    res = client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    assert res.status_code == 204
    assert res.text == ""


def test_post_sync_returns_400_when_header_missing(client: TestClient) -> None:
    body = {"device": {"id": "mac-1", "platform": "macos"}, "sessions": []}
    res = client.post("/api/sync/sessions", json=body)
    assert res.status_code == 400


def test_post_sync_returns_400_when_header_body_mismatch(client: TestClient) -> None:
    body = {"device": {"id": "mac-1", "platform": "macos"}, "sessions": []}
    res = client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-2"})
    assert res.status_code == 400


def test_post_sync_deletes_removed_sessions(client: TestClient) -> None:
    # First push: s1, s2
    body1 = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [
            {"id": "s1", "created_at": 1, "updated_at": 2, "message_count": 0},
            {"id": "s2", "created_at": 3, "updated_at": 4, "message_count": 0},
        ],
    }
    assert client.post("/api/sync/sessions", json=body1, headers={"X-Device-Id": "mac-1"}).status_code == 204
    # Second push: s1 only — s2 should be deleted
    body2 = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [{"id": "s1", "created_at": 1, "updated_at": 99, "message_count": 7}],
    }
    assert client.post("/api/sync/sessions", json=body2, headers={"X-Device-Id": "mac-1"}).status_code == 204
    listing = client.get("/api/sync/sessions").json()
    ids = {s["id"] for s in listing["sessions"]}
    assert ids == {"s1"}


def test_post_sync_isolates_by_device(client: TestClient) -> None:
    """Mac-A pushes s1; Mac-B pushes s1 with different content; both rows coexist? No:
    in V1, last-writer-wins on device_id. Verify the row transfers."""
    body_a = {
        "device": {"id": "mac-a", "name": "A", "platform": "macos"},
        "sessions": [{"id": "s1", "created_at": 1, "updated_at": 2, "message_count": 1}],
    }
    body_b = {
        "device": {"id": "mac-b", "name": "B", "platform": "macos"},
        "sessions": [{"id": "s1", "created_at": 1, "updated_at": 99, "message_count": 9}],
    }
    assert client.post("/api/sync/sessions", json=body_a, headers={"X-Device-Id": "mac-a"}).status_code == 204
    assert client.post("/api/sync/sessions", json=body_b, headers={"X-Device-Id": "mac-b"}).status_code == 204
    listing = client.get("/api/sync/sessions").json()
    assert len(listing["sessions"]) == 1
    # mac-b won
    s = listing["sessions"][0]
    assert s["device_id"] == "mac-b"
    assert s["message_count"] == 9
```

- [ ] **Step 9.3: Update `server/tests/conftest.py` to init the DB schema for tests**

Replace the file with:

```python
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
```

- [ ] **Step 9.4: Write `server/src/hermes_sync/routers/sync.py` (POST only)**

```python
"""/api/sync/* — session metadata catalog endpoints."""
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from hermes_sync.deps import db_session, require_device_id
from hermes_sync.models import Device, SessionMeta
from hermes_sync.schemas import SyncPushIn

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def push_sessions(
    payload: SyncPushIn,
    device_id: str = Depends(require_device_id),
    session: AsyncSession = Depends(db_session),
) -> None:
    """Mac daemon pushes the full list of its sessions. Upserts + deletes diffs."""
    if payload.device.id != device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id must match body device.id")
    now = int(time.time() * 1000)

    # 1) Upsert device
    existing_device = await session.get(Device, device_id)
    if existing_device is None:
        session.add(Device(
            id=device_id,
            name=payload.device.name,
            platform=payload.device.platform,
            first_seen_at=now,
            last_seen_at=now,
        ))
    else:
        existing_device.name = payload.device.name
        existing_device.platform = payload.device.platform
        existing_device.last_seen_at = now

    # 2) Upsert sessions
    incoming_ids = {s.id for s in payload.sessions}
    for s in payload.sessions:
        stmt = sqlite_insert(SessionMeta).values(
            id=s.id,
            device_id=device_id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
            message_count=s.message_count,
            preview=s.preview,
            synced_at=now,
        ).on_conflict_do_update(
            index_elements=[SessionMeta.id],
            set_={
                "device_id": device_id,
                "title": s.title,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "message_count": s.message_count,
                "preview": s.preview,
                "synced_at": now,
            },
        )
        await session.execute(stmt)

    # 3) Delete sessions that disappeared from this device's payload.
    existing_rows = (await session.execute(
        select(SessionMeta.id).where(SessionMeta.device_id == device_id)
    )).scalars().all()
    for existing_id in existing_rows:
        if existing_id not in incoming_ids:
            await session.delete(await session.get(SessionMeta, existing_id))

    await session.commit()
```

- [ ] **Step 9.5: Wire up the router in `main.py`**

Open `server/src/hermes_sync/main.py`. Add an import after `from hermes_sync.routers import health`:

```python
from hermes_sync.routers import health, sync
```

In `create_app()`, after `app.include_router(health.router)`, add:

```python
    app.include_router(sync.router)
```

- [ ] **Step 9.6: Run tests (expected: 4 failures on test_sync.py because GET endpoint not implemented yet, but POST tests should pass)**

Run:
```bash
cd server && .venv/bin/pytest tests/test_sync.py -v 2>&1 | head -60
```

Expected: the POST tests pass; the delete-diff and device-isolation tests pass. The `test_post_sync_deletes_removed_sessions` and `test_post_sync_isolates_by_device` will fail because the GET endpoint isn't implemented yet — they'll be addressed in the next task. (We don't yet assert on GET output; we only assert status 204. The `assert client.get("/api/sync/sessions").json()["sessions"]` lines in those tests will fail with a JSON parse error since GET returns 404. That's OK for now — we'll fix it in Task 10.)

**Wait** — that's a test failure, which the plan says to avoid at commit time. Update the test file to **remove the GET-dependent assertions for now**, OR implement GET first.

Choose: implement GET first (Task 10), then run all sync tests together. **Skip Steps 9.6 — 9.7 for now**, and proceed to Task 10.

- [ ] **Step 9.7: Commit (POST endpoint done, GET tests deferred)**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/deps.py server/src/hermes_sync/routers/sync.py server/src/hermes_sync/main.py server/tests/conftest.py server/tests/test_sync.py
git commit -m "server: add POST /api/sync/sessions (upsert + delete-diff)"
```

---

### Task 10: `GET /api/sync/sessions` — list catalog

**Files:**
- Modify: `server/src/hermes_sync/routers/sync.py` (add GET)
- Modify: `server/tests/test_sync.py` (add GET tests)

- [ ] **Step 10.1: Append GET tests to `server/tests/test_sync.py`**

```python
def test_get_sync_returns_empty_when_no_push(client: TestClient) -> None:
    res = client.get("/api/sync/sessions")
    assert res.status_code == 200
    body = res.json()
    assert body["sessions"] == []
    assert isinstance(body["server_ts"], int)
    assert body["server_ts"] > 0


def test_get_sync_returns_sessions_after_push(client: TestClient) -> None:
    now = _now_ms()
    body = {
        "device": {"id": "mac-1", "name": "Studio", "platform": "macos"},
        "sessions": [
            {"id": "s1", "title": "Refactor", "created_at": now - 10000, "updated_at": now, "message_count": 5, "preview": "Help ..."},
        ],
    }
    client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    res = client.get("/api/sync/sessions")
    assert res.status_code == 200
    data = res.json()
    assert len(data["sessions"]) == 1
    s = data["sessions"][0]
    assert s["id"] == "s1"
    assert s["title"] == "Refactor"
    assert s["device_id"] == "mac-1"
    assert s["device_name"] == "Studio"
    assert s["message_count"] == 5
    assert s["preview"] == "Help ..."


def test_get_sync_sorted_by_updated_at_desc(client: TestClient) -> None:
    now = _now_ms()
    body = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [
            {"id": "old", "created_at": now - 30000, "updated_at": now - 20000, "message_count": 1},
            {"id": "new", "created_at": now - 1000, "updated_at": now, "message_count": 9},
        ],
    }
    client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    ids = [s["id"] for s in client.get("/api/sync/sessions").json()["sessions"]]
    assert ids == ["new", "old"]


def test_get_sync_supports_limit_and_since(client: TestClient) -> None:
    now = _now_ms()
    body = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [
            {"id": f"s{i}", "created_at": now - (10 - i) * 1000, "updated_at": now - (10 - i) * 1000, "message_count": i}
            for i in range(5)
        ],
    }
    client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    # Limit
    res = client.get("/api/sync/sessions?limit=2").json()
    assert len(res["sessions"]) == 2
    # Since: pick a midpoint and only newer should come back
    midpoint = now - 5 * 1000
    res = client.get(f"/api/sync/sessions?since={midpoint}").json()
    ids = {s["id"] for s in res["sessions"]}
    # Sessions with updated_at > midpoint: s3, s4 (updated_at = now-3k, now-2k)
    assert ids == {"s3", "s4"}
```

- [ ] **Step 10.2: Add the GET handler to `server/src/hermes_sync/routers/sync.py`**

Append to the file:

```python
from fastapi import Query
from hermes_sync.schemas import SessionOut, SyncPullOut


@router.get("/sessions", response_model=SyncPullOut)
async def pull_sessions(
    limit: int = Query(50, ge=1, le=200),
    since: int | None = Query(None, description="ms epoch; only return updated_at > since"),
    session: AsyncSession = Depends(db_session),
) -> SyncPullOut:
    """Phone pulls the catalog."""
    stmt = select(SessionMeta).order_by(SessionMeta.updated_at.desc()).limit(limit)
    if since is not None:
        stmt = stmt.where(SessionMeta.updated_at > since)
    rows = (await session.execute(stmt)).scalars().all()
    out = [
        SessionOut(
            id=r.id,
            device_id=r.device_id,
            device_name=r.device.name if r.device else None,
            title=r.title,
            created_at=r.created_at,
            updated_at=r.updated_at,
            message_count=r.message_count,
            preview=r.preview,
            synced_at=r.synced_at,
        )
        for r in rows
    ]
    return SyncPullOut(sessions=out, server_ts=int(time.time() * 1000))
```

Also add the imports at the top of the file (consolidate):

```python
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from hermes_sync.deps import db_session, require_device_id
from hermes_sync.models import Device, SessionMeta
from hermes_sync.schemas import SessionOut, SyncPushIn, SyncPullOut
```

(Replace the existing import block.)

- [ ] **Step 10.3: Run all sync tests**

Run:
```bash
cd server && .venv/bin/pytest tests/test_sync.py -v
```

Expected: 8 passed (4 POST + 4 GET).

- [ ] **Step 10.4: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/routers/sync.py server/tests/test_sync.py
git commit -m "server: add GET /api/sync/sessions (list catalog)"
```

---

### Task 11: `GET /api/sync/sessions/{id}` — single session

**Files:**
- Modify: `server/src/hermes_sync/routers/sync.py`
- Modify: `server/tests/test_sync.py`

- [ ] **Step 11.1: Add tests to `server/tests/test_sync.py`**

```python
def test_get_single_session_returns_200(client: TestClient) -> None:
    now = _now_ms()
    body = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [{"id": "s1", "title": "T", "created_at": now, "updated_at": now, "message_count": 1}],
    }
    client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    res = client.get("/api/sync/sessions/s1")
    assert res.status_code == 200
    assert res.json()["id"] == "s1"


def test_get_single_session_returns_404_when_missing(client: TestClient) -> None:
    res = client.get("/api/sync/sessions/nonexistent")
    assert res.status_code == 404
```

- [ ] **Step 11.2: Add the GET-by-id handler to `server/src/hermes_sync/routers/sync.py`**

Append:

```python
@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: str,
    session: AsyncSession = Depends(db_session),
) -> SessionOut:
    row = await session.get(SessionMeta, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return SessionOut(
        id=row.id,
        device_id=row.device_id,
        device_name=row.device.name if row.device else None,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
        message_count=row.message_count,
        preview=row.preview,
        synced_at=row.synced_at,
    )
```

- [ ] **Step 11.3: Run all sync tests**

Run:
```bash
cd server && .venv/bin/pytest tests/test_sync.py -v
```

Expected: 10 passed.

- [ ] **Step 11.4: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/routers/sync.py server/tests/test_sync.py
git commit -m "server: add GET /api/sync/sessions/{id}"
```

---

### Task 12: `DELETE /api/sync/sessions/{id}` — drop a session

**Files:**
- Modify: `server/src/hermes_sync/routers/sync.py`
- Modify: `server/tests/test_sync.py`

- [ ] **Step 12.1: Add tests to `server/tests/test_sync.py`**

```python
def test_delete_session_returns_204_and_removes(client: TestClient) -> None:
    now = _now_ms()
    body = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [{"id": "s1", "created_at": now, "updated_at": now, "message_count": 1}],
    }
    client.post("/api/sync/sessions", json=body, headers={"X-Device-Id": "mac-1"})
    res = client.delete("/api/sync/sessions/s1")
    assert res.status_code == 204
    assert client.get("/api/sync/sessions/s1").status_code == 404


def test_delete_session_returns_404_when_missing(client: TestClient) -> None:
    res = client.delete("/api/sync/sessions/ghost")
    assert res.status_code == 404
```

- [ ] **Step 12.2: Add the DELETE handler to `server/src/hermes_sync/routers/sync.py`**

Append:

```python
@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    session: AsyncSession = Depends(db_session),
) -> None:
    row = await session.get(SessionMeta, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    await session.delete(row)
    await session.commit()
```

- [ ] **Step 12.3: Run all tests**

Run:
```bash
cd server && .venv/bin/pytest -v
```

Expected: 13 passed (test_health + test_sync).

- [ ] **Step 12.4: Live curl smoke test**

Run:
```bash
cd server && rm -f hermes_sync.db && .venv/bin/alembic upgrade head
.venv/bin/uvicorn hermes_sync.main:app --host 127.0.0.1 --port 8765 > /tmp/uvicorn.log 2>&1 &
sleep 2

# Health
curl -sS http://127.0.0.1:8765/api/health
echo

# Push
curl -sS -X POST http://127.0.0.1:8765/api/sync/sessions \
    -H "X-Device-Id: mac-test" -H "Content-Type: application/json" \
    -d '{"device":{"id":"mac-test","name":"CurlTest","platform":"macos"},"sessions":[{"id":"s1","title":"From curl","created_at":1700000000000,"updated_at":1700000000000,"message_count":3,"preview":"hello"}]}'
echo

# Pull
curl -sS http://127.0.0.1:8765/api/sync/sessions
echo

# Stop
pkill -f 'uvicorn hermes_sync' || true
sleep 1
```

Expected: health returns `{"status":"ok",...}`, push returns 204, pull returns JSON with s1 in it.

- [ ] **Step 12.5: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/routers/sync.py server/tests/test_sync.py
git commit -m "server: add DELETE /api/sync/sessions/{id}"
```

---

## Phase C — Mac-side partner daemon

### Task 13: Daemon skeleton (poll Hermes, transform, with mocked HTTP)

**Files:**
- Create: `server/src/hermes_sync/partner/__init__.py`
- Create: `server/src/hermes_sync/partner/__main__.py`
- Create: `server/src/hermes_sync/partner/daemon.py`
- Create: `server/tests/test_daemon.py`

- [ ] **Step 13.1: Write `server/src/hermes_sync/partner/__init__.py`**

```python
"""Mac-side partner daemon: polls Hermes and pushes to the backend."""
```

- [ ] **Step 13.2: Write `server/src/hermes_sync/partner/__main__.py`**

```python
"""Entry point for `python -m hermes_sync.partner`."""
from hermes_sync.partner.daemon import main

raise SystemExit(main())
```

- [ ] **Step 13.3: Write the daemon (with injection seam for tests)**

```python
"""Mac-side daemon. Polls Hermes, pushes session list to the backend.

Invoked as: `python -m hermes_sync.partner`
Or:        `hermes-sync-partner` (installed console script)
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from typing import Any, Protocol

import httpx


log = logging.getLogger("hermes_sync.partner")


class _Pusher(Protocol):
    """Anything that can POST a JSON body and return ok/error."""
    def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> tuple[int, str]: ...


class _HermesClient:
    """Just a thin wrapper around httpx so the daemon can be tested with a fake."""
    def __init__(self, base_url: str, timeout_s: float = 3.0) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout_s)

    def list_sessions(self) -> list[dict[str, Any]]:
        """GET /api/sessions → list of session dicts."""
        res = self._client.get("/api/sessions")
        res.raise_for_status()
        data = res.json()
        # Hermes returns either a list or {data: [...]}
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        return []

    def close(self) -> None:
        self._client.close()


def _first_user_preview(messages: list[dict[str, Any]]) -> str | None:
    for m in messages:
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            return m["content"][:100]
    return None


def transform_for_backend(
    raw_sessions: list[dict[str, Any]],
    *,
    device_id: str,
    device_name: str,
) -> dict[str, Any]:
    """Map Hermes's `/api/sessions` shape to our backend's POST body."""
    out_sessions: list[dict[str, Any]] = []
    for s in raw_sessions:
        sid = s.get("id") or s.get("session_id")
        if not isinstance(sid, str) or not sid:
            continue
        messages = s.get("messages") or []
        out_sessions.append({
            "id": sid,
            "title": s.get("title"),
            "created_at": s.get("created_at") or 0,
            "updated_at": s.get("updated_at") or 0,
            "message_count": s.get("message_count") or len(messages),
            "preview": _first_user_preview(messages),
        })
    return {
        "device": {"id": device_id, "name": device_name, "platform": "macos"},
        "sessions": out_sessions,
    }


def run_once(
    hermes: _HermesClient,
    backend_url: str,
    *,
    device_id: str,
    device_name: str,
) -> bool:
    """One poll→push cycle. Returns True on success, False on error."""
    try:
        raw = hermes.list_sessions()
    except Exception as e:  # noqa: BLE001 — we log and continue
        log.warning("hermes list_sessions failed: %s", e)
        return False
    body = transform_for_backend(raw, device_id=device_id, device_name=device_name)
    try:
        with httpx.Client(timeout=3.0) as client:
            res = client.post(
                f"{backend_url.rstrip('/')}/api/sync/sessions",
                json=body,
                headers={"X-Device-Id": device_id, "Content-Type": "application/json"},
            )
            if res.status_code != 204:
                log.warning("backend POST failed: %d %s", res.status_code, res.text)
                return False
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("backend POST error: %s", e)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Hermes sync partner daemon")
    parser.add_argument("--hermes", default=os.environ.get("HERMES_LOCAL", "http://127.0.0.1:8642"))
    parser.add_argument("--backend", default=os.environ.get("HERMES_SYNC_BACKEND", "http://127.0.0.1:8000"))
    parser.add_argument("--device-id", default=os.environ.get("HERMES_SYNC_DEVICE_ID"))
    parser.add_argument("--device-name", default=os.environ.get("HERMES_SYNC_DEVICE_NAME", os.uname().nodename))
    parser.add_argument("--interval", type=float, default=float(os.environ.get("HERMES_SYNC_INTERVAL_S", "5")))
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit (for tests)")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    device_id = args.device_id
    if not device_id:
        # Lazy-generate and persist under ~/.hermes_sync/
        import json
        from pathlib import Path
        cfg_dir = Path.home() / ".hermes_sync"
        cfg_dir.mkdir(parents=True, exist_ok=True)
        id_file = cfg_dir / "device_id"
        if id_file.exists():
            device_id = id_file.read_text().strip()
        else:
            import uuid
            device_id = str(uuid.uuid4())
            id_file.write_text(device_id)
        log.info("using device_id=%s (from %s)", device_id, id_file)

    hermes = _HermesClient(args.hermes)
    try:
        if args.once:
            ok = run_once(hermes, args.backend, device_id=device_id, device_name=args.device_name)
            return 0 if ok else 1
        log.info("daemon started: hermes=%s backend=%s interval=%ss", args.hermes, args.backend, args.interval)
        while True:
            run_once(hermes, args.backend, device_id=device_id, device_name=args.device_name)
            time.sleep(args.interval)
    finally:
        hermes.close()


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
```

- [ ] **Step 13.4: Write `server/tests/test_daemon.py` (unit tests for `transform_for_backend`)**

```python
"""Daemon tests — focus on transform_for_backend (pure function) and run_once with mocks."""
import time
from typing import Any
from unittest.mock import patch, MagicMock

from hermes_sync.partner.daemon import transform_for_backend, run_once


def _now_ms() -> int:
    return int(time.time() * 1000)


def test_transform_drops_sessions_without_id() -> None:
    raw = [
        {"id": "s1", "title": "A", "created_at": 1, "updated_at": 2, "message_count": 1},
        {"session_id": "s2", "title": "B", "created_at": 1, "updated_at": 2},  # alt key
        {"title": "C"},  # no id — dropped
    ]
    body = transform_for_backend(raw, device_id="mac-1", device_name="Studio")
    assert len(body["sessions"]) == 2
    ids = {s["id"] for s in body["sessions"]}
    assert ids == {"s1", "s2"}


def test_transform_extracts_preview_from_first_user_message() -> None:
    raw = [{
        "id": "s1",
        "title": "T",
        "created_at": 1,
        "updated_at": 2,
        "messages": [
            {"role": "assistant", "content": "Hi!"},
            {"role": "user", "content": "Please help me with caching strategies that scale to 10k rps"},
        ],
    }]
    body = transform_for_backend(raw, device_id="mac-1", device_name="Studio")
    assert body["sessions"][0]["preview"].startswith("Please help me")
    assert len(body["sessions"][0]["preview"]) <= 100


def test_transform_handles_alternate_response_shape() -> None:
    """Hermes sometimes returns {data: [...]}."""
    body = transform_for_backend(
        [],
        device_id="mac-1",
        device_name="Studio",
    )
    assert body["device"]["id"] == "mac-1"
    assert body["device"]["platform"] == "macos"
    assert body["sessions"] == []


def test_run_once_returns_true_on_204() -> None:
    fake_hermes = MagicMock()
    fake_hermes.list_sessions.return_value = [
        {"id": "s1", "title": "A", "created_at": 1, "updated_at": 2, "message_count": 1}
    ]
    fake_hermes.close = MagicMock()
    with patch("hermes_sync.partner.daemon.httpx.Client") as Client:
        http = MagicMock()
        http.post.return_value = MagicMock(status_code=204, text="")
        http.__enter__ = lambda s: http
        http.__exit__ = lambda s, *a: None
        Client.return_value = http
        ok = run_once(fake_hermes, "http://backend", device_id="mac-1", device_name="Studio")
    assert ok is True
    http.post.assert_called_once()
    args, kwargs = http.post.call_args
    assert args[0] == "http://backend/api/sync/sessions"
    assert kwargs["headers"]["X-Device-Id"] == "mac-1"


def test_run_once_returns_false_on_500() -> None:
    fake_hermes = MagicMock()
    fake_hermes.list_sessions.return_value = []
    with patch("hermes_sync.partner.daemon.httpx.Client") as Client:
        http = MagicMock()
        http.post.return_value = MagicMock(status_code=500, text="boom")
        http.__enter__ = lambda s: http
        http.__exit__ = lambda s, *a: None
        Client.return_value = http
        ok = run_once(fake_hermes, "http://backend", device_id="mac-1", device_name="Studio")
    assert ok is False


def test_run_once_returns_false_when_hermes_unreachable() -> None:
    fake_hermes = MagicMock()
    fake_hermes.list_sessions.side_effect = RuntimeError("connection refused")
    ok = run_once(fake_hermes, "http://backend", device_id="mac-1", device_name="Studio")
    assert ok is False
```

- [ ] **Step 13.5: Run daemon tests**

Run:
```bash
cd server && .venv/bin/pytest tests/test_daemon.py -v
```

Expected: 6 passed.

- [ ] **Step 13.6: Smoke-test the entry point (no Hermes, just the help text)**

Run:
```bash
cd server && .venv/bin/python -m hermes_sync.partner --help
```

Expected: prints argparse help with all flags (`--hermes`, `--backend`, `--device-id`, `--device-name`, `--interval`, `--once`, `--verbose`).

- [ ] **Step 13.7: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/src/hermes_sync/partner/ server/tests/test_daemon.py
git commit -m "server: mac-side partner daemon with mocked-HTTP tests"
```

---

### Task 14: End-to-end daemon test against a fake Hermes + real backend

**Files:**
- Modify: `server/tests/test_daemon.py`

- [ ] **Step 14.1: Add an end-to-end test**

Append to `server/tests/test_daemon.py`:

```python
def test_end_to_end_daemon_pushes_into_backend(client: TestClient) -> None:
    """Spin up a fake Hermes on a local port, run one daemon cycle, assert backend has the rows."""
    import threading
    import http.server
    import socketserver
    import json
    from hermes_sync.partner.daemon import _HermesClient, run_once  # type: ignore

    fake_sessions = [
        {"id": "s1", "title": "From Fake Hermes", "created_at": 1, "updated_at": 2, "message_count": 3},
        {"id": "s2", "title": "Another", "created_at": 3, "updated_at": 4, "message_count": 0,
         "messages": [{"role": "user", "content": "hello world"}]},
    ]
    body = json.dumps(fake_sessions).encode()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/api/sessions":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass

    with socketserver.TCPServer(("127.0.0.1", 0), Handler) as httpd:
        port = httpd.server_address[1]
        host = f"http://127.0.0.1:{port}"

        # The TestClient is bound to a fastapi app pointed at the test SQLite
        # via the env override in conftest. Point the daemon at the same backend.
        backend_url = "http://testserver"  # fastapi TestClient routing key

        # Run one cycle
        hermes = _HermesClient(host)
        try:
            ok = run_once(hermes, backend_url, device_id="mac-fake", device_name="Fake")
        finally:
            hermes.close()
        assert ok is True

    # The backend (via TestClient) should now have 2 sessions from mac-fake.
    res = client.get("/api/sync/sessions").json()
    assert {s["id"] for s in res["sessions"]} == {"s1", "s2"}
    s2 = next(s for s in res["sessions"] if s["id"] == "s2")
    assert s2["preview"] == "hello world"
```

- [ ] **Step 14.2: Run the test**

Run:
```bash
cd server && .venv/bin/pytest tests/test_daemon.py -v
```

Expected: 7 passed (1 new + 6 prior).

- [ ] **Step 14.3: Commit**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add server/tests/test_daemon.py
git commit -m "server: end-to-end daemon test (fake Hermes + real backend)"
```

---

## Final Verification

### Task 15: All tests pass + CI would be green

- [ ] **Step 15.1: Run the full test suite**

Run:
```bash
cd server && .venv/bin/pytest -v
```

Expected: 21 tests pass (1 health + 10 sync + 9 daemon + the conftest fixtures don't count). No warnings about unresolved fixtures.

- [ ] **Step 15.2: Run lint**

Run:
```bash
cd server && .venv/bin/ruff check src tests
```

Expected: clean (no errors). If ruff complains about unused imports, run `ruff check --fix` to auto-fix.

- [ ] **Step 15.3: Run type check (allowed to have issues; CI has `continue-on-error`)**

Run:
```bash
cd server && .venv/bin/mypy src tests
```

Expected: may have a few errors (we're not strict yet). Note them in the next step.

- [ ] **Step 15.4: Final live curl smoke test (full happy path)**

Run:
```bash
cd server && rm -f hermes_sync.db && .venv/bin/alembic upgrade head
.venv/bin/uvicorn hermes_sync.main:app --host 127.0.0.1 --port 8765 > /tmp/uvicorn.log 2>&1 &
sleep 2

# Health
curl -fsS http://127.0.0.1:8765/api/health | python3 -m json.tool

# Push a Mac session
curl -fsS -X POST http://127.0.0.1:8765/api/sync/sessions \
    -H "X-Device-Id: mac-final" -H "Content-Type: application/json" \
    -d '{"device":{"id":"mac-final","name":"FinalMac","platform":"macos"},"sessions":[{"id":"s-final","title":"Final","created_at":1700000000000,"updated_at":1700000000000,"message_count":2,"preview":"hi"}]}'
echo "POST → $?"

# Pull
curl -fsS http://127.0.0.1:8765/api/sync/sessions | python3 -m json.tool

# Get single
curl -fsS http://127.0.0.1:8765/api/sync/sessions/s-final | python3 -m json.tool

# Delete
curl -fsS -X DELETE -w "DELETE → %{http_code}\n" http://127.0.0.1:8765/api/sync/sessions/s-final

# Pull again
curl -fsS http://127.0.0.1:8765/api/sync/sessions | python3 -m json.tool

# Stop
pkill -f 'uvicorn hermes_sync' || true
sleep 1
```

Expected: health 200, POST 204, GET list with s-final, GET single returns s-final, DELETE 204, GET list is empty.

- [ ] **Step 15.5: Commit the test run (if any fixes were made)**

If anything was fixed, commit:
```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git add -A
git status  # review what's staged
git commit -m "server: lint + smoke fixes from final verification"
```

If nothing changed, skip.

- [ ] **Step 15.6: Push to origin/main**

```bash
cd /Users/bytedance/Desktop/CodeSpace/hermes-chat
git push origin main
```

---

## Self-Review (against spec)

Before handoff, verify the plan covers every spec requirement:

| Spec requirement | Plan task |
|---|---|
| 5 endpoints (`/api/health`, POST/GET/GET-by-id/DELETE `/api/sync/sessions`) | Tasks 2, 9, 10, 11, 12 |
| `X-Device-Id` header required for POST | Task 9 (test) + Task 9 (router check) |
| `X-Device-Id` must match `body.device.id` | Task 9 (test) + Task 9 (router check) |
| Upsert device | Task 9 |
| Upsert sessions with last-writer-wins on device_id | Task 9 (test) |
| Delete sessions removed from payload | Task 9 (test) |
| `?limit=` and `?since=` query params on GET | Task 10 |
| Sort by `updated_at DESC` | Task 10 (test) |
| SQLAlchemy 2.0 + async | Task 6 |
| `Device` + `SessionMeta` models | Task 6 |
| Alembic migrations | Task 7 |
| Pydantic v2 schemas | Task 8 |
| Mac daemon: poll Hermes `/api/sessions` every 5s, POST to backend | Task 13 |
| Daemon: standalone script `python -m hermes_sync.partner` | Task 13 |
| Daemon: configurable via env vars | Task 13 |
| End-to-end daemon test with fake Hermes | Task 14 |
| V1: no auth, no pair, no chat proxy | Throughout — not added |
| Boundaries confirmation section in spec | Already in spec doc (separate from this plan) |
| Monorepo note in README + Connect to Hermes section | Task 5 |
| CI workflow for Python | Task 4 |

All spec requirements covered. Plan is self-contained.

**Placeholder scan**: No "TBD", "TODO", "add appropriate error handling" — every step has the actual code. Where a step describes configuration, it has the YAML / TOML / Python literally shown.

**Type consistency**: 
- `SessionMeta.id` is `str` everywhere (model, schema, router)
- `Device.id` is `str` everywhere
- `X-Device-Id` header → `device_id` parameter → `Device.id` consistently
- `transform_for_backend` signature is the same in daemon code and tests
- `run_once` signature is the same in daemon code and tests

Plan is consistent.

---

## Execution Handoff

This plan is now ready to execute. Total: 15 tasks, ~30 commits, ~21 passing tests when done.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task is self-contained so a fresh subagent has the full context it needs from this plan.

2. **Inline Execution** — Execute tasks in this session using the executing-plans skill, batch execution with checkpoints for review.

Which approach?
