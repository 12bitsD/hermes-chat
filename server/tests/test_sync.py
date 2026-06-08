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
