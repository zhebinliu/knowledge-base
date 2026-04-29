"""Executor — 单模块 / 单分卷的 LLM 填充。

每个 module / subsection 一个 executor 调用,返回 markdown 内容 + provenance 索引。
所有 executor 可并行调度(由 runner 编排)。

v3:引入 sources_index 机制,后端给每个 source(doc/kb/web)显式编号 D1/K1/W1,
LLM 在生成正文时强约束用这些 ID 引用,Executor 后处理:
  - 正则把 `[D1]` 替换成 markdown footnote `[^D1]`
  - 在内容末尾追加 footnote 定义区块(`[^D1]: SOW · 文件名`)
  - 返回 sources_index 给 runner 写入 bundle.extra.provenance
前端用这个 provenance 渲染角标 hover preview + 跳右栏引用栏。
"""
import re
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


def _build_sources_index(
    *,
    docs_by_type: dict | None,
    conv_refs: list[dict] | None,
    extra_kb_refs: dict | None,
    web_research_refs: list[dict] | None,
    module_key: str,
    max_chars_per_doc: int = 30000,   # 项目洞察阶段:文档喂全文(不走切片召回);
                                       # 30000 字 ≈ 10-12k tokens / 文档,够覆盖 SOW / 方案 / 合同等长文。
                                       # 后续若改走 RAG 切片召回再降回小值。
) -> tuple[dict, str]:
    """构建该模块的 sources_index(后端给每个 source 编号)+ 渲染的 evidence_block 文本。

    Returns: (sources_index, evidence_block_text)

    sources_index 结构:
        {
          "D1": {"type":"doc",  "label":"SOW 需求说明书 · xxx.docx",
                 "doc_id":"...", "filename":"...", "doc_type":"sow", "snippet":"..."},
          "K1": {"type":"kb",   "label":"KB · 文件名 · 章节",
                 "chunk_id":"...", "filename":"...", "section":"...", "snippet":"..."},
          "W1": {"type":"web",  "label":"标题",
                 "url":"...", "domain":"...", "snippet":"..."},
        }

    evidence_block 里每个 source 前面会显式标 [D1] [K1] [W1],强约束 LLM 用这些 ID 引用。
    """
    sources_index: dict[str, dict] = {}
    blocks: list[str] = []
    next_d = 1
    next_k = 1
    next_w = 1
    seen_chunks: set = set()

    # 1. 项目上传文档
    if docs_by_type:
        from models.project import DOC_TYPE_LABELS
        blocks.append("### 项目上传文档(权威源,引用用 [D1] [D2] 这种 ID):")
        for doc_type, docs in docs_by_type.items():
            type_label = DOC_TYPE_LABELS.get(doc_type, doc_type)
            for d in docs:
                content = (d.get("markdown") or d.get("summary") or "").strip()
                if not content:
                    continue
                src_id = f"D{next_d}"
                next_d += 1
                excerpt = content[:max_chars_per_doc]
                if len(content) > max_chars_per_doc:
                    excerpt += f"\n…(余下 {len(content) - max_chars_per_doc} 字省略)"
                sources_index[src_id] = {
                    "type": "doc",
                    "label": f"{type_label} · {d.get('filename', '未命名')}",
                    "doc_id": d.get("doc_id"),
                    "filename": d.get("filename"),
                    "doc_type": doc_type,
                    "snippet": (d.get("summary") or content[:200])[:300],
                }
                blocks.append(f"\n**[{src_id}] {type_label} · {d.get('filename')}**\n{excerpt}")

    # 2. 对话期 KB refs(过滤当前 module)
    kb_pool: list[dict] = []
    for r in (conv_refs or []):
        if not r.get("for_module") or r["for_module"] == module_key:
            kb_pool.append(r)
    for fk, rlist in (extra_kb_refs or {}).items():
        for r in rlist:
            if not r.get("for_module") or r["for_module"] == module_key:
                kb_pool.append(r)

    if kb_pool:
        blocks.append("\n### 知识库证据(引用用 [K1] [K2] 这种 ID):")
        for r in kb_pool:
            cid = r.get("chunk_id")
            if cid in seen_chunks:
                continue
            seen_chunks.add(cid)
            src_id = f"K{next_k}"
            next_k += 1
            section = r.get("source_section") or ""
            filename = r.get("filename") or "未知文档"
            label = f"KB · {filename}" + (f" · {section}" if section else "")
            content = (r.get("content") or "")[:400]
            sources_index[src_id] = {
                "type": "kb",
                "label": label,
                "chunk_id": cid,
                "filename": filename,
                "section": section,
                "snippet": content[:300],
            }
            blocks.append(f"\n**[{src_id}] {label}**\n{content}")
            if next_k > 12:    # 限制单模块 KB 引用数量
                break

    # 3. Web research refs(M9 行业最佳实践用)
    if web_research_refs:
        blocks.append("\n### 互联网检索结果(权重低于 KB,引用用 [W1] [W2] 这种 ID):")
        for w in web_research_refs:
            src_id = f"W{next_w}"
            next_w += 1
            url = w.get("url") or ""
            domain = w.get("domain") or (url.split("/")[2] if "//" in url else "")
            title = (w.get("title") or "")[:80]
            snippet = (w.get("snippet") or "")[:300]
            sources_index[src_id] = {
                "type": "web",
                "label": title or domain,
                "url": url,
                "domain": domain,
                "snippet": snippet,
            }
            blocks.append(f"\n**[{src_id}] {title}** ({domain})\n{snippet}")

    return sources_index, "\n".join(blocks)


# 后处理:把 LLM 输出的 [D1] [K1] [W1] 转成 markdown link `[D1](#cite-<module_key>-D1)`
# 前端 CitedReportView 自定义 a renderer 检测 #cite- 前缀,渲染为可点击角标 + 跳引用栏
_INLINE_CITATION_RE = re.compile(r'\[([DKW]\d{1,3})\](?!\()')   # [D1] 但不是 [D1](url)


def _post_process_citations(content: str, sources_index: dict, module_key: str) -> tuple[str, dict]:
    """正则把 [D1] → `[D1](#cite-<module_key>-D1)`(markdown link)。

    前端 CitedReportView 检测 `#cite-` 前缀,把链接渲染为可点击角标 chip,
    点击触发 onCitationClick(moduleKey, refId) → 父组件跳右栏引用面板。

    Returns: (new_content, used_sources_index_filtered_to_used_ids)
    """
    if not content:
        return content, {}
    used_ids = set(_INLINE_CITATION_RE.findall(content))
    if not used_ids:
        return content, {}
    # 替换 [D1] → [D1](#cite-<module_key>-D1)
    def repl(m):
        sid = m.group(1)
        return f"[{sid}](#cite-{module_key}-{sid})"
    new_content = _INLINE_CITATION_RE.sub(repl, content)
    used_index = {sid: sources_index[sid] for sid in used_ids if sid in sources_index}
    return new_content, used_index


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
    docs_by_type: dict | None = None,
    web_research_refs: list[dict] | None = None,    # v3 改:从 block 改成结构化 list
) -> dict:
    """生成单个 insight 模块的内容 + provenance。

    Returns: {"content": str, "sources_index": dict}
    """
    from services.output_service import _llm_call

    fields_block = _format_field_states(assessment)
    project_block = _format_project_block(project)

    # v3 核心:统一编号所有 source,生成 sources_index + evidence_block
    sources_index, evidence_text = _build_sources_index(
        docs_by_type=docs_by_type,
        conv_refs=refs,
        extra_kb_refs=extra_kb_refs,
        web_research_refs=web_research_refs if module.key == "M9_industry_benchmark" else None,
        module_key=module.key,
    )

    # 行业包(只在该模块的 industry_filter 命中或 M9 开放)
    industry_block = ""
    if module.industry_filter or module.key == "M9_industry_benchmark":
        industry_block = _format_industry_pack_block(industry)

    # 拼装 prompt
    user_prompt = module.prompt_template.format(
        fields_block=f"【字段评估】\n{fields_block}",
        project_block=f"【项目元数据】\n{project_block}",
        evidence_block=(
            (f"{evidence_text}\n\n" if evidence_text else "")
            + f"【访谈记录】\n{transcript or '（无访谈记录,引用时不要造 ID）'}\n\n"
            + (f"{industry_block}\n\n" if industry_block else "")
            + (f"【方法论】\n{agent_prompt}\n\n" if agent_prompt else "")
            + (f"【启用技能】\n{skill_text}" if skill_text else "")
        ),
    )

    # 准备给 LLM 看的 ID 范围说明
    available_ids = sorted(sources_index.keys(),
                           key=lambda x: (x[0], int(x[1:]) if x[1:].isdigit() else 0))
    ids_summary = ", ".join(available_ids[:30]) if available_ids else "(无可引用素材)"

    system = f"""你是 MBB 风格的资深 CRM 实施咨询顾问。
你正在生成项目洞察报告的【{module.title}】章节。

【模块目的】{module.purpose}

【输出契约】
- 只输出本节正文,不要重复输出"# {module.title}"标题(系统会注入)
- 用简体中文 + Markdown
- 关键 rubric 维度:{', '.join(module.rubric_focus)}
- 缺信息时写"信息缺失,建议在 Phase 1 第一周补访";**绝不**编造数据或来源

【信息源引用 — 强制执行】
- evidence_block 里每个 source 都已经标了 ID:[D1][D2]... 是上传文档,
  [K1][K2]... 是知识库证据,[W1][W2]... 是 Web 检索结果
- 本节可用的 ID:{ids_summary}
- 你在正文里**每个事实陈述末尾**必须用 ID 引用,格式:
    "陕西分公司 12/15 出现 2 次商机审批超时 [D2][K3]"
    "行业典型周期 6-9 个月 [W1]"
- **不要**自己编新的 ID(如 [^1] [^2] 这种数字 footnote);只能用上面列出的 ID。
- **不要**用"[访谈]"/"[KB]"/"[Brief]"这种泛化标签 — 必须用具体 ID。
- 系统会自动把 [D1] 转成可点击的 footnote,前端能 hover 看原文。
- 如果某段没素材支撑,写"信息缺失"或干脆别写;**绝不**裸输出无引用的事实。
"""
    try:
        raw_content = await _llm_call(user_prompt, system=system, model=model,
                                      max_tokens=3000, timeout=180.0)
        content_processed, used_sources = _post_process_citations(
            raw_content.strip(), sources_index, module.key,
        )
        return {
            "content": content_processed,
            "sources_index": used_sources,
        }
    except Exception as e:
        logger.warning("insight_executor_failed", module=module.key, error=str(e)[:200])
        return {
            "content": f"_（本模块生成失败:{str(e)[:120]}）_",
            "sources_index": {},
        }


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
