"""/api/sync/* — session metadata catalog endpoints."""
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from hermes_sync.deps import db_session, require_device_id
from hermes_sync.models import Device, SessionMeta
from hermes_sync.schemas import SyncPushIn

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def push_sessions(
    payload: SyncPushIn,
    device_id: str = Depends(require_device_id),
    session: AsyncSession = Depends(db_session),
) -> None:
    """Mac daemon pushes the full list of its sessions. Upserts + deletes diffs."""
    if payload.device.id != device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id must match body device.id")
    now = int(time.time() * 1000)

    # 1) Upsert device
    existing_device = await session.get(Device, device_id)
    if existing_device is None:
        session.add(Device(
            id=device_id,
            name=payload.device.name,
            platform=payload.device.platform,
            first_seen_at=now,
            last_seen_at=now,
        ))
    else:
        existing_device.name = payload.device.name
        existing_device.platform = payload.device.platform
        existing_device.last_seen_at = now

    # 2) Upsert sessions
    incoming_ids = {s.id for s in payload.sessions}
    for s in payload.sessions:
        stmt = sqlite_insert(SessionMeta).values(
            id=s.id,
            device_id=device_id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
            message_count=s.message_count,
            preview=s.preview,
            synced_at=now,
        ).on_conflict_do_update(
            index_elements=[SessionMeta.id],
            set_={
                "device_id": device_id,
                "title": s.title,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "message_count": s.message_count,
                "preview": s.preview,
                "synced_at": now,
            },
        )
        await session.execute(stmt)

    # 3) Delete sessions that disappeared from this device's payload.
    existing_rows = (await session.execute(
        select(SessionMeta.id).where(SessionMeta.device_id == device_id)
    )).scalars().all()
    for existing_id in existing_rows:
        if existing_id not in incoming_ids:
            await session.delete(await session.get(SessionMeta, existing_id))

    await session.commit()
