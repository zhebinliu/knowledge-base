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
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, func as sa_func

from agents.kb_agent import answer_question
from api.outputs import KIND_TITLES  # 单一 kind 来源,避免 §6.8 第 4 处漂移
from config import settings
from models import async_session_maker
from models.project import Project
from models.document import Document
from models.user import User
from services.embedding_service import embedding_service
from services.project_acl import assert_project_access, list_accessible_project_ids
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
            "拿单个项目的全景快照：基本信息、文档数、LTC 全链路各产物状态"
            "(洞察 / 调研 / 方案设计 / 实施 / 测试 / 验收,已生成 / 进行中 / 未开始)。\n"
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
                    "description": "可选：按产物类型过滤(覆盖洞察 / 调研 / 方案设计 / 实施 / 测试 / 验收全链路)",
                    "enum": list(KIND_TITLES),
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
    {
        "name": "get_document",
        "description": (
            "【读】拿单份文档的提取后全文(markdown)。\n"
            "先用 list_documents 拿到 doc_id 再调这个。适用:AI 要读 SOW / 合同 / 方案 / "
            "交接单等原文做分析。注意正文可能很长(数千~数万字)。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "文档 ID(从 list_documents 拿到)"},
            },
            "required": ["doc_id"],
        },
    },
    {
        "name": "list_meetings",
        "description": (
            "【读】列出项目下的会议(ID / 标题 / 状态 / 时间)。\n"
            "适用:AI 要看这个项目开过哪些会、哪些已出纪要。配合 get_meeting 拿详情。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {"type": "string", "description": "项目 ID 或名称"},
            },
            "required": ["project"],
        },
    },
    {
        "name": "get_meeting",
        "description": (
            "【读】拿单个会议的完整资料:纪要(摘要/议题/决议/待办)、需求清单、业务流程、"
            "干系人图谱。默认不含逐字转写(很长),需要时传 include_transcript=true。\n"
            "先用 list_meetings 拿到 meeting_id。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "meeting_id": {"type": "integer", "description": "会议 ID(从 list_meetings 拿到)"},
                "include_transcript": {
                    "type": "boolean",
                    "description": "是否附带润色后的逐字转写(默认 false,转写可能很长)",
                    "default": False,
                },
            },
            "required": ["meeting_id"],
        },
    },
    {
        "name": "get_smart_advice",
        "description": (
            "【读】拿项目的智能建议(综合 brief / 产物 / 文档由 LLM 生成的下一步动作 + 风险)。\n"
            "只读已缓存结果,不触发新生成;若从未生成会提示去 Web 工作台触发。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {"type": "string", "description": "项目 ID 或名称"},
            },
            "required": ["project"],
        },
    },
    {
        "name": "generate_output",
        "description": (
            "【写】触发生成某个产物(异步,立即返回 bundle_id,稍后用 get_output 取结果)。\n"
            "需要对该项目有写权限。kind 见枚举(洞察 / 调研 / 方案设计 / 实施 / 测试 / 验收全链路)。\n"
            "典型:list_projects → generate_output(project, kind) → 轮询 get_output(bundle_id)。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {"type": "string", "description": "项目 ID 或名称"},
                "kind": {
                    "type": "string",
                    "description": "要生成的产物类型",
                    "enum": list(KIND_TITLES),
                },
            },
            "required": ["project", "kind"],
        },
    },
    {
        "name": "create_meeting_from_text",
        "description": (
            "【写】把一段会议文本(纪要/转写/笔记)直接建成会议并自动跑 AI pipeline"
            "(润色 → 纪要 / 需求 / 业务流程 / 干系人)。异步,立即返回 meeting_id。\n"
            "若传 project 则关联到该项目(需对该项目有写权限);不传则只挂在自己名下。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "transcript": {"type": "string", "description": "会议文本内容(必填)"},
                "title": {"type": "string", "description": "会议标题(可选,默认「文本导入会议」)"},
                "project": {"type": "string", "description": "可选:关联项目 ID 或名称(需写权限)"},
            },
            "required": ["transcript"],
        },
    },
]


# ── Project resolution (id or case-insensitive name match) ───────────────────

async def _resolve_project(ref: str) -> Project | None:
    """接收 project ID 或名称，返回匹配的 Project 或 None。**不做权限校验**(内部使用)。"""
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


async def _resolve_project_for(user: User, ref: str, level: str = "read") -> Project | None:
    """带权限校验的 resolve。无权访问的项目返回 None(等同于不存在,避免侧信道枚举)。

    2026-05-12 新增:此前 MCP tool handler 直接调 _resolve_project,任何 API key 用户
    可读他人项目;现在统一走这个 helper,admin 仍可访问全部。
    2026-06-25:加 level 参数。写/动作类工具(generate_output 等)传 "write",
    只读工具仍默认 "read"(LEARNING §10.1:写操作必须校 write,不能复用 read)。
    """
    proj = await _resolve_project(ref)
    if not proj:
        return None
    if getattr(user, "is_admin", False):
        return proj
    try:
        await assert_project_access(user, proj.id, level)
        return proj
    except HTTPException:
        return None


async def _document_ids_for_project(project_id: str) -> list[str]:
    async with async_session_maker() as session:
        rows = await session.execute(
            select(Document.id).where(Document.project_id == project_id)
        )
        return [r[0] for r in rows.all()]


# ── Tool handlers ─────────────────────────────────────────────────────────────

async def _handle_ask_kb(arguments: dict, user: User) -> str:
    question = arguments["question"]
    ltc_stage = arguments.get("ltc_stage") or None
    persona = (arguments.get("persona") or "general").lower()
    project_ref = arguments.get("project") or None

    project_id: str | None = None
    project_name: str = ""
    if persona == "pm":
        if not project_ref:
            return "❌ persona=pm 时必须传 project 参数（项目 ID 或名称）。可先调 list_projects 查可用项目。"
        proj = await _resolve_project_for(user, project_ref)
        if not proj:
            return f"❌ 未找到项目「{project_ref}」或无权访问。可先调 list_projects 查可用项目。"
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


async def _handle_search_kb(arguments: dict, user: User) -> str:
    query     = arguments["query"]
    top_k     = min(int(arguments.get("top_k", 5)), 20)
    ltc_stage = arguments.get("ltc_stage") or None
    project_ref = arguments.get("project") or None

    # 2026-05-12:非 admin 用户搜索必须指定 project,避免跨项目泄露切片内容
    if not project_ref and not user.is_admin:
        return "❌ 搜索切片需要指定 project 参数(项目 ID 或名称)。可先调 list_projects 查可用项目。"

    document_ids: list[str] | None = None
    if project_ref:
        proj = await _resolve_project_for(user, project_ref)
        if not proj:
            return f"❌ 未找到项目「{project_ref}」或无权访问。可先调 list_projects 查可用项目。"
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


async def _handle_list_projects(arguments: dict, user: User) -> str:
    q = (arguments.get("query") or "").strip().lower()
    # 2026-05-12:非 admin 用户只列自己 owned + 协作的项目
    accessible_ids = await list_accessible_project_ids(user)
    async with async_session_maker() as session:
        stmt = select(
            Project.id, Project.name, Project.customer, Project.industry,
            sa_func.count(Document.id).label("doc_count"),
        ).outerjoin(Document, Document.project_id == Project.id)
        if accessible_ids is not None:  # None 表示 admin,全部可见
            if not accessible_ids:
                return "您当前没有任何可访问的项目。"
            stmt = stmt.where(Project.id.in_(accessible_ids))
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


async def _handle_get_project_status(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。可先调 list_projects 查可用项目。"

    from models.curated_bundle import CuratedBundle
    # 全 13 个 kind 直接取自 outputs.KIND_TITLES,新增 kind 自动纳入(不再手抄漏更新)
    KINDS = list(KIND_TITLES)
    KIND_LABELS = dict(KIND_TITLES)

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


async def _handle_list_outputs(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。"

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


async def _handle_get_output(arguments: dict, user: User) -> str:
    bundle_id = arguments["bundle_id"]
    from models.curated_bundle import CuratedBundle
    async with async_session_maker() as session:
        b = await session.get(CuratedBundle, bundle_id)
    if not b:
        return f"❌ 未找到产物 ID `{bundle_id}`。"
    # 2026-05-12:校验 bundle 所属项目的访问权
    if b.project_id and not user.is_admin:
        try:
            await assert_project_access(user, b.project_id, "read")
        except HTTPException:
            return f"❌ 未找到产物 ID `{bundle_id}` 或无权访问。"

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


async def _handle_list_documents(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。"

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


async def _handle_get_brief(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    kind = arguments["kind"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。"

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


# ── 只读:文档全文 / 会议 / 智能建议 ───────────────────────────────────────────

async def _handle_get_document(arguments: dict, user: User) -> str:
    doc_id = arguments["doc_id"]
    async with async_session_maker() as session:
        doc = await session.get(Document, doc_id)
    if not doc:
        return f"❌ 未找到文档 ID `{doc_id}`。"
    # 文档是原始素材,权限从严:无项目归属的文档仅 admin 可读
    if not user.is_admin:
        if not doc.project_id:
            return f"❌ 未找到文档 ID `{doc_id}` 或无权访问。"
        try:
            await assert_project_access(user, doc.project_id, "read")
        except HTTPException:
            return f"❌ 未找到文档 ID `{doc_id}` 或无权访问。"

    md = doc.markdown_content or ""
    lines = [f"# {doc.filename}\n"]
    lines.append(f"- **类型**: {doc.doc_type or '—'}")
    lines.append(f"- **状态**: {doc.conversion_status}")
    lines.append(f"- **doc_id**: `{doc.id}`")
    lines.append("\n---\n")
    lines.append(md if md else "_(文档尚无提取后的 markdown,可能仍在处理中)_")
    return "\n".join(lines)


async def _handle_list_meetings(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。"

    from models.meeting import Meeting
    async with async_session_maker() as session:
        rows = (await session.execute(
            select(Meeting).where(Meeting.project_id == proj.id).order_by(Meeting.created_at.desc())
        )).scalars().all()

    if not rows:
        return f"项目「{proj.name}」暂无会议。"

    lines = [f"项目「{proj.name}」共 **{len(rows)}** 场会议:\n"]
    for m in rows:
        ts = m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else "—"
        lines.append(f"- **{m.title or '(未命名)'}** · 状态: {m.status} · {ts} · `meeting_id={m.id}`")
    return "\n".join(lines)


def _render_minutes(minutes: dict) -> list[str]:
    """把纪要 dict 渲染成 markdown 行(只渲染非空字段)。"""
    out: list[str] = []
    summary = (minutes.get("summary") or "").strip()
    if summary:
        out.append(f"### 摘要\n{summary}")
    for key, label in (("key_points", "关键议题"), ("decisions", "决议"),
                       ("action_items", "待办"), ("unresolved", "未决问题")):
        items = minutes.get(key) or []
        if not items:
            continue
        out.append(f"### {label}")
        for it in items:
            if isinstance(it, dict):
                txt = it.get("content") or it.get("text") or it.get("title") or ""
                owner = it.get("owner")
                txt = f"{txt}（负责人: {owner}）" if owner else txt
            else:
                txt = str(it)
            if txt.strip():
                out.append(f"- {txt.strip()}")
    return out


async def _handle_get_meeting(arguments: dict, user: User) -> str:
    meeting_id = int(arguments["meeting_id"])
    include_tx = bool(arguments.get("include_transcript", False))

    from api.meeting import _load_meeting_owned
    from models.meeting import Requirement
    async with async_session_maker() as session:
        try:
            m = await _load_meeting_owned(meeting_id, session, user)
        except HTTPException:
            return f"❌ 未找到会议 `{meeting_id}` 或无权访问。"
        reqs = (await session.execute(
            select(Requirement).where(Requirement.meeting_id == meeting_id).order_by(Requirement.id)
        )).scalars().all()
        title = m.title or "(未命名会议)"
        status = m.status
        minutes = m.edited_minutes or m.meeting_minutes or {}
        flows = (m.process_flows or {}).get("flows", []) if isinstance(m.process_flows, dict) else []
        smap = m.stakeholder_map or {}
        polished = m.polished_transcript or m.raw_transcript or ""

    lines = [f"# 会议:{title}\n", f"- **状态**: {status} · `meeting_id={meeting_id}`"]

    if isinstance(minutes, dict) and minutes:
        rendered = _render_minutes(minutes)
        if rendered:
            lines.append("\n## 纪要\n")
            lines.extend(rendered)

    if reqs:
        lines.append(f"\n## 需求清单({len(reqs)} 条)\n")
        for r in reqs:
            mod = f"[{r.module}] " if r.module else ""
            lines.append(f"- **{r.req_id}** {mod}{r.description} · 优先级 {r.priority} · {r.status}")

    if flows:
        lines.append(f"\n## 业务流程({len(flows)} 个)\n")
        for f in flows:
            if not isinstance(f, dict):
                continue
            lines.append(f"### {f.get('title') or f.get('flow_id') or '流程'}")
            if f.get("summary"):
                lines.append(f.get("summary"))
            if f.get("mermaid"):
                lines.append(f"```mermaid\n{f['mermaid']}\n```")

    sh = smap.get("stakeholders", []) if isinstance(smap, dict) else []
    if sh:
        lines.append(f"\n## 干系人({len(sh)} 人)\n")
        for s in sh:
            if not isinstance(s, dict):
                continue
            name = s.get("name") or "(未命名)"
            role = s.get("role") or ""
            org = s.get("organization") or ""
            meta = " · ".join(x for x in (role, org) if x)
            lines.append(f"- **{name}**" + (f" · {meta}" if meta else ""))

    if include_tx and polished:
        lines.append("\n## 转写(润色后)\n")
        lines.append(polished)

    if len(lines) <= 2:
        lines.append("\n_(该会议尚无纪要 / 需求 / 流程 / 干系人,可能仍在处理或处理失败)_")
    return "\n".join(lines)


async def _handle_get_smart_advice(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    proj = await _resolve_project_for(user, project_ref)
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无权访问。"

    from services.smart_advice import get_advice_only
    advice = await get_advice_only(proj.id)
    if not advice:
        return f"项目「{proj.name}」尚未生成智能建议。可在 Web 工作台触发生成。"

    lines = [f"# {proj.name} · 智能建议\n"]
    if advice.get("is_stale"):
        lines.append("> ⚠️ 当前建议已标记为过时(项目数据有更新),建议在 Web 工作台刷新。\n")
    if advice.get("generated_at"):
        lines.append(f"- 生成时间: {advice['generated_at']}")
    if advice.get("advice_md"):
        lines.append("\n## 建议\n" + advice["advice_md"])
    if advice.get("next_steps"):
        lines.append("\n## 下一步\n" + "\n".join(f"- {s}" for s in advice["next_steps"]))
    if advice.get("risks"):
        lines.append("\n## 风险\n" + "\n".join(f"- {r}" for r in advice["risks"]))
    return "\n".join(lines)


# ── 写 / 动作:触发生成 / 建会议 ───────────────────────────────────────────────

async def _handle_generate_output(arguments: dict, user: User) -> str:
    project_ref = arguments["project"]
    kind = arguments["kind"]
    if kind not in KIND_TITLES:
        return f"❌ 不支持的产物类型「{kind}」。可选: {', '.join(KIND_TITLES)}"
    # 生成是写操作 → 校 write 权限
    proj = await _resolve_project_for(user, project_ref, level="write")
    if not proj:
        return f"❌ 未找到项目「{project_ref}」或无写权限(生成产物需要写权限)。"

    from api.outputs import enqueue_generation
    async with async_session_maker() as session:
        try:
            bundle = await enqueue_generation(
                user=user, project_id=proj.id, kind=kind, session=session
            )
        except HTTPException as e:
            return f"❌ 触发生成失败: {getattr(e, 'detail', str(e))}"

    return (
        f"✅ 已触发生成「{KIND_TITLES[kind]}」(项目「{proj.name}」)。\n"
        f"- bundle_id: `{bundle.id}` · 状态: {bundle.status}\n"
        f"生成是异步的(约 2-5 分钟),稍后用 get_output(bundle_id) 取结果,"
        f"或 list_outputs(project) 看状态。"
    )


async def _handle_create_meeting_from_text(arguments: dict, user: User) -> str:
    transcript = (arguments.get("transcript") or "").strip()
    if not transcript:
        return "❌ transcript(会议文本)不能为空。"
    title = (arguments.get("title") or "文本导入会议").strip()
    project_ref = arguments.get("project") or None

    project_id: str | None = None
    proj_name = ""
    if project_ref:
        # 关联到项目 = 会触发读该项目数据的 pipeline → 校 write 权限(同 HTTP /from-text)
        proj = await _resolve_project_for(user, project_ref, level="write")
        if not proj:
            return f"❌ 未找到项目「{project_ref}」或无写权限(关联项目需要写权限)。"
        project_id = proj.id
        proj_name = proj.name

    from models.meeting import Meeting
    async with async_session_maker() as session:
        m = Meeting(
            title=title,
            owner_id=user.id,
            project_id=project_id,
            raw_transcript=transcript,
            status="processing",
            asr_engine="text",
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        mid = m.id

    from tasks.meeting_tasks import process_meeting as _task
    _task.delay(mid)

    extra = f",已关联项目「{proj_name}」" if proj_name else "(未关联项目)"
    return (
        f"✅ 已创建会议「{title}」{extra}并触发 AI 处理。\n"
        f"- meeting_id: `{mid}`\n"
        f"处理是异步的(润色 → 纪要 / 需求 / 业务流程 / 干系人),"
        f"稍后用 get_meeting(meeting_id) 取结果。"
    )


# ── JSON-RPC helpers ──────────────────────────────────────────────────────────

def _ok(req_id, result):
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})

def _err(req_id, code: int, message: str):
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


# ── Main endpoint ─────────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str | None:
    """支持三种 header 形式(MCP 客户端配置时容易漏 Bearer 前缀,这里宽容):
      Authorization: Bearer mcp_xxx     # 标准
      Authorization: mcp_xxx            # 裸 MCP key (常见误配)
      Authorization: Bearer eyJ...      # JWT
      Authorization: eyJ...             # 裸 JWT
    """
    auth = request.headers.get("Authorization", "").strip()
    if not auth:
        return None
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    # 没 Bearer 前缀:看起来像 token 就直接当 token
    if auth.startswith("mcp_") or auth.startswith("eyJ"):
        return auth
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
    acting_user: User | None = None  # 2026-05-12:tool handler 用它做 project 权限隔离

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
        acting_user = user
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
        acting_user = jwt_user

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
                "纷享销客 CRM 实施知识库 MCP 服务器。所有 tool 严格按当前用户的项目权限隔离,"
                "只能读 / 写自己 owned 或被分享的项目(admin 例外)。\n"
                "\n"
                "## 知识 / 检索(读)\n"
                "• ask_kb              — 提问获取 RAG 答案(默认通用模式)\n"
                "• ask_kb (persona=pm) — 项目 PM 视角回答,带状态/下一步/风险结构化分析\n"
                "• search_kb           — 检索原始知识切片(可 project 过滤)\n"
                "\n"
                "## 项目 / 产物(读)\n"
                "• list_projects       — 列项目清单(ID / 名称 / 客户 / 行业 / 文档数)\n"
                "• get_project_status  — 单个项目全景(LTC 全链路产物状态 + 挑战结果)\n"
                "• list_outputs        — 项目产物清单(全 13 kind:洞察/调研/方案/实施/测试/验收)\n"
                "• get_output          — 拿单个产物的 markdown 全文 + 元数据\n"
                "• get_brief           — 项目 brief 字段(已抽取 + 已编辑的关键信息)\n"
                "• get_smart_advice    — 项目智能建议(下一步动作 + 风险,只读缓存)\n"
                "\n"
                "## 文档 / 会议(读)\n"
                "• list_documents      — 项目文档清单(filename / 类型 / 处理状态)\n"
                "• get_document        — 单份文档提取后全文(markdown)\n"
                "• list_meetings       — 项目会议清单\n"
                "• get_meeting         — 单个会议全资料(纪要 / 需求 / 业务流程 / 干系人 / 可选转写)\n"
                "\n"
                "## 写 / 动作(需对项目有写权限)\n"
                "• generate_output           — 触发生成某 kind 产物(异步,返回 bundle_id)\n"
                "• create_meeting_from_text  — 把会议文本建成会议并自动跑 AI pipeline\n"
                "\n"
                "## 典型流程\n"
                "- 通用问答:直接 ask_kb\n"
                "- PM 模式:list_projects → ask_kb(persona=pm, project=XX)\n"
                "- 项目分析:get_project_status → list_outputs → get_output(bundle_id)\n"
                "- 读项目资料:list_documents → get_document(doc_id);list_meetings → get_meeting(meeting_id)\n"
                "- 生成产物:list_projects → generate_output(project, kind) → 轮询 get_output(bundle_id)\n"
                "\n"
                "写操作会真正修改 / 新增项目数据并消耗 LLM 配额,调用前确认是用户意图。"
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

        # 2026-05-12:所有 handler 都接收 acting_user 做 project 权限隔离
        # 上方鉴权流程已保证 acting_user 不为 None,这里 assert 为类型收窄
        assert acting_user is not None
        try:
            if tool_name == "ask_kb":
                text = await _handle_ask_kb(arguments, acting_user)
            elif tool_name == "search_kb":
                text = await _handle_search_kb(arguments, acting_user)
            elif tool_name == "list_projects":
                text = await _handle_list_projects(arguments, acting_user)
            elif tool_name == "get_project_status":
                text = await _handle_get_project_status(arguments, acting_user)
            elif tool_name == "list_outputs":
                text = await _handle_list_outputs(arguments, acting_user)
            elif tool_name == "get_output":
                text = await _handle_get_output(arguments, acting_user)
            elif tool_name == "list_documents":
                text = await _handle_list_documents(arguments, acting_user)
            elif tool_name == "get_brief":
                text = await _handle_get_brief(arguments, acting_user)
            elif tool_name == "get_document":
                text = await _handle_get_document(arguments, acting_user)
            elif tool_name == "list_meetings":
                text = await _handle_list_meetings(arguments, acting_user)
            elif tool_name == "get_meeting":
                text = await _handle_get_meeting(arguments, acting_user)
            elif tool_name == "get_smart_advice":
                text = await _handle_get_smart_advice(arguments, acting_user)
            elif tool_name == "generate_output":
                text = await _handle_generate_output(arguments, acting_user)
            elif tool_name == "create_meeting_from_text":
                text = await _handle_create_meeting_from_text(arguments, acting_user)
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
