"""Health endpoint tests."""
from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["ts"], int)
    assert body["ts"] > 0
