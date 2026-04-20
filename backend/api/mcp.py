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

import jwt
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agents.kb_agent import answer_question
from config import settings
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
            "适用场景：实施方法论、操作规范、流程最佳实践、常见问题解答。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "要询问的问题，支持中文自然语言",
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
            },
            "required": ["query"],
        },
    },
]


# ── Tool handlers ─────────────────────────────────────────────────────────────

async def _handle_ask_kb(arguments: dict) -> str:
    question = arguments["question"]
    ltc_stage = arguments.get("ltc_stage") or None

    result = await answer_question(question, ltc_stage=ltc_stage)
    text = result["answer"]

    if result.get("sources"):
        text += f"\n\n---\n**参考来源**（{len(result['sources'])} 条）："
        for i, s in enumerate(result["sources"], 1):
            pct   = round(s["score"] * 100)
            stage = s.get("ltc_stage") or "通用"
            text += f"\n- 来源 {i} · 阶段: {stage} · 相关度: {pct}%"
    if result.get("model"):
        text += f"\n\n*由 {result['model']} 生成*"

    return text


async def _handle_search_kb(arguments: dict) -> str:
    query     = arguments["query"]
    top_k     = min(int(arguments.get("top_k", 5)), 20)
    ltc_stage = arguments.get("ltc_stage") or None

    vector   = await embedding_service.embed(query)
    results  = await vector_store.search(vector, top_k=top_k, ltc_stage=ltc_stage)

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
    # ── JWT 鉴权 ──────────────────────────────────────────────────────────
    token = _extract_token(request)
    if not token:
        return JSONResponse(
            status_code=401,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "缺少认证 token"}},
        )
    try:
        jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        return JSONResponse(
            status_code=401,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "token 已过期"}},
        )
    except jwt.InvalidTokenError:
        return JSONResponse(
            status_code=401,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "无效的 token"}},
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
                "• ask_kb   — 提问获取 RAG 答案（推荐）\n"
                "• search_kb — 检索原始知识切片"
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
