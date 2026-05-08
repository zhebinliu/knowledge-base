"""项目库 API：CRUD + 项目下文档列表。"""
from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.document import Document
from models.project import DOC_TYPE_LABELS, DOC_TYPES, Project
from models.project_collaborator import ProjectCollaborator
from models.user import User
from prompts.ltc_taxonomy import MODULE_TAGS, INDUSTRIES
from services.auth import get_current_user
from services.project_acl import (
    require_project_access, list_accessible_project_ids,
)

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None
    customer_profile: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None
    customer_profile: str | None = None


def _project_dto(
    p: Project, doc_count: int = 0, my_role: str | None = None,
) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "customer": p.customer,
        "industry": p.industry,
        "modules": p.modules or [],
        "kickoff_date": p.kickoff_date.isoformat() if p.kickoff_date else None,
        "description": p.description,
        "customer_profile": p.customer_profile,
        "created_by": p.created_by,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "document_count": doc_count,
        # 当前用户对该项目的角色:owner / read_write / read / admin
        # 前端用于控制可写按钮 / 协作者管理入口
        "my_role": my_role,
    }


async def _resolve_my_role(user: User, p: Project) -> str:
    """返回当前用户对该项目的角色 — owner / read_write / read / admin / none。"""
    if getattr(user, "is_admin", False):
        return "admin"
    if p.created_by == user.id:
        return "owner"
    from services.project_acl import get_user_project_access
    access = await get_user_project_access(user, p.id)
    return access or "none"


def _validate_modules(modules: list[str] | None) -> list[str] | None:
    if modules is None:
        return None
    bad = [m for m in modules if m not in MODULE_TAGS]
    if bad:
        raise HTTPException(400, f"未知模块：{bad}（合法模块见 /api/projects/meta）")
    # 去重保序
    seen, out = set(), []
    for m in modules:
        if m not in seen:
            seen.add(m); out.append(m)
    return out


def _validate_industry(industry: str | None) -> str | None:
    if industry is None or industry == "":
        return None
    if industry not in INDUSTRIES:
        raise HTTPException(400, f"未知行业：{industry}")
    return industry


# ── Meta ─────────────────────────────────────────────────────────────────────

@router.get("/meta")
async def project_meta():
    """前端下拉用：合法模块 + 文档类型枚举 + 行业枚举。"""
    from prompts.ltc_taxonomy import INDUSTRY_TAGS
    return {
        "modules": list(MODULE_TAGS),
        "doc_types": [{"value": v, "label": DOC_TYPE_LABELS[v]} for v in DOC_TYPES],
        "industries": [{"value": k, "label": v} for k, v in INDUSTRY_TAGS.items()],
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_projects(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # 权限隔离:
    # - admin → 看到所有项目
    # - 普通用户 → 自己 owned 的 + 被加为协作者的(通过 list_accessible_project_ids 取并集)
    accessible_ids = await list_accessible_project_ids(user)  # None = 全部(admin)

    stmt = (
        select(Project, func.count(Document.id))
        .outerjoin(Document, Document.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )
    if accessible_ids is not None:
        if not accessible_ids:
            # 普通用户 + 一个项目都没权限 → 直接返回空,免一次 SQL
            return []
        stmt = stmt.where(Project.id.in_(accessible_ids))

    rows = (await session.execute(stmt)).all()
    # admin 全部 my_role='admin';owner 直接判断;其他批量查 collaborator
    if user.is_admin:
        return [_project_dto(p, doc_count=cnt or 0, my_role="admin") for p, cnt in rows]
    # owner / collaborator 双源:批量取一次 collaborator 表,避免 N+1
    own_ids = {p.id for p, _ in rows if p.created_by == user.id}
    coll_role: dict[str, str] = {}
    if rows:
        coll_rows = (await session.execute(
            select(ProjectCollaborator.project_id, ProjectCollaborator.role)
            .where(ProjectCollaborator.user_id == user.id)
            .where(ProjectCollaborator.project_id.in_([p.id for p, _ in rows]))
        )).all()
        for pid, role in coll_rows:
            coll_role[pid] = role
    out = []
    for p, cnt in rows:
        my = "owner" if p.id in own_ids else coll_role.get(p.id, "none")
        out.append(_project_dto(p, doc_count=cnt or 0, my_role=my))
    return out


@router.post("", status_code=201)
async def create_project(
    body: ProjectIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    modules = _validate_modules(body.modules)
    industry = _validate_industry(body.industry)
    p = Project(
        name=body.name.strip(),
        customer=(body.customer or "").strip() or None,
        industry=industry,
        modules=modules,
        kickoff_date=body.kickoff_date,
        description=body.description,
        customer_profile=body.customer_profile,
        created_by=user.id,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    logger.info("project_created", id=p.id, name=p.name, by=user.username)
    return _project_dto(p, doc_count=0)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("read")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    role = await _resolve_my_role(user, p)
    return _project_dto(p, doc_count=cnt or 0, my_role=role)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("write")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    if body.name is not None:
        p.name = body.name.strip()
    if body.customer is not None:
        p.customer = body.customer.strip() or None
    if body.industry is not None:
        p.industry = _validate_industry(body.industry)
    if body.modules is not None:
        p.modules = _validate_modules(body.modules)
    if body.kickoff_date is not None:
        p.kickoff_date = body.kickoff_date
    if body.description is not None:
        p.description = body.description
    if body.customer_profile is not None:
        p.customer_profile = body.customer_profile
    await session.commit()
    await session.refresh(p)
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    return _project_dto(p, doc_count=cnt or 0)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    cascade: bool = Query(False, description="true 时一并解除关联文档的 project_id（不删文档本身）"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("owner_only")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    ) or 0
    if cnt > 0 and not cascade:
        raise HTTPException(
            409,
            f"项目下还有 {cnt} 个文档；如需继续请加 ?cascade=true（仅解除关联，不删文档）",
        )
    if cnt > 0:
        # 解关联：把这些文档的 project_id 置空
        from sqlalchemy import update as sa_update
        await session.execute(
            sa_update(Document).where(Document.project_id == project_id).values(project_id=None)
        )
    await session.delete(p)
    await session.commit()
    return {"ok": True, "unlinked_documents": cnt}


# ── Documents under project ─────────────────────────────────────────────────

@router.post("/{project_id}/generate_profile")
async def generate_customer_profile(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("write")),
):
    """LLM 一次成稿生成客户画像草稿（不入库，返回字符串，前端确认后再 PATCH 写回）。"""
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")

    # 拉取已关联文档摘要（最多 5 份）作为上下文
    doc_rows = (await session.execute(
        select(Document.filename, Document.summary)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
        .limit(5)
    )).all()
    doc_ctx = "\n".join(
        f"- 《{fn}》：{(s or '')[:300]}" for fn, s in doc_rows if (s or "").strip()
    )

    from services.model_router import model_router

    system = """你是资深企业咨询顾问，正在为某客户撰写"客户画像"小节，给项目交付团队对齐认知。

【输出风格】
- 用 Markdown，长度 400–700 字
- 结构：① 公司速写（行业地位、规模、阶段）② 业务模式与增长动能 ③ 组织与决策风格 ④ 数字化成熟度 ⑤ 与本项目相关的关键诉求/痛点（结合 industry / 文档摘要推断）
- 数据缺失时用"信息缺失，建议在 Phase 1 第一周补访"标注，不要编造具体数字
- 不要 emoji、不要营销话术、不要一级标题（H1）
"""
    prompt = f"""客户名称：{p.customer or '—'}
项目名称：{p.name}
行业：{p.industry or '—'}
立项日期：{p.kickoff_date.isoformat() if p.kickoff_date else '—'}
项目描述：{p.description or '—'}

{f"【已关联文档摘要】{chr(10)}{doc_ctx}" if doc_ctx else "【已关联文档】无"}

请输出客户画像 Markdown 正文，不要包含项目名称作为标题。"""
    try:
        content, _model = await model_router.chat_with_routing(
            "doc_generation",
            [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            max_tokens=2000,
            timeout=120.0,
        )
    except Exception as e:
        logger.error("generate_profile_failed", project_id=project_id, error=str(e)[:200])
        raise HTTPException(502, f"画像生成失败：{str(e)[:120] or type(e).__name__}")

    return {"profile": (content or "").strip()}


@router.get("/{project_id}/documents")
async def list_project_documents(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    rows = (await session.execute(
        select(Document, User.username, User.full_name)
        .outerjoin(User, Document.uploader_id == User.id)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "original_format": d.original_format,
            "conversion_status": d.conversion_status,
            "doc_type": d.doc_type,
            "doc_type_label": DOC_TYPE_LABELS.get(d.doc_type) if d.doc_type else None,
            "uploader_id": d.uploader_id,
            "uploader_name": full_name or username,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        }
        for d, username, full_name in rows
    ]


# ── 项目洞察"先看体检"端点(规则化预 plan,不调 LLM) ─────────────────────────

@router.post("/{project_id}/insight-checkup")
async def insight_checkup(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    """生成前体检 — 跑 plan_insight 看每模块字段够不够、缺什么。

    100% 规则化,不调 LLM,响应 < 500ms。让 PM 在「开始生成」前知道
    哪些模块会成功 / 哪些信息不够,提前补,避免试错式生成。
    """
    from models.project_brief import ProjectBrief
    from services.agentic.planner import plan_insight

    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    # Brief 字段(若有)
    brief_row = (await session.execute(
        select(ProjectBrief).where(
            ProjectBrief.project_id == project_id,
            ProjectBrief.output_kind == "insight",
        )
    )).scalar_one_or_none()
    brief_fields = (brief_row.fields or {}) if brief_row else {}

    # docs_by_type:已完成转换的项目文档
    doc_rows = (await session.execute(
        select(Document.id, Document.filename, Document.doc_type,
               Document.summary, Document.markdown_content)
        .where(Document.project_id == project_id)
        .where(Document.conversion_status == "completed")
    )).all()
    docs_by_type: dict[str, list[dict]] = {}
    for r in doc_rows:
        if not r.doc_type:
            continue
        docs_by_type.setdefault(r.doc_type, []).append({
            "doc_id": r.id, "filename": r.filename,
            "summary": (r.summary or "")[:600],
            "markdown": (r.markdown_content or ""),
        })

    # has_conversation 简化(影响 conversation source 字段是否可解析)
    # 这里只看 OutputConversation 表是否有该项目的对话(粗略)
    from models.output_conversation import OutputConversation
    conv_count = (await session.execute(
        select(func.count(OutputConversation.id)).where(
            OutputConversation.project_id == project_id,
        )
    )).scalar() or 0
    has_conversation = conv_count > 0

    plan = plan_insight(
        project=project, industry=project.industry,
        brief_fields=brief_fields, has_conversation=has_conversation,
        docs_by_type=docs_by_type,
    )

    # 简化输出 — 给前端易消费
    docs_total = sum(len(v) for v in docs_by_type.values())
    return {
        "industry": plan.industry,
        "sufficient_critical": plan.sufficient_critical,
        "modules": [
            {
                "key": m.key,
                "title": m.title,
                "necessity": m.necessity,
                "status": m.status,         # ready / blocked / skipped
                "reason": m.reason,
                "fields": [
                    {
                        "key": fk,
                        "label": fs.label,
                        "status": fs.status,        # available / deferred / missing
                        "source": fs.source,
                        "note": fs.note,
                    }
                    for fk, fs in m.fields.items()
                ],
            }
            for m in plan.modules
        ],
        "gap_actions": [
            {
                "module_key": g.module_key,
                "field_key": g.field_key,
                "field_label": g.field_label,
                "module_title": g.module_title,
                "necessity": g.necessity,
                "action": g.action,            # kb_search / web_search / ask_user / downgrade
                "detail": g.detail,
                "required": g.required,
            }
            for g in plan.gap_actions
        ],
        "stats": {
            "ready_n": sum(1 for m in plan.modules if m.status == "ready"),
            "blocked_n": sum(1 for m in plan.modules if m.status == "blocked"),
            "skipped_n": sum(1 for m in plan.modules if m.status == "skipped"),
            "ask_user_n": sum(1 for g in plan.gap_actions if g.action == "ask_user"),
            "kb_search_n": sum(1 for g in plan.gap_actions if g.action == "kb_search"),
            "docs_total": docs_total,
            "brief_fields_n": len(brief_fields),
            "has_conversation": has_conversation,
        },
    }


# ── 协作者 CRUD ──────────────────────────────────────────────────────────────
# Owner / read_write 协作者 / admin 可加/移除/改角色;read 协作者只能列。
# 不允许把 owner 自己加为协作者(owner 关系由 Project.created_by 表达)。

from models.project_collaborator import ProjectCollaborator, VALID_ROLES, ROLE_READ_WRITE  # noqa: E402


class CollaboratorAddBody(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)
    role: str = Field(default="read", pattern="^(read|read_write)$")


class CollaboratorPatchBody(BaseModel):
    role: str = Field(pattern="^(read|read_write)$")


def _collaborator_dto(c: ProjectCollaborator, u: User | None) -> dict:
    return {
        "id": c.id,
        "project_id": c.project_id,
        "user_id": c.user_id,
        "username": u.username if u else None,
        "full_name": u.full_name if u else None,
        "email": u.email if u else None,
        "role": c.role,
        "created_by": c.created_by,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


@router.get("/{project_id}/collaborators")
async def list_collaborators(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    """返回 owner + 全部协作者(便于前端显示一张「成员」表)。"""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    owner_user = None
    if project.created_by:
        owner_user = await session.get(User, project.created_by)

    rows = (await session.execute(
        select(ProjectCollaborator, User)
        .outerjoin(User, ProjectCollaborator.user_id == User.id)
        .where(ProjectCollaborator.project_id == project_id)
        .order_by(ProjectCollaborator.created_at.asc())
    )).all()

    return {
        "owner": {
            "user_id": project.created_by,
            "username": owner_user.username if owner_user else None,
            "full_name": owner_user.full_name if owner_user else None,
            "email": owner_user.email if owner_user else None,
        } if project.created_by else None,
        "collaborators": [_collaborator_dto(c, u) for c, u in rows],
    }


@router.post("/{project_id}/collaborators", status_code=201)
async def add_collaborator(
    project_id: str,
    body: CollaboratorAddBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    target = await session.get(User, body.user_id)
    if not target:
        raise HTTPException(404, "目标用户不存在")
    if not target.is_active:
        raise HTTPException(400, "目标用户已禁用,不能加为协作者")

    # 不能把 owner 自己加进 collaborators
    if project.created_by and target.id == project.created_by:
        raise HTTPException(400, "项目所有者不能加为协作者")

    # 已存在 → 直接返回(幂等)或 409?这里返回 409 让前端提示「该用户已是协作者」
    existing = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == body.user_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "该用户已经是项目协作者(可改角色,不需要重新添加)")

    coll = ProjectCollaborator(
        project_id=project_id,
        user_id=body.user_id,
        role=body.role if body.role in VALID_ROLES else "read",
        created_by=user.id,
    )
    session.add(coll)
    await session.commit()
    await session.refresh(coll)
    logger.info("collaborator_added", project_id=project_id,
                user_id=body.user_id, role=coll.role, by=user.username)
    return _collaborator_dto(coll, target)


@router.patch("/{project_id}/collaborators/{user_id}")
async def update_collaborator_role(
    project_id: str,
    user_id: str,
    body: CollaboratorPatchBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    coll = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "协作者不存在")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"非法角色 {body.role}")
    coll.role = body.role
    await session.commit()
    await session.refresh(coll)
    target = await session.get(User, user_id)
    logger.info("collaborator_role_changed", project_id=project_id,
                user_id=user_id, role=coll.role, by=user.username)
    return _collaborator_dto(coll, target)


@router.delete("/{project_id}/collaborators/{user_id}")
async def remove_collaborator(
    project_id: str,
    user_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    coll = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "协作者不存在")
    await session.delete(coll)
    await session.commit()
    logger.info("collaborator_removed", project_id=project_id,
                user_id=user_id, by=user.username)
    return {"ok": True}


# ── 用户搜索(供「加协作者」下拉) — 任何登录用户可调,但只返回必要字段 ────────

@router.get("/_/users/search")
async def search_users(
    q: str = Query(..., min_length=1, max_length=64),
    limit: int = Query(default=10, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    """按 username / email / full_name 模糊搜活跃用户,只返回 id+username+full_name+email。"""
    from sqlalchemy import or_ as sa_or
    pattern = f"%{q.strip()}%"
    rows = (await session.execute(
        select(User)
        .where(User.is_active == True)  # noqa: E712
        .where(sa_or(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
            User.full_name.ilike(pattern),
        ))
        .order_by(User.username.asc())
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": u.id, "username": u.username,
            "full_name": u.full_name, "email": u.email,
        } for u in rows
    ]
