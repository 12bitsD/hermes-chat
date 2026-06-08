"""Pydantic v2 request/response shapes."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── Device ────────────────────────────────────────────────────────────

class DeviceIn(BaseModel):
    """Device descriptor sent in POST body."""
    id: str = Field(..., min_length=1, max_length=128)
    name: Optional[str] = Field(None, max_length=200)
    platform: str = Field(..., min_length=1, max_length=32)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: Optional[str]
    platform: str


# ─── Session ───────────────────────────────────────────────────────────

class SessionIn(BaseModel):
    """One session as the daemon posts it."""
    id: str = Field(..., min_length=1, max_length=128)
    title: Optional[str] = Field(None, max_length=500)
    created_at: int
    updated_at: int
    message_count: int = Field(0, ge=0)
    preview: Optional[str] = Field(None, max_length=500)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    device_id: str
    device_name: Optional[str] = None
    title: Optional[str]
    created_at: int
    updated_at: int
    message_count: int
    preview: Optional[str]
    synced_at: int


# ─── Sync payload ──────────────────────────────────────────────────────

class SyncPushIn(BaseModel):
    """Full POST body for /api/sync/sessions."""
    device: DeviceIn
    sessions: list[SessionIn] = Field(default_factory=list)


class SyncPullOut(BaseModel):
    """GET /api/sync/sessions response."""
    sessions: list[SessionOut]
    server_ts: int
