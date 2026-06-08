"""Mac-side daemon. Polls Hermes, pushes session list to the backend.

Invoked as: `python -m hermes_sync.partner`
Or:        `hermes-sync-partner` (installed console script)
"""
from __future__ import annotations

import argparse
import logging
import os
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
    except Exception as e:
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
    except Exception as e:
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


if __name__ == "__main__":
    raise SystemExit(main())
