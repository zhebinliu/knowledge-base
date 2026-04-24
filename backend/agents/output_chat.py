"""输出智能体对话循环：智能体带 search_kb 工具，可在会话中动态检索知识库。"""
import json
import structlog
from sqlalchemy import select
from services.model_router import model_router
from services.embedding_service import embedding_service
from services.rerank_service import rerank_service
from services.vector_store import vector_store
from models import async_session_maker
from models.chunk import Chunk
from models.document import Document
from models.project import Project
from models.skill import Skill
from models.agent_config import AgentConfig

logger = structlog.get_logger()

MAX_TOOL_ITERATIONS = 4
SEARCH_TOP_K = 8
DEFAULT_TOOL_MODEL = "qwen3-next-80b-a3b"  # OpenAI 兼容 tools，edgefn 代理支持


SEARCH_KB_TOOL = {
    "type": "function",
    "function": {
        "name": "search_kb",
        "description": "检索知识库，返回与 query 最相关的内容片段（含出处）。在需要引用客户已有资料、行业最佳实践或项目历史决策时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "检索关键词或完整问题；建议具体到模块/阶段/行业术语，如'零售行业 CRM 客户分层方案'",
                },
            },
            "required": ["query"],
        },
    },
}


async def get_output_agent_config(kind: str) -> dict:
    """返回 {prompt, skill_ids, model}。"""
    async with async_session_maker() as s:
        row = (await s.execute(
            select(AgentConfig).where(
                AgentConfig.config_type == "output_agent",
                AgentConfig.config_key == kind,
            )
        )).scalar_one_or_none()
    if row and isinstance(row.config_value, dict):
        return {
            "prompt": row.config_value.get("prompt", ""),
            "skill_ids": row.config_value.get("skill_ids", []),
            "model": row.config_value.get("model"),
        }
    return {"prompt": "", "skill_ids": [], "model": None}


async def load_skill_snippets(skill_ids: list[str]) -> str:
    if not skill_ids:
        return ""
    async with async_session_maker() as s:
        rows = (await s.execute(select(Skill).where(Skill.id.in_(skill_ids)))).scalars().all()
    by_id = {r.id: r for r in rows}
    parts = []
    for sid in skill_ids:
        r = by_id.get(sid)
        if r:
            parts.append(f"### 技能：{r.name}\n{r.prompt_snippet}")
    return "\n\n".join(parts)


async def _project_scope(project_id: str) -> tuple[str, list[str], dict]:
    """返回 (scope_description, document_ids, project_meta)。"""
    async with async_session_maker() as s:
        proj = await s.get(Project, project_id)
        if not proj:
            return "", [], {}
        doc_rows = (await s.execute(select(Document.id).where(Document.project_id == project_id))).all()
    doc_ids = [r[0] for r in doc_rows]
    meta = {
        "name": proj.name,
        "customer": proj.customer,
        "industry": proj.industry,
        "modules": proj.modules or [],
        "kickoff_date": proj.kickoff_date.isoformat() if proj.kickoff_date else None,
        "description": proj.description,
    }
    lines = [f"项目名称：{proj.name}"]
    if proj.customer: lines.append(f"客户：{proj.customer}")
    if proj.industry: lines.append(f"行业：{proj.industry}")
    if proj.modules: lines.append(f"涉及模块：{', '.join(proj.modules)}")
    if proj.kickoff_date: lines.append(f"启动日期：{proj.kickoff_date.isoformat()}")
    if proj.description: lines.append(f"项目描述：{proj.description}")
    lines.append(f"项目下已入库文档数：{len(doc_ids)}")
    return "\n".join(lines), doc_ids, meta


def _industry_scope(industry: str) -> str:
    return f"行业：{industry}\n（本次没有锁定具体项目，请按该行业的共性情况与用户对话，工具检索时会自动限定在该行业相关的知识。）"


def build_system_prompt(
    kind: str,
    agent_prompt: str,
    skill_text: str,
    scope_desc: str,
) -> str:
    kind_label = {
        "kickoff_pptx": "启动会 PPT",
        "survey": "实施调研问卷",
        "insight": "项目洞察报告",
    }.get(kind, kind)

    return f"""你是一位资深顾问，当前任务是通过一轮对话收集信息，最终为用户生成《{kind_label}》。

# 你的工作流
1. **开场**：用一段友好、专业的话问候用户，告诉他你会怎么协作（几轮对话、大致问哪些维度），然后抛出第一个开场问题。
2. **持续提问**：基于用户的回答，在合适的节点调用 `search_kb` 工具，把**行业/客户名/模块/关键术语**作为 query，拿到知识库证据后再继续追问或补充建议。**不要一上来就盲目检索**，先听用户说，再按需检索。
3. **给选项**：当问题有常见答案范围（阶段、规模、模式、选项 A/B/C 等），**尽量把选项列出来让用户挑**，在问题末尾单独起一行附上下面格式（前端会把这段解析为可点击的 chip，用户点选后作为下一条消息返回给你）。**千万不要**把这行放进反引号或代码块里，也不要加任何装饰——原文输出：

   <choices>["选项A","选项B","选项C"]</choices>

   允许多选时改写成： <choices multi="true">["A","B","C"]</choices> 。
4. **阶段性小结**：每 3~4 轮对话做一次复盘，用 bullet 复述你收集到的关键事实，便于用户校正。
5. **结束**：当你判断信息已经足够生成一份高质量的《{kind_label}》，明确告诉用户"我们可以开始生成了，点击右下角「生成文档」按钮"。不要自己生成正文——正文会在用户点按钮后由独立的生成流程完成。

# 作用域
{scope_desc}

# 方法论 / 风格要求（来自输出智能体配置）
{agent_prompt or "（未配置，按通用顾问视角提问）"}

# 启用的技能片段
{skill_text or "（未启用任何技能）"}

# 工具使用规则
- `search_kb(query)` 每轮最多调 2 次；同一 query 不要重复调用
- 没有信息需要检索时直接回答，不要硬调工具
- 检索到的片段要消化后自然融入对话，不要原文粘贴给用户
- 所有回复必须使用简体中文

# 对话风格
- 一次只问 1~2 个问题，避免轰炸
- 问题具体、可作答，避免大而空的"您怎么看"
- 如果用户答得简略，追问一层细节；答得详细，点头确认后推进下一维度
"""


async def _run_search_kb(
    query: str,
    project_document_ids: list[str] | None,
    industry: str | None,
) -> tuple[str, list[dict]]:
    """执行 search_kb 工具；返回 (给模型看的文本, 结构化 refs)。"""
    try:
        qvec = await embedding_service.embed(query, use_cache=True)
        raw = await vector_store.search(
            qvec,
            top_k=SEARCH_TOP_K * 2,
            industry=industry,
            document_ids=project_document_ids,
        )
        if not raw:
            # industry 过滤过严？降级一次广召
            raw = await vector_store.search(qvec, top_k=SEARCH_TOP_K * 2, document_ids=project_document_ids)
        if not raw:
            return "（知识库没有与之相关的内容）", []

        docs = [r["payload"].get("content_preview", "") for r in raw]
        try:
            reranked = await rerank_service.rerank(query, docs, top_n=SEARCH_TOP_K)
            top = [raw[idx] for idx, _ in reranked]
        except Exception:
            top = raw[:SEARCH_TOP_K]

        # 补文档标题 / section
        chunk_ids = [r["id"] for r in top]
        async with async_session_maker() as s:
            rows = (await s.execute(
                select(Chunk.id, Chunk.content, Chunk.source_section, Chunk.document_id, Chunk.ltc_stage, Document.filename)
                .join(Document, Document.id == Chunk.document_id)
                .where(Chunk.id.in_(chunk_ids))
            )).all()
        detail_map = {r.id: r for r in rows}

        refs: list[dict] = []
        text_blocks: list[str] = []
        for r in top:
            d = detail_map.get(r["id"])
            content = (d.content if d else r["payload"].get("content_preview", "")) or ""
            content = content[:600]
            filename = d.filename if d else ""
            section = (d.source_section if d else "") or ""
            stage = (d.ltc_stage if d else r["payload"].get("ltc_stage", "")) or ""
            refs.append({
                "chunk_id": r["id"],
                "document_id": d.document_id if d else "",
                "filename": filename,
                "source_section": section,
                "ltc_stage": stage,
                "content": content,
                "query": query,
            })
            header = f"[{filename or '未知文档'}" + (f" · {section}" if section else "") + (f" · {stage}" if stage else "") + "]"
            text_blocks.append(f"{header}\n{content}")
        return "\n\n".join(text_blocks), refs
    except Exception as e:
        logger.warning("search_kb_failed", error=str(e)[:200])
        return f"（检索失败：{str(e)[:120]}）", []


def _pick_model(preferred: str | None) -> str:
    if preferred and preferred in {
        "minimax-m2.5", "minimax-m2.7", "mimo-v2-pro", "mimo-v2-omni",
        "glm-5", "glm-4.7", "qwen3-next-80b-a3b", "qwen3-235b-a22b",
    }:
        return preferred
    return DEFAULT_TOOL_MODEL


async def run_agent_turn(
    *,
    messages: list[dict],
    tools: list[dict],
    model: str,
    project_document_ids: list[str] | None,
    industry: str | None,
) -> tuple[list[dict], list[dict]]:
    """执行一轮 agent 循环（含工具调用）。返回 (追加到 messages 的条目, 本轮新增 refs)。

    追加条目顺序为：可能的 (assistant w/ tool_calls) + (tool results) 反复，最终一条无 tool_calls 的 assistant。
    """
    new_msgs: list[dict] = []
    new_refs: list[dict] = []
    current = list(messages)

    for it in range(MAX_TOOL_ITERATIONS):
        result = await model_router.chat_with_tools(
            model, current, tools=tools, tool_choice="auto", max_tokens=4000, temperature=0.4,
        )
        content = result.get("content")
        tool_calls = result.get("tool_calls") or []

        if tool_calls:
            # 规范化：保留 id / type / function
            normalized = [
                {
                    "id": tc.get("id") or f"call_{it}_{idx}",
                    "type": tc.get("type", "function"),
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"].get("arguments", "{}"),
                    },
                }
                for idx, tc in enumerate(tool_calls)
            ]
            assistant_msg = {"role": "assistant", "content": content or "", "tool_calls": normalized}
            new_msgs.append(assistant_msg)
            current.append(assistant_msg)

            for tc in normalized:
                fn = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"] or "{}")
                except Exception:
                    args = {}
                if fn == "search_kb":
                    q = (args.get("query") or "").strip()
                    if not q:
                        tool_text = "（query 为空）"
                    else:
                        tool_text, refs = await _run_search_kb(q, project_document_ids, industry)
                        new_refs.extend(refs)
                else:
                    tool_text = f"（未知工具 {fn}）"
                tool_msg = {"role": "tool", "tool_call_id": tc["id"], "content": tool_text}
                new_msgs.append(tool_msg)
                current.append(tool_msg)
            # 继续循环，拿到最终的自然语言回复
            continue

        # 没有 tool_calls → assistant 的最终回复
        assistant_msg = {"role": "assistant", "content": content or ""}
        new_msgs.append(assistant_msg)
        return new_msgs, new_refs

    # 超过最大轮数仍在调工具：兜底说一句
    fallback = {"role": "assistant", "content": "（抱歉，思考有点绕进死循环。我们换个角度：请先告诉我当前最想让我聚焦的一个问题。）"}
    new_msgs.append(fallback)
    return new_msgs, new_refs
