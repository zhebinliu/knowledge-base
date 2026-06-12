"""交付物公开分享表 — 给单个 curated_bundle 生成「免登录只读」公开链接。

设计要点(2026-06-12):
- 一个 bundle 一条分享记录(bundle_id 唯一);「重新生成」= 换 share_token。
- share_token 随机不可猜(secrets.token_urlsafe),即免登录访问凭证。
- enabled 开关 = 「关闭分享 / 撤销」:置 false 后公开链接立即失效,记录保留(可再开)。
- 只读:公开端点只渲染只读 HTML,绝不暴露下载 / 编辑 / 保存 / 列表。
- 仅允许「客户向」交付物 kind 分享(白名单 PUBLIC_SHAREABLE_KINDS 在 api 层双重校验)。
- 删除 CuratedBundle 时 ON DELETE CASCADE 一起清掉。
"""
from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from models import Base
from services._time import utcnow_naive as _utcnow


class BundleShare(Base):
    __tablename__ = "bundle_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bundle_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("curated_bundles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    share_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("bundle_id", name="uq_bundle_share_bundle"),
        Index("idx_bundle_share_token", "share_token"),
    )

    def __repr__(self) -> str:
        return f"<BundleShare bundle_id={self.bundle_id!r} enabled={self.enabled}>"
