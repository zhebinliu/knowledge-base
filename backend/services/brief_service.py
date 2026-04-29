"""Brief schemas + LLM-driven auto-extraction.

按 output_kind 定义需要的字段；用户进入"开始生成"时若 brief 缺失，前端会调
/api/briefs/{kind}/extract 让 LLM 基于项目元数据 + 关联文档摘要 + KB 检索
一次性把字段抽出（每字段含 confidence 与 sources）作为草稿。

不做 per-skill schema —— 直接按交付物种类划分 schema 更直观，少一个迁移。
"""
import json
import structlog
from sqlalchemy import select
from models import async_session_maker
from models.project import Project
from models.document import Document
from models.chunk import Chunk

logger = structlog.get_logger()


# 字段定义：key/label/hint/required/group/type
# type: text | list | date
BRIEF_SCHEMAS: dict[str, list[dict]] = {
    "kickoff_pptx": [
        # 项目背景
        {"key": "business_context",   "label": "客户业务背景",      "hint": "客户主营、规模、组织、当前业务挑战", "group": "项目背景", "type": "text", "required": True},
        {"key": "current_state",      "label": "现状与痛点",         "hint": "现有系统、流程问题、已知缺口（事实型）",     "group": "项目背景", "type": "text", "required": True},
        {"key": "industry_landscape", "label": "行业判断",           "hint": "行业典型规模 / 数字化成熟度 / 同行参照",       "group": "项目背景", "type": "text", "required": False},
        # 范围
        {"key": "scope_in",           "label": "范围内（In-scope）", "hint": "本期实施覆盖的模块、流程、用户群、数据域",     "group": "范围与目标", "type": "list", "required": True},
        {"key": "scope_out",          "label": "范围外（Out-of-scope）", "hint": "明确排除的模块/系统/能力",                 "group": "范围与目标", "type": "list", "required": False},
        {"key": "smart_goals",        "label": "SMART 目标 3 条",    "hint": "每条含可量化指标（如转化率提升 X%、周期缩短 X 天）","group": "范围与目标", "type": "list", "required": True},
        # 治理
        {"key": "stakeholders",       "label": "干系人",             "hint": "甲方决策人 / 业务负责人 / 乙方 PM / 联合团队（角色+态度）", "group": "团队与治理", "type": "list", "required": True},
        {"key": "raci_notes",         "label": "RACI 关键约定",      "hint": "需求评审、变更控制、上线决策由谁拍板",         "group": "团队与治理", "type": "text", "required": False},
        # 计划
        {"key": "phase_plan",         "label": "阶段计划",           "hint": "Phase 1/2/… 的边界、时间窗、交付物（双周粒度）", "group": "计划与里程碑", "type": "list", "required": True},
        {"key": "key_milestones",     "label": "关键里程碑",         "hint": "UAT / 上线 / 验收日期",                          "group": "计划与里程碑", "type": "list", "required": True},
        {"key": "kickoff_date",       "label": "启动日期",           "hint": "若已确定，写明日期；否则 [待确认]",              "group": "计划与里程碑", "type": "date", "required": False},
        # 风险
        {"key": "key_risks",          "label": "Top 风险与应对",     "hint": "5 条以内，每条 风险/影响/可能性/应对/Owner",     "group": "风险", "type": "list", "required": True},
        # 资源
        {"key": "budget_resource",    "label": "预算与人天",         "hint": "项目预算区间、关键角色人天分布；不清楚写 [待确认]","group": "资源", "type": "text", "required": False},
        {"key": "next_steps",         "label": "本周/下周 Next Step","hint": "具体到 Owner 与 deadline 的 Action Items",       "group": "Next Step", "type": "list", "required": True},
    ],
    "insight": [
        # 项目快照
        {"key": "exec_summary",       "label": "执行摘要要点",       "hint": "3–5 条 bullet：当前态势 + 1 大机会 + 1 大风险",  "group": "执行摘要", "type": "list", "required": True},
        {"key": "project_overview",   "label": "项目概览（量化）",   "hint": "用户数 / 模块数 / 预算 / 时间窗",                "group": "项目概览", "type": "text", "required": True},
        # 干系人
        {"key": "stakeholder_map",    "label": "干系人画像",         "hint": "角色/决策权重/态度（积极/观望/阻力）",          "group": "干系人", "type": "list", "required": True},
        # 决策
        {"key": "decisions_made",     "label": "已做出的关键决策",   "hint": "决策内容 + 背景 + 影响",                          "group": "关键决策", "type": "list", "required": False},
        {"key": "decisions_pending",  "label": "待决策事项",         "hint": "选项 A/B + Owner + 截止时间",                     "group": "关键决策", "type": "list", "required": True},
        # 风险与依赖
        {"key": "risks",              "label": "Top 5–8 风险",       "hint": "风险 / 影响 / 可能性 / 应对 / Owner",            "group": "风险与依赖", "type": "list", "required": True},
        {"key": "dependencies",       "label": "关键依赖与里程碑",   "hint": "阻塞项与时间线",                                  "group": "风险与依赖", "type": "list", "required": True},
        # 行业最佳实践
        {"key": "best_practices",     "label": "可借鉴 / 应规避",    "hint": "2–3 条同行业可借鉴 + 1–2 条反例（标出处）",       "group": "行业最佳实践", "type": "list", "required": False},
        # 行动
        {"key": "next_actions",       "label": "下一步建议",         "hint": "5–8 条；区分 Quick Win / Strategic；含 Owner+deadline+预期产出", "group": "行动", "type": "list", "required": True},
    ],
    # ── v2 (agentic) — 旁路验证版本，与 insight/survey 并存 ──
    # insight_v2: 对齐 INSIGHT_MODULES 中标 source_priority 含 "brief" 的关键字段，
    # 让 BriefDrawer 可以一次性预抽取，再交给 Planner / Executor 用。
    "insight_v2": [
        # M1 执行摘要
        {"key": "situation",          "label": "项目态势(Situation)", "hint": "一句话:规模/阶段/紧迫度",                        "group": "M1 执行摘要", "type": "text", "required": True},
        {"key": "complication",       "label": "项目难点(Complication)", "hint": "项目最大的卡点/困难",                          "group": "M1 执行摘要", "type": "text", "required": True},
        {"key": "top_opportunity",    "label": "最大机会",            "hint": "项目顺利时最大的业务机会",                       "group": "M1 执行摘要", "type": "text", "required": False},
        {"key": "top_risk",           "label": "最大风险",            "hint": "最担心的一件事",                                 "group": "M1 执行摘要", "type": "text", "required": False},
        # M2 项目快照
        {"key": "user_count",         "label": "目标用户数",          "hint": "全员/销售/渠道分别多少",                          "group": "M2 项目快照", "type": "text", "required": True},
        {"key": "budget_range",       "label": "预算区间",            "hint": "含软件/实施/培训/运维",                            "group": "M2 项目快照", "type": "text", "required": False},
        {"key": "timeline",           "label": "时间窗",              "hint": "启动→上线→验收的关键日期",                        "group": "M2 项目快照", "type": "text", "required": True},
        {"key": "current_phase",      "label": "当前阶段",            "hint": "需求/方案/配置/UAT/上线",                         "group": "M2 项目快照", "type": "text", "required": True},
        # M3 健康度 — 关键字段(让 LLM 抽取也能预填,BriefDrawer 也能编辑)
        {"key": "budget",             "label": "预算执行情况",        "hint": "预算消耗比例 / 是否超支风险",                       "group": "M3 健康度", "type": "text", "required": False},
        {"key": "team",               "label": "团队稳定性",          "hint": "双方团队 / 关键人离场 / 客户配合度",                "group": "M3 健康度", "type": "text", "required": False},
        {"key": "risk",               "label": "整体风险 RAG",        "hint": "红 / 黄 / 绿 三档风险评估",                          "group": "M3 健康度", "type": "text", "required": True},
        # M4 干系人
        {"key": "decision_makers",    "label": "关键决策人",          "hint": "拍板预算/范围/上线的最高决策人",                  "group": "M4 干系人", "type": "list", "required": True},
        {"key": "daily_drivers",      "label": "日常推进人",          "hint": "客户方IT/业务的核心推进人",                       "group": "M4 干系人", "type": "list", "required": False},
        {"key": "decision_chain",     "label": "决策链层级",          "hint": "重大决策走几层(直线/委员会/集团-子公司)",          "group": "M4 干系人", "type": "text", "required": False},
        {"key": "attitudes",          "label": "各方态度",            "hint": "各关键角色态度(积极/观望/阻力)",                   "group": "M4 干系人", "type": "text", "required": False},
        # M7 RAID
        {"key": "risks",              "label": "Top 风险(3-5 条)",    "hint": "风险/影响/可能性/应对/Owner",                     "group": "M7 RAID", "type": "list", "required": True},
        {"key": "decisions_pending",  "label": "待决策事项",          "hint": "事项/选项/截止时间/拍板人",                       "group": "M7 RAID", "type": "list", "required": False},
        # M8 里程碑
        {"key": "milestones",         "label": "关键里程碑",          "hint": "UAT / 上线 / 验收日期",                            "group": "M8 里程碑", "type": "list", "required": False},
        # M10 下一步
        {"key": "quick_wins_2w",      "label": "Quick Win(2周内)",    "hint": "2周内可见效的 3-4 条动作,含 Owner+deadline",       "group": "M10 下一步", "type": "list", "required": False},
    ],
    # survey_outline_v2: L0 调研启动 brief — 给"调研大纲"skill 用
    # 大纲是问卷的上游(先定调研场次和议题,再拼对应分卷给责任人)
    "survey_outline_v2": [
        {"key": "discovery_purpose",     "label": "调研目的",          "hint": "本轮调研要解决什么(摸底现状 / 验证方案 / 收集需求 / 确认变更)", "group": "L0 目标", "type": "text", "required": True},
        {"key": "duration_weeks",        "label": "总周期",            "hint": "几周(2 / 3 / 4 周)",                                          "group": "L0 节奏", "type": "text", "required": True},
        {"key": "in_scope_departments",  "label": "涵盖部门",          "hint": "客户哪些部门参与本轮调研",                                       "group": "L0 范围", "type": "list", "required": True},
        {"key": "expected_decisions",    "label": "调研后要拍板的事项","hint": "调研结束后必须做的决策(范围 / 优先级 / 阶段切分)",              "group": "L0 目标", "type": "list", "required": False},
        {"key": "customer_contact",      "label": "客户对接人",        "hint": "客户方的 PMO / 主对接人,负责协调档期、催材料",                 "group": "L0 协作", "type": "text", "required": True},
        {"key": "our_team_members",      "label": "我方调研团队",      "hint": "主访 / 记录 / 跟进 / 工作坊主持 各角色人员",                   "group": "L0 团队", "type": "list", "required": False},
        {"key": "time_constraints",      "label": "时间窗约束",        "hint": "客户上班时间 / 节假日避开 / 关键人档期 / 材料到位时间",         "group": "L0 节奏", "type": "text", "required": False},
        {"key": "preferred_format",      "label": "偏好形式",          "hint": "集中 vs 分散;线上 vs 线下;集中工作坊 vs 一对一访谈",          "group": "L0 节奏", "type": "text", "required": False},
    ],
    # survey_v2: L1 高管短卷 — 战略+痛点对齐(对齐 L1_EXEC_SUBSECTION must_cover)
    "survey_v2": [
        {"key": "strategic_intent",   "label": "战略意图",            "hint": "为什么上 CRM(业务驱动 / 合规 / 数字化转型)",        "group": "L1 战略", "type": "text", "required": True},
        {"key": "success_metrics",    "label": "成功标准(3 个 SMART)", "hint": "可量化、可验证(例:商机赢率提升 X%)",                "group": "L1 战略", "type": "list", "required": True},
        {"key": "top_pain_points",    "label": "Top 3 痛点",          "hint": "按优先级排序",                                     "group": "L1 痛点", "type": "list", "required": True},
        {"key": "decision_chain",     "label": "决策链 / 拍板人",     "hint": "最终决策人+审批层级",                              "group": "L1 治理", "type": "text", "required": True},
        {"key": "timeline_target",    "label": "时间预期",            "hint": "上线节点 + 是否有刚性截止(年度大会 / 合规)",        "group": "L1 时间", "type": "text", "required": True},
        {"key": "budget_range",       "label": "预算区间",            "hint": "含软件 / 实施 / 培训 / 运维",                       "group": "L1 资源", "type": "text", "required": False},
        {"key": "existing_systems",   "label": "现有系统生态",        "hint": "ERP / OA / MES / PLM / 其他 CRM",                   "group": "L1 集成", "type": "list", "required": True},
        {"key": "channel_complexity", "label": "渠道结构概况",        "hint": "直销/经销商比例 + 是否需要渠道门户",                "group": "L1 渠道", "type": "text", "required": False},
    ],
}


def get_schema(output_kind: str) -> list[dict]:
    # kickoff_html 与 kickoff_pptx 共用同一份 brief schema（两者输入素材一致，仅渲染形态不同）
    if output_kind == "kickoff_html":
        return BRIEF_SCHEMAS.get("kickoff_pptx", [])
    return BRIEF_SCHEMAS.get(output_kind, [])


def get_v2_paired_schema(output_kind: str) -> list[dict]:
    """v2 输出辅助: insight_v2 / survey_v2 共用 v2 schema(用于 BriefDrawer 抽取)。

    本期不区分 v2 与原版 schema 的 BriefDrawer 流;直接复用 BRIEF_SCHEMAS 注册即可。
    保留此函数以便后续做 v1/v2 schema 镜像时统一入口。
    """
    return BRIEF_SCHEMAS.get(output_kind, [])


def empty_brief(output_kind: str) -> dict:
    """根据 schema 返回空骨架。"""
    schema = get_schema(output_kind)
    return {f["key"]: {"value": None, "confidence": None, "sources": []} for f in schema}


def merge_extract_with_user_edits(existing: dict, draft: dict) -> dict:
    """合并：用户编辑过的字段（edited_at 存在）保留；其余用新草稿覆盖。"""
    merged: dict = {}
    keys = set(existing or {}) | set(draft or {})
    for k in keys:
        old = (existing or {}).get(k)
        new = (draft or {}).get(k)
        # 裸值（list/str/...）容错：当作未编辑过的草稿值使用
        if not isinstance(old, dict):
            old = {}
        if not isinstance(new, dict):
            new = {"value": new} if new is not None else {}
        if old.get("edited_at"):
            merged[k] = old
        else:
            merged[k] = new
    return merged


# ── 文档类型 → 优先抽取字段 + 抽取重点提示(差异化提取策略) ──
# 用于 insight_v2 的文档驱动 brief extraction。每种文档类型擅长承载哪些字段,
# 给 LLM 显式 must_extract / nice_to_have / why_focus 提示,而不是让它一锅炖。
DOC_TYPE_EXTRACTION_HINTS: dict[str, dict] = {
    "sow": {
        "label": "SOW 需求说明书",
        "must_extract":   ["situation", "complication", "user_count", "timeline", "current_phase", "decision_makers"],
        "nice_to_have":   ["top_risk", "top_opportunity", "milestones", "decision_chain"],
        "why_focus":      "SOW 是项目范围+目标的权威源 — 优先提取项目态势/难点/规模/时间窗/决策人;Top 风险与里程碑次之。",
    },
    "system_integration": {
        "label": "系统集成清单",
        "must_extract":   ["module_list", "decisions_pending"],
        "nice_to_have":   ["risks", "milestones", "complication"],
        "why_focus":      "集成清单专注外部依赖 + 模块范围 — 优先提取实施模块清单 / 待决策的集成项;集成相关风险次之。",
    },
    "contract": {
        "label": "项目合同",
        "must_extract":   ["budget_range", "user_count", "timeline", "module_list"],
        "nice_to_have":   ["milestones", "decision_makers"],
        "why_focus":      "合同条款是数据化指标的硬来源 — 直接采信预算/账号数/时间窗/模块清单;不要从其他文档覆盖合同的硬数据。",
    },
    "handover": {
        "label": "交接单",
        "must_extract":   ["situation", "current_phase", "complication", "team", "risks"],
        "nice_to_have":   ["decisions_pending", "quick_wins_2w", "milestones"],
        "why_focus":      "交接单反映项目实际进展 — 优先提取当前态势/阶段/已发现的难点/团队稳定性;待执行 action 与 Quick Win 次之。",
    },
    "stakeholder_map": {
        "label": "组织架构 / 干系人图谱",
        "must_extract":   ["decision_makers", "daily_drivers", "attitudes", "decision_chain"],
        "nice_to_have":   [],
        "why_focus":      "干系人图是 M4 模块的唯一权威源 — 提完 4 个干系人字段后即可。",
    },
    "presales_solution": {
        "label": "售前解决方案",
        "must_extract":   ["top_opportunity", "module_list"],
        "nice_to_have":   ["complication", "risks", "current_phase"],
        "why_focus":      "售前方案给的是预期目标 + 解决思路 — 优先提取最大机会/拟定模块;难点与风险次之。注意:预期目标 ≠ 现状,不要用方案描述代替交接单的实际进展。",
    },
    "presales_survey": {
        "label": "售前调研问卷",
        "must_extract":   ["situation", "complication", "user_count", "current_phase"],
        "nice_to_have":   ["decision_makers", "decision_chain", "top_risk"],
        "why_focus":      "售前调研问卷反映客户的初始陈述 — 优先提取业务现状/痛点/规模/项目阶段;干系人 + 风险次之。",
    },
    # 老 doc_types 兜底
    "requirement_research": {
        "label": "需求调研",
        "must_extract": ["situation", "complication"],
        "nice_to_have": ["risks", "user_count"],
        "why_focus": "需求调研材料,提取客户业务现状与核心痛点。",
    },
    "meeting_notes": {
        "label": "会议纪要",
        "must_extract": ["decisions_pending"],
        "nice_to_have": ["risks", "current_phase"],
        "why_focus": "会议纪要主要承载已决策事项 + 待拍板事项,注意时间线。",
    },
}


def get_extraction_hints(doc_type: str | None) -> dict | None:
    """按 doc_type 取抽取重点提示;未定义返回 None(LLM 走通用策略)。"""
    if not doc_type:
        return None
    return DOC_TYPE_EXTRACTION_HINTS.get(doc_type)


# ── LLM 抽取 ────────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """你是一名 MBB 风格的资深咨询顾问助理，正在为一份 CRM 实施项目交付物起草 Brief。
你只负责"抽取与初填"，不负责创作；遇到没有依据的字段一律给 null + low confidence。

【按文档类型差异化提取 — 严格执行】
不同文档类型有自己的"权威字段"。当下方素材里某文档类型给出 must_extract 提示时:
- 优先从该类型文档抽取相应字段(其他文档来源仅作交叉验证,不覆盖该类型的硬数据)
- 例如:合同的 budget_range 是硬数据,不要被 SOW 里"预估预算" 覆盖;干系人图的 decision_makers 是权威源,不要被会议纪要里随口提的人名覆盖。
- 沿用文档原话作为 sources 引用,不要重述。

【输出 — 严格 JSON】
- 必须输出可被 JSON.parse 解析的对象，不要 ```json 围栏，不要任何前后语句
- 顶层结构：{ "fields": { "<field_key>": { "value": ... | null, "confidence": "high"|"medium"|"low"|null, "sources": [{"type":"...","ref":"...","snippet":"..."}] } } }
- value 类型按 schema：text → 字符串；list → 字符串数组；date → "YYYY-MM-DD"；信息缺失 → null
- confidence：
  - high：素材里有明确依据（直接引文/数字）
  - medium：可由素材合理推断
  - low：靠行业常识 + 客户画像泛泛推断
  - null：没有依据，value 必须为 null
- sources[] 至多 3 条；type ∈ {"document","kb_chunk","metadata","industry"}；ref 写文档名/切片 ID/字段名；snippet 不超过 80 字
- 不得编造来源；如果只是行业常识，sources=[{"type":"industry","ref":"行业常识","snippet":"..."}]，confidence=low

【风格】
- list 类字段每条 ≤ 60 字、可执行、避免黑话（赋能/抓手/链路/生态/全方位）
- text 类字段 100–250 字
- 数据型字段尽量给区间/数字；不知道写 null

【关键】不要省略 schema 里任何 key，全部输出（即使 value 为 null）。
"""


def _format_schema_for_prompt(schema: list[dict]) -> str:
    lines = []
    for f in schema:
        kind = f.get("type", "text")
        req = "必填" if f.get("required") else "选填"
        hint = f.get("hint") or ""
        lines.append(f'- {f["key"]} ({kind}, {req}) — {f["label"]}：{hint}')
    return "\n".join(lines)


async def _gather_extract_context(project_id: str, kind: str) -> dict:
    """拉项目元数据 + 关联文档(按 doc_type 分组,带抽取重点提示) + KB chunks。

    v3 升级:文档不再"一锅炖摘要",而是按 doc_type 分组渲染,每组带 must_extract / why_focus
    提示给 LLM,实现差异化提取(SOW 提范围,合同提预算,交接单提进展...)。
    """
    async with async_session_maker() as s:
        proj = await s.get(Project, project_id) if project_id else None
        doc_rows: list = []
        chunks_text = ""
        if proj:
            doc_rows = list((await s.execute(
                select(
                    Document.id, Document.filename, Document.summary,
                    Document.doc_type, Document.markdown_content,
                )
                .where(Document.project_id == proj.id)
                .where(Document.conversion_status == "completed")
                .limit(30)
            )).all())
            doc_ids = [r.id for r in doc_rows]
            if doc_ids:
                chunk_rows = (await s.execute(
                    select(Chunk.content, Chunk.source_section, Document.filename)
                    .join(Document, Document.id == Chunk.document_id)
                    .where(Chunk.document_id.in_(doc_ids))
                    .where(Chunk.review_status != "rejected")
                    .order_by(Chunk.citation_count.desc())
                    .limit(30)
                )).all()
                chunks_text = "\n\n".join(
                    f"[{r.filename or '未知文档'}{(' · ' + r.source_section) if r.source_section else ''}]\n{(r.content or '')[:400]}"
                    for r in chunk_rows
                )

    # 按 doc_type 分组(未分类的归一组)
    grouped: dict[str, list] = {}
    for r in doc_rows:
        grouped.setdefault(r.doc_type or "_unspecified", []).append(r)

    # 渲染每组:带 must_extract / why_focus 提示 + 各文档摘要 + 截断 markdown
    docs_block_parts: list[str] = []
    if doc_rows:
        for doc_type, rows in grouped.items():
            hints = get_extraction_hints(doc_type)
            label = (hints or {}).get("label") or doc_type or "未分类"
            docs_block_parts.append(f"\n### 【文档类型:{label}】({len(rows)} 份)")
            if hints:
                must = ", ".join(hints.get("must_extract") or []) or "—"
                nice = ", ".join(hints.get("nice_to_have") or []) or "—"
                docs_block_parts.append(f"- **must_extract**: {must}")
                docs_block_parts.append(f"- **nice_to_have**: {nice}")
                if hints.get("why_focus"):
                    docs_block_parts.append(f"- **重点说明**: {hints['why_focus']}")
            else:
                docs_block_parts.append("- (该文档类型未定义抽取重点,通用策略)")
            for r in rows:
                summary = (r.summary or "")[:300]
                # markdown 截断 — 每份 6000 字符上限,够看完关键段(整体 LLM 输入控制)
                md_excerpt = (r.markdown_content or "")[:6000]
                docs_block_parts.append(f"\n  **[{r.filename or '未命名'}]**")
                if summary:
                    docs_block_parts.append(f"  摘要:{summary}")
                if md_excerpt:
                    docs_block_parts.append(f"  正文(截断):\n```\n{md_excerpt}\n```")

    docs_block = "\n".join(docs_block_parts) if docs_block_parts else "（无关联文档)"

    # 兼容字段:docs_summary(老接口仍在用)
    docs_summary = "\n".join(
        f"- {r.filename}（{(get_extraction_hints(r.doc_type) or {}).get('label') or r.doc_type or '未分类'}）: {(r.summary or '')[:200]}"
        for r in doc_rows
    ) if doc_rows else "（无关联文档）"

    return {
        "project": proj,
        "docs_summary": docs_summary,
        "docs_block": docs_block,         # ← v3 新增:按 doc_type 分组的完整素材
        "chunks_text": chunks_text,
    }


def _parse_brief_response(raw: str, schema: list[dict]) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        nl = text.find("\n")
        if nl >= 0:
            text = text[nl + 1:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    # 截到第一个 { 开头
    if not text.startswith("{"):
        i = text.find("{")
        if i >= 0:
            text = text[i:]
    # 用 raw_decode 解析第一个完整 JSON 值，忽略任何尾部 token / 多余对象
    parsed = None
    try:
        parsed, _end = json.JSONDecoder().raw_decode(text)
    except Exception as e:
        logger.warning("brief_extract_json_parse_failed", error=str(e)[:120], head=text[:200])
        return {}
    fields_raw = parsed.get("fields") if isinstance(parsed, dict) else None
    if not isinstance(fields_raw, dict):
        return {}
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    out: dict = {}
    for f in schema:
        k = f["key"]
        raw_v = fields_raw.get(k)
        # LLM 偶尔把 cell 直接返成裸值（list / str / dict），统一包成 {value,confidence,sources}
        if isinstance(raw_v, dict):
            v = raw_v
        elif raw_v is None:
            v = {}
        else:
            v = {"value": raw_v}
        out[k] = {
            "value": _coerce_value(v.get("value"), f.get("type", "text")),
            "confidence": v.get("confidence") if v.get("confidence") in {"high", "medium", "low"} else None,
            "sources": v.get("sources") if isinstance(v.get("sources"), list) else [],
            "auto_filled_at": now_iso,
        }
    return out


def _stringify_item(item) -> str:
    """LLM 偶尔会把 list 项返回成 dict（如 {role, weight, stance}），拼成 'k: v · k: v' 字符串。"""
    if item is None:
        return ""
    if isinstance(item, str):
        return item
    if isinstance(item, (int, float, bool)):
        return str(item)
    if isinstance(item, dict):
        parts = [f"{k}: {_stringify_item(v)}" for k, v in item.items() if v not in (None, "", [])]
        return " · ".join(parts)
    if isinstance(item, list):
        return "; ".join(_stringify_item(x) for x in item if x not in (None, "", []))
    return str(item)


def _coerce_value(value, ftype: str):
    if value is None:
        return None
    if ftype == "list":
        if isinstance(value, list):
            return [s for s in (_stringify_item(x) for x in value) if s]
        # LLM 偶尔把单条 list 返成 string / dict
        s = _stringify_item(value)
        return [s] if s else []
    if ftype == "date":
        return value if isinstance(value, str) else None
    # text
    if isinstance(value, str):
        return value
    return _stringify_item(value)


async def stream_extract_brief_draft(project_id: str, output_kind: str, model: str | None = None):
    """异步生成器：边干边吐进度事件。

    事件 schema：
    - {"type":"stage_start","id":"...","label":"..."}
    - {"type":"stage_done","id":"...","detail":"..."}
    - {"type":"done","fields":{...}}
    - {"type":"error","message":"..."}
    """
    schema = get_schema(output_kind)
    if not schema:
        yield {"type": "done", "fields": {}}
        return

    # ── 1. 项目元数据 ─────────────────────────────────────
    yield {"type": "stage_start", "id": "metadata", "label": "拉取项目元数据"}
    try:
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id) if project_id else None
        yield {"type": "stage_done", "id": "metadata",
               "detail": (proj.name if proj else "无项目")}
    except Exception as e:
        yield {"type": "error", "message": f"读取项目失败：{e}"}
        return

    # ── 2. 关联文档(按 doc_type 分组,带正文截断) ───────
    yield {"type": "stage_start", "id": "documents", "label": "读取关联文档(按类型分组)"}
    doc_rows = []
    try:
        if proj:
            async with async_session_maker() as s:
                doc_rows = list((await s.execute(
                    select(Document.id, Document.filename, Document.summary,
                           Document.doc_type, Document.markdown_content)
                    .where(Document.project_id == proj.id)
                    .where(Document.conversion_status == "completed")
                    .limit(30)
                )).all())
        # 按 doc_type 分组拼 detail
        by_type: dict[str, int] = {}
        for r in doc_rows:
            t = r.doc_type or "_unspecified"
            by_type[t] = by_type.get(t, 0) + 1
        detail_str = " · ".join(f"{(get_extraction_hints(t) or {}).get('label') or t}({n})"
                                 for t, n in by_type.items())
        yield {"type": "stage_done", "id": "documents",
               "detail": f"{len(doc_rows)} 份 — {detail_str}" if detail_str else f"{len(doc_rows)} 份"}
    except Exception as e:
        yield {"type": "error", "message": f"读取文档失败：{e}"}
        return

    # ── 3. KB 相关切片 ───────────────────────────────────
    yield {"type": "stage_start", "id": "chunks", "label": "检索知识库相关切片"}
    chunks_text = ""
    chunk_n = 0
    try:
        doc_ids = [r.id for r in doc_rows]
        if doc_ids:
            async with async_session_maker() as s:
                chunk_rows = (await s.execute(
                    select(Chunk.content, Chunk.source_section, Document.filename)
                    .join(Document, Document.id == Chunk.document_id)
                    .where(Chunk.document_id.in_(doc_ids))
                    .where(Chunk.review_status != "rejected")
                    .order_by(Chunk.citation_count.desc())
                    .limit(30)
                )).all()
            chunk_n = len(chunk_rows)
            chunks_text = "\n\n".join(
                f"[{r.filename or '未知文档'}{(' · ' + r.source_section) if r.source_section else ''}]\n{(r.content or '')[:400]}"
                for r in chunk_rows
            )
        yield {"type": "stage_done", "id": "chunks",
               "detail": f"{chunk_n} 条切片"}
    except Exception as e:
        yield {"type": "error", "message": f"检索切片失败：{e}"}
        return

    # ── 4. LLM 抽取(按 doc_type 差异化) ────────────────
    yield {"type": "stage_start", "id": "llm", "label": "AI 综合素材并按文档类型差异化抽取"}

    # v3:按 doc_type 分组渲染 + 抽取重点提示
    grouped: dict[str, list] = {}
    for r in doc_rows:
        grouped.setdefault(r.doc_type or "_unspecified", []).append(r)

    docs_block_parts: list[str] = []
    if doc_rows:
        for doc_type, rows in grouped.items():
            hints = get_extraction_hints(doc_type)
            label = (hints or {}).get("label") or doc_type or "未分类"
            docs_block_parts.append(f"\n### 【文档类型:{label}】({len(rows)} 份)")
            if hints:
                must = ", ".join(hints.get("must_extract") or []) or "—"
                nice = ", ".join(hints.get("nice_to_have") or []) or "—"
                docs_block_parts.append(f"- **must_extract**(优先抽取): {must}")
                docs_block_parts.append(f"- **nice_to_have**(次要): {nice}")
                if hints.get("why_focus"):
                    docs_block_parts.append(f"- **重点说明**: {hints['why_focus']}")
            else:
                docs_block_parts.append("- (该文档类型未定义抽取重点,通用策略)")
            for r in rows:
                summary = (r.summary or "")[:300]
                md_excerpt = (r.markdown_content or "")[:6000]
                docs_block_parts.append(f"\n  **[{r.filename or '未命名'}]**")
                if summary:
                    docs_block_parts.append(f"  摘要:{summary}")
                if md_excerpt:
                    docs_block_parts.append(f"  正文(截 6000 字):\n```\n{md_excerpt}\n```")
    docs_summary = "\n".join(docs_block_parts) if docs_block_parts else "（无关联文档)"

    meta_block = "（无项目元数据）"
    if proj:
        meta_block = f"""项目名称：{proj.name}
客户：{proj.customer or '—'}
行业：{proj.industry or '—'}
启动日期：{proj.kickoff_date.isoformat() if proj.kickoff_date else '—'}
实施模块：{', '.join(proj.modules or []) or '—'}
项目描述：{proj.description or '—'}
客户画像：{proj.customer_profile or '—'}"""

    schema_block = _format_schema_for_prompt(schema)
    prompt = f"""【交付物类型】{output_kind}

【项目元数据】
{meta_block}

【关联文档摘要】
{docs_summary}

【项目相关切片（节选，作为引用素材）】
{chunks_text or '（无相关切片）'}

【需要抽取的字段 schema】
{schema_block}

请按系统提示要求，输出 JSON。所有 schema 中的 key 都必须出现在 fields 中。"""

    from services.output_service import _llm_call
    try:
        raw = await _llm_call(prompt, system=EXTRACT_SYSTEM, model=model, max_tokens=6000, timeout=240.0)
    except Exception as e:
        yield {"type": "error", "message": f"LLM 调用失败：{e}"}
        return

    out = _parse_brief_response(raw, schema)
    if not out:
        out = empty_brief(output_kind)
        yield {"type": "stage_done", "id": "llm", "detail": "解析失败，已返回空骨架"}
    else:
        filled = sum(1 for cell in out.values() if isinstance(cell, dict) and cell.get("value") not in (None, "", []))
        yield {"type": "stage_done", "id": "llm", "detail": f"{filled}/{len(schema)} 字段已抽取"}

    yield {"type": "done", "fields": out}


async def extract_brief_draft(project_id: str, output_kind: str, model: str | None = None) -> dict:
    """非流式封装：跑完 stream，取 done 事件的 fields。"""
    fields: dict = {}
    async for ev in stream_extract_brief_draft(project_id, output_kind, model):
        if ev.get("type") == "done":
            fields = ev.get("fields") or {}
        elif ev.get("type") == "error":
            return empty_brief(output_kind)
    return fields or empty_brief(output_kind)


def render_brief_for_prompt(brief_fields: dict, schema: list[dict]) -> str:
    """把已确认的 brief 拼成给生成 prompt 的 markdown 块。空字段跳过。"""
    if not brief_fields or not schema:
        return ""
    by_group: dict[str, list[str]] = {}
    for f in schema:
        cell = (brief_fields or {}).get(f["key"])
        # 容错：cell 也许是裸值（list/str），统一包成 {value}
        if not isinstance(cell, dict):
            cell = {"value": cell} if cell is not None else {}
        v = cell.get("value")
        if v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not v):
            continue
        if isinstance(v, list):
            body = "\n".join(f"  - {item}" for item in v)
        else:
            body = str(v).strip()
        line = f"- **{f['label']}**：\n{body}" if isinstance(v, list) else f"- **{f['label']}**：{body}"
        by_group.setdefault(f.get("group") or "其他", []).append(line)
    if not by_group:
        return ""
    blocks = []
    for grp, lines in by_group.items():
        blocks.append(f"### {grp}\n" + "\n".join(lines))
    return "\n\n".join(blocks)
