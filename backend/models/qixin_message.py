"""企信 IM 消息表(2026-05-29 接入)。

每用户的 Bot 收发消息全部落这张表:
- direction='in'   :Gateway 推过来的(用户发给 Bot)
- direction='out'  :Bot 回发给 Gateway(Phase 2 启用)

按 user_id 隔离,顾问只能看到自己 Bot 收的消息。
按 chat_id 分组形成"会话",前端侧边栏按 chat_id 列表 + 时间线展示。
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class QixinMessage(Base):
    __tablename__ = "qixin_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # 哪个 Bot 用户的消息(跨用户隔离)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # 企信会话 id,Bot 回发时必须按这个发
    chat_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Gateway data.chat_type:"direct"(私聊)/ "group"(群聊),区分会话类型
    chat_type: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Gateway 推过来的原始 message_id,用于去重(同一条 history 会多次出现在不同 event 里)
    # 与 user_id 组成 partial unique 索引(NULL 时不参与约束,允许 out 消息 / 旧数据无 id)
    gateway_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Gateway 给的源用户 id(私聊就是对方,群聊是发言人)
    sender_user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # in = 用户发给 Bot;out = Bot 回发(Phase 2)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="in")

    # Phase 1 文本;富文本 / 图片 Phase 2
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Gateway 原始 event payload,排查问题用
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 消息时间(Gateway 给的就用 Gateway 的;没给用 created_at)
    ts: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        Index("idx_qixin_msg_user_chat_ts", "user_id", "chat_id", "ts"),
    )
