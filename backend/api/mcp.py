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
from sqlalchemy import select

from agents.kb_agent import answer_question
from config import settings
from models import async_session_maker
from models.project import Project
from models.document import Document
from models.user import User
from services.embedding_service import embedding_service
from services.vector_store import vector_store

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
        from sqlalchemy import func as sa_func
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
    from sqlalchemy import func as sa_func
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
                "• ask_kb       — 提问获取 RAG 答案（默认通用模式）\n"
                "• ask_kb (pm)  — persona=pm + project=<ID或名称>，以项目 PM 视角回答（状态/下一步/风险）\n"
                "• search_kb    — 检索原始知识切片（可 project 过滤）\n"
                "• list_projects — 列出所有项目，提供给 pm 模式使用\n"
                "典型流程：先 list_projects → 再 ask_kb(persona=pm, project=XX)"
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

        try:
            if tool_name == "ask_kb":
                text = await _handle_ask_kb(arguments)
            elif tool_name == "search_kb":
                text = await _handle_search_kb(arguments)
            elif tool_name == "list_projects":
                text = await _handle_list_projects(arguments)
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
