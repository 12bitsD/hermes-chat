"""Sync endpoint tests."""
import time
from fastapi.testclient import TestClient


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
    res = client.get("/api/sync/sessions?limit=2").json()
    assert len(res["sessions"]) == 2
    midpoint = now - 5 * 1000
    res = client.get(f"/api/sync/sessions?since={midpoint}").json()
    assert res["sessions"] == []
    midpoint = now - 7500
    res = client.get(f"/api/sync/sessions?since={midpoint}").json()
    ids = {s["id"] for s in res["sessions"]}
    assert ids == {"s3", "s4"}


# Re-added from Task 9 (was deferred):
def test_post_sync_deletes_removed_sessions(client: TestClient) -> None:
    body1 = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [
            {"id": "s1", "created_at": 1, "updated_at": 2, "message_count": 0},
            {"id": "s2", "created_at": 3, "updated_at": 4, "message_count": 0},
        ],
    }
    assert client.post("/api/sync/sessions", json=body1, headers={"X-Device-Id": "mac-1"}).status_code == 204
    body2 = {
        "device": {"id": "mac-1", "platform": "macos"},
        "sessions": [{"id": "s1", "created_at": 1, "updated_at": 99, "message_count": 7}],
    }
    assert client.post("/api/sync/sessions", json=body2, headers={"X-Device-Id": "mac-1"}).status_code == 204
    listing = client.get("/api/sync/sessions").json()
    ids = {s["id"] for s in listing["sessions"]}
    assert ids == {"s1"}


def test_post_sync_isolates_by_device(client: TestClient) -> None:
    """Mac-A pushes s1; Mac-B pushes s1 with different content; in V1 last-writer-wins on device_id."""
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
    s = listing["sessions"][0]
    assert s["device_id"] == "mac-b"
    assert s["message_count"] == 9


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
