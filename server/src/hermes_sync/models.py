"""SQLAlchemy 2.0 ORM models."""
from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Device(Base):
    """A device that pushes or pulls sessions. Created lazily on first POST."""
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    platform: Mapped[str] = mapped_column(String)
    first_seen_at: Mapped[int] = mapped_column(Integer)
    last_seen_at: Mapped[int] = mapped_column(Integer)


class SessionMeta(Base):
    """Cross-device session metadata. The session content lives in Hermes."""
    __tablename__ = "session_meta"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    device_id: Mapped[str] = mapped_column(String, ForeignKey("devices.id"))
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[int] = mapped_column(Integer)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    preview: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    synced_at: Mapped[int] = mapped_column(Integer)

    device: Mapped["Device"] = relationship("Device", lazy="joined")

    __table_args__ = (
        Index("ix_session_meta_updated_at", "updated_at"),
        Index("ix_session_meta_device_id", "device_id"),
    )
