# Hermes Session Sync — Backend Design

**Date**: 2026-06-08
**Status**: Draft (awaiting user review)
**Repo**: `hermes-chat` (monorepo — `server/` subfolder)
**Decides**: Backend scope, sync semantics, repo layout, phasing

## Context

`hermes-chat` is the React Native client (Expo SDK 56) for the local
**Hermes** LLM gateway. Today the client talks directly to Hermes
(`http://<mac-lan-ip>:8642` for chat, `/api/sessions/*` for catalog,
`/v1/capabilities|skills|toolsets` for metadata, `/v1/runs` for agent
runs, `/v1/chat/completions` for completion). There is **no server-side
component owned by this repo** — only client code.

The owner has decided this is a full-stack project and wants a small
backend in `/server/` of this monorepo. After conversation:

- The backend is **not** a chat proxy or LLM-serving gateway. Hermes
  already does that on the user's Mac.
- The backend is **not** the pair-code authority. The `POST
  /api/pair/redeem` lives on **Hermes** (per `src/lib/pairCode.ts:21-24`
  comment, "will live on the gateway side") and is Phase 78b.
- The backend **is** a cross-device session-metadata catalog: a small
  service that lets the phone see "what's on my Mac" without
  round-tripping to Hermes on every app open.

## Goals (V1)

1. **Cross-device session list**: phone shows a recent-sessions view
   that includes sessions authored on other devices (initially: Mac).
2. **Persistence**: durable history of session metadata so the phone can
   show "yesterday's Mac sessions" offline.
3. **Trivial to self-host**: one `uvicorn` command, one SQLite file,
   no Docker, no Redis, no Postgres.

## Non-Goals (V1)

- LLM inference, chat completion, SSE streaming.
- Chat / runs proxying (chat always client → Hermes direct).
- Pair-code authority / device-token issuance (Hermes's job, Phase 78b).
- User accounts, multi-tenant, RBAC, billing.
- Real-time push to phone (V1 uses polling).
- Hermes-as-upstream: the backend doesn't proxy to or call Hermes
  (only the Mac-side daemon does, to read its own session list).
- **Hermes discovery**: phone finding Mac on the network.
- **CORS proxying** for the web variant.
- **Cross-network tunneling** (e.g. phone-on-cellular → Mac-at-home).
- **Pair-code authority** (Phase 78b lives on Hermes, not here).

## Boundaries Confirmation (2026-06-08)

Confirmed in chat with the owner:

1. **Backend is OFF the critical chat path.** Chat (send message →
   receive response) is a direct phone → Hermes HTTP connection.
   The backend is never in this path. If the backend is down, chat
   still works.
2. **V1 backend does exactly one thing**: cross-device session
   metadata catalog. Mac pushes, phone pulls, SQLite persists.
3. **All "hard" connection problems are out of V1 scope**:
   discovery (mDNS / IP / pair code → Hermes URL), CORS (web
   variant), cross-network (Tailscale / tunnel), pair-code
   authority. These are owned by **Hermes + client** in later
   phases (Phase 78b, 79+).
4. **Connect-to-Hermes story in V1**: user manually enters Mac LAN
   IP in Settings. This is the existing flow. V1 doesn't change
   it; V1 just documents it in the README "Connect to Hermes"
   section so users know what to do.
5. **Pair code is a Hermes-side feature** (per
   `src/lib/pairCode.ts:21-24` comment). It will route via Hermes
   (Phase 78b), not via this backend.

If any of (1)-(5) changes, this spec is invalidated and a new one
is needed.

## Architecture

```
┌─────────────────┐       ┌─────────────────────┐       ┌────────────────┐
│  Mac (Hermes)   │       │  Backend            │       │  Phone         │
│                 │       │  (hermes-chat repo  │       │  (hermes-chat  │
│  ┌───────────┐  │ POST  │   /server)          │ GET   │   RN app)      │
│  │ partner   │──┼──────►│  FastAPI + SQLite   │◄──────┼─ syncClient   │
│  │ daemon    │  │       │  5 endpoints        │       │                │
│  └─────┬─────┘  │       │                     │       │  drawer shows  │
│        │ polls  │       │                     │       │  remote sess   │
│        ▼        │       └─────────────────────┘       └────────────────┘
│  Hermes 8642    │
│  (existing)     │
└─────────────────┘
```

**Three actors, two flows**:

1. **Mac daemon → Backend** (write): every 5s, daemon polls
   `http://localhost:8642/api/sessions`, transforms to `SessionMeta[]`,
   POSTs to backend. Backend upserts.
2. **Phone → Backend** (read): on app start + every 30s, phone GETs
   the catalog, stores in zustand, drawer renders it.
3. **Phone → Hermes** (read, NOT through backend): when user taps a
   remote session, phone opens `GET
   http://<mac-lan-ip>:8642/api/sessions/{id}/messages` **directly**.
   Backend never sees message bodies.

## Tech Stack

| | |
|---|---|
| Runtime | Python 3.11+ |
| Framework | FastAPI + uvicorn |
| ORM | SQLAlchemy 2.0 (async) |
| Driver | aiosqlite (SQLite, file-backed) |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Settings | pydantic-settings |
| Tests | pytest + httpx.AsyncClient |
| Lint | ruff (recommended, not required V1) |
| Type check | mypy --strict (recommended, not required V1) |
| CI | GitHub Actions (Python job added next to existing tsc + npm test) |

## Repo Layout

```
hermes-chat/                          # monorepo root
├── src/                              # client (existing, unchanged)
├── server/                           # NEW
│   ├── pyproject.toml
│   ├── README.md
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── src/hermes_sync/              # package name: "hermes_sync"
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app + lifespan
│   │   ├── config.py                 # pydantic-settings (env vars)
│   │   ├── db.py                     # async engine, session factory
│   │   ├── models.py                 # SQLAlchemy ORM
│   │   ├── schemas.py                # Pydantic v2 request/response
│   │   ├── deps.py                   # FastAPI DI helpers
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── health.py             # GET /api/health
│   │   │   └── sync.py               # /api/sync/* (4 endpoints)
│   │   └── partner/                  # Mac-side daemon
│   │       ├── __init__.py
│   │       └── daemon.py             # `python -m hermes_sync.partner`
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py               # AsyncClient + tmp SQLite fixture
│       ├── test_health.py
│       └── test_sync.py
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-08-hermes-session-sync-design.md  # this file
├── .github/
│   └── workflows/
│       ├── test.yml                  # existing (client tsc + npm test)
│       └── server-ci.yml             # NEW (Python pytest)
├── README.md                         # update with monorepo note
└── package.json                      # unchanged
```

**Naming**: package is `hermes_sync` (not `hermes_gateway`, not
`hermes_proxy`). It's a sync service, not a gateway.

## Data Model

```python
# models.py
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, ForeignKey
from typing import Optional

class Base(DeclarativeBase):
    pass

class Device(Base):
    """A physical device that's pushed or pulled sessions.
    Created lazily on first POST/GET — no separate registration."""
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # client-generated uuid
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    platform: Mapped[str] = mapped_column(String)              # "macos" | "ios" | "android" | "web"
    first_seen_at: Mapped[int] = mapped_column(Integer)       # ms epoch
    last_seen_at: Mapped[int] = mapped_column(Integer)        # ms epoch

class SessionMeta(Base):
    """Cross-device session metadata. The session itself lives in Hermes;
    this row is just a phone-friendly pointer + summary."""
    __tablename__ = "session_meta"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # Hermes session_id
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"))
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[int] = mapped_column(Integer)          # ms epoch
    updated_at: Mapped[int] = mapped_column(Integer)          # ms epoch
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    preview: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # first 100 chars of first user msg
    synced_at: Mapped[int] = mapped_column(Integer)          # when Mac last pushed it
```

**Indexes**: `SessionMeta.updated_at` (for the "recent sessions" sort),
`SessionMeta.device_id` (for the "by device" filter).

## API Surface

### `GET /api/health`

Liveness probe. Returns `{"status": "ok", "ts": 1700000000000}`.

No auth. No DB write.

### `POST /api/sync/sessions`

Mac daemon pushes the full list of its sessions. Backend upserts:
- **Device identity** comes from the `X-Device-Id` request header
  (required). The body's `device.id` MUST equal the header; if it
  doesn't, return `400`. The body's `device.name` and
  `device.platform` are upserted onto the `devices` row (created
  lazily on first POST).
- For each session in `payload.sessions`: INSERT or UPDATE
  `session_meta` row where `id == session.id` AND `device_id ==
  X-Device-Id` (PK is `id` alone in V1, so if a different device
  pushes the same `id`, the row is **transferred** — last-writer-wins
  on device_id).
- After upserting, **delete any `session_meta` rows for that
  `X-Device-Id` whose `id` is not in the payload** (so a
  Mac-deleted session disappears from the catalog).

**Request body**:
```json
{
  "device": {
    "id": "mac-uuid-1",
    "name": "Studio",
    "platform": "macos"
  },
  "sessions": [
    {
      "id": "hermes-session-abc",
      "title": "Refactor caching",
      "created_at": 1700000000000,
      "updated_at": 1700000050000,
      "message_count": 12,
      "preview": "Help me add an LRU cache to ..."
    }
  ]
}
```

**Headers**:
- `X-Device-Id: <uuid>` — required, must match `body.device.id`
- `Content-Type: application/json`

**Response**: `204 No Content` (success), `400` (header/body device
mismatch), `422` (validation error).

**Auth**: V1 none. `X-Device-Id` is identification, not
authentication. Anyone can POST anything in V1.

### `GET /api/sync/sessions`

Phone pulls the catalog. Supports filters via query params:

- `?device_id=...` — restrict to one device (V2, not V1)
- `?since=<ms_epoch>` — only sessions updated after this timestamp
  (for incremental polling)
- `?limit=50` — default 50, max 200
- `?offset=0` — for pagination (V2, not V1 — V1 only returns the
  first `limit` rows)

**Response**:
```json
{
  "sessions": [
    {
      "id": "hermes-session-abc",
      "device_id": "mac-uuid-1",
      "device_name": "Studio",
      "title": "Refactor caching",
      "created_at": 1700000000000,
      "updated_at": 1700000050000,
      "message_count": 12,
      "preview": "Help me add an LRU cache to ..."
    }
  ],
  "server_ts": 1700000100000
}
```

Sorted by `updated_at DESC`.

**Auth**: V1 none. Phone sets `X-Device-Id` header (its own uuid),
backend just uses it for analytics (which devices are pulling). V1
doesn't even need to record the pull device; we just need the
catalog.

### `GET /api/sync/sessions/{id}`

Single session metadata. Same shape as the array element above.

**404** if not found.

### `DELETE /api/sync/sessions/{id}`

Mac daemon tells backend "this session is gone from Hermes now".
Backend removes the row.

**204** on success. **404** if not found.

**Optional scope**: `?device_id=...` to scope the delete to a device
(V1 not needed — IDs are globally unique in Hermes).

## Mac-Side Partner Daemon

`server/src/hermes_sync/partner/daemon.py` — runnable as
`python -m hermes_sync.partner`.

**Behavior**:
1. Read config from env / CLI args:
   - `HERMES_SYNC_BACKEND` (e.g. `https://sync.example.com`)
   - `HERMES_SYNC_DEVICE_ID` (uuid; generate on first run, save to
     `~/.hermes_sync/device_id`)
   - `HERMES_SYNC_DEVICE_NAME` (hostname by default)
   - `HERMES_LOCAL` (e.g. `http://127.0.0.1:8642`, where Hermes runs)
   - `HERMES_SYNC_INTERVAL_S` (default 5)
2. Loop:
   - `GET {HERMES_LOCAL}/api/sessions` → list
   - Transform to backend schema (extract `id, title, created_at,
     updated_at, message_count`, compute `preview` from first user
     message)
   - `POST {HERMES_SYNC_BACKEND}/api/sync/sessions` with body
   - Sleep `HERMES_SYNC_INTERVAL_S`
3. On error: log, back off 5s × 2^attempt (cap 5 min), retry

**Daemon ≠ a long-running system service** in V1. User runs it from
a terminal or via `launchd` / `systemd` (out of scope — documented in
README, not auto-configured).

## Client-Side Changes (Out of Scope for This Spec, Listed for Awareness)

The spec author will produce a **separate** client-side spec before
client code changes. The changes are minimal:

- New `src/services/sync/syncClient.ts` (5 methods mirroring backend)
- New `useAppStore.syncSessionsFromBackend()` + `pushMySessions()`
- New `useBackendSync()` hook (parallel to `useHermesSnapshot`)
- Settings: new "Sync endpoint" text field
- AsyncStorage key: `hermes-chat:device-id` (generated once)
- `X-Device-Id` header on all sync calls

These are tracked but **not part of this backend spec**.

## Phasing

Each phase is independently shippable and verifiable.

| Phase | Scope | Acceptance |
|---|---|---|
| **A — Scaffold** | `pyproject.toml`, FastAPI app, SQLite engine, `/api/health`, pytest config, GH Actions workflow | `curl localhost:8000/api/health` returns 200; CI green on push |
| **B — Sync endpoints** | `/api/sync/sessions` POST/GET/GET-by-id/DELETE, Device + SessionMeta ORM, Alembic migration, pytest coverage | `curl POST` + `curl GET` round-trips; pytest green |
| **C — Mac daemon** | `python -m hermes_sync.partner` works end-to-end; logs to stderr; README section | Daemon running on Mac pushes sessions; backend DB shows rows; visible in `/api/sync/sessions` GET |
| **D — Client integration** (separate spec) | `syncClient.ts`, store action, drawer renders remote sessions, `X-Device-Id` everywhere | Phone drawer shows Mac session titles |
| **E — Hardening** | Incremental `?since=`, exponential backoff in daemon, device heartbeat, README has launchd / systemd example | Pull the network on Mac → daemon reconnects automatically; phone sees new sessions after reconnect |

A + B are pure-backend. C requires Hermes running. D requires A+B+C
in production. E is forever.

## Testing Strategy

- **Unit tests** (`tests/test_sync.py`): each endpoint happy + sad
  paths. Use `pytest-asyncio` + `httpx.AsyncClient` with the FastAPI
  app and a tmp SQLite file.
- **Integration test** (one, in `tests/test_sync.py`): full round-trip
  — POST a list, GET it back, assert all fields preserved.
- **Contract test** (smoke): the same JSON schema FastAPI returns is
  what the client consumes. Validate in `test_sync.py` schema checks.
- **Daemon test** (later, in C): a mocked `httpx` client + a fixture
  Hermes server that returns canned sessions; assert the daemon
  transforms correctly.
- **No live Hermes in CI** — we mock at the daemon boundary.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Mac LAN IP changes (router reboot) | Phase E: heartbeat includes `hermes_url`; phone can re-discover via Phase 79 (existing) |
| Multiple Macs push for the same Hermes session_id | `id` is the PK; last write wins. Acceptable for V1. |
| SQLite locked under concurrent writes | SQLAlchemy + aiosqlite handle this; one writer at a time. Daemon polls at 5s; phone pulls at 30s — well below SQLite's limits. |
| Partner daemon crashes silently | V1: log to stderr + exit. Phase E: launchd / systemd restart. |
| CORS for browser (web variant of hermes-chat) | Backend CORS allowlist `*` for V1; tighten later |
| TLS / HTTPS for `/api/sync/sessions` | V1: deploy behind a TLS-terminating reverse proxy (Caddy, nginx). App code doesn't need to know. |

## Open Questions (None Blocking)

These can be decided later without redoing the design:

1. Should `device.platform` be a free-form string or enum? (V1: free-form)
2. Should we add a "device is alive" heartbeat table? (Phase E)
3. Should the phone be able to **delete** a session from the backend
   (when user deletes locally)? (V1: no — phone is read-only on backend;
   only Mac daemon can write. Phone-deleted local session is just gone
   locally.)

## What Changed Since Last Spec Iteration

(This section exists because this design went through 3 revisions in
chat. Recording the journey so future agents don't re-litigate.)

- **Rev 1** (rejected): I proposed a full chat / runs proxy
  ("全量反代"). The user pushed back: Hermes is on the user's machine,
  no need for an extra hop.
- **Rev 2** (rejected): I proposed `services/llm.py` with a mock LLM
  provider. The user pushed back twice: backend has no LLM, period.
- **Rev 3** (rejected): I proposed a pair-code authority on the
  backend. The user pushed back: pair is Phase 78b and lives on
  **Hermes** (per `src/lib/pairCode.ts:21-24` comment), not on this
  backend.
- **Rev 4 (this)**: Backend = cross-device session metadata catalog.
  Pure sync, no LLM, no chat, no pair. Confirmed with user.
