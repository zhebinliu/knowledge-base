"""Insight v2 — 10 个模块的声明式定义。

每个模块包含:
- key / title / necessity (critical|optional)
- purpose: 给 Planner 看的"这个模块要解决什么"
- fields: 该模块所需的信息字段(每字段含来源优先级 + 缺时获取动作)
- prompt_template: Executor 单模块生成的提示词模板
- rubric_focus: Critic 重点检查哪些 Sopact 维度

数据是纯声明,所有逻辑在 planner.py / executor.py / critic.py 里。
"""
from dataclasses import dataclass, field, asdict
from typing import Literal


FieldType = Literal["text", "list", "rag_label", "table", "number", "date"]
SourceKind = Literal["brief", "conversation", "kb_search", "web_search", "metadata", "industry_pack", "compute"]
GapAction = Literal["kb_search", "web_search", "ask_user", "downgrade", "compute_from"]
RubricDim = Literal["specificity", "evidence", "timeliness", "next_step"]


@dataclass
class FieldSpec:
    key: str
    label: str
    type: FieldType
    source_priority: list[SourceKind]
    gap_action: GapAction = "downgrade"
    kb_query_hint: str = ""               # gap_action=kb_search 时使用
    user_question: str = ""               # gap_action=ask_user 时使用
    compute_from: list[str] = field(default_factory=list)  # gap_action=compute_from 时引用其他字段
    required: bool = False                # 模块内必填:缺则模块降级
    description: str = ""
    # 给"信息不足拦截"问卷用 — 单/多选选项;前端会渲染 chip,留 "其他(自填)" 口
    options: list[str] = field(default_factory=list)
    multi: bool = False                   # options 是否多选(配合 type=list 用)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ModuleSpec:
    key: str                              # e.g. "M1_exec_summary",bundle.extra.module_states 用这个
    title: str                            # 渲染到 markdown 章节标题
    necessity: Literal["critical", "optional"]
    purpose: str
    fields: list[FieldSpec]
    prompt_template: str
    rubric_focus: list[RubricDim] = field(default_factory=lambda: ["specificity", "evidence", "next_step"])
    industry_filter: list[str] = field(default_factory=list)  # 空=所有行业;非空=只在指定行业激活

    def to_dict(self) -> dict:
        d = asdict(self)
        d["fields"] = [f.to_dict() for f in self.fields]
        return d


# ── 共用 prompt 片段 ────────────────────────────────────────────────────────────
COMMON_STYLE = """【风格】
- MBB 风格(McKinsey/BCG/Bain),金字塔原理:先抛结论,后给证据
- 表格优先于 bullet
- 不写黑话(赋能/抓手/闭环/链路/生态/数字化转型/一站式)
- 每个数据点末尾标 [访谈]/[KB]/[Brief]/[Web]/[推断] 来源
- 信息缺口写"信息缺失,建议在 Phase 1 第一周补访",绝不编造

【禁止】
- 禁止输出 H1 / H2 章节标题(系统会自动注入)
- 禁止 emoji
- 禁止"我们认为/相信/坚信",克制,克制,再克制"""


# ── 10 个模块 ───────────────────────────────────────────────────────────────────

INSIGHT_MODULES: list[ModuleSpec] = [
    # ── M1 执行摘要 ───────────────────────────────────────────────
    ModuleSpec(
        key="M1_exec_summary",
        title="执行摘要",
        necessity="critical",
        purpose="SCQA 开篇,30 秒读完;识别 1 大机会 + 1 大风险 + 总 RAG",
        fields=[
            FieldSpec("situation", "项目态势(Situation)", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="一句话概括项目当前态势:规模 / 阶段 / 紧迫度?",
                      required=True),
            FieldSpec("complication", "项目难点(Complication)", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="项目最大的难点 / 卡点是什么?", required=True),
            FieldSpec("top_opportunity", "最大机会", "text",
                      ["conversation", "brief"], "ask_user",
                      user_question="如果项目顺利,最大的业务机会是什么?",
                      options=["销售效率提升", "渠道管控强化", "数据驱动决策",
                               "客户体验升级", "服务收入转型", "组织数字化"]),
            FieldSpec("top_risk", "最大风险", "text",
                      ["conversation", "brief"], "ask_user",
                      user_question="最担心的一件事是什么?",
                      options=["范围蔓延 / 镀金", "推广阻力 / 采纳率低", "数据迁移质量",
                               "集成复杂度", "时间压力 / 上线延期", "预算超支",
                               "关键人离场", "客户内部协调失败"]),
            FieldSpec("overall_rag", "总体健康度", "rag_label",
                      ["compute"], "compute_from",
                      compute_from=["M3_health_radar"], required=True),
        ],
        prompt_template="""请生成项目洞察报告的【执行摘要】章节。

按 SCQA + Pyramid 结构写,3–5 条 bullet,给客户高管 30 秒读完。
首行:**总体健康度: 红/黄/绿** + 一句话定性。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "next_step"],
    ),

    # ── M2 项目快照 ───────────────────────────────────────────────
    ModuleSpec(
        key="M2_project_snapshot",
        title="项目快照",
        necessity="critical",
        purpose="量化快照:用户数 / 模块数 / 预算 / 时间窗 / 当前阶段",
        fields=[
            FieldSpec("user_count", "目标用户数(规模)", "text",
                      ["brief", "conversation", "kb_search"], "ask_user",
                      kb_query_hint="目标用户 角色 数量",
                      user_question="目标用户数(全员 / 销售 / 渠道分别多少)?",
                      required=True,
                      options=["< 50 人", "50-200 人", "200-500 人",
                               "500-2000 人", "2000-10000 人", "> 10000 人"]),
            FieldSpec("module_list", "实施模块清单", "list",
                      ["metadata", "brief", "conversation"], "downgrade",
                      description="从 Project.modules + Brief.scope_in 合并"),
            FieldSpec("budget_range", "预算区间", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="项目预算区间 / 是否含硬件软件人天?",
                      options=["< 50 万", "50-200 万", "200-500 万",
                               "500-1000 万", "1000-3000 万", "> 3000 万"]),
            FieldSpec("timeline", "时间窗", "text",
                      ["metadata", "brief"], "ask_user",
                      user_question="项目启动 → 上线 → 验收的关键日期?", required=True,
                      options=["1 个月内", "2-3 个月", "3-6 个月",
                               "6-12 个月", "1-2 年", "> 2 年"]),
            FieldSpec("current_phase", "当前所处阶段", "text",
                      ["conversation", "brief"], "ask_user",
                      user_question="目前在哪个阶段(需求 / 方案 / 配置 / UAT / 上线)?",
                      required=True,
                      options=["需求调研", "方案设计", "系统配置 / 开发",
                               "数据迁移", "SIT / UAT", "上线前准备",
                               "已上线 / 运维", "二期规划"]),
        ],
        prompt_template="""请生成项目洞察报告的【项目快照】章节。

用一张 Markdown 表格呈现项目核心量化指标(规模 / 模块 / 预算 / 时间 / 阶段)。
表格下面附 1-2 句话定性结论(项目体量在行业内属于什么水平)。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M3 健康度雷达(6 维 RAG) ────────────────────────────────────
    ModuleSpec(
        key="M3_health_radar",
        title="健康度雷达",
        necessity="critical",
        purpose="6 维健康度评估(进度/范围/预算/质量/人员/风险),每维子 RAG + 量化",
        fields=[
            FieldSpec("progress", "进度健康度", "table",
                      ["brief", "conversation", "kb_search"], "kb_search",
                      kb_query_hint="项目进度 周报 里程碑 实际vs计划", required=True),
            FieldSpec("scope", "范围控制", "table",
                      ["conversation", "kb_search"], "kb_search",
                      kb_query_hint="变更控制 范围变化 需求新增", required=True),
            FieldSpec("budget", "预算执行", "table",
                      ["brief", "conversation"], "ask_user",
                      user_question="预算消耗比例?是否有超支风险?",
                      options=["< 30% 已用,正常", "30-60% 已用,正常",
                               "60-90% 已用,关注", "> 90% 已用,超支风险",
                               "已超支"]),
            FieldSpec("quality", "质量(缺陷/UAT)", "table",
                      ["kb_search", "conversation"], "kb_search",
                      kb_query_hint="UAT 缺陷 测试报告 bug"),
            FieldSpec("team", "团队稳定", "table",
                      ["brief", "conversation"], "ask_user",
                      user_question="团队稳定性 / 关键人离场 / 客户配合度?",
                      options=["双方稳定,配合好", "我方稳定,客户配合一般",
                               "我方稳定,客户配合差", "我方关键人离场",
                               "客户关键人离场", "双方都有变动"]),
            FieldSpec("risk", "风险整体 RAG", "text",
                      ["brief", "conversation"], "ask_user", required=True,
                      user_question="项目风险整体评估?",
                      options=["红 - 高风险,需立即介入",
                               "黄 - 中风险,需关注",
                               "绿 - 低风险,正常推进"]),
        ],
        prompt_template="""请生成项目洞察报告的【健康度雷达】章节。

输出一张 6 行的 Markdown 表格:
| 维度 | RAG | 量化指标 | 关键观察 | 触发原因 |

6 维 = 进度 / 范围 / 预算 / 质量 / 人员 / 风险
RAG 用 红/黄/绿 三档(不要 emoji)。
量化指标必须有数字或区间(没有就写"暂无量化口径")。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "evidence"],
    ),

    # ── M4 干系人画像 ─────────────────────────────────────────────
    ModuleSpec(
        key="M4_stakeholder_map",
        title="干系人画像",
        necessity="critical",
        purpose="决策链 + 各角色态度(积极 / 观望 / 阻力)+ 影响力",
        fields=[
            FieldSpec("decision_makers", "关键决策人", "list",
                      ["brief", "conversation"], "ask_user",
                      user_question="谁拍板预算 / 范围 / 上线?最高拍板人是谁?",
                      required=True),
            FieldSpec("daily_drivers", "日常推进人", "list",
                      ["brief", "conversation"], "ask_user",
                      user_question="客户方日常推进项目的核心人员有谁(IT / 业务)?"),
            FieldSpec("attitudes", "各方态度", "table",
                      ["brief", "conversation"], "ask_user",
                      user_question="各关键角色态度?(积极/观望/阻力)"),
            FieldSpec("decision_chain", "决策链层级", "text",
                      ["conversation", "brief"], "ask_user",
                      user_question="重大决策走几层?(直线 / 委员会 / 集团-子公司)",
                      options=["单一负责人直线决策", "部门内部委员会",
                               "跨部门联合委员会", "集团-子公司两层",
                               "集团-事业部-子公司三层", "需董事会 / 国资委审批"]),
        ],
        prompt_template="""请生成项目洞察报告的【干系人画像】章节。

主要用一张 Markdown 表格:
| 角色 / 部门 | 关键人 | 决策权重 | 态度 | 影响力 | 应对策略 |

下面再用 2-3 句话描述决策链特点(直线 / 委员会 / 集团式)。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M5 行业上下文(智能制造专属) ──────────────────────────────
    ModuleSpec(
        key="M5_industry_context",
        title="行业上下文",
        necessity="optional",
        purpose="智能制造 / 工业品行业的特殊业务模式 + 客户在行业里的位置",
        industry_filter=["manufacturing"],
        fields=[
            FieldSpec("install_base_size", "Install Base 体量", "text",
                      ["brief", "industry_pack", "conversation"], "ask_user",
                      user_question="客户已售设备数量级?是否有序列号档案?",
                      options=["< 100 台", "100-1000 台", "1000-10000 台",
                               "1万-10万 台", "> 10万 台", "未管理"]),
            FieldSpec("bom_complexity", "BOM 复杂度", "text",
                      ["brief", "industry_pack", "conversation"], "ask_user",
                      user_question="标品占比 / 定制品比例?BOM 嵌套层数?",
                      options=["纯标品", "标品 80% / 定制 20%(2 层 BOM)",
                               "50/50(3 层 BOM)", "纯定制(3-5 层 BOM)",
                               "纯定制(5+ 层 BOM)"]),
            FieldSpec("channel_mix", "渠道结构", "text",
                      ["brief", "industry_pack", "conversation"], "ask_user",
                      user_question="直销 vs 经销商比例?经销商数量?是否分级?",
                      options=["纯直销", "直销 80% / 经销 20%",
                               "50/50", "经销 80% / 直销 20%",
                               "纯经销商(已分级)", "纯经销商(未分级)"]),
            FieldSpec("erp_vendor", "ERP 厂商", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="现有 ERP 是哪家?",
                      options=["金蝶", "用友", "SAP", "Oracle", "鼎捷",
                               "自研", "无 ERP"]),
            FieldSpec("project_sales_flow", "项目型销售流程", "text",
                      ["conversation", "kb_search"], "kb_search",
                      kb_query_hint="项目型销售 报备 试样 试机 投标"),
            FieldSpec("service_revenue_pct", "售后收入占比", "text",
                      ["conversation"], "downgrade"),
        ],
        prompt_template="""请生成项目洞察报告的【行业上下文】章节(本节专属于智能制造/工业品 B2B 客户)。

用 Markdown 表格 + 段落混排,覆盖:
1. 客户在行业里的位置(头部 / 中部 / 长尾)
2. 行业典型业务模式(项目型销售 / 经销商主导 / install base 售后)
3. 与同行业头部企业的差异(优势 / 短板)
4. 行业典型 CRM 实施风险点

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["evidence", "specificity"],
    ),

    # ── M6 关键发现(Sopact 四要素) ────────────────────────────────
    ModuleSpec(
        key="M6_key_findings",
        title="关键发现",
        necessity="critical",
        purpose="5–8 条关键发现,每条满足 Sopact 四要素(Specificity / Evidence / Timeliness / Next Step)",
        fields=[
            FieldSpec("findings_pool", "候选发现池", "list",
                      ["conversation", "brief", "kb_search"], "downgrade",
                      kb_query_hint="风险 问题 痛点 卡点",
                      description="主要从访谈/refs 中由 LLM 提炼;若没有,模块会写信息不足"),
        ],
        prompt_template="""请生成项目洞察报告的【关键发现】章节。

输出 5–8 条关键发现,每条**严格**满足 Sopact 四要素:
- **Specificity**: 主语 / 对象 / 条件明确(不是"系统不稳定"而是"陕西分公司 12/15 出现 2 次商机审批超时")
- **Evidence**: 数据点必须有 [访谈]/[KB]/[Brief]/[Web]/[推断] 标注
- **Timeliness**: 结论现在还能影响项目(避免事后诸葛亮)
- **Next Step**: 每条配 Owner + deadline(不是"加强沟通")

格式:
> **[发现 N]** <一句话结论>
> - 证据: ...
> - 紧迫度: <为什么现在重要>
> - 下一步: <Owner @ deadline> — <具体动作>

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "evidence", "next_step"],
    ),

    # ── M7 风险 RAID ─────────────────────────────────────────────
    ModuleSpec(
        key="M7_risk_raid",
        title="风险与议题(RAID)",
        necessity="critical",
        purpose="不只是风险,而是 RAID:Risks / Actions / Issues / Decisions",
        fields=[
            FieldSpec("risks", "Top 风险", "list",
                      ["brief", "conversation"], "ask_user",
                      user_question="目前最担心的 3-5 个风险是什么?", required=True,
                      multi=True,
                      options=["范围蔓延 / 镀金", "推广阻力 / 采纳率低",
                               "数据迁移质量", "集成复杂度(ERP/MES/PLM)",
                               "时间压力 / 上线延期", "预算超支",
                               "关键人离场", "客户内部协调失败",
                               "需求变更频繁", "性能 / 稳定性"]),
            FieldSpec("issues_open", "已发生的待解决议题", "list",
                      ["conversation", "kb_search"], "kb_search",
                      kb_query_hint="问题 议题 待解决"),
            FieldSpec("decisions_pending", "待决策事项", "list",
                      ["conversation", "brief"], "ask_user",
                      user_question="哪些事还没拍板,等谁?截止时间?"),
            FieldSpec("actions_open", "待执行 Action", "list",
                      ["conversation"], "downgrade"),
        ],
        prompt_template="""请生成项目洞察报告的【风险与议题】章节。

按 RAID 拆四张表(每张 3-5 行):
- **R(Risks)**: 风险 / 影响 / 可能性 / 应对 / Owner
- **A(Actions)**: 待执行动作 / Owner / Deadline / 状态
- **I(Issues)**: 已发生的问题 / 影响 / 阻塞 / Owner / 解决路径
- **D(Decisions)**: 待决策事项 / 选项 A/B / 截止时间 / 拍板人

可能性 / 影响用 高/中/低(不用 emoji)。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "next_step"],
    ),

    # ── M8 依赖与里程碑 ──────────────────────────────────────────
    ModuleSpec(
        key="M8_dependency_milestone",
        title="依赖与里程碑",
        necessity="optional",
        purpose="关键交付物的依赖关系 + 里程碑节点 + 阻塞项",
        fields=[
            FieldSpec("milestones", "关键里程碑", "list",
                      ["brief", "metadata", "conversation"], "ask_user",
                      user_question="关键里程碑(UAT / 上线 / 验收)的日期?"),
            FieldSpec("dependencies", "外部依赖", "list",
                      ["conversation", "kb_search"], "kb_search",
                      kb_query_hint="依赖 接口 集成 ERP OA"),
            FieldSpec("blockers", "当前阻塞", "list",
                      ["conversation"], "downgrade"),
        ],
        prompt_template="""请生成项目洞察报告的【依赖与里程碑】章节。

一张 Markdown 表格:
| 里程碑 | 计划日期 | 实际日期 | 关键依赖 | 阻塞项 | 状态(达成/延期/在途) |

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M9 行业最佳实践对照 ──────────────────────────────────────
    ModuleSpec(
        key="M9_industry_benchmark",
        title="行业最佳实践对照",
        necessity="optional",
        purpose="同行业 / 同模块的实施经验对照(可借鉴 + 反例),引用具体出处",
        fields=[
            FieldSpec("best_practices", "可借鉴做法", "list",
                      ["kb_search", "industry_pack", "web_search"], "kb_search",
                      kb_query_hint="最佳实践 行业方案 同行 头部企业"),
            FieldSpec("anti_patterns", "应规避的反例", "list",
                      ["kb_search", "industry_pack"], "kb_search",
                      kb_query_hint="失败 教训 陷阱 风险案例"),
        ],
        prompt_template="""请生成项目洞察报告的【行业最佳实践对照】章节。

输出:
- 2-3 条**可借鉴做法**:每条注明来源(同行业头部 / KB 文档名 / 行业 brief)
- 1-2 条**应规避的反例**:每条注明触发条件 / 后果 / 规避方法

不要泛化"建议加强培训"这种空话,要具体到"参考 X 公司在 Y 阶段做了 Z 动作"。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["evidence", "specificity"],
    ),

    # ── M10 下一步建议 ───────────────────────────────────────────
    ModuleSpec(
        key="M10_next_actions",
        title="下一步建议",
        necessity="critical",
        purpose="分级建议:本周 / 本月 / 季度,每条 Owner + deadline + 预期产出",
        fields=[
            FieldSpec("quick_wins_2w", "Quick Win(2 周内)", "list",
                      ["conversation", "brief"], "downgrade",
                      description="主要从访谈/brief 提取;若没有,模块会写'待补访'"),
            FieldSpec("this_month", "本月行动", "list",
                      ["conversation", "brief"], "downgrade"),
            FieldSpec("strategic_q", "季度战略", "list",
                      ["conversation", "brief"], "downgrade"),
        ],
        prompt_template="""请生成项目洞察报告的【下一步建议】章节。

输出 5-8 条建议,**严格分三级**,每级单独一张 Markdown 表格(列固定):

| 动作 | Owner | Deadline | 预期产出 |
|---|---|---|---|
| <具体到可执行> | <人或角色> | <日期或周次> | <可验证交付物或指标 + 引用ID> |

**三级要求**:
- **Quick Win(2 周内)** — 3-4 条:见效快、风险低
- **本月行动** — 2-3 条:需要协调资源
- **季度战略** — 1-2 条:影响项目走向

**完整示例(严格按这个格式)**:

### Quick Win(2 周内)

| 动作 | Owner | Deadline | 预期产出 |
|---|---|---|---|
| 完成项目团队组建,确认乙方 PM 及关键成员名单 | 甲方 PM 孙善春 / 乙方 PM 孙宇航 | 2025-09-05 (W36) | 《项目组人员确认表》含 8+ 成员 [D7] |
| 组织项目启动会,明确目标 / 里程碑 / 沟通机制 | 甲方 PM 孙善春 | 2025-09-08 (W36) | 启动会纪要 + 双周计划表 [D7] |

### 本月行动

| 动作 | Owner | Deadline | 预期产出 |
|---|---|---|---|
| 搭建项目管理机制(周报 / 变更 / 升级) | 乙方 PM 孙宇航 | 2025-09-12 (W37) | 《项目管理规范》含模板 [D7] |

### 季度战略

| 动作 | Owner | Deadline | 预期产出 |
|---|---|---|---|
| ... | ... | ... | ... |

**约束**:
- 用 Markdown 表格,**不要用 bullet 列表**(bullet 视觉密度低,扫起来累)
- 动作要具体,**不要写"加强 / 提升 / 优化"** 这类无主动作
- 预期产出末尾标 [D1][K2][W3] 引用 ID(若来源已在 evidence_block 中)
- Deadline 用绝对日期 + 周次(如 `2025-09-05 (W36)`),不用相对表述

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "next_step"],
    ),
]


# ── 工具函数 ────────────────────────────────────────────────────────────────────

def list_modules_for_industry(industry: str | None) -> list[ModuleSpec]:
    """按行业过滤激活的模块。industry 为 None 时只返回无 industry_filter 的模块。"""
    out = []
    for m in INSIGHT_MODULES:
        if not m.industry_filter:
            out.append(m)
        elif industry and industry in m.industry_filter:
            out.append(m)
    return out


def critical_modules_for_industry(industry: str | None) -> list[ModuleSpec]:
    return [m for m in list_modules_for_industry(industry) if m.necessity == "critical"]


def get_module(key: str) -> ModuleSpec | None:
    for m in INSIGHT_MODULES:
        if m.key == key:
            return m
    return None
