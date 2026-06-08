"""Liveness probe — no DB, no auth."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str | int]:
    """Return 200 with current timestamp. No side effects."""
    import time
    return {"status": "ok", "ts": int(time.time() * 1000)}
