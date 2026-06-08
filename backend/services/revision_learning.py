"""修订版学习 — 对比 AI 原版 vs 用户修订版,LLM 抽取「用户偏好笔记」。

使用方:
- `backend/tasks/output_tasks.py::analyze_bundle_revision` Celery 任务
- 任务完成后写入 `bundle_revision_memories` 表,下次同 kind 生成时拼到 system prompt 顶部

设计:
- 输入两份 markdown(原版 + 修订版),都太长时截断(各保留首尾共 8000 字符)
- 输出:3-5 条「用户总是...」结构的笔记,Markdown bullet 形式
- 模型走 model_router 的 `revision_learning` task,primary minimax-m2.7
"""
from __future__ import annotations
import structlog
from services.model_router import model_router

logger = structlog.get_logger()

# 每份输入的最大字符数(超出取首尾)
_MAX_CHARS_PER_SIDE = 8000

# bundle_kind 到中文标签的映射(给 LLM 看更友好)
KIND_LABELS = {
    "blueprint_design": "蓝图设计",
    "object_field_layout": "对象字段表",
    "process_setup": "流程建设表",
    "research_report": "调研报告",
}


def _truncate_head_tail(text: str, max_chars: int) -> str:
    """超长时取首尾,中间用省略说明替代,保留结构感。"""
    if len(text) <= max_chars:
        return text
    head_n = max_chars * 2 // 3
    tail_n = max_chars - head_n - 80
    return (
        text[:head_n]
        + f"\n\n[... 此处省略 {len(text) - head_n - tail_n} 字符,中间内容已截断 ...]\n\n"
        + text[-tail_n:]
    )


_SYSTEM_PROMPT = """你是一位资深的纷享销客 CRM 实施咨询顾问 coach。

你的工作:对比同一份「{kind_label}」产物的 **AI 原版** 和 **用户人工修订版**,
找出用户的**系统性修订偏好**,沉淀成「下次 AI 生成时应当遵循的规则」。

输出要求:
- 3-5 条规则,Markdown 无序列表
- 每条规则用「用户偏好...」「应当...」「避免...」开头
- 抓**模式**,不抓**单点细节**(例:「字段描述应当包含使用场景示例」是模式,
  「把『客户类型』改成『客户分级』」是细节,不要)
- 每条规则后面用括号简短解释这个偏好为什么对该类产物有价值
- 仅基于这次对比能稳定观察到的偏好,不要凭空发挥
- 如果两版差异非常小(只是错别字 / 格式微调),输出一条「(本次修订仅为表面调整,无显著系统性偏好)」

不要输出标题、不要输出前后铺垫,直接给规则列表。"""


_USER_TEMPLATE = """## AI 原版({kind_label}, {original_chars} 字符)

```markdown
{original_md}
```

## 用户修订版({kind_label}, {new_chars} 字符)

```markdown
{revised_md}
```

请输出 3-5 条用户的修订偏好规则。"""


async def analyze_revision(
    original_md: str,
    revised_md: str,
    kind: str,
) -> tuple[str, str]:
    """对比原版 + 修订版,产出修订笔记。

    返回 (notes_md, model_name) — model_name 是实际使用的模型(主或回落)。
    """
    kind_label = KIND_LABELS.get(kind, kind)

    # 截断超长输入
    original_truncated = _truncate_head_tail(original_md, _MAX_CHARS_PER_SIDE)
    revised_truncated = _truncate_head_tail(revised_md, _MAX_CHARS_PER_SIDE)

    system_prompt = _SYSTEM_PROMPT.format(kind_label=kind_label)
    user_prompt = _USER_TEMPLATE.format(
        kind_label=kind_label,
        original_chars=len(original_md),
        new_chars=len(revised_md),
        original_md=original_truncated,
        revised_md=revised_truncated,
    )

    logger.info(
        "revision_learning_start",
        kind=kind,
        original_chars=len(original_md),
        new_chars=len(revised_md),
        original_truncated=len(original_truncated) < len(original_md),
        revised_truncated=len(revised_truncated) < len(revised_md),
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    content, model_used = await model_router.chat_with_routing(
        task="revision_learning",
        messages=messages,
        max_tokens=1200,
        temperature=0.3,  # 偏稳定,不需要太创新
    )

    notes = (content or "").strip()

    # 边界检查:输出不该过短(< 20 字符基本是失败)或过长
    if len(notes) < 20:
        logger.warning("revision_learning_too_short", kind=kind, notes=notes)
        notes = "(本次修订未能提炼出明确的系统性偏好)"
    elif len(notes) > 3000:
        notes = notes[:3000] + "\n\n[输出被截断到 3000 字符]"

    logger.info("revision_learning_done", kind=kind, model=model_used, notes_chars=len(notes))
    return notes, model_used


# ── 生成时注入 ──────────────────────────────────────────────────────────────

# 注入到 system prompt 的上限:避免历史 memory 无限堆积膨胀 prompt
_MAX_MEMORIES = 10
_MAX_TOTAL_CHARS = 4000


async def fetch_revision_memories_block(
    kind: str,
    limit: int = _MAX_MEMORIES,
    max_chars: int = _MAX_TOTAL_CHARS,
) -> str:
    """SELECT 启用中的修订笔记,按 kind / DESC / LIMIT 拼成一段可直接 prepend 到 SYSTEM_PROMPT 的字符串。

    没有 memory 时返回空串。带 header 和分隔符,直接放在 SYSTEM_PROMPT 前面即可。
    """
    from sqlalchemy import select
    from models import async_session_maker
    from models.bundle_revision_memory import BundleRevisionMemory

    try:
        async with async_session_maker() as session:
            rows = (await session.execute(
                select(BundleRevisionMemory)
                .where(BundleRevisionMemory.bundle_kind == kind)
                .where(BundleRevisionMemory.enabled.is_(True))
                .order_by(BundleRevisionMemory.created_at.desc())
                .limit(limit)
            )).scalars().all()
    except Exception as e:
        logger.warning("revision_memories_fetch_failed", kind=kind, error=str(e)[:200])
        return ""

    if not rows:
        return ""

    # 倒序遍历加进去(最新的优先),累计字符到上限就停
    parts: list[str] = []
    total = 0
    for r in rows:
        block = (r.notes_md or "").strip()
        if not block:
            continue
        # 每条笔记前加序号,便于 LLM 引用
        section = f"### 历史修订经验 #{len(parts) + 1}\n{block}"
        if total + len(section) > max_chars:
            break
        parts.append(section)
        total += len(section)

    if not parts:
        return ""

    header = (
        "## 历史用户修订经验(请在生成本次产物时遵循以下偏好规则)\n\n"
        "以下是历史上同类产物被用户人工修订后,沉淀下来的偏好规则。"
        "在不与本次具体任务冲突的前提下,生成时应主动满足这些偏好,以减少后续被再次修订的可能。\n\n"
    )
    footer = "\n\n---\n\n"
    return header + "\n\n".join(parts) + footer


def prepend_revision_memories_sync(system_prompt: str, memories_block: str) -> str:
    """把 fetched memories block 拼到 SYSTEM_PROMPT 前面。memories_block 空串时返回原 system_prompt 不变。"""
    if not memories_block:
        return system_prompt
    return memories_block + system_prompt
