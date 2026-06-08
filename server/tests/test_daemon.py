"""Daemon tests — focus on transform_for_backend (pure function) and run_once with mocks."""
import time
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

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


def test_end_to_end_daemon_pushes_into_backend(client: TestClient) -> None:
    """Spin up a fake Hermes on a local port, run one daemon cycle, assert backend has the rows."""
    import threading
    import http.server
    import socketserver
    import json
    from hermes_sync.partner.daemon import _HermesClient, run_once

    fake_sessions = [
        {"id": "s1", "title": "From Fake Hermes", "created_at": 1, "updated_at": 2, "message_count": 3},
        {"id": "s2", "title": "Another", "created_at": 3, "updated_at": 4, "message_count": 0,
         "messages": [{"role": "user", "content": "hello world"}]},
    ]
    body = json.dumps(fake_sessions).encode()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            if self.path == "/api/sessions":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()
        def log_message(self, format, *args):  # noqa: A002
            pass

    import uvicorn
    import socket
    with socketserver.TCPServer(("127.0.0.1", 0), Handler) as httpd:
        port = httpd.server_address[1]
        host = f"http://127.0.0.1:{port}"
        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()

        backend_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        backend_sock.bind(("127.0.0.1", 0))
        backend_sock.listen()
        backend_port = backend_sock.getsockname()[1]
        config = uvicorn.Config(
            client.app, fd=backend_sock.fileno(), log_level="warning"
        )
        server = uvicorn.Server(config)
        backend_thread = threading.Thread(target=server.run, daemon=True)
        backend_thread.start()
        # wait for uvicorn to start
        for _ in range(50):
            if server.started:
                break
            time.sleep(0.02)
        backend_url = f"http://127.0.0.1:{backend_port}"

        hermes = _HermesClient(host)
        try:
            ok = run_once(hermes, backend_url, device_id="mac-fake", device_name="Fake")
        finally:
            hermes.close()
        assert ok is True
        httpd.shutdown()
        server.should_exit = True
        server_thread.join()
        backend_thread.join()
        backend_sock.close()

    res = client.get("/api/sync/sessions").json()
    assert {s["id"] for s in res["sessions"]} == {"s1", "s2"}
    s2 = next(s for s in res["sessions"] if s["id"] == "s2")
    assert s2["preview"] == "hello world"
