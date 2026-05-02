"""调研大纲 v2 (survey_outline) — 7 个模块的声明式定义。

跟 insight_modules.py 共享 ModuleSpec / FieldSpec 数据结构(直接 import 复用)。

核心区别:
- insight 是"项目洞察",给高管看
- outline 是"调研项目计划",给顾问 + 客户对齐"接下来几周开几场访谈、谁参加、聊什么、要准备什么"
- M3 调研日程表是核心交付物(一张 9 列表格,每行 = 一场访谈)
"""
from .insight_modules import ModuleSpec, FieldSpec, COMMON_STYLE


# ── 7 个模块 ───────────────────────────────────────────────────────────────────

OUTLINE_MODULES: list[ModuleSpec] = [
    # ── M1 调研目标与范围 ────────────────────────────────────────
    ModuleSpec(
        key="M1_outline_objective",
        title="调研目标与范围",
        necessity="critical",
        purpose="为什么要做这一轮调研 + 涵盖哪些部门、业务模块、流程域",
        fields=[
            FieldSpec("discovery_objective", "调研目的", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="本轮调研的核心目的是什么?",
                      required=True,
                      options=["摸底现状(项目启动初期)", "验证方案(方案评审前)",
                               "收集需求(模块细节)", "确认变更(范围调整)",
                               "复盘问题(上线异常)"]),
            FieldSpec("in_scope_departments", "涵盖部门", "list",
                      ["brief", "conversation", "industry_pack"], "ask_user",
                      user_question="本轮调研涉及哪些客户部门?",
                      required=True,
                      multi=True,
                      options=["销售总部", "区域销售 / 分公司", "渠道运营",
                               "售前 / 解决方案", "售后服务", "产品 / 研发",
                               "制造 / 生产", "物流 / 备件", "财务 / 应收",
                               "IT / 信息中心", "PMO / 战略", "人力 / 行政"]),
            FieldSpec("in_scope_modules", "涵盖业务模块", "list",
                      ["brief", "metadata", "conversation"], "downgrade",
                      required=True),
            FieldSpec("out_of_scope", "明确排除", "list",
                      ["brief", "conversation"], "downgrade"),
            FieldSpec("expected_decisions", "调研后要拍板的事项", "list",
                      ["brief", "conversation"], "ask_user",
                      user_question="这一轮调研结束后,需要拍板哪些事项?",
                      multi=True,
                      options=["范围切分(in/out scope)", "阶段切分(一期/二期)",
                               "差异化配置策略", "数据迁移责任分工",
                               "集成方案(与 ERP/OA)", "推广策略 + 奖惩机制",
                               "上线节点 + 验收标准"]),
        ],
        prompt_template="""请生成调研大纲的【调研目标与范围】章节。

输出结构:
1. 一段话(50-80 字)说明本轮调研的目的
2. **范围(In-scope)** - bullet 列出涵盖部门 + 业务模块
3. **范围外(Out-of-scope)** - bullet 列出明确排除的(避免后期范围蔓延)
4. **预期决策** - bullet 列出调研结束后必须拍板的事项

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M2 调研方法与节奏 ────────────────────────────────────────
    ModuleSpec(
        key="M2_outline_method",
        title="调研方法与节奏",
        necessity="critical",
        purpose="选用的调研方法(集中访谈 / 现场观察 / 资料收集 / 工作坊)+ 总周期 + 频次",
        fields=[
            FieldSpec("methods", "调研方法组合", "list",
                      ["brief", "conversation"], "downgrade",
                      required=True),
            FieldSpec("duration_weeks", "总周期", "text",
                      ["brief", "conversation"], "ask_user",
                      user_question="本轮调研总周期是几周?",
                      required=True,
                      options=["1 周(快速摸底)", "2 周(标准)", "3 周(中等复杂)",
                               "4 周(集团 / 多业务线)", "> 4 周(超大型)"]),
            FieldSpec("session_density", "频次", "text",
                      ["brief", "conversation"], "downgrade"),
            FieldSpec("time_constraints", "时间窗约束", "text",
                      ["brief", "conversation"], "downgrade"),
        ],
        prompt_template="""请生成调研大纲的【调研方法与节奏】章节。

输出结构:
1. 一张 Markdown 表格,列出本轮调研选用的方法及其适用场景:
| 方法 | 适用场景 | 持续时长 | 备注 |
   方法选项: 集中访谈 / 现场观察 / 资料收集 / 工作坊 / 高管 1on1
2. **总周期与节奏**: 总周期 N 周;每周 X 场;典型一天密度 Y 场
3. **时间窗约束**: 客户上班时间 / 避开节假日 / 关键人档期约束

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M3 调研日程表(核心) ────────────────────────────────────
    ModuleSpec(
        key="M3_outline_schedule",
        title="调研日程表",
        necessity="critical",
        purpose="一张 9 列表格,每行 = 一场访谈 / 工作坊 / 现场观察。这是本份大纲的最核心交付物",
        fields=[
            FieldSpec("sessions", "访谈场次列表", "table",
                      ["brief", "conversation", "industry_pack"], "downgrade",
                      required=True,
                      description="按 in_scope_departments × methods 推算,行业包提供 default sessions"),
            FieldSpec("customer_stakeholders", "客户参与人池", "list",
                      ["brief", "conversation"], "downgrade"),
            FieldSpec("our_team_members", "我方调研团队", "list",
                      ["brief", "conversation"], "ask_user",
                      user_question="我方参与本次调研的团队成员有哪些?(主访 / 记录 / 跟进)"),
        ],
        prompt_template="""请生成调研大纲的【调研日程表】章节。

这是本份大纲的**核心交付物**,务必按以下 9 列输出 Markdown 表格(列顺序固定,不要随意调整):

| 时间 | 时长 | 议题 | 被访方角色 | 我方参与人 | 客户准备材料 | 我方准备材料 | 交付物 | 备注 |

【出表规则】
- 每个 in_scope_department 至少 1 场访谈,业务复杂的可拆 2-3 场
- 每个被访方角色独立成行 (例:总监 / 一线 / 主管 分开)
- 时间用相对周次:Week 1 周二上午 / Week 1 周二下午 / Week 1 周三上午 ...
- 时长按议题深度: 2h / 3h / 半天 / 全天
- 议题写到具体子主题(不是"销售流程",而是"线索分配规则 + 商机推进阶段定义")
- 我方参与人写角色(主访 + 记录,具体人名待 brief.our_team_members 填)
- 客户准备材料: 现有表单 / 系统截图 / 流程图 / KPI 报表 / 组织架构图 等具体物
- 我方准备材料: 议程模板 / 访谈提纲 / 行业 benchmark / 类似案例
- 交付物: 访谈纪要 + 流程现状描述 + 问题清单
- 备注: 关键人是否到场不确定 / 需要提前 N 天发议程

【约束】
- 至少 6 场,最多 15 场
- 工作坊 / 现场观察 这类非访谈场次也要纳入(标议题)
- 不要把访谈+材料收集合并成一行 — 分开行

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
        rubric_focus=["specificity", "evidence", "next_step"],
    ),

    # ── M4 客户准备材料清单 ────────────────────────────────────
    ModuleSpec(
        key="M4_outline_customer_materials",
        title="客户准备材料清单",
        necessity="critical",
        purpose="客户在调研开始前需要提前准备的所有材料,按类型汇总(避免临时跑腿)",
        fields=[
            # required=False:本字段是 LLM 可基于行业包 + 访谈日程派生的标准化产物,
            # 不该硬卡(原 required=True 在 brief 没填时整个 outline 短路)
            FieldSpec("material_categories", "材料类别", "list",
                      ["brief", "industry_pack"], "downgrade",
                      required=False),
        ],
        prompt_template="""请生成调研大纲的【客户准备材料清单】章节。

把所有访谈场次需要的材料**去重 + 按类别汇总**,输出一张 Markdown 表格:

| 类别 | 具体材料 | 涉及部门 | 用于哪场访谈 | 责任人 | 截止日 |

类别建议: 组织 / 业务流程 / 数据 / 系统 / 制度 / 战略

【约束】
- 截止日按 Week 表示(例: Week 1 周一前 / Week 2 周二前)
- 责任人写部门或角色,不写具体人(具体人在 brief 里)
- 材料越具体越好 — 不写"业务流程",写"线索→商机→合同→订单 完整流程图(含审批节点)"
- 行业相关材料(BOM 表 / 经销商分级表 / Install Base 清单)若适用要列出

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M5 我方调研团队分工 ─────────────────────────────────────
    ModuleSpec(
        key="M5_outline_team_raci",
        title="我方调研团队分工",
        necessity="optional",
        purpose="主访 / 记录 / 跟进 / 工作坊主持等角色 RACI",
        fields=[
            FieldSpec("our_team_members", "我方团队成员", "list",
                      ["brief", "conversation"], "downgrade"),
            FieldSpec("raci_summary", "RACI 摘要", "text",
                      ["brief", "conversation"], "downgrade"),
        ],
        prompt_template="""请生成调研大纲的【我方调研团队分工】章节。

输出 Markdown 表格:
| 角色 | 职责 | 负责场次 | 责任人 |

角色: 项目 PM / 主访顾问 / 记录员 / 行业专家 / 工作坊主持 / 后台支持

下面再 1-2 句话描述协作机制(纪要 24 小时内出 / 每日复盘 / 每周对齐)。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M6 调研产出物清单 ──────────────────────────────────────
    ModuleSpec(
        key="M6_outline_deliverables",
        title="调研产出物清单",
        necessity="critical",
        purpose="本轮调研结束后必须交出的产物清单(给客户对齐期望)",
        fields=[
            FieldSpec("per_session_deliverables", "每场访谈产出", "list",
                      ["brief"], "downgrade"),
            # required=False:产出物清单是高度标准化的(访谈纪要 / 流程现状描述 / 需求与差距分析),
            # LLM prompt_template 已固定模板,brief 没填也能完整输出。原 required=True 是过严
            FieldSpec("final_deliverables", "最终汇总产出", "list",
                      ["brief"], "downgrade",
                      required=False),
        ],
        prompt_template="""请生成调研大纲的【调研产出物清单】章节。

输出两组:
1. **每场访谈产出**(标准化)
   - 访谈纪要(48 小时内)
   - 流程现状描述
   - 问题与风险清单
2. **最终汇总产出**(本轮调研结束)
   - 调研总结报告(用 v2 「项目洞察」生成)
   - 现状流程图(可选 Visio / 飞书文档)
   - 需求与差距分析
   - 方案设计输入清单(衔接下一阶段)

每条产出要标 责任人 + 截止日期 + 验收标准。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),

    # ── M7 衔接方案设计 ────────────────────────────────────────
    ModuleSpec(
        key="M7_outline_handoff",
        title="衔接方案设计",
        necessity="optional",
        purpose="调研结束 → 方案设计 阶段的过渡机制(workshop 时间 / 评审节点 / 反复机制)",
        fields=[
            FieldSpec("handoff_plan", "衔接计划", "text",
                      ["brief", "conversation"], "downgrade"),
        ],
        prompt_template="""请生成调研大纲的【衔接方案设计】章节。

输出结构:
1. **方案设计 Kickoff**: 调研结束后第几天召开 / 谁参加 / 议程
2. **评审机制**: 方案需要哪几轮评审(初稿 / 终稿 / 客户 sign-off)
3. **反复机制**: 调研中发现的不确定项,如何在方案阶段补访

简洁,3-5 段即可。

{fields_block}

{project_block}

{evidence_block}

""" + COMMON_STYLE,
    ),
]


# ── 工具函数 ────────────────────────────────────────────────────────────────────

def list_outline_modules() -> list[ModuleSpec]:
    """目前不按行业过滤(行业差异化在 industry_pack 的 default sessions 里实现)。"""
    return list(OUTLINE_MODULES)


def critical_outline_modules() -> list[ModuleSpec]:
    return [m for m in OUTLINE_MODULES if m.necessity == "critical"]


def get_outline_module(key: str) -> ModuleSpec | None:
    for m in OUTLINE_MODULES:
        if m.key == key:
            return m
    return None
