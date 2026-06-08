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
