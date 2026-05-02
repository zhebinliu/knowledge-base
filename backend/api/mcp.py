"""
MCP (Model Context Protocol) — Streamable HTTP transport
POST /api/mcp

Implements the 2024-11-05 spec:
  https://spec.modelcontextprotocol.io/specification/2024-11-05/

Supported methods:
  initialize   – handshake
  tools/list   – enumerate available tools
  tools/call   – invoke ask_kb or search_kb
  ping         – health-check
"""

import json

import jwt
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, func as sa_func

from agents.kb_agent import answer_question
from config import settings
from models import async_session_maker
from models.project import Project
from models.document import Document
from models.user import User
from services.embedding_service import embedding_service
from services.vector_store import vector_store
from services.call_log_service import log_call

logger = structlog.get_logger()
router = APIRouter()

MCP_VERSION = "2024-11-05"
SERVER_INFO = {"name": "kb-system-mcp", "version": "1.0.0"}

# ── Tool schemas ──────────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "ask_kb",
        "description": (
            "向纷享销客 CRM 实施知识库提问，返回基于文档的 RAG 答案与来源引用。\n"
            "两种模式：\n"
            "• 通用模式（默认）：检索全库，回答事实/方法论类问题\n"
            "• 项目经理模式（persona=pm + project）：以指定项目的 PM 视角回答，"
            "回答带状态/下一步/风险等项目管理结构化分析，仅检索该项目的文档\n"
            "使用前若不知道有哪些项目，先调 list_projects。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "要询问的问题，支持中文自然语言",
                },
                "persona": {
                    "type": "string",
                    "description": "回答视角。general=通用实施顾问；pm=虚拟项目经理（需配合 project 使用）",
                    "enum": ["general", "pm"],
                    "default": "general",
                },
                "project": {
                    "type": "string",
                    "description": (
                        "项目标识（ID 或名称）。persona=pm 时必填，"
                        "优先按 ID 精确匹配，匹配不到按名称模糊匹配（大小写不敏感）。"
                    ),
                },
                "ltc_stage": {
                    "type": "string",
                    "description": "可选：按 LTC 销售阶段过滤检索范围",
                    "enum": ["线索", "商机", "报价", "合同", "回款", "售后"],
                },
            },
            "required": ["question"],
        },
    },
    {
        "name": "search_kb",
        "description": (
            "在知识库中语义向量检索，返回原始知识切片列表。\n"
            "适用场景：需要获取原文引用、对多个来源做二次分析、检查某主题的覆盖情况。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "检索查询语句",
                },
                "top_k": {
                    "type": "integer",
                    "description": "返回结果数量（默认 5，最大 20）",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 20,
                },
                "ltc_stage": {
                    "type": "string",
                    "description": "可选：按 LTC 阶段过滤",
                    "enum": ["线索", "商机", "报价", "合同", "回款", "售后"],
                },
                "project": {
                    "type": "string",
                    "description": "可选：限定到特定项目的文档（ID 或名称）",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_projects",
        "description": (
            "列出所有项目（ID、名称、客户、行业、文档数）。\n"
            "通常在使用 persona=pm 之前调用以获取有效的 project 参数。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "可选：按名称/客户模糊过滤（大小写不敏感）",
                },
            },
        },
    },
    {
        "name": "get_project_status",
        "description": (
            "拿单个项目的全景快照：基本信息、文档清单概况、各阶段(insight/survey_outline/survey/"
            "kickoff_pptx/kickoff_html)的产物状态(已生成 / 进行中 / 未开始)。\n"
            "适用场景：AI 助手要回答\"这个项目现在到哪一步了\" / \"有哪些已生成的报告\" 时先调这个。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "项目 ID 或名称(同 ask_kb)",
                },
            },
            "required": ["project"],
        },
    },
    {
        "name": "list_outputs",
        "description": (
            "列出项目下所有产物(curated_bundles)。返回每条产物的 ID / kind / 状态 / 标题 / 创建时间。\n"
            "结合 get_output 可拿到具体内容。kind 可选过滤。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "项目 ID 或名称",
                },
                "kind": {
                    "type": "string",
                    "description": "可选：按产物类型过滤",
                    "enum": ["insight", "survey_outline", "survey", "kickoff_pptx", "kickoff_html"],
                },
                "status": {
                    "type": "string",
                    "description": "可选：按状态过滤",
                    "enum": ["done", "pending", "generating", "failed"],
                },
            },
            "required": ["project"],
        },
    },
    {
        "name": "get_output",
        "description": (
            "拿某个具体产物的完整 markdown 内容 + 元数据(挑战循环结果、引用 provenance 等)。\n"
            "用 list_outputs 拿到 ID 后再调这个。markdown 体积可能较大(单份洞察报告可达 1-2 万字)。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "bundle_id": {
                    "type": "string",
                    "description": "产物 ID(从 list_outputs 拿到)",
                },
            },
            "required": ["bundle_id"],
        },
    },
    {
        "name": "list_documents",
        "description": (
            "列出项目下所有上传文档(filename / 文档类型 / 处理状态)。\n"
            "适用场景:AI 要看项目有什么文档 / 哪些文档还在处理中 / 有没有补全 SOW / 合同等。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "项目 ID 或名称",
                },
            },
            "required": ["project"],
        },
    },
    {
        "name": "get_brief",
        "description": (
            "拿项目某个 kind 的 Brief 字段(LLM 抽取 + 顾问编辑过的关键信息,如客户业务背景 / 范围 / 风险 / "
            "里程碑 / Top 干系人 等)。返回每个字段的当前值 + confidence + 来源标注。\n"
            "适用场景:AI 写文档前先了解项目的 brief 状态;判断哪些字段已有数据 / 哪些缺失。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "项目 ID 或名称",
                },
                "kind": {
                    "type": "string",
                    "description": "Brief 类型",
                    "enum": ["insight", "survey_outline", "survey", "kickoff_pptx"],
                },
            },
            "required": ["project", "kind"],
        },
    },
]


# ── Project resolution (id or case-insensitive name match) ───────────────────

async def _resolve_project(ref: str) -> Project | None:
    """接收 project ID 或名称，返回匹配的 Project 或 None。"""
    if not ref:
        return None
    ref = ref.strip()
    async with async_session_maker() as session:
        # 1) 精确 ID
        proj = await session.get(Project, ref)
        if proj:
            return proj
        # 2) 名称精确匹配（大小写不敏感）
        proj = (await session.execute(
            select(Project).where(sa_func.lower(Project.name) == ref.lower())
        )).scalar_one_or_none()
        if proj:
            return proj
        # 3) 名称 / 客户模糊匹配，只返回唯一命中
        rows = (await session.execute(
            select(Project).where(
                sa_func.lower(Project.name).contains(ref.lower())
                | sa_func.lower(sa_func.coalesce(Project.customer, "")).contains(ref.lower())
            ).limit(5)
        )).scalars().all()
        if len(rows) == 1:
            return rows[0]
        return None


async def _document_ids_for_project(project_id: str) -> list[str]:
    async with async_session_maker() as session:
        rows = await session.execute(
            select(Document.id).where(Document.project_id == project_id)
        )
        return [r[0] for r in rows.all()]


# ── Tool handlers ─────────────────────────────────────────────────────────────

async def _handle_ask_kb(arguments: dict) -> str:
    question = arguments["question"]
    ltc_stage = arguments.get("ltc_stage") or None
    persona = (arguments.get("persona") or "general").lower()
    project_ref = arguments.get("project") or None

    project_id: str | None = None
    project_name: str = ""
    if persona == "pm":
        if not project_ref:
            return "❌ persona=pm 时必须传 project 参数（项目 ID 或名称）。可先调 list_projects 查可用项目。"
        proj = await _resolve_project(project_ref)
        if not proj:
            return f"❌ 未找到项目「{project_ref}」。可先调 list_projects 查可用项目。"
        project_id = proj.id
        project_name = proj.name

    result = await answer_question(
        question,
        ltc_stage=ltc_stage,
        persona=persona,
        project_id=project_id,
    )
    text = result["answer"]

    header = ""
    if persona == "pm" and project_name:
        header = f"**[PM 视角 · {project_name}]**\n\n"

    if result.get("sources"):
        text += f"\n\n---\n**参考来源**（{len(result['sources'])} 条）："
        for i, s in enumerate(result["sources"], 1):
            pct   = round((s.get("score") or 0) * 100)
            stage = s.get("ltc_stage") or "通用"
            text += f"\n- 来源 {i} · 阶段: {stage} · 相关度: {pct}%"
    if result.get("model"):
        text += f"\n\n*由 {result['model']} 生成*"

    return header + text


async def _handle_search_kb(arguments: dict) -> str:
    query     = arguments["query"]
    top_k     = min(int(arguments.get("top_k", 5)), 20)
    ltc_stage = arguments.get("ltc_stage") or None
    project_ref = arguments.get("project") or None

    document_ids: list[str] | None = None
    if project_ref:
        proj = await _resolve_project(project_ref)
        if not proj:
            return f"❌ 未找到项目「{project_ref}」。可先调 list_projects 查可用项目。"
        document_ids = await _document_ids_for_project(proj.id)
        if not document_ids:
            return f"项目「{proj.name}」下暂无已入库文档。"

    vector   = await embedding_service.embed(query, use_cache=True)
    results  = await vector_store.search(
        vector, top_k=top_k, ltc_stage=ltc_stage, document_ids=document_ids
    )

    if not results:
        return "未找到相关知识切片。"

    lines = [f"找到 **{len(results)}** 条相关切片：\n"]
    for i, r in enumerate(results, 1):
        pct     = round(r["score"] * 100)
        stage   = r["payload"].get("ltc_stage") or "通用"
        content = (r["payload"].get("content_preview") or "")[:400]
        chunk_id = r["id"]
        lines.append(
            f"### 切片 {i}  |  阶段: {stage}  |  相关度: {pct}%  |  ID: `{chunk_id}`\n"
            f"{content}\n"
        )
    return "\n".join(lines)


async def _handle_list_projects(arguments: dict) -> str:
    q = (arguments.get("query") or "").strip().lower()
    async with async_session_maker() as session:
        stmt = select(
            Project.id, Project.name, Project.customer, Project.industry,
            sa_func.count(Document.id).label("doc_count"),
        ).outerjoin(Document, Document.project_id == Project.id)
        if q:
            stmt = stmt.where(
                sa_func.lower(Project.name).contains(q)
                | sa_func.lower(sa_func.coalesce(Project.customer, "")).contains(q)
            )
        stmt = stmt.group_by(Project.id).order_by(Project.name)
        rows = (await session.execute(stmt)).all()

    if not rows:
        return "暂无项目。" if not q else f"未找到匹配「{q}」的项目。"

    lines = [f"找到 **{len(rows)}** 个项目：\n"]
    for r in rows:
        customer = r.customer or "—"
        industry = r.industry or "—"
        lines.append(
            f"- **{r.name}** · 客户: {customer} · 行业: {industry} · 文档数: {r.doc_count} · `id={r.id}`"
        )
    return "\n".join(lines)


async def _handle_get_project_status(arguments: dict) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project(project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」。可先调 list_projects 查可用项目。"

    from models.curated_bundle import CuratedBundle
    KINDS = ["insight", "survey_outline", "survey", "kickoff_pptx", "kickoff_html"]
    KIND_LABELS = {
        "insight": "项目洞察", "survey_outline": "调研大纲", "survey": "调研问卷",
        "kickoff_pptx": "启动会·PPT", "kickoff_html": "启动会·HTML",
    }

    async with async_session_maker() as session:
        # 文档数
        doc_count = await session.scalar(
            select(sa_func.count(Document.id)).where(Document.project_id == proj.id)
        )
        # 各 kind 最新产物 status
        bundles_by_kind: dict[str, list] = {k: [] for k in KINDS}
        rows = (await session.execute(
            select(CuratedBundle).where(CuratedBundle.project_id == proj.id).order_by(CuratedBundle.created_at.desc())
        )).scalars().all()
        for b in rows:
            if b.kind in bundles_by_kind:
                bundles_by_kind[b.kind].append(b)

    lines = [f"# {proj.name}\n"]
    if proj.customer:
        lines.append(f"- **客户**: {proj.customer}")
    if proj.industry:
        lines.append(f"- **行业**: {proj.industry}")
    lines.append(f"- **文档数**: {doc_count or 0}")
    lines.append(f"- **项目 ID**: `{proj.id}`")
    if proj.description:
        lines.append(f"- **描述**: {proj.description[:200]}")

    lines.append("\n## 各阶段产物状态\n")
    for k in KINDS:
        bs = bundles_by_kind[k]
        label = KIND_LABELS[k]
        if not bs:
            lines.append(f"- **{label}** (`{k}`): 尚未生成")
            continue
        latest = bs[0]
        ts = latest.created_at.strftime("%Y-%m-%d %H:%M") if latest.created_at else "—"
        extra = ""
        if latest.status == "done" and latest.kind in ("insight", "survey_outline"):
            cs = (latest.extra or {}).get("challenge_summary") or {}
            if cs:
                extra = f" · 挑战 {cs.get('rounds_total', '?')} 轮 · 最终 {cs.get('final_verdict', '?')}"
        lines.append(f"- **{label}** (`{k}`): {latest.status} · {ts}{extra} · `bundle_id={latest.id}`")
        if len(bs) > 1:
            lines.append(f"  历史版本 {len(bs) - 1} 份")

    return "\n".join(lines)


async def _handle_list_outputs(arguments: dict) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project(project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」。"

    from models.curated_bundle import CuratedBundle
    kind_filter = arguments.get("kind")
    status_filter = arguments.get("status")

    async with async_session_maker() as session:
        stmt = select(CuratedBundle).where(CuratedBundle.project_id == proj.id)
        if kind_filter:
            stmt = stmt.where(CuratedBundle.kind == kind_filter)
        if status_filter:
            stmt = stmt.where(CuratedBundle.status == status_filter)
        stmt = stmt.order_by(CuratedBundle.created_at.desc()).limit(50)
        rows = (await session.execute(stmt)).scalars().all()

    if not rows:
        return f"项目「{proj.name}」暂无{kind_filter or ''}产物。"

    lines = [f"项目「{proj.name}」共 **{len(rows)}** 份产物{'(' + kind_filter + ')' if kind_filter else ''}:\n"]
    for b in rows:
        ts = b.created_at.strftime("%Y-%m-%d %H:%M") if b.created_at else "—"
        lines.append(f"- **{b.title or b.kind}** · `{b.kind}` · {b.status} · {ts} · `id={b.id}`")
    return "\n".join(lines)


async def _handle_get_output(arguments: dict) -> str:
    bundle_id = arguments["bundle_id"]
    from models.curated_bundle import CuratedBundle
    async with async_session_maker() as session:
        b = await session.get(CuratedBundle, bundle_id)
    if not b:
        return f"❌ 未找到产物 ID `{bundle_id}`。"

    if b.status != "done":
        return (
            f"产物「{b.title or b.kind}」当前状态: **{b.status}**(尚未完成)。\n"
            f"- kind: `{b.kind}`\n- bundle_id: `{b.id}`\n"
            f"完成后再调 get_output 拿正文。"
        )

    md = b.content_md or ""
    extra = b.extra or {}
    lines = [f"# {b.title or b.kind}\n"]
    lines.append(f"- **kind**: `{b.kind}`")
    lines.append(f"- **bundle_id**: `{b.id}`")
    if b.created_at:
        lines.append(f"- **生成时间**: {b.created_at.strftime('%Y-%m-%d %H:%M')}")

    cs = extra.get("challenge_summary")
    if cs:
        lines.append(f"- **挑战循环**: {cs.get('rounds_total', '?')} 轮 · 最终 verdict={cs.get('final_verdict', '?')} · 仍剩 {cs.get('issues_remaining', 0)} 项重大问题")

    validity = extra.get("validity_status")
    if validity:
        lines.append(f"- **完整性**: {validity}")

    lines.append("\n---\n")
    if md:
        lines.append(md)
    else:
        lines.append("_(产物 markdown 为空)_")

    return "\n".join(lines)


async def _handle_list_documents(arguments: dict) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project(project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」。"

    async with async_session_maker() as session:
        rows = (await session.execute(
            select(Document).where(Document.project_id == proj.id).order_by(Document.created_at.desc())
        )).scalars().all()

    if not rows:
        return f"项目「{proj.name}」暂无文档。"

    lines = [f"项目「{proj.name}」共 **{len(rows)}** 份文档:\n"]
    for d in rows:
        ts = d.created_at.strftime("%Y-%m-%d") if d.created_at else "—"
        doc_type = d.doc_type or "—"
        # Document 字段名是 conversion_status,不是 status
        lines.append(f"- **{d.filename}** · 类型: {doc_type} · 状态: {d.conversion_status} · {ts} · `id={d.id}`")
    return "\n".join(lines)


async def _handle_get_brief(arguments: dict) -> str:
    project_ref = arguments["project"]
    kind = arguments["kind"]
    proj = await _resolve_project(project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」。"

    from models.project_brief import ProjectBrief
    from services.brief_service import get_schema
    # kickoff_html 与 kickoff_pptx 共用 brief
    canon = "kickoff_pptx" if kind == "kickoff_html" else kind
    schema = get_schema(canon)
    if not schema:
        return f"❌ 不支持的 kind: {kind}"

    async with async_session_maker() as session:
        row = (await session.execute(
            select(ProjectBrief).where(
                ProjectBrief.project_id == proj.id,
                ProjectBrief.output_kind == canon,
            )
        )).scalar_one_or_none()

    if not row or not row.fields:
        return f"项目「{proj.name}」的 {kind} brief 尚未抽取(或为空)。可在前端 BriefDrawer 触发 LLM 抽取。"

    lines = [f"# {proj.name} · {kind} Brief\n"]
    fields = row.fields
    for spec in schema:
        key = spec["key"]
        label = spec.get("label", key)
        cell = fields.get(key) or {}
        if isinstance(cell, dict):
            value = cell.get("value")
            confidence = cell.get("confidence")
            edited = cell.get("edited_at")
        else:
            value = cell
            confidence = None
            edited = None
        if value in (None, "", []):
            lines.append(f"- **{label}** (`{key}`): _未填_")
            continue
        if isinstance(value, list):
            value_str = "; ".join(str(v)[:120] for v in value[:5])
            if len(value) > 5:
                value_str += f" …({len(value) - 5} 项更多)"
        else:
            value_str = str(value)[:300]
        meta = []
        if confidence:
            meta.append(f"confidence={confidence}")
        if edited:
            meta.append("已人工编辑")
        meta_str = f" · {' · '.join(meta)}" if meta else ""
        lines.append(f"- **{label}** (`{key}`): {value_str}{meta_str}")
    return "\n".join(lines)


# ── JSON-RPC helpers ──────────────────────────────────────────────────────────

def _ok(req_id, result):
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})

def _err(req_id, code: int, message: str):
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


# ── Main endpoint ─────────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return None


@router.post("")
async def mcp_endpoint(request: Request):
    # ── 鉴权：支持 MCP API Key（mcp_xxx）和 JWT ───────────────────────
    token = _extract_token(request)
    if not token:
        return JSONResponse(
            status_code=401,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "缺少认证 token"}},
        )

    _log_uid: str | None = None
    _log_uname: str | None = None
    _log_ttype: str = "mcp_key"

    if token.startswith("mcp_"):
        # API Key 模式：查库匹配
        async with async_session_maker() as session:
            user = await session.scalar(select(User).where(User.mcp_api_key == token))
        if not user or not user.is_active:
            return JSONResponse(
                status_code=401,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "无效的 MCP API Key"}},
            )
        if not user.api_enabled:
            return JSONResponse(
                status_code=403,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32003, "message": "未获得 API/MCP 调用授权，请联系管理员开启"}},
            )
        _log_uid = user.id
        _log_uname = user.username
        _log_ttype = "mcp_key"
    else:
        # JWT 模式
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "token 已过期，请在知识库平台刷新 MCP Key"}},
            )
        except jwt.InvalidTokenError:
            return JSONResponse(
                status_code=401,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "无效的 token"}},
            )
        user_id = payload.get("sub")
        async with async_session_maker() as session:
            jwt_user = await session.get(User, user_id) if user_id else None
        if not jwt_user or not jwt_user.is_active:
            return JSONResponse(
                status_code=401,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "用户不存在或已禁用"}},
            )
        if not jwt_user.api_enabled:
            return JSONResponse(
                status_code=403,
                content={"jsonrpc": "2.0", "id": None, "error": {"code": -32003, "message": "未获得 API/MCP 调用授权，请联系管理员开启"}},
            )
        _log_uid = jwt_user.id
        _log_uname = jwt_user.username
        _log_ttype = "jwt"

    try:
        body = await request.json()
    except Exception:
        return _err(None, -32700, "Parse error")

    method = body.get("method", "")
    params = body.get("params") or {}
    req_id = body.get("id")

    logger.info("mcp_request", method=method, id=req_id)

    # ── initialize ────────────────────────────────────────────────────────
    if method == "initialize":
        return _ok(req_id, {
            "protocolVersion": MCP_VERSION,
            "capabilities":    {"tools": {}},
            "serverInfo":      SERVER_INFO,
            "instructions": (
                "纷享销客 CRM 实施知识库 MCP 服务器。\n"
                "\n"
                "## 知识 / 检索类(全只读)\n"
                "• ask_kb              — 提问获取 RAG 答案(默认通用模式)\n"
                "• ask_kb (persona=pm) — 项目 PM 视角回答,带状态/下一步/风险结构化分析\n"
                "• search_kb           — 检索原始知识切片(可 project 过滤)\n"
                "\n"
                "## 项目 / 产物类(全只读)\n"
                "• list_projects       — 列项目清单(ID / 名称 / 客户 / 行业 / 文档数)\n"
                "• get_project_status  — 单个项目全景(基本信息 + 各 stage 产物状态 + 挑战结果)\n"
                "• list_outputs        — 项目产物清单(insight / survey / kickoff PPT 等)\n"
                "• get_output          — 拿单个产物的 markdown 全文 + 元数据\n"
                "• list_documents      — 项目文档清单(filename / 类型 / 处理状态)\n"
                "• get_brief           — 项目 brief 字段(已抽取 + 已编辑的关键信息)\n"
                "\n"
                "## 典型流程\n"
                "- 通用问答:直接 ask_kb\n"
                "- PM 模式:list_projects → ask_kb(persona=pm, project=XX)\n"
                "- 项目分析:get_project_status → list_outputs → get_output(bundle_id)\n"
                "- 文档摸底:list_documents → search_kb(project=XX)\n"
                "\n"
                "所有 tool 均为只读,不会修改项目数据。触发产物生成等写操作请在 Web 工作台进行。"
            ),
        })

    # ── ping ──────────────────────────────────────────────────────────────
    if method == "ping":
        return _ok(req_id, {})

    # ── tools/list ────────────────────────────────────────────────────────
    if method == "tools/list":
        return _ok(req_id, {"tools": TOOLS})

    # ── tools/call ────────────────────────────────────────────────────────
    if method == "tools/call":
        tool_name  = params.get("name", "")
        arguments  = params.get("arguments") or {}

        log_call(_log_uid, _log_uname, _log_ttype, "mcp", f"tools/call:{tool_name}")

        try:
            if tool_name == "ask_kb":
                text = await _handle_ask_kb(arguments)
            elif tool_name == "search_kb":
                text = await _handle_search_kb(arguments)
            elif tool_name == "list_projects":
                text = await _handle_list_projects(arguments)
            elif tool_name == "get_project_status":
                text = await _handle_get_project_status(arguments)
            elif tool_name == "list_outputs":
                text = await _handle_list_outputs(arguments)
            elif tool_name == "get_output":
                text = await _handle_get_output(arguments)
            elif tool_name == "list_documents":
                text = await _handle_list_documents(arguments)
            elif tool_name == "get_brief":
                text = await _handle_get_brief(arguments)
            else:
                return _err(req_id, -32602, f"未知工具: {tool_name}")

            return _ok(req_id, {"content": [{"type": "text", "text": text}]})

        except KeyError as e:
            return _err(req_id, -32602, f"缺少必要参数: {e}")
        except Exception as e:
            logger.error("mcp_tool_error", tool=tool_name, error=str(e)[:200])
            return _err(req_id, -32000, str(e))

    # ── unknown method ────────────────────────────────────────────────────
    return _err(req_id, -32601, f"未知方法: {method}")
