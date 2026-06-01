"""调研报告生成器(2026-05-29)。

定位:给 PM 出方案设计的"全景调研报告"。读项目全部素材 → 一次 Opus 大调用 → 出 markdown。

为什么不走 v2 agentic 流水线(planner / executor / critic / challenger):
- 调研报告本质是"汇总 + 结构化",不像 insight 那样需要按模块独立检索 + 综合判断
- 上游 insight / survey_outline / survey 已经过 critic / challenger,质量在那放着了
- 单次大调用能保证整篇叙事连贯(分模块再拼接反而割裂)
- 工程上 200 行能干完,跟新加一份完整 v2 agentic 流水线(800+ 行)比性价比高

报告 8 个章节(对齐 PM 出方案设计的实际信息需求):
  1. 执行摘要
  2. 客户现状(组织 / 系统 / 数据 — 业务流程拆到第 3 章)
  3. 业务线与流程梳理(业态 / 主营产品 / 渠道结构 / 各线 L2C 关键节点差异)
  4. 业务诉求与痛点(战略 / 业务 / 一线 三层)
  5. 结构化需求清单(REQ-NNN 表格,综合会议 + SOW + 顾问问卷,给 PM 直接做模块设计)
  6. SOW 范围与 LTC 模块覆盖度
  7. 方案设计建议方向(一期 scope / 优先级 / 节奏 / 集成)
  8. 风险与下一步(合并风险 + 启动会准备 + 待澄清)
"""
from dataclasses import dataclass
from typing import Optional


# ── 章节结构声明 ─────────────────────────────────────────────────────────────

@dataclass
class ReportSection:
    key: str
    title: str          # markdown H2
    instruction: str    # 给 LLM 看,告诉它这章要写什么


REPORT_SECTIONS: list[ReportSection] = [
    ReportSection(
        key="exec_summary",
        title="1. 执行摘要",
        instruction=(
            "120-180 字一气呵成。包含:客户行业 + 业态 / 项目核心目标 / 现状关键约束 / "
            "本报告的 3 个核心结论 / 推荐的方案设计切入方向(1 句话)。"
            "不要分 bullet — 用流畅 2-3 段文字。"
        ),
    ),
    ReportSection(
        key="current_state",
        title="2. 客户现状",
        instruction=(
            "3 个子小节(不含业务流程,流程拆到第 3 章):"
            "**2.1 组织架构与干系人**(决策链 / 关键角色 / 我方对接关系);"
            "**2.2 现有系统生态**(用什么 CRM/ERP/OA/中台,数据怎么流,集成现状);"
            "**2.3 数据资产盘点**(客户主数据 / 历史成交 / 渠道数据 / 报表习惯)。"
            "每个小节用表格或紧凑 bullet,结合证据(标 [D1] [P1] 来源)。"
        ),
    ),
    ReportSection(
        key="business_line",
        title="3. 业务线与流程梳理",
        instruction=(
            "这章是给 PM 看「方案要怎么适配客户的业务结构」。4 个子小节:"
            "**3.1 业态与业务线总览**(2B / 2C / 渠道分销 / 直营 / SaaS / 项目制 — "
            "客户有几条业务线,各占多少营收 / 客户数,主营是哪个);"
            "**3.2 各业务线销售模式差异**(每条线一行表格:线名 / 销售模式 / 主要客户类型 / "
            "成交链路特征 / 是否多组织 / 数据隔离需求);"
            "**3.3 L2C 关键节点梳理**(对每条业务线拆出 Lead → Opportunity → Quote → Order → Cash "
            "各环节的现状:哪些已数字化、哪些线下、哪些有遗留系统);"
            "**3.4 多业务线对 CRM 的不同侧重**(哪条线最迫切上、哪条线已有系统暂不动、"
            "哪条线需要多组织 / 多租户配置)。"
            "用表格优先,证据带 [D1][M1][P1]。"
            "如果证据里看不出业务线分化(只有单一业务线),明确写「客户单一业务线运营,"
            "本章简化为单线 L2C 现状」然后给出该线的 L2C 节点。"
        ),
    ),
    ReportSection(
        key="pain_and_need",
        title="4. 业务诉求与痛点",
        instruction=(
            "按 3 层分(定性视角,跟第 5 章「结构化需求清单」互补 — 这里是「为什么要做」,下一章是「具体要做什么」):"
            "**4.1 战略层**(高管视角的成功标准 / KPI / 上 CRM 的根本动机);"
            "**4.2 业务层**(部门负责人的协同 / 流程 / 数据需求);"
            "**4.3 一线层**(销售 / 服务一线的日常痛点)。"
            "每层用表格,列「诉求 / 痛点 → 严重度(P0-P3) → 来源」。"
            "P0 是阻塞、P1 是高频、P2 是有期望、P3 是 nice-to-have。"
        ),
    ),
    ReportSection(
        key="needs_list",
        title="5. 结构化需求清单",
        instruction=(
            "**这章是给 PM 出方案设计的核心交付物 — PM 拿这表直接做 user story / 功能模块拆分。**"
            "把所有来源(会议提取的 requirements [M]、SOW 拆出的功能项 [D]、顾问问卷答案推出的诉求 [R]、"
            "上游 insight/survey 里点名的诉求 [P])归一成一份**大表**。"
            ""
            "表头(严格按这个顺序,不要改名):"
            "| REQ | LTC 模块 | 业务线 | 需求描述 | 优先级 | 范围 | 来源 |"
            "示例行:"
            "| REQ-001 | M02_opportunity | 直营 | 销售线索按区域自动分配到一线代表 | P0 | new | [M1][D2] |"
            ""
            "约束:"
            "- 按 LTC 模块分组排序(同模块的需求挨在一起),组内按优先级降序"
            "- REQ-NNN 连续编号,跨章节不复用"
            "- 单条「需求描述」≤ 35 字,只描述「做什么」不写「怎么做」"
            "- 优先级:P0 阻塞上线 / P1 一期必做 / P2 一期可做 / P3 二期及以后"
            "- 范围:new / digitize / migrate / out_of_scope(没把握就标 new + 备注「待澄清」)"
            "- 来源至少 1 条角标。如果一条需求多次出现(会议提到 + SOW 也写了),把所有来源都列上"
            "- 多业务线场景下「业务线」字段填具体线名(直营/渠道/...);单业务线就填「全量」"
            ""
            "表后再写 1 段 100-150 字的「需求分布速览」:"
            "总数 N 条,P0 几条 / P1 几条 / ...;按 LTC 模块统计 top 3 集中区域;"
            "明显的覆盖盲区(哪个 LTC 模块完全没需求 — 通常是漏访 / 不在范围)。"
            ""
            "如果证据里实在挖不出 15 条以上的具体需求,如实写「证据里只能整理出 N 条具体需求,"
            "建议 Phase 1 第一周做集中需求访谈补足」然后列出能挖到的部分。"
        ),
    ),
    ReportSection(
        key="scope_ltc",
        title="6. SOW 范围与 LTC 模块覆盖度",
        instruction=(
            "**6.1 SOW 显式范围**(合同 / 项目说明书里白纸黑字写的功能 / 流程,逐项列出);"
            "**6.2 LTC 模块映射**(把 SOW 项落到 LTC 字典的标准模块 key,标 ✅/⚠️/❌:"
            "✅ 字典命中且无歧义 / ⚠️ 字典命中但客户有自定义补丁 / ❌ 不在字典,客户自定义);"
            "**6.3 范围四分类汇总**(基于第 5 章需求清单 + SOW,统计各 LTC 模块的 "
            "new / digitize / migrate / out_of_scope 分布,给顾问/PM 做范围确认参考)。"
            "用表格呈现。"
        ),
    ),
    ReportSection(
        key="design_direction",
        title="7. 方案设计建议方向",
        instruction=(
            "这是给 PM 的最后一块核心交付。"
            "**7.1 一期范围建议**(明确 in/out — 引用第 5 章里 P0+P1 的 REQ 编号,写出取舍逻辑);"
            "**7.2 实施优先级排序**(按 LTC 模块分档:P0 模块 / P1 模块 / P2 模块,每个模块带 1 句选择理由);"
            "**7.3 落地节奏建议**(分阶段:Phase 0 准备 / Phase 1 MVP / Phase 2 完善 / Phase 3 推广,各阶段周期 + 关键里程碑 + 涉及的 REQ);"
            "**7.4 集成与数据依赖**(必须先打通的上下游系统接口、必须先治理的主数据,标明依赖了哪个外部系统);"
            "**7.5 多业务线适配建议**(如果第 3 章识别出多业务线 — 哪几条业务线建议同期上、哪条延后)。"
            "建议方向必须可指导后续方案设计文档,不写「具体功能怎么实现」(那是设计阶段的事)。"
        ),
    ),
    ReportSection(
        key="risks_and_next",
        title="8. 风险与下一步",
        instruction=(
            "**8.1 项目层风险**(组织 / 决策 / 预算 / 时间);"
            "**8.2 业务层风险**(流程变更阻力 / 部门博弈 / 一线接受度);"
            "**8.3 技术层风险**(已有系统遗留 / 集成复杂度 / 数据迁移);"
            "**8.4 待澄清问题清单**(列 5-10 条最关键的);"
            "**8.5 待客户提供的材料清单**(具体到文件名 / 表单 / 数据样本);"
            "**8.6 立即可启动的子任务**(顾问 / PM / 客户三方各自可以开始动手做的事 — 各列 3 条)。"
            "8.1-8.3 每条用「风险描述 → 影响等级 → 缓解建议」表格。"
        ),
    ),
]


# ── Prompt builders ────────────────────────────────────────────────────────

SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的资深主笔顾问,正在为项目经理(PM)
撰写「调研报告」——这份报告将作为后续「方案设计」阶段的核心输入。

【报告读者】项目经理(PM)。PM 拿到这份报告后,会基于此出方案设计文档、做架构选型、
排实施计划、跟客户对范围。所以你要写得让 PM 一遍读完就能开始动手设计。

【风格】
- MBB 风格,金字塔原理:每段先抛结论,再给证据
- 表格优先于 bullet,bullet 优先于段落
- 每个事实 / 数据点末尾标证据来源 [D1] [D2] [P1] [P2] [R1] [M1] 这种 ID
   - D = 项目上传的文档
   - P = 上游产物(insight / survey_outline / survey)
   - R = 顾问已录入的问卷答案
   - M = 会议素材(纪要 + requirements)
   - I = 行业最佳实践
- 不写黑话(赋能 / 抓手 / 闭环 / 链路 / 生态 / 数字化转型 / 一站式)
- 信息缺失就写「**信息缺失**,建议在 Phase 1 第一周补访 / 在 SOW 评审会确认」
- 绝不编造数据 / 编造客户原话

【术语统一】
- Owner / owner / responsible → 责任人
- Deadline / due / due date → 截止日期
- Next Step → 下一步
- Action Item → 行动项
- Risk → 风险 / Issue → 问题
- 不要在正文 / 表格 / bullet 里直接出现这些英文标签
- 专有缩写保留:CRM / ERP / SaaS / SCQA / RAG / KPI / SOW / MVP / API

【禁止】
- 禁止 emoji
- 禁止"我们认为 / 相信 / 坚信"等主观语
- 禁止前导句 / 元描述 — 不要写"以下是..."/"接下来..."/"我将..."等过渡句
- 禁止套话 / 客套话
- 禁止在每章开头复述上面给的素材,直接进入正文(章节标题系统会自动注入)

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter 无围栏)
- 系统会自动给每章注入 H2 标题(见用户消息里的「章节清单」),你只输出**正文**:
   - 不要写 `## 1. 执行摘要` 这种标题行
   - 直接从内容开始,按章节顺序无缝衔接
   - 章节之间用一个空行分隔(系统会按"章节标记"分块)
- H3 子小节(### 2.1 组织架构...)由你自己写,跟章节内容耦合
- 表格用 markdown 标准语法
- 不要写「附录」「参考资料」这种章节(证据已经内嵌在正文里了)"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    sources_block: str,
    prior_bundles_block: str,
    meeting_block: str,
    responses_block: str,
    industry_pack_block: str,
) -> str:
    """组装 user message。"""
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in REPORT_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材一:项目文档(权威源,引用用 [D1] [D2])】
{sources_block or '(没有上传文档)'}

【素材二:上游产物 — 项目洞察 / 调研大纲 / 调研问卷(引用用 [P1] [P2])】
{prior_bundles_block or '(尚未生成上游产物)'}

【素材三:顾问已录入的调研答案(引用用 [R1] [R2])】
{responses_block or '(顾问暂无已录入答案)'}

【素材四:会议素材 — 会议纪要 + 提取的需求(引用用 [M1] [M2])】
{meeting_block or '(本项目暂无完成的会议)'}

【素材五:行业最佳实践(引用用 [I1])】
{industry_pack_block or '(无可用的行业 pack)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
对每个章节,先输出一行分隔标记:
<<<SECTION:exec_summary>>>
然后写该章节正文(不带 H2 标题,直接内容)。
下一个章节前再写:
<<<SECTION:current_state>>>
依次类推到 <<<SECTION:next_step>>>。

不要在分隔标记前后加任何空行 / 注释 / 解释。系统会按这些分隔标记把正文切回 8 个章节,
然后给每章加上规范的 H2 标题。

整篇控制在 7000-12000 字 — 因为第 5 章「结构化需求清单」是大表格(至少 15 行通常 25-50 行),
单独这一章就占 1500-3000 字,这是给 PM 的核心交付物,**不要为了控字数而砍需求条数**。
其他章节保持紧凑、信息密度高、不灌水。"""


# ── 素材渲染 ─────────────────────────────────────────────────────────────


def format_project_meta(project) -> str:
    if not project:
        return "(无项目元信息)"
    parts = [f"项目名:{project.name or '未命名'}"]
    if project.customer:
        parts.append(f"客户:{project.customer}")
    if project.industry:
        parts.append(f"行业:{project.industry}")
    return "\n".join(parts)


def format_docs_for_report(docs_by_type: dict, max_chars_per_doc: int = 18000) -> str:
    """把 docs_by_type 渲染成 D1/D2 编号的素材块。"""
    if not docs_by_type:
        return ""
    from models.project import DOC_TYPE_LABELS
    blocks: list[str] = []
    n = 0
    for doc_type, docs in docs_by_type.items():
        type_label = DOC_TYPE_LABELS.get(doc_type, doc_type)
        for d in docs:
            content = (d.get("markdown") or d.get("summary") or "").strip()
            if not content:
                continue
            n += 1
            sid = f"D{n}"
            excerpt = content[:max_chars_per_doc]
            if len(content) > max_chars_per_doc:
                excerpt += f"\n…(余下 {len(content) - max_chars_per_doc} 字省略)"
            blocks.append(f"**[{sid}] {type_label} · {d.get('filename', '未命名')}**\n{excerpt}")
    return "\n\n".join(blocks)


def format_prior_bundles(prior_bundles: list[dict], max_chars_per: int = 8000) -> str:
    """渲染上游产物(generate 函数已经过滤过 valid 状态)。"""
    if not prior_bundles:
        return ""
    blocks: list[str] = []
    n = 0
    for pb in prior_bundles:
        md = (pb.get("content_md") or "").strip()
        if not md:
            continue
        n += 1
        sid = f"P{n}"
        excerpt = md[:max_chars_per]
        if len(md) > max_chars_per:
            excerpt += f"\n…(余下 {len(md) - max_chars_per} 字省略)"
        kind = pb.get("kind") or "?"
        title = pb.get("title") or kind
        blocks.append(f"**[{sid}] {kind} · {title}**\n{excerpt}")
    return "\n\n".join(blocks)


def format_responses(rows: list[dict]) -> str:
    """rows: [{item_key, question, answer_value_label, scope_label}]"""
    if not rows:
        return ""
    lines = []
    for i, r in enumerate(rows, 1):
        sid = f"R{i}"
        question = r.get("question") or r.get("item_key") or "?"
        answer = r.get("answer_label") or "(空)"
        scope = r.get("scope_label") or ""
        scope_str = f" · 范围={scope}" if scope else ""
        lines.append(f"[{sid}] 问:{question} → 答:{answer}{scope_str}")
    return "\n".join(lines)


def format_meeting_evidence(meetings: list[dict]) -> str:
    """meetings: [{id, title, summary, key_points, decisions, requirements}]"""
    if not meetings:
        return ""
    blocks: list[str] = []
    n = 0
    for m in meetings:
        n += 1
        sid = f"M{n}"
        chunk = [f"**[{sid}] 会议:{m.get('title', '未命名')}**(id={m.get('id')})"]
        if m.get("summary"):
            chunk.append(f"摘要:{m['summary'][:400]}")
        key_points = m.get("key_points") or []
        if key_points:
            chunk.append("讨论要点:")
            for kp in key_points[:8]:
                topic = kp.get("topic", "")
                content = kp.get("content", "")
                if topic or content:
                    chunk.append(f"- 【{topic}】{content[:200]}")
        decisions = m.get("decisions") or []
        if decisions:
            chunk.append("决议:")
            for d in decisions[:5]:
                content = d.get("content", "")
                if content:
                    chunk.append(f"- {content[:200]}")
        reqs = m.get("requirements") or []
        if reqs:
            chunk.append(f"提取的需求({len(reqs)} 条):")
            for r in reqs[:20]:
                chunk.append(
                    f"- [{r.get('req_id', '?')} · {r.get('priority', 'P2')}] "
                    f"【{r.get('module', '')}】{(r.get('description', '') or '')[:200]}"
                )
        blocks.append("\n".join(chunk))
    return "\n\n".join(blocks)


def format_industry_pack(pack) -> str:
    """渲染行业 pack 给 LLM。"""
    if not pack:
        return ""
    parts = [f"**[I1] 行业最佳实践 · {pack.display_name}**"]
    if pack.must_visit_departments:
        parts.append("典型必访部门:" + "、".join(pack.must_visit_departments))
    if pack.default_sessions:
        parts.append("典型调研议题(节选):")
        for s in pack.default_sessions[:8]:
            parts.append(f"- {s.get('topic')} · {s.get('target')} · {s.get('method')}")
    if pack.typical_customer_materials:
        # typical_customer_materials 是 list[dict],每个 dict 有 category + items(list[str])
        # 不是 list[str] — 跟 runner.py:1604 处理方式对齐,避免 join dict 报 TypeError
        parts.append("典型客户准备材料:")
        for cat in pack.typical_customer_materials:
            if isinstance(cat, dict):
                items = cat.get("items") or []
                items_str = "、".join(str(x) for x in items)
                parts.append(f"- {cat.get('category', '')}:{items_str}")
            elif isinstance(cat, str):
                # 兼容旧 list[str] 形态(若有)
                parts.append(f"- {cat}")
    return "\n".join(parts)


# ── 结果切分 ─────────────────────────────────────────────────────────────


SECTION_MARKER_PREFIX = "<<<SECTION:"

# LLM 偶尔会漂成 <<SECTION:..>> / <SECTION:..>>> / 不同数量的尖括号,
# 这个宽容正则统一识别。要求行首即标记(strip 后),key 是合法标识符。
import re as _re
_SECTION_MARKER_RE = _re.compile(r"^<+\s*SECTION\s*:\s*([A-Za-z_][\w]*)\s*>+$")



def _strip_leading_h2(body: str) -> str:
    """LLM 偶尔无视"不要写 H2"指令,在 chunk 内重复写一次 ## 标题。
    系统又自动注入一次 → 渲染成"1. 流程总览 / 1. 流程总览"重复。
    这里删除 chunk 前导的 # / ## 标题行(及后续空行)。
    """
    if not body:
        return body
    lines = body.split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines):
        first = lines[i].lstrip()
        if first.startswith("## ") or first.startswith("# "):
            del lines[i]
            while i < len(lines) and not lines[i].strip():
                del lines[i]
    return "\n".join(lines).lstrip("\n")

def assemble_markdown_from_llm_output(llm_raw: str) -> str:
    """LLM 按 <<<SECTION:key>>> 分隔输出,这里按规范的 H2 标题重新拼成完整 markdown。

    容错:某个 section 缺了就跳过(标题加备注);多余的 section 也保留(按声明顺序排)。
    marker 尖括号数量漂了(<<..>> / <..>>>)也能识别 — LLM 经常这样。
    """
    raw = (llm_raw or "").strip()
    # 按分隔标记切块
    chunks: dict[str, str] = {}
    cur_key: Optional[str] = None
    cur_buf: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        m = _SECTION_MARKER_RE.match(stripped)
        if m:
            # flush 上一段
            if cur_key is not None:
                chunks[cur_key] = "\n".join(cur_buf).strip()
            cur_buf = []
            cur_key = m.group(1)
        else:
            cur_buf.append(line)
    if cur_key is not None:
        chunks[cur_key] = "\n".join(cur_buf).strip()

    # 按 REPORT_SECTIONS 声明顺序组装
    out: list[str] = []
    for sec in REPORT_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        body = _strip_leading_h2(body)
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")  # 章间空行
    return "\n".join(out).strip()
