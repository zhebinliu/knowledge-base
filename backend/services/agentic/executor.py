"""Executor — 单模块 / 单分卷的 LLM 填充。

每个 module / subsection 一个 executor 调用,返回 markdown 内容。
所有 executor 可并行调度(由 runner 编排)。
"""
import structlog
from typing import Any

from .insight_modules import ModuleSpec, get_module
from .survey_modules import SubsectionSpec, get_subsection, L1_EXEC_SUBSECTION
from .planner import ModuleAssessment, FieldState, ExecutionPlan, SurveyPlan
from .industry_packs import get_pack

logger = structlog.get_logger()


# ── 共享 helpers ───────────────────────────────────────────────────────────────

def _format_field_states(assessment: ModuleAssessment) -> str:
    """渲染 module 的 field 评估为 prompt 用的 markdown 块。"""
    if not assessment.fields:
        return "（本模块无字段评估）"
    lines = []
    for k, fs in assessment.fields.items():
        if fs.status == "available":
            val_str = str(fs.value)[:300] if fs.value is not None else "—"
            lines.append(f"- **{fs.label}** [{fs.source}] ✓: {val_str}")
        elif fs.status == "deferred":
            lines.append(f"- **{fs.label}** [{fs.source} → 你需要从访谈/检索结果中提取]: {fs.note}")
        elif fs.status == "missing":
            lines.append(f"- **{fs.label}** ✗: {fs.note}")
    return "\n".join(lines)


def _format_kb_refs(refs: list[dict], for_module_key: str | None = None) -> str:
    """格式化 kb refs(可按 module 过滤)。"""
    if not refs:
        return ""
    blocks = []
    seen = set()
    for r in refs:
        if for_module_key and r.get("for_module") and r["for_module"] != for_module_key:
            continue
        cid = r.get("chunk_id")
        if cid in seen:
            continue
        seen.add(cid)
        header = f"[{r.get('filename') or '未知'}" + (f" · {r['source_section']}" if r.get("source_section") else "") + "]"
        blocks.append(f"{header}\n{(r.get('content') or '')[:400]}")
    return "\n\n".join(blocks[:8])


def _format_project_block(project) -> str:
    if not project:
        return "（无项目元数据）"
    lines = [f"项目名:{project.name}"]
    if project.customer:
        lines.append(f"客户:{project.customer}")
    if project.industry:
        lines.append(f"行业:{project.industry}")
    if project.modules:
        lines.append(f"模块:{', '.join(project.modules)}")
    if project.kickoff_date:
        lines.append(f"启动:{project.kickoff_date.isoformat()}")
    if project.description:
        lines.append(f"描述:{project.description[:200]}")
    return "\n".join(lines)


def _format_docs_block(docs_by_type: dict | None, max_chars_per_doc: int = 4000) -> str:
    """把 docs_by_type({doc_type: [{doc_id, filename, summary, markdown}]}) 渲染成 prompt 用的块。

    每个文档:摘要 + 截断的 markdown(避免 prompt 爆 token)。
    LLM 会自己挑相关章节作为证据。每段引用时要带 [文档名] 标识。
    """
    if not docs_by_type:
        return ""
    from models.project import DOC_TYPE_LABELS
    parts = ["### 项目上传文档(按类型分组,作为生成依据,引用必须标 [文档名]):"]
    for doc_type, docs in docs_by_type.items():
        type_label = DOC_TYPE_LABELS.get(doc_type, doc_type)
        for d in docs:
            content = (d.get("markdown") or d.get("summary") or "").strip()
            if not content:
                continue
            if len(content) > max_chars_per_doc:
                content = content[:max_chars_per_doc] + f"\n…(余下 {len(content) - max_chars_per_doc} 字省略)"
            parts.append(f"\n**[{type_label} · {d.get('filename', '未命名')}]**\n{content}")
    return "\n".join(parts) if len(parts) > 1 else ""


def _format_industry_pack_block(industry: str | None) -> str:
    pack = get_pack(industry)
    if not pack:
        return ""
    parts = [f"### 行业包:{pack.display_name}"]
    if pack.pain_points:
        parts.append("**典型痛点:**\n" + "\n".join(f"- {p}" for p in pack.pain_points[:8]))
    if pack.cases:
        parts.append("**标杆案例:**")
        for c in pack.cases[:3]:
            parts.append(f"- **{c['name']}**: {c.get('pattern', '')}\n  教训:{c.get('lessons', '')[:120]}")
    return "\n\n".join(parts)


# ── Insight 单模块执行 ────────────────────────────────────────────────────────

async def execute_insight_module(
    *,
    module: ModuleSpec,
    assessment: ModuleAssessment,
    project,
    industry: str | None,
    transcript: str,
    refs: list[dict],
    extra_kb_refs: dict[str, list[dict]],
    skill_text: str,
    agent_prompt: str,
    model: str | None,
    docs_by_type: dict | None = None,           # v3 新增
    web_research_block: str = "",                # v3 新增(M9 用)
) -> str:
    """生成单个 insight 模块的 markdown 内容。"""
    from services.output_service import _llm_call

    fields_block = _format_field_states(assessment)
    project_block = _format_project_block(project)

    # 组合 refs:对话期 refs + 该模块对应的 KB 补充
    module_refs = list(refs or [])
    for fk, rlist in extra_kb_refs.items():
        for r in rlist:
            if r.get("for_module") == module.key:
                module_refs.append(r)
    refs_block = _format_kb_refs(module_refs, for_module_key=None)

    # 行业包(只在该模块的 industry_filter 命中或开放给所有模块的 M9_industry_benchmark)
    industry_block = ""
    if module.industry_filter or module.key == "M9_industry_benchmark":
        industry_block = _format_industry_pack_block(industry)

    # v3 新增:项目上传文档(按 doc_type 分组,作为最权威证据)
    docs_block = _format_docs_block(docs_by_type)

    # 拼装 prompt(使用 module.prompt_template 的占位符)
    user_prompt = module.prompt_template.format(
        fields_block=f"【字段评估】\n{fields_block}",
        project_block=f"【项目元数据】\n{project_block}",
        evidence_block=(
            (f"{docs_block}\n\n" if docs_block else "")           # ← 文档放最前(权威优先)
            + f"【访谈记录】\n{transcript or '（无访谈记录）'}\n\n"
            + f"【证据材料(知识库)】\n{refs_block or '（无证据材料）'}\n\n"
            + (f"{web_research_block}\n\n" if web_research_block else "")
            + (f"{industry_block}\n\n" if industry_block else "")
            + (f"【方法论】\n{agent_prompt}\n\n" if agent_prompt else "")
            + (f"【启用技能】\n{skill_text}" if skill_text else "")
        ),
    )

    system = f"""你是 MBB 风格的资深 CRM 实施咨询顾问。
你正在生成项目洞察报告的【{module.title}】章节。

【模块目的】{module.purpose}

【输出契约】
- 只输出本节正文,不要重复输出"# {module.title}"标题(系统会注入)
- 用简体中文 + Markdown
- 关键 rubric 维度:{', '.join(module.rubric_focus)}
- 缺信息时写"信息缺失,建议在 Phase 1 第一周补访"或类似表达;**绝不**编造

【信息源标注 — 强制执行】
- 每个事实陈述末尾必须标来源,采用句子级内联角标格式:`句子内容[^N]`
- N 是数字编号(从 1 开始,本节内连续)
- 在该模块文末输出来源映射(每段独立一行):
    [^1]: SOW 需求说明书 · 章节名 / 段落片段
    [^2]: 访谈 · 张三(销售总监)
    [^3]: 知识库 · 文档名
    [^4]: Web · domain.com
- 来源类型分 5 种:**文档**(用 [文档名] 标识)/ **访谈** / **知识库** / **Web** / **推断**
- 编造或来源不明的内容一律不写;宁可写"信息缺失"也不要瞎扯
- 只能引用上述 evidence_block 里给出的素材,**closed-corpus**(不许编)
"""
    try:
        content = await _llm_call(user_prompt, system=system, model=model, max_tokens=3000, timeout=180.0)
        return content.strip()
    except Exception as e:
        logger.warning("insight_executor_failed", module=module.key, error=str(e)[:200])
        return f"_（本模块生成失败:{str(e)[:120]}）_"


# ── Survey 单分卷执行 ─────────────────────────────────────────────────────────

async def execute_survey_subsection(
    *,
    subsection: SubsectionSpec,
    project,
    industry: str | None,
    transcript: str,
    already_covered: list[str],
    extra_seeds_from_pack: list[dict],
    skill_text: str,
    agent_prompt: str,
    model: str | None,
) -> str:
    """生成单个 survey 分卷的 markdown 内容(题目列表)。"""
    from services.output_service import _llm_call

    # 选出与本 subsection 所属 theme 相关的额外种子(基于 theme key 简单匹配)
    theme_relevant_seeds = []
    sub_theme_key = ""
    from .survey_modules import SURVEY_THEMES, L1_EXEC_SUBSECTION
    if subsection.key == L1_EXEC_SUBSECTION.key:
        sub_theme_key = "_l1_"
    else:
        for t in SURVEY_THEMES:
            if subsection in t.subsections:
                sub_theme_key = t.key
                break
    for seed in extra_seeds_from_pack:
        if seed.get("theme") == sub_theme_key:
            theme_relevant_seeds.append(seed)

    # 渲染种子(标准 + 行业)
    seeds_block_lines = []
    for s in subsection.question_seeds:
        seeds_block_lines.append(f"- [{s.get('type', '?')}] {s.get('text', '')}  *(为什么问:{s.get('why', '')})*")
    if theme_relevant_seeds:
        seeds_block_lines.append("")
        seeds_block_lines.append(f"**[行业包补充种子 — {get_pack(industry).display_name if get_pack(industry) else ''}]**")
        for s in theme_relevant_seeds:
            seeds_block_lines.append(f"- [{s.get('type', '?')}] {s.get('text', '')}  *(为什么问:{s.get('why', '')})*")
    seeds_block = "\n".join(seeds_block_lines) or "（无种子)"

    # must_cover
    must_cover_block = "\n".join(f"- {x}" for x in subsection.must_cover)

    # already covered
    covered_block = ", ".join(already_covered) if already_covered else "（无)"

    project_block = _format_project_block(project)
    industry_block = _format_industry_pack_block(industry) if subsection.industry_filter else ""

    target_roles_label = " / ".join(subsection.target_roles)
    qmin, qmax = subsection.question_count_target

    user_prompt = f"""请为本分卷生成一份**实施前调研问卷**(Markdown 格式)。

【分卷】{subsection.title}({subsection.layer})
【目标受众】{target_roles_label}
【题量目标】{qmin} - {qmax} 题
【必须覆盖的子主题】
{must_cover_block}

【已经在访谈中覆盖的话题(请避免重复问)】
{covered_block}

【种子问题(参考,但要根据客户场景具体化)】
{seeds_block}

【项目元数据】
{project_block}

【访谈记录(用于个性化题目)】
{transcript or '（无访谈记录,按通用情形出题)'}

{industry_block + chr(10) + chr(10) if industry_block else ''}{f"【方法论】{chr(10)}{agent_prompt}{chr(10)}{chr(10)}" if agent_prompt else ''}{f"【启用技能】{chr(10)}{skill_text}" if skill_text else ''}

【输出格式 — 严格遵守】
顶部加一段说明(1-2 句):本分卷的目的 + 预计填答时间 + 由谁填。

每题格式:
```
### {qmin}. <问题正文>
- 类型: [事实型 / 判断型 / 数据型 / 开放题]
- *为什么问:* <一句话>
- *答案如何使用:* <一句话>
- 选项(如适用): A. ... / B. ... / C. ...
```

【约束】
- 每题问题颗粒度具体到可作答(不是"贵司销售流程如何?")
- 已访谈过的话题不重复
- 单分卷题量必须在 {qmin}-{qmax} 范围内
- 不写黑话(赋能/抓手/闭环/链路/生态)
- 用简体中文
"""
    system = f"""你是 MBB 风格的资深 CRM 实施咨询顾问,擅长设计实施前调研问卷。
你正在为分卷【{subsection.title}】生成问题。

设计原则:
- MECE 思维(子主题不重叠不遗漏)
- 区分事实型 / 判断型 / 数据型 / 开放题
- 每题带"为什么问 / 答案如何使用"
- 单分卷控制在 {qmin}-{qmax} 题,5-10 分钟可填完
- 已访谈覆盖的话题不再重复出
"""
    try:
        content = await _llm_call(user_prompt, system=system, model=model, max_tokens=4000, timeout=180.0)
        return content.strip()
    except Exception as e:
        logger.warning("survey_executor_failed", subsection=subsection.key, error=str(e)[:200])
        return f"_（本分卷生成失败:{str(e)[:120]}）_"
