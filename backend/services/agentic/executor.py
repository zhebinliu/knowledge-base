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
    from datetime import date
    today = date.today()
    # 今天日期放最上面 — LLM 生成"Deadline 2 周内 / 本月 / 季度"等内容时
    # 必须基于真实当前日期,避免输出"2025-09-05"这种过期日期
    lines = [
        f"今天日期:{today.isoformat()}(W{today.isocalendar().week:02d}, 周{today.isoweekday()})",
    ]
    if not project:
        lines.append("（无项目元数据）")
        return "\n".join(lines)
    lines.append(f"项目名:{project.name}")
    if project.customer:
        lines.append(f"客户:{project.customer}")
    if project.industry:
        lines.append(f"行业:{project.industry}")
    if project.modules:
        lines.append(f"模块:{', '.join(project.modules)}")
    if project.kickoff_date:
        delta_days = (today - project.kickoff_date).days
        lines.append(f"启动:{project.kickoff_date.isoformat()}(距今 {delta_days} 天)")
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
    prior_bundles: list[dict] | None = None,   # v3.2: 上游 stage 的 valid bundle 列表(P 类源)
    max_chars_per_prior: int = 8000,            # 单份上游 bundle 注入字数上限
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
    next_p = 1
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

    # 4. v3.2: 上游 stage 产物(P 类源)
    # 当前 stage 的"前一阶段"已生成的 valid bundle 自动注入,作为强参考素材。
    # 不同于 D 类(客户原始资料):P 类是 AI + critic 已认可的"半成品",
    # 当前 stage 的结论应当呼应 P 类源的核心结论(若偏离需明确说明)。
    if prior_bundles:
        blocks.append("\n### 上游产物(已通过质量评审的前序阶段成果,引用用 [P1] [P2] 这种 ID;**当前章节结论应当与之呼应**):")
        for pb in prior_bundles:
            content = (pb.get("content_md") or "").strip()
            if not content:
                continue
            src_id = f"P{next_p}"
            next_p += 1
            stage_label = pb.get("stage_label") or pb.get("prior_kind") or "上游产物"
            title = pb.get("title") or stage_label
            excerpt = content[:max_chars_per_prior]
            if len(content) > max_chars_per_prior:
                excerpt += f"\n…(余下 {len(content) - max_chars_per_prior} 字省略)"
            sources_index[src_id] = {
                "type":            "prior",
                "label":           f"上游产物 · {stage_label}",
                "prior_kind":      pb.get("prior_kind"),
                "prior_bundle_id": pb.get("bundle_id"),
                "stage_label":     stage_label,
                "snippet":         (content[:300]),
            }
            blocks.append(f"\n**[{src_id}] 上游产物 · {stage_label}({title})**\n{excerpt}")

    return sources_index, "\n".join(blocks)


# 后处理:把 LLM 输出的 [D1] [K1] [W1] [P1] 转成 markdown link `[D1](#cite-<module_key>-D1)`
# 前端 CitedReportView 自定义 a renderer 检测 #cite- 前缀,渲染为可点击角标 + 跳引用栏
# v3.2: 新增 P 类(上游 stage 产物)支持
_INLINE_CITATION_RE = re.compile(r'\[([DKWP]\d{1,3})\](?!\()')   # [D1] [P1] 但不是 [D1](url)


_PREAMBLE_PATTERNS = [
    # "根据项目上传文档(D1-D8)和知识库切片(K1-K5)，以下是【关键发现】章节的5条..."
    r'^根据.{0,80}(以下是|如下).*[:：。]\s*$',
    # "基于上述资料，整理如下..."
    r'^基于.{0,80}(以下|如下|下面).*[:：。]\s*$',
    # "以下是 N 条 ..."
    r'^以下是.{0,80}[:：。]\s*$',
    # "我将 / 接下来 / 现在为您 ..."
    r'^(我将|接下来|现在为您|请允许我).{0,80}[:：。]\s*$',
    # "下面 / 下方 ..." (开头过渡句)
    r'^(下面|下方).{0,80}[:：。]\s*$',
]
_PREAMBLE_RE = [re.compile(p) for p in _PREAMBLE_PATTERNS]


def _strip_preamble(content: str) -> str:
    """剥掉 LLM 输出开头的前导句 / 元描述(LLM 复述上下文的过渡话)。

    例:
      "根据项目上传文档(D1-D8)和知识库切片(K1-K5),以下是【关键发现】章节的5条关键发现:"
      "基于上述资料,整理如下:"

    扫前 5 个非空行,匹配上述任一 pattern 的整行 → 删除。
    保守策略:只删完全是过渡句的行,不动含数据/具体信息的行。
    """
    if not content:
        return content
    lines = content.split("\n")
    cleaned = []
    seen_non_blank = 0
    for line in lines:
        stripped = line.strip()
        if seen_non_blank < 5 and stripped:
            seen_non_blank += 1
            # 长度过滤:超过 120 字的行通常含真实信息,保留
            if len(stripped) <= 120 and any(p.match(stripped) for p in _PREAMBLE_RE):
                continue   # 删除这一行
        cleaned.append(line)
    return "\n".join(cleaned).lstrip("\n")


def _strip_redundant_title(content: str, module_title: str) -> str:
    """剥掉 LLM 输出开头跟 module.title 重复的 H1/H2 行(runner 已经注入 ## title,
    LLM 偶尔无视 system prompt 的"禁止输出标题"约束,造成 # title 出现两次)。

    去重策略:
    - 扫前 3 个非空行,如果是 # title / ## title / ### title 且 title 跟 module_title 相同
      或仅相差 emoji / 空格 → 删掉那行
    - 不动正文中间或末尾的子标题
    """
    if not content:
        return content
    lines = content.split("\n")
    cleaned = []
    seen_non_blank = 0
    title_norm = module_title.strip().lower()
    skipped = False
    for line in lines:
        stripped = line.strip()
        if seen_non_blank < 3 and not skipped and stripped:
            seen_non_blank += 1
            # 检测 # / ## / ### + title (允许中间空格)
            m = re.match(r'^(#{1,3})\s*(.+?)\s*$', stripped)
            if m:
                heading_text = m.group(2)
                # 去掉中间括号注释 / emoji 比对
                norm_heading = re.sub(r'[\s（）()【】\[\]·*~_]', '', heading_text).lower()
                norm_target  = re.sub(r'[\s（）()【】\[\]·*~_]', '', title_norm)
                if norm_target and (norm_heading == norm_target or norm_target in norm_heading):
                    skipped = True
                    continue   # 删除这一行
        cleaned.append(line)
    return "\n".join(cleaned).lstrip("\n")


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
    revision_suffix: str = "",                       # v3.1 挑战循环:上轮挑战意见,追加到 user prompt 末
    prior_bundles: list[dict] | None = None,         # v3.2: 上游 stage 的 valid bundle(P 类源)
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
        prior_bundles=prior_bundles,
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
    # 挑战循环:追加上一轮挑战意见(只 regenerate 模式才有)
    if revision_suffix:
        user_prompt += revision_suffix

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
- evidence_block 里每个 source 都已经标了 ID:
    [D1][D2]... 是项目上传文档(权威源)
    [K1][K2]... 是知识库证据
    [W1][W2]... 是 Web 检索结果
    [P1][P2]... 是上游 stage 已通过质量评审的产物(项目洞察 / 启动会 / 调研大纲 等)
- 本节可用的 ID:{ids_summary}
- 你在正文里**每个事实陈述末尾**必须用 ID 引用,格式:
    "陕西分公司 12/15 出现 2 次商机审批超时 [D2][K3]"
    "行业典型周期 6-9 个月 [W1]"
    "对应项目洞察识别的 Top 风险 R1,本章节进一步展开 [P1]"
- **P 类源的特殊重要性**:P 类是上一阶段已认可的核心结论,本章节结论**必须呼应**,
  若有偏离需明确写"基于 [P1] 的 X 结论,本阶段调研后调整为 Y,理由:Z";不允许沉默地与 P 类源冲突。
- **不要**自己编新的 ID(如 [^1] [^2] 这种数字 footnote);只能用上面列出的 ID。
- **不要**用"[访谈]"/"[KB]"/"[Brief]"这种泛化标签 — 必须用具体 ID。
- 系统会自动把 [D1] 转成可点击的 footnote,前端能 hover 看原文。
- 如果某段没素材支撑,写"信息缺失"或干脆别写;**绝不**裸输出无引用的事实。
"""
    async def _call_once(attempt: int) -> str:
        # max_tokens 8000 — 推理模型(GLM-5 / minimax-m2.7)<think> 块容易吃掉 3-5k tokens,
        # 之前 3000 时 M6 经常空输出。和 challenger 对齐到 8000。
        raw = await _llm_call(user_prompt, system=system, model=model,
                              max_tokens=8000, timeout=240.0)
        clean_len = len((raw or "").strip())
        has_think = "<think>" in (raw or "").lower()
        logger.info("insight_module_llm_returned",
                    module=module.key, attempt=attempt,
                    raw_len=len(raw or ""), clean_len=clean_len,
                    has_think=has_think,
                    head=(raw or "")[:120])
        return raw or ""

    try:
        raw_content = await _call_once(attempt=1)
        # 推理模型偶发:think 块吃光所有 token,正文为空。critical 模块再试一次。
        if not raw_content.strip() and module.necessity == "critical":
            logger.warning("insight_module_empty_retry", module=module.key)
            raw_content = await _call_once(attempt=2)
        # 1. 剥重复标题(LLM 偶尔无视 system prompt 输出 ## 标题, runner 已注入)
        content_clean = _strip_redundant_title(raw_content.strip(), module.title)
        # 1.5 剥前导句 / 元描述(LLM 复述上下文的过渡话,如"根据 XXX,以下是 N 条...")
        content_clean = _strip_preamble(content_clean)
        # 2. 引用 ID 后处理 [D1] → [D1](#cite-...)
        content_processed, used_sources = _post_process_citations(
            content_clean, sources_index, module.key,
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
    ltc_module_key: str | None = None,   # research v1 — 用于 item_key 命名
    kb_inject_block: str = "",            # research v1 — KB 二次过滤后的高分参考(由调用方预先准备好)
    customer_modules: list[str] | None = None,  # research v1 — SOW 中超出 LTC 字典的客户自定义模块
    prior_bundles: list[dict] | None = None,    # v3.2: 上游 stage 的 valid bundle(P 类源)
) -> dict:
    """生成单个 survey 分卷。

    返回 dict:
    - markdown: 现有的 markdown 题目列表(向后兼容)
    - questionnaire_items: 结构化题目数组(research v1 新增,顾问录入用)
    """
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

    # v3.2: 上游 stage 产物作为问卷设计的呼应基准
    # — 不参与 sources_index 编号(问卷题目本身不裸引 [P1])
    # — 作为 prior_context_block 让 LLM 出题时围绕已识别的 Top 风险 / 关键决策 / 干系人 设计具体问题
    prior_context_block = ""
    if prior_bundles:
        parts = ["【上游 stage 已生成的核心结论 — 本分卷出题时应当呼应这些关键点】"]
        for pb in prior_bundles:
            excerpt = (pb.get("content_md") or "")[:3000]
            parts.append(f"\n--- {pb.get('stage_label', '上游')} · {pb.get('title', '')} ---\n{excerpt}")
        prior_context_block = "\n".join(parts)

    # 把分卷原始 target_roles(可能是 LTC 字典的 c_level/biz_owner...)收敛到严格 4 角色,
    # 让 LLM 直接看到本分卷应该覆盖的「严格 4 选 N」角色
    from services.agentic.research.questionnaire_schema import (
        coerce_audience_roles, AUDIENCE_ROLE_LABELS,
    )
    strict_target_roles = coerce_audience_roles(subsection.target_roles) or ["dept_head"]
    strict_label = " / ".join(f"{r}({AUDIENCE_ROLE_LABELS[r]})" for r in strict_target_roles)
    target_roles_label = f"{' / '.join(subsection.target_roles)}  → 严格 4 角色映射: {strict_label}"
    qmin, qmax = subsection.question_count_target

    # research v1:item_key 前缀(顾问录入答案时按此 key 索引)
    item_key_prefix = ltc_module_key or subsection.key

    # research v1:LTC 候选清单 — 让 LLM 知道每题该归到哪个 LTC 模块,
    # 前端左栏按 LTC 字典 key 分组,题目必须打 LTC 字典内的 key 才会被命中
    from .research.ltc_dictionary import ALL_LTC_MODULES, hints_for_subsection
    candidate_ltc_keys = hints_for_subsection(subsection.key)
    if not candidate_ltc_keys:
        # 没有预置 hint(很少见)→ 给 LLM 全字典让它自由选
        candidate_ltc_keys = [m.key for m in ALL_LTC_MODULES]
    ltc_dict_block_lines = ["【LTC 流程模块字典 — ltc_module_key 必须从这些 key 中选】"]
    for m in ALL_LTC_MODULES:
        marker = "★" if m.key in candidate_ltc_keys else " "
        ltc_dict_block_lines.append(f"  {marker} {m.key}: {m.label}")
    # research v1:客户自定义模块(SOW 中超出 LTC 字典的项),也作为 ltc_module_key 候选
    if customer_modules:
        ltc_dict_block_lines.append("\n【本项目客户自定义模块 — SOW 中超出 LTC 字典的项,也是合法 ltc_module_key】")
        for sow_term in customer_modules:
            ltc_dict_block_lines.append(f"  ☆ {sow_term}")
        ltc_dict_block_lines.append("如果题目内容跟 LTC 字典任何一项都不贴合,但跟某个 ☆ 客户自定义模块相关,可填客户自定义模块名作为 ltc_module_key。")
    ltc_dict_block_lines.append(f"\n本分卷主要服务的 LTC 候选(★ 标记):{', '.join(candidate_ltc_keys[:8])}")
    ltc_dict_block_lines.append("每题按其内容主旨,从 ★ 候选 / ☆ 客户自定义 / 全部 LTC 字典中选最贴合的 1 个填到 ltc_module_key 字段。")
    ltc_dict_block_lines.append(
        "\n【常见挂错纠正 — 选 key 时按「问题问的本质」而不是「字面关键词」】\n"
        "- 题干含「集成 / 接口 / 双写 / 同步 / 主数据 / 数据存储 / ERP / OA / MES / PLM / 字段映射 / 数据归属 / 权限 / 数据隔离」"
        "→ 选 **S05_integration**(即使题干提到「客户」「产品」「订单」字眼,但本质讨论的是系统对接)\n"
        "- 题干含「客户档案 / 建档 / 查重 / 客户分级 / 客户审批 / 客户跟进」→ 选 **S01_customer**\n"
        "- 题干含「BOM / 产品价格 / 价目表 / SKU / 阶梯价」→ 选 **S02_product**\n"
        "- 题干含「经销商 / 分销 / 渠道商机报备 / 防串货」→ 选 **S03_channel**\n"
        "- 反例(常错):「客户主数据存哪个系统?」**不是** S01_customer,而是 **S05_integration**(因为本质是数据归属 / 集成话题)"
    )
    ltc_dict_block = "\n".join(ltc_dict_block_lines)

    user_prompt = f"""请为本分卷生成一份**实施前调研问卷**。

{ltc_dict_block}

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

{prior_context_block + chr(10) + chr(10) if prior_context_block else ''}{kb_inject_block + chr(10) + chr(10) if kb_inject_block else ''}{industry_block + chr(10) + chr(10) if industry_block else ''}{f"【方法论】{chr(10)}{agent_prompt}{chr(10)}{chr(10)}" if agent_prompt else ''}{f"【启用技能】{chr(10)}{skill_text}" if skill_text else ''}

【输出格式 — 严格两段式,顺序必须先 Markdown 后 JSON】

**第一段:Markdown 题目列表**(给顾问可读)
顶部加一段说明(1-2 句):本分卷的目的 + 预计填答时间 + 由谁填。

每题格式:
```
### N. <问题正文>
- 类型: [single / multi / rating / number / text / node_pick]
- *为什么问:* <一句话>
- *答案如何使用:* <一句话>
- 选项(single/multi/node_pick 必填): A. ... / B. ... / C. ... / 其他(请说明) / 不适用
```

**第二段:结构化 JSON**(给系统消费)— 用 ```json``` 围栏包裹,顶层是数组
```json
[
  {{
    "item_key": "{item_key_prefix}::<英文小写下划线短标识,与本题问题语义一致>",
    "ltc_module_key": "<必须从 LTC 字典中选 1 个 key,例 M02_opportunity>",
    "audience_roles": ["<从 executive / dept_head / frontline / it 中选 1-2 个,与本分卷目标人群一致>"],
    "phase": "<pre_meeting 或 in_meeting,见下方判定原则>",
    "type": "single | multi | rating | number | text | node_pick",
    "question": "<同上方第 N 题的问题正文>",
    "why": "<同 *为什么问*>",
    "options": [
      {{"value": "<英文小写下划线>", "label": "<中文标签>"}},
      ...
      {{"value": "__other__", "label": "其他(请说明)", "is_other": true}},
      {{"value": "__na__",   "label": "不适用",       "is_not_applicable": true}}
    ],
    "rating_scale": 5,
    "number_unit": "<如「天」「万元」「%」, type=number 才用>",
    "required": true,
    "hint": "<给顾问的补充提示, 可空>"
  }},
  ...
]
```

注意:**不要**输出 `best_practice_refs` 字段。系统会基于题目的 ltc_module_key + 本项目行业,
自动从内置的「跨项目实施最佳实践库」(2025 年沉淀的 13 个项目跨行业核心做法)注入这块内容。
你只负责出题。

【phase 判定原则 — 决定题目走「会前自填」还是「会中追问」】
- **pre_meeting(会前)**:客观、闭合、低门槛,客户不需要顾问引导就能答 — 例如:
  - 当前是否有 X 流程(yes/no/部分)
  - 角色 / 数量 / 现有系统 / 数据条数(数值或多选)
  - 标准化的清单选择(产品线 / 客户分级 / 已用系统)
- **in_meeting(会中)**:开放、深入、需要顾问对话引导才能高质量回答 — 例如:
  - 流程卡点 / 痛点 / 业务异常处理
  - 决策链 / 协同规则 / 分歧场景的具体做法
  - 跨部门协作的灰色地带、未明文规定的"潜规则"
  - 需要现场画图 / 拉通多方才能定义清楚的内容
- 同分卷内 pre_meeting 与 in_meeting 都要有,**比例建议 30-50% 会前 + 50-70% 会中**(具体看分卷性质;高管类分卷会中比例可更高)。

【audience_roles 取值约束 — 严格 4 选 N】
- 只能从 `executive`(高管/决策者)/ `dept_head`(部门负责人/业务主管)/ `frontline`(一线/操作者)/ `it`(IT / 系统管理员) 中选,**不要写其他值**。
- 单题通常 1 个角色;少数跨角色题最多 2 个。如果分卷的 target_roles 给了多个,按本题最相关的人填。

【完整 few-shot 示例 — 严格按这个格式输出 markdown + JSON 配对】
假设分卷是「商机管理」,生成 3 题(single / multi / rating 各一题),完整输出如下:

---示例开始---

本分卷面向**销售部门负责人 + 一线销售**,预计 5 分钟,梳理商机阶段定义和推进瓶颈。

### 1. 你们目前用哪种商机阶段模型?
- 类型: single
- *为什么问:* 阶段模型决定 CRM 商机推进逻辑和赢率字段
- *答案如何使用:* 落地到系统阶段配置 + 决定是否需要定制阶段
- 选项: A. 华为 LTC 6 阶段 / B. MEDDIC / C. BANT / D. 自定义阶段 / E. 其他(请说明) / F. 不适用

### 2. 商机推进的最大卡点是什么?(可多选)
- 类型: multi
- *为什么问:* 找到当前流程的核心痛点,决定 CRM 重点解决方向
- *答案如何使用:* 蓝图设计阶段优先攻克的问题
- 选项: A. 阶段定义模糊 / B. 决策链不清 / C. 缺少预警 / D. 赢率不准 / E. 战败无复盘 / F. 看板靠手工汇总 / G. 其他(请说明) / H. 不适用

### 3. 当前商机数据完整度如何?
- 类型: rating
- *为什么问:* 数据基础决定 CRM 商机模块上线后的可用性
- *答案如何使用:* 评估数据治理工作量

```json
[
  {{
    "item_key": "{item_key_prefix}::stage_model",
    "type": "single",
    "question": "你们目前用哪种商机阶段模型?",
    "why": "阶段模型决定 CRM 商机推进逻辑和赢率字段",
    "options": [
      {{"value": "huawei_ltc", "label": "华为 LTC 6 阶段"}},
      {{"value": "meddic", "label": "MEDDIC"}},
      {{"value": "bant", "label": "BANT"}},
      {{"value": "custom", "label": "自定义阶段"}},
      {{"value": "__other__", "label": "其他(请说明)", "is_other": true}},
      {{"value": "__na__", "label": "不适用", "is_not_applicable": true}}
    ],
    "required": true,
    "hint": ""
  }},
  {{
    "item_key": "{item_key_prefix}::推进卡点",
    "type": "multi",
    "question": "商机推进的最大卡点是什么?(可多选)",
    "why": "找到当前流程的核心痛点,决定 CRM 重点解决方向",
    "options": [
      {{"value": "stage_unclear", "label": "阶段定义模糊"}},
      {{"value": "decision_chain", "label": "决策链不清"}},
      {{"value": "no_alert", "label": "缺少预警"}},
      {{"value": "win_rate", "label": "赢率不准"}},
      {{"value": "no_review", "label": "战败无复盘"}},
      {{"value": "manual_dashboard", "label": "看板靠手工汇总"}},
      {{"value": "__other__", "label": "其他(请说明)", "is_other": true}},
      {{"value": "__na__", "label": "不适用", "is_not_applicable": true}}
    ],
    "required": true,
    "hint": ""
  }},
  {{
    "item_key": "{item_key_prefix}::data_completeness",
    "type": "rating",
    "question": "当前商机数据完整度如何?",
    "why": "数据基础决定 CRM 商机模块上线后的可用性",
    "options": [],
    "rating_scale": 5,
    "required": true,
    "hint": "1=极差(基本字段都缺) / 5=完整(所有字段齐全)"
  }}
]
```

---示例结束---

【硬性约束 — 严格遵守,否则解析会失败】
- single/multi/node_pick 题的 options **必须**包含 __other__ 和 __na__ 兜底(参考示例)
- text/number/rating 题的 options 数组留空 []
- rating 题填 rating_scale=5,number 题填 number_unit
- item_key 全局唯一(用 `{item_key_prefix}::` 前缀 + 简短英文小写下划线 / 中文都行,但**确保稳定**,顾问录答案后再生成时不要换 key)
- JSON 必须可被 json.loads 解析:双引号、最后元素无逗号、不要写注释
- Markdown 与 JSON 的题目数量、顺序、问题文本必须**一一对应**(自检一遍)
- 每题问题颗粒度具体到可作答(不是"贵司销售流程如何?")
- 已访谈过的话题不重复
- 单分卷题量必须在 {qmin}-{qmax} 范围内
- 不写黑话(赋能/抓手/闭环/链路/生态)
- 全部用简体中文
"""
    system = f"""你是 MBB 风格的资深 CRM 实施咨询顾问,擅长设计实施前调研问卷。
你正在为分卷【{subsection.title}】生成问题,用于"顾问拿大纲口头问 + 系统选择题录入"的工作模式。

设计原则:
- 60% single/multi(单选多选,带选项池)
- 15% rating(分级量表 1-5)
- 10% number(数值/范围)
- 10% text(短文本,顾问速记)
- 5% node_pick(流程节点勾选)
- MECE 思维(子主题不重叠不遗漏)
- 单分卷控制在 {qmin}-{qmax} 题,5-10 分钟可填完
- 已访谈覆盖的话题不再重复出

输出**两段**:Markdown 题目列表 + JSON 结构化数据。两段题目必须一致。
"""
    try:
        content = await _llm_call(user_prompt, system=system, model=model, max_tokens=6000, timeout=240.0)
        raw = content.strip()
        markdown, items = _split_markdown_and_questionnaire_json(
            raw,
            item_key_prefix=item_key_prefix,
            ltc_module_key=ltc_module_key,
            audience_roles=subsection.target_roles,
            candidate_ltc_keys=candidate_ltc_keys,
            customer_modules=customer_modules,
            industry=industry,
        )
        # 批量调 advisor LLM,给每题写一段贴合的「最佳实践建议」
        # 失败 / 部分缺失 → 该题 advice 为空,前端折叠区不显示(不影响题目本身)
        if items:
            try:
                from services.agentic.research.best_practice_advisor import generate_advice_for_items
                project_name = getattr(project, "name", "") if project else ""
                advice_map = await generate_advice_for_items(
                    items, industry=industry, project_name=project_name, model=model,
                )
                if advice_map:
                    for it in items:
                        adv = advice_map.get(it.get("item_key", ""), "").strip()
                        if adv:
                            it["best_practice_advice"] = adv
            except Exception as e:
                logger.warning("advisor_call_failed_nonfatal",
                               subsection=subsection.key, error=str(e)[:200])
        return {"markdown": markdown, "questionnaire_items": items}
    except Exception as e:
        logger.warning("survey_executor_failed", subsection=subsection.key, error=str(e)[:200])
        return {
            "markdown": f"_（本分卷生成失败:{str(e)[:120]}）_",
            "questionnaire_items": [],
        }


# ── 结构化输出解析 ────────────────────────────────────────────────────────

def _split_markdown_and_questionnaire_json(
    raw: str, *, item_key_prefix: str, ltc_module_key: str | None,
    audience_roles: list[str],
    candidate_ltc_keys: list[str] | None = None,
    customer_modules: list[str] | None = None,
    industry: str | None = None,
) -> tuple[str, list[dict]]:
    """从 LLM 原始输出里拆分 Markdown 部分和 JSON 数组。

    LLM 应返回:<markdown> + ```json [...] ```。
    解析失败时仅返回 markdown,questionnaire_items=[]。

    在 items 上做后处理:
    - 校验/兜底 ltc_module_key(必须在 LTC 字典 + customer_modules 内)
    - audience_roles 注入
    - ensure_sentinels:single/multi/node_pick 必含"其他+不适用"
    - item_key 缺失时按前缀+序号兜底生成
    - 按 (ltc_module_key, industry, 题干) 注入 best_practice_refs
    """
    import json
    import re

    fence_pattern = re.compile(r"```json\s*(\[[\s\S]*?\])\s*```", re.IGNORECASE)
    matches = fence_pattern.findall(raw)
    if not matches:
        i, j = raw.rfind("["), raw.rfind("]")
        if 0 <= i < j:
            try:
                items_raw = json.loads(raw[i:j+1])
                markdown = raw[:i].rstrip()
                return markdown, _post_process_items(items_raw,
                                                     item_key_prefix=item_key_prefix,
                                                     ltc_module_key=ltc_module_key,
                                                     audience_roles=audience_roles,
                                                     candidate_ltc_keys=candidate_ltc_keys,
                                                     customer_modules=customer_modules,
                                                     industry=industry)
            except Exception:
                pass
        return raw, []

    json_text = matches[-1]
    fence_idx = raw.rfind("```json")
    markdown = raw[:fence_idx].rstrip() if fence_idx > 0 else raw
    try:
        items_raw = json.loads(json_text)
    except Exception:
        return markdown, []
    if not isinstance(items_raw, list):
        return markdown, []
    return markdown, _post_process_items(items_raw,
                                          item_key_prefix=item_key_prefix,
                                          ltc_module_key=ltc_module_key,
                                          audience_roles=audience_roles,
                                          candidate_ltc_keys=candidate_ltc_keys,
                                          customer_modules=customer_modules,
                                          industry=industry)


def _post_process_items(
    items_raw: list, *, item_key_prefix: str, ltc_module_key: str | None,
    audience_roles: list[str],
    candidate_ltc_keys: list[str] | None = None,
    customer_modules: list[str] | None = None,
    industry: str | None = None,
) -> list[dict]:
    """规整结构化题目:校验 ltc_module_key / 补 sentinel / 校验 phase + audience_roles / 兜底 item_key。"""
    from services.agentic.research.questionnaire_schema import (
        QuestionItem, OptionItem, ensure_sentinels, coerce_audience_roles,
    )
    from services.agentic.research.ltc_dictionary import ALL_LTC_MODULES
    valid_ltc_keys = {m.key for m in ALL_LTC_MODULES} | set(customer_modules or [])
    fallback_ltc = ltc_module_key or (candidate_ltc_keys[0] if candidate_ltc_keys else None) or "_uncategorized"

    # 调用方传入的 audience_roles(可能是 LTC 字典的老角色)收敛到严格 4 角色,作为兜底默认值
    fallback_roles = coerce_audience_roles(audience_roles)
    if not fallback_roles:
        fallback_roles = ["dept_head"]  # 兜底:大多数 CRM 调研主体是部门负责人

    out: list[dict] = []
    for idx, raw in enumerate(items_raw, 1):
        if not isinstance(raw, dict):
            continue
        try:
            # 校验 ltc_module_key:必须在 LTC 字典 + 客户自定义模块集合内
            llm_key = (raw.get("ltc_module_key") or "").strip()
            if llm_key and llm_key in valid_ltc_keys:
                # LLM 给的合法 key,采用
                raw["ltc_module_key"] = llm_key
            elif ltc_module_key:
                # 调用方强制覆盖
                raw["ltc_module_key"] = ltc_module_key
            else:
                # LLM 给的 key 不合法或没给 → 兜底用候选首项,避免落到 subsection.key 让前端找不到
                logger.info("questionnaire_ltc_key_fallback",
                            llm_gave=llm_key, fallback=fallback_ltc, item_idx=idx)
                raw["ltc_module_key"] = fallback_ltc

            # audience_roles:严格 4 选 N,过滤非法值(同时把老角色映射成新角色);为空则用调用方兜底
            cleaned_roles = coerce_audience_roles(raw.get("audience_roles"))
            raw["audience_roles"] = cleaned_roles or list(fallback_roles)

            # phase:pre_meeting / in_meeting,默认 in_meeting(老兼容)
            llm_phase = (raw.get("phase") or "").strip()
            raw["phase"] = llm_phase if llm_phase in ("pre_meeting", "in_meeting") else "in_meeting"

            # source:LLM 生成的题统一标 ai
            raw.setdefault("source", "ai")

            if not raw.get("item_key"):
                raw["item_key"] = f"{item_key_prefix}::q{idx}"

            t = raw.get("type")
            if t in ("single", "multi", "node_pick"):
                opts_raw = raw.get("options") or []
                opts = [OptionItem(**o) if isinstance(o, dict) else o for o in opts_raw]
                opts = ensure_sentinels(opts)
                raw["options"] = [o.to_dict() for o in opts]
            else:
                raw["options"] = []

            # best_practice_refs / best_practice_advice 不在这里注入;
            # 等本批题全部规整完后,在批量出口处统一调 advisor LLM 一次性生成,
            # 这样 advisor 看到的是 subsection 全题语境,出来的建议更连贯,且只调 1 次 LLM。

            q = QuestionItem.from_dict(raw)
            out.append(q.to_dict())
        except Exception as e:
            logger.warning("questionnaire_item_postprocess_failed",
                           idx=idx, error=str(e)[:120])
            continue
    return out
