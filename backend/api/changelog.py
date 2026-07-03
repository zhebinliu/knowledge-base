"""平台更新日志(changelog)API — 2026-07-03。

对外只读:
  GET /api/public/changelog          列表(X-API-Key 鉴权)
  GET /api/public/changelog/latest   最新一条(方便集成)
  GET /api/public/changelog/{id}     详情

内部维护(需要 admin JWT):
  POST   /api/admin/changelog                创建(默认草稿)
  PUT    /api/admin/changelog/{id}           编辑
  DELETE /api/admin/changelog/{id}           删除
  POST   /api/admin/changelog/{id}/publish   发布(is_published=true + published_at=now)
  POST   /api/admin/changelog/{id}/unpublish 下线
  GET    /api/admin/changelog                列表(含草稿)

鉴权复用现有能力:
- 对外 API Key:直接用 users.mcp_api_key(mcp_ 前缀)+ users.api_enabled 开关,
  校验逻辑参考 api/mcp.py:1007-1024;通过 X-API-Key 请求头传入。
- Admin CRUD:走 get_current_user + is_admin,参考 api/admin_invite_codes.py。

调用日志:main.py 的 log_api_calls middleware 会自动落 ApiCallLog,不需要额外埋点。
"""
from typing import Literal
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.user import User
from models.changelog_entry import ChangelogEntry
from services.auth import get_current_user
from services.rate_limit import limiter
from services._time import iso_utc, utcnow_naive

logger = structlog.get_logger()

# 两个 router:public 走 /api/public/changelog,admin 走 /api/admin/changelog
public_router = APIRouter()
admin_router = APIRouter()

VALID_CATEGORIES = ("feature", "fix", "improvement", "breaking", "security")


# ── DTO ──────────────────────────────────────────────────────────────────────

def _to_dto(e: ChangelogEntry, *, include_draft_fields: bool = False) -> dict:
    d = {
        "id": e.id,
        "version": e.version,
        "title": e.title,
        "content_md": e.content_md,
        "category": e.category,
        "tags": e.tags or [],
        "published_at": iso_utc(e.published_at),
    }
    if include_draft_fields:
        d.update({
            "is_published": e.is_published,
            "author_id": e.author_id,
            "author_name": e.author_name,
            "created_at": iso_utc(e.created_at),
            "updated_at": iso_utc(e.updated_at),
        })
    return d


# ── 对外 API Key 校验 ────────────────────────────────────────────────────────
# 复用 users.mcp_api_key,不新建 api_keys 表。逻辑抄自 api/mcp.py:1007-1024。

async def _authenticate_api_key(
    x_api_key: str | None,
    session: AsyncSession,
) -> User:
    if not x_api_key:
        raise HTTPException(401, "缺少 X-API-Key 请求头")
    if not x_api_key.startswith("mcp_"):
        raise HTTPException(401, "无效的 API Key 格式(须以 mcp_ 开头)")
    user = await session.scalar(select(User).where(User.mcp_api_key == x_api_key))
    if not user or not user.is_active:
        raise HTTPException(401, "无效的 API Key")
    if not user.api_enabled:
        raise HTTPException(403, "该 API Key 未被授权调用(请联系管理员开启 api_enabled)")
    return user


# ── 对外只读端点 ────────────────────────────────────────────────────────────

@public_router.get("/changelog")
@limiter.limit("60/minute")
async def public_list_changelog(
    request: Request,
    category: str | None = Query(None, description="按 category 过滤"),
    tag: str | None = Query(None, description="按 tag 过滤(单个)"),
    since: str | None = Query(None, description="ISO8601,只返回 published_at >= since 的条目"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_session),
):
    caller = await _authenticate_api_key(x_api_key, session)

    stmt = select(ChangelogEntry).where(ChangelogEntry.is_published == True)  # noqa: E712
    if category:
        stmt = stmt.where(ChangelogEntry.category == category)
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            # 存的是 naive UTC,比较前脱 tzinfo
            if since_dt.tzinfo is not None:
                since_dt = since_dt.astimezone(tz=None).replace(tzinfo=None)
            stmt = stmt.where(ChangelogEntry.published_at >= since_dt)
        except ValueError:
            raise HTTPException(400, "since 参数不是合法 ISO8601 时间")

    total = await session.scalar(
        select(func.count()).select_from(stmt.subquery())
    )
    stmt = stmt.order_by(desc(ChangelogEntry.published_at)).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()

    items = [_to_dto(r) for r in rows]
    # tag 过滤放到内存里做:JSON 数组的 SQL 过滤跨库不通用(PG jsonb / SQLite JSON1)
    if tag:
        items = [it for it in items if tag in (it.get("tags") or [])]

    logger.info("public_changelog_list", caller=caller.username, count=len(items), total=total)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "next_offset": (offset + limit) if (offset + limit) < (total or 0) else None,
    }


@public_router.get("/changelog/latest")
@limiter.limit("60/minute")
async def public_latest_changelog(
    request: Request,
    category: str | None = Query(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_session),
):
    await _authenticate_api_key(x_api_key, session)
    stmt = select(ChangelogEntry).where(ChangelogEntry.is_published == True)  # noqa: E712
    if category:
        stmt = stmt.where(ChangelogEntry.category == category)
    stmt = stmt.order_by(desc(ChangelogEntry.published_at)).limit(1)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "暂无已发布的更新")
    return _to_dto(row)


@public_router.get("/changelog/{entry_id}")
@limiter.limit("60/minute")
async def public_get_changelog(
    request: Request,
    entry_id: str,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_session),
):
    await _authenticate_api_key(x_api_key, session)
    row = await session.get(ChangelogEntry, entry_id)
    if not row or not row.is_published:
        raise HTTPException(404, "条目不存在或未发布")
    return _to_dto(row)


# ── Admin CRUD ──────────────────────────────────────────────────────────────

def _ensure_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(403, "仅管理员可维护更新日志")


class ChangelogIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content_md: str = ""
    category: Literal["feature", "fix", "improvement", "breaking", "security"] = "feature"
    version: str | None = Field(default=None, max_length=40)
    tags: list[str] | None = None


class ChangelogPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content_md: str | None = None
    category: Literal["feature", "fix", "improvement", "breaking", "security"] | None = None
    version: str | None = Field(default=None, max_length=40)
    tags: list[str] | None = None


@admin_router.get("/changelog")
async def admin_list_changelog(
    include_drafts: bool = Query(True),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    stmt = select(ChangelogEntry)
    if not include_drafts:
        stmt = stmt.where(ChangelogEntry.is_published == True)  # noqa: E712
    stmt = stmt.order_by(desc(ChangelogEntry.created_at)).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return {"items": [_to_dto(r, include_draft_fields=True) for r in rows]}


@admin_router.post("/changelog")
async def admin_create_changelog(
    payload: ChangelogIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    e = ChangelogEntry(
        title=payload.title,
        content_md=payload.content_md or "",
        category=payload.category,
        version=payload.version,
        tags=payload.tags,
        author_id=user.id,
        author_name=user.username,
        is_published=False,
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    logger.info("changelog_created", entry_id=e.id, by=user.username, title=e.title)
    return _to_dto(e, include_draft_fields=True)


@admin_router.put("/changelog/{entry_id}")
async def admin_update_changelog(
    entry_id: str,
    payload: ChangelogPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    e = await session.get(ChangelogEntry, entry_id)
    if not e:
        raise HTTPException(404, "条目不存在")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(e, k, v)
    await session.commit()
    await session.refresh(e)
    logger.info("changelog_updated", entry_id=e.id, by=user.username, fields=list(data.keys()))
    return _to_dto(e, include_draft_fields=True)


@admin_router.delete("/changelog/{entry_id}")
async def admin_delete_changelog(
    entry_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    e = await session.get(ChangelogEntry, entry_id)
    if not e:
        raise HTTPException(404, "条目不存在")
    await session.delete(e)
    await session.commit()
    logger.info("changelog_deleted", entry_id=entry_id, by=user.username)
    return {"ok": True}


@admin_router.post("/changelog/{entry_id}/publish")
async def admin_publish_changelog(
    entry_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    e = await session.get(ChangelogEntry, entry_id)
    if not e:
        raise HTTPException(404, "条目不存在")
    e.is_published = True
    if not e.published_at:
        e.published_at = utcnow_naive()
    await session.commit()
    await session.refresh(e)
    logger.info("changelog_published", entry_id=e.id, by=user.username)
    return _to_dto(e, include_draft_fields=True)


@admin_router.post("/changelog/{entry_id}/unpublish")
async def admin_unpublish_changelog(
    entry_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    _ensure_admin(user)
    e = await session.get(ChangelogEntry, entry_id)
    if not e:
        raise HTTPException(404, "条目不存在")
    e.is_published = False
    await session.commit()
    await session.refresh(e)
    logger.info("changelog_unpublished", entry_id=e.id, by=user.username)
    return _to_dto(e, include_draft_fields=True)
