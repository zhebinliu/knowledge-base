"""项目权限访问控制(ACL)— 统一所有 project_id 端点的权限校验入口。

权限级别(从低到高):
- read:任何 collaborator(read 或 read_write) / owner / admin
- write:read_write collaborator / owner / admin
- owner_only:owner / admin(用于删项目 / 转让 owner 等)

使用方式:
    from services.project_acl import require_project_access

    @router.get("/projects/{project_id}/something",
                dependencies=[Depends(require_project_access("read"))])
    async def get_something(project_id: str): ...

    @router.delete("/projects/{project_id}",
                   dependencies=[Depends(require_project_access("owner_only"))])
    async def delete_project(project_id: str): ...

或直接在 endpoint 函数里:
    user = Depends(require_project_access("write"))

依赖会自动:
1. 解析 path 里的 project_id
2. 校验当前用户对该项目的权限是否 ≥ 要求级别
3. 失败:404(项目不存在或无权访问)/ 403(权限不足)
4. 成功:返回当前 User 对象
"""
from __future__ import annotations

from typing import Literal
from fastapi import Depends, HTTPException, Path
from sqlalchemy import select, or_

from models import async_session_maker
from models.project import Project
from models.project_collaborator import ProjectCollaborator, ROLE_READ_WRITE
from models.user import User
from services.auth import get_current_user


AccessLevel = Literal["owner", "read_write", "read"]
RequiredLevel = Literal["read", "write", "owner_only"]


async def get_user_project_access(
    user: User, project_id: str
) -> AccessLevel | None:
    """返回用户对指定项目的访问级别。
    - admin 等价 owner(可改 / 可删 / 可加协作者)
    - 项目不存在或用户无任何关系 → None
    """
    if not project_id:
        return None
    if getattr(user, "is_admin", False):
        # admin 直接 owner 等价(项目存在性下面会查一次)
        async with async_session_maker() as s:
            project = await s.get(Project, project_id)
            return "owner" if project else None

    async with async_session_maker() as s:
        project = await s.get(Project, project_id)
        if not project:
            return None
        if project.created_by == user.id:
            return "owner"
        coll = (await s.execute(
            select(ProjectCollaborator).where(
                ProjectCollaborator.project_id == project_id,
                ProjectCollaborator.user_id == user.id,
            )
        )).scalar_one_or_none()
        if coll:
            return "read_write" if coll.role == ROLE_READ_WRITE else "read"
        return None


def _level_meets(actual: AccessLevel, required: RequiredLevel) -> bool:
    if required == "read":
        return actual in ("owner", "read_write", "read")
    if required == "write":
        return actual in ("owner", "read_write")
    if required == "owner_only":
        return actual == "owner"
    return False


def require_project_access(level: RequiredLevel = "read"):
    """FastAPI Depends 工厂。返回的依赖函数会:
    1. 从 path 拿 project_id
    2. 调用 get_current_user 拿当前用户
    3. 检查 access level
    4. 失败 → 404 / 403;成功 → 返回 User
    """
    async def dep(
        project_id: str = Path(...),
        user: User = Depends(get_current_user),
    ) -> User:
        access = await get_user_project_access(user, project_id)
        if access is None:
            # 不区分「不存在」vs「无权」,统一 404 避免侧信道
            raise HTTPException(404, "项目不存在或无权访问")
        if not _level_meets(access, level):
            need = {"read": "读", "write": "读写", "owner_only": "项目所有者"}[level]
            raise HTTPException(403, f"权限不足:本操作需要「{need}」权限")
        return user

    return dep


async def assert_project_access(
    user: User, project_id: str, level: RequiredLevel = "read"
) -> None:
    """Inline 版权限校验 — 用于 project_id 不在 path(在 body / query)的 endpoint。
    使用:
        await assert_project_access(user, body.project_id, "write")
    失败 → 抛 HTTPException;成功 → 静默返回。
    """
    if not project_id:
        raise HTTPException(400, "缺 project_id")
    access = await get_user_project_access(user, project_id)
    if access is None:
        raise HTTPException(404, "项目不存在或无权访问")
    if not _level_meets(access, level):
        need = {"read": "读", "write": "读写", "owner_only": "项目所有者"}[level]
        raise HTTPException(403, f"权限不足:本操作需要「{need}」权限")


async def list_accessible_project_ids(user: User) -> list[str] | None:
    """返回当前用户能访问的项目 id 列表。
    - admin 返回 None(代表「全部」,调用方据此跳过 WHERE 过滤)
    - 普通用户:owned + collaborators 联合
    """
    if getattr(user, "is_admin", False):
        return None

    async with async_session_maker() as s:
        # owned
        owned_ids = (await s.execute(
            select(Project.id).where(Project.created_by == user.id)
        )).scalars().all()
        # collaborator
        coll_ids = (await s.execute(
            select(ProjectCollaborator.project_id).where(
                ProjectCollaborator.user_id == user.id
            )
        )).scalars().all()
        return list(set(owned_ids) | set(coll_ids))
