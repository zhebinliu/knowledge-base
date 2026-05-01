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
from models.user import User
from prompts.ltc_taxonomy import MODULE_TAGS, INDUSTRIES
from services.auth import get_current_user

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


def _project_dto(p: Project, doc_count: int = 0) -> dict:
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
    }


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
async def list_projects(session: AsyncSession = Depends(get_session)):
    # 一次拉项目 + 各项目文档数（LEFT JOIN GROUP BY）
    stmt = (
        select(Project, func.count(Document.id))
        .outerjoin(Document, Document.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [_project_dto(p, doc_count=cnt or 0) for p, cnt in rows]


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
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    return _project_dto(p, doc_count=cnt or 0)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
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
    _user: User = Depends(get_current_user),
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
    _user: User = Depends(get_current_user),
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
async def list_project_documents(project_id: str, session: AsyncSession = Depends(get_session)):
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
async def insight_checkup(project_id: str, session: AsyncSession = Depends(get_session)):
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
            ProjectBrief.output_kind == "insight_v2",
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
