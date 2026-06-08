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
