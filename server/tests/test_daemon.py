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
        {"session_id": "s2", "title": "B", "created_at": 1, "updated_at": 2},
        {"title": "C"},
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
