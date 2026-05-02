"""输出对话 API：用户与输出智能体的访谈式会话（替代静态题库）。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from models import get_session
from models.output_conversation import OutputConversation
from models.project import Project
from models.curated_bundle import CuratedBundle
from models.user import User
from services.auth import get_current_user
from agents.output_chat import (
    get_output_agent_config,
    load_skill_snippets,
    build_system_prompt,
    run_agent_turn,
    SEARCH_KB_TOOL,
    _project_scope,
    _industry_scope,
    _pick_model,
)

logger = structlog.get_logger()
router = APIRouter()

# 对话式生成只剩 kickoff_pptx / kickoff_html;insight / survey / survey_outline
# 已切到 agentic 规则化生成,不在此对话流程内。
VALID_KINDS = ("kickoff_pptx", "kickoff_html")

KIND_TITLES = {
    "kickoff_pptx": "启动会 PPT(pptxgen)",
    "kickoff_html": "启动会 PPT(htmlppt)",
}


class CreateBody(BaseModel):
    kind: str
    project_id: str | None = None
    industry: str | None = None


class MessageBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)


def _dto(conv: OutputConversation, include_messages: bool = True) -> dict:
    # 对外隐藏 role=tool 的消息（用户不需要看工具原文），只保留 user / assistant
    public_messages = []
    if include_messages:
        for m in (conv.messages or []):
            role = m.get("role")
            if role in ("user", "assistant"):
                public_messages.append({
                    "role": role,
                    "content": m.get("content", "") or "",
                    "tool_uses": [
                        {"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "")}
                        for tc in (m.get("tool_calls") or [])
                    ] if role == "assistant" else [],
                })
    return {
        "id": conv.id,
        "kind": conv.kind,
        "project_id": conv.project_id,
        "industry": conv.industry,
        "skill_ids": conv.skill_ids or [],
        "model": conv.model_name,
        "messages": public_messages,
        "refs_count": len(conv.refs or []),
        "status": conv.status,
        "bundle_id": conv.bundle_id,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }


@router.post("", status_code=201)
async def create_chat(
    body: CreateBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.kind not in VALID_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of: {VALID_KINDS}")
    if not body.project_id and not body.industry:
        raise HTTPException(400, "必须至少提供 project_id 或 industry 其中之一")

    # 构建作用域
    document_ids: list[str] | None = None
    if body.project_id:
        scope_desc, document_ids, _meta = await _project_scope(body.project_id)
        if not scope_desc:
            raise HTTPException(404, "项目不存在")
    else:
        scope_desc = _industry_scope(body.industry or "")

    # 加载智能体配置
    agent_cfg = await get_output_agent_config(body.kind)
    skill_text = await load_skill_snippets(agent_cfg["skill_ids"])
    system_prompt = build_system_prompt(body.kind, agent_cfg["prompt"], skill_text, scope_desc)
    model = _pick_model(agent_cfg["model"])

    # 先记一条 system，再让 agent 生成开场问候
    base_messages: list[dict] = [{"role": "system", "content": system_prompt}]
    # 用一条"空的" user 触发开场
    kickoff_user = {"role": "user", "content": "（请开场并抛出第一个问题）"}
    new_msgs, new_refs = await run_agent_turn(
        messages=base_messages + [kickoff_user],
        tools=[SEARCH_KB_TOOL],
        model=model,
        project_document_ids=document_ids,
        industry=body.industry,
    )
    # 对外对话历史里不保留 system，也不保留这句占位 user；只保留 assistant 回复
    visible_messages = [m for m in new_msgs if m.get("role") == "assistant" and not m.get("tool_calls")]
    full_messages = base_messages + [kickoff_user] + new_msgs

    conv = OutputConversation(
        kind=body.kind,
        project_id=body.project_id,
        industry=body.industry,
        skill_ids=agent_cfg["skill_ids"],
        model_name=model,
        messages=full_messages,
        refs=new_refs,
        status="active",
        created_by=current_user.id,
    )
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    dto = _dto(conv)
    # 前端首屏只显示 assistant 的开场问候
    dto["messages"] = [
        {"role": "assistant", "content": (visible_messages[-1]["content"] if visible_messages else "你好，我们开始吧。"), "tool_uses": []}
    ]
    return dto


@router.post("/{conv_id}/message")
async def send_message(
    conv_id: str,
    body: MessageBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    conv = await session.get(OutputConversation, conv_id)
    if not conv:
        raise HTTPException(404, "对话不存在")
    if not current_user.is_admin and conv.created_by != current_user.id:
        raise HTTPException(403, "无权访问")
    if conv.status not in ("active",):
        raise HTTPException(400, f"当前状态 {conv.status} 不能继续对话")

    document_ids: list[str] | None = None
    if conv.project_id:
        _s, document_ids, _m = await _project_scope(conv.project_id)

    full_messages = list(conv.messages or [])
    full_messages.append({"role": "user", "content": body.content})

    new_msgs, new_refs = await run_agent_turn(
        messages=full_messages,
        tools=[SEARCH_KB_TOOL],
        model=conv.model_name or _pick_model(None),
        project_document_ids=document_ids,
        industry=conv.industry,
    )
    full_messages.extend(new_msgs)

    conv.messages = full_messages
    conv.refs = list(conv.refs or []) + new_refs
    await session.commit()
    await session.refresh(conv)

    # 只返回本次新增的 assistant 可见回复（最后一条 assistant 无 tool_calls）
    reply = ""
    for m in reversed(new_msgs):
        if m.get("role") == "assistant" and not m.get("tool_calls"):
            reply = m.get("content", "") or ""
            break
    return {
        "reply": reply,
        "tool_uses": [
            {"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "")}
            for m in new_msgs if m.get("role") == "assistant"
            for tc in (m.get("tool_calls") or [])
        ],
        "refs_added": len(new_refs),
        "total_refs": len(conv.refs or []),
    }


@router.get("/{conv_id}")
async def get_chat(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    conv = await session.get(OutputConversation, conv_id)
    if not conv:
        raise HTTPException(404, "对话不存在")
    if not current_user.is_admin and conv.created_by != current_user.id:
        raise HTTPException(403, "无权访问")
    return _dto(conv)


@router.post("/{conv_id}/generate", status_code=202)
async def finalize_and_generate(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    conv = await session.get(OutputConversation, conv_id)
    if not conv:
        raise HTTPException(404, "对话不存在")
    if not current_user.is_admin and conv.created_by != current_user.id:
        raise HTTPException(403, "无权访问")
    if conv.bundle_id:
        # 重复点击保护：已经在生成或已完成
        existing = await session.get(CuratedBundle, conv.bundle_id)
        if existing:
            return {"bundle_id": existing.id, "status": existing.status}

    # 组装标题：启动会 PPT 用 "客户名/行业 启动会 PPT"，其他 kind 用 "kind · 客户/项目/行业"
    proj = None
    if conv.project_id:
        proj = await session.get(Project, conv.project_id)
    if conv.kind in ("kickoff_pptx", "kickoff_html"):
        scope = (proj.customer or proj.name) if proj else (conv.industry or "行业")
        suffix = "PPT" if conv.kind == "kickoff_pptx" else "HTML"
        title = f"{scope} 启动会 {suffix}"
    else:
        scope = (proj.customer or proj.name) if proj else (conv.industry or "行业")
        title = f"{KIND_TITLES.get(conv.kind, conv.kind)} · {scope}"

    bundle = CuratedBundle(
        kind=conv.kind,
        project_id=conv.project_id,
        title=title,
        status="pending",
        extra={"conversation_id": conv.id, "industry": conv.industry},
        created_by=current_user.id,
        created_by_name=current_user.username,
    )
    session.add(bundle)
    await session.flush()
    conv.bundle_id = bundle.id
    conv.status = "generating"
    await session.commit()

    from tasks.output_tasks import generate_kickoff_pptx, generate_kickoff_html
    task_fn = {
        "kickoff_pptx": generate_kickoff_pptx,
        "kickoff_html": generate_kickoff_html,
    }[conv.kind]
    # 沿用旧签名 (bundle_id, project_id)；project_id 可能为 None（行业作用域）
    task_fn.delay(bundle.id, conv.project_id or "")
    return {"bundle_id": bundle.id, "status": "pending"}


@router.get("")
async def list_chats(
    kind: str | None = None,
    project_id: str | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(OutputConversation).order_by(desc(OutputConversation.updated_at)).limit(min(max(limit, 1), 100))
    if not current_user.is_admin:
        stmt = stmt.where(OutputConversation.created_by == current_user.id)
    if kind:
        stmt = stmt.where(OutputConversation.kind == kind)
    if project_id:
        stmt = stmt.where(OutputConversation.project_id == project_id)
    rows = (await session.execute(stmt)).scalars().all()
    return [_dto(c, include_messages=False) for c in rows]
