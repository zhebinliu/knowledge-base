import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AgentConfig(Base):
    __tablename__ = "agent_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    config_type: Mapped[str] = mapped_column(String(30), nullable=False)
    config_key: Mapped[str] = mapped_column(String(100), nullable=False)
    config_value: Mapped[dict] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        UniqueConstraint("config_type", "config_key", name="uq_config_type_key"),
    )
