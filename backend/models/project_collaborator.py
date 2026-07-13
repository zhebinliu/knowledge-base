"""项目协作者表 — 记录除 owner(Project.created_by)外其他人对项目的访问权限。

权限模型(2026-05-08 落地):
- owner(Project.created_by):全部权限,包括转让 owner / 删项目
- read_write 协作者:跟 owner 几乎平权,**仅不能**删项目 / 转让 owner;可加/移除其他协作者
- read 协作者:只读,不能改任何内容
- admin(User.is_admin):跳过所有检查,等价 owner

逻辑约束:
- (project_id, user_id)唯一(同一个用户不能在同一项目里挂两个角色)
- 不允许把 owner 自己加进 collaborators 表(owner 关系由 Project.created_by 表达)
- 删项目时 ON DELETE CASCADE 清理协作者记录
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from models import Base
from services._time import utcnow_naive as _utcnow


# 角色常量(访问权限)
ROLE_READ = "read"
ROLE_READ_WRITE = "read_write"
VALID_ROLES = (ROLE_READ, ROLE_READ_WRITE)

# 项目角色分类(Harness P3/P4,与访问权限正交):pm=项目经理 / consultant=顾问 / customer=客户
PROJECT_ROLES = ("pm", "consultant", "customer")


class ProjectCollaborator(Base):
    __tablename__ = "project_collaborators"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # 'read' | 'read_write'
    # 项目角色分类(pm/consultant/customer),可空;与 role 访问权限正交(2026-07-13 Harness)
    project_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # 谁加的协作者(审计)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_collaborator"),
        Index("idx_project_collaborator_user", "user_id"),
    )
