"""Survey v2 — 7 主题 × 子模块,L1 高管短卷 + L2 模块化分卷。

设计原则:
- L1: 8-12 题战略+痛点对齐(给客户高管,≤10 分钟填完)
- L2: 7 主题 × 多个分卷(给业务负责人/一线/IT/财务/渠道/售后,每分卷 8-15 题)
- 题型严格区分: 事实型 / 判断型 / 数据型
- 每题带"为什么问 / 答案如何使用"注释
"""
from dataclasses import dataclass, field, asdict
from typing import Literal


QuestionType = Literal["fact", "judgment", "data", "open"]
TargetRole = Literal["c_level", "biz_owner", "frontline_sales", "it", "finance", "channel_mgr", "service"]


@dataclass
class SubsectionSpec:
    key: str                              # e.g. "biz_flow_l2c"
    title: str
    target_roles: list[TargetRole]        # 谁应该填这个分卷
    question_count_target: tuple[int, int]  # (min, max) 题量
    layer: Literal["L1", "L2"]            # L1=高管短卷;L2=模块化分卷
    question_seeds: list[dict]            # 种子问题(给 LLM 做参考,实际题目由 LLM 按场景生成)
    must_cover: list[str]                 # 必须覆盖的子主题
    industry_filter: list[str] = field(default_factory=list)  # 空=所有行业

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ThemeSpec:
    key: str                              # e.g. "biz_process"
    title: str
    purpose: str
    subsections: list[SubsectionSpec]

    def to_dict(self) -> dict:
        return {**asdict(self), "subsections": [s.to_dict() for s in self.subsections]}


# ── L1 高管短卷(8-12 题) ────────────────────────────────────────────────────────

L1_EXEC_SUBSECTION = SubsectionSpec(
    key="L1_exec_alignment",
    title="L1 · 高管战略对齐",
    target_roles=["c_level"],
    question_count_target=(8, 12),
    layer="L1",
    must_cover=[
        "战略意图(为什么上 CRM)",
        "成功标准(3 个 SMART 指标)",
        "Top 3 痛点",
        "干系人结构(决策链)",
        "时间预期(上线节点)",
        "预算区间",
        "已有系统生态(ERP/OA/MES/其他 CRM)",
    ],
    question_seeds=[
        {"type": "judgment", "text": "对您而言,本次 CRM 项目最重要的业务结果是什么(单选)?", "why": "对齐战略意图,避免后期摇摆"},
        {"type": "data", "text": "请给出 3 个项目成功的可量化指标(SMART)。", "why": "锁定可验证的成功标准"},
        {"type": "open", "text": "您认为现状最大的 3 个痛点是什么?(按优先级排)", "why": "校准实施重心"},
        {"type": "fact", "text": "项目最高拍板人是谁?重大变更需要走几层审批?", "why": "决策链是项目推进的关键变量"},
        {"type": "data", "text": "期望何时上线?是否有刚性节点(年度大会/合规/上市)?", "why": "时间窗决定方案颗粒度"},
        {"type": "data", "text": "项目预算区间(含软件 / 实施 / 培训 / 运维)?", "why": "确定可投入资源边界"},
        {"type": "fact", "text": "现有信息化系统清单(ERP/OA/MES/PLM/其他 CRM)?", "why": "决定集成范围"},
    ],
)


# ── L2 七大主题 ────────────────────────────────────────────────────────────────

SURVEY_THEMES: list[ThemeSpec] = [
    # ── 主题 1: 战略与目标 ────────────────────────────────────────
    ThemeSpec(
        key="strategy",
        title="战略与目标",
        purpose="承接 L1,在业务负责人层面落地为可执行 KPI 与阶段目标",
        subsections=[
            SubsectionSpec(
                key="biz_kpi",
                title="业务 KPI 与阶段目标",
                target_roles=["biz_owner"],
                question_count_target=(8, 12),
                layer="L2",
                must_cover=["KPI 定义", "阶段拆解", "考核机制", "数据口径"],
                question_seeds=[
                    {"type": "data", "text": "您部门未来 12 个月的核心 KPI 有哪些?目标值?", "why": "对齐 CRM 报表口径"},
                    {"type": "fact", "text": "KPI 当前的统计来源(系统 / Excel / 手工)?", "why": "数据采集成本评估"},
                    {"type": "judgment", "text": "上线 CRM 后,您希望系统首先帮您解决的 KPI 监控问题是什么?", "why": "落地优先级排序"},
                ],
            ),
        ],
    ),

    # ── 主题 2: 组织与角色 ────────────────────────────────────────
    ThemeSpec(
        key="org_role",
        title="组织与角色",
        purpose="厘清部门 / 角色 / 决策链 / RACI",
        subsections=[
            SubsectionSpec(
                key="org_structure",
                title="组织架构与汇报关系",
                target_roles=["biz_owner", "it"],
                question_count_target=(8, 12),
                layer="L2",
                must_cover=["组织树", "汇报关系", "事业部隔离", "集团-子公司架构"],
                question_seeds=[
                    {"type": "fact", "text": "请提供最新组织架构图(集团-事业部-部门-小组)。", "why": "权限模型基础"},
                    {"type": "fact", "text": "是否多法人 / 多事业部?是否需要数据/权限隔离?",
                     "why": "决定权限设计与多租户考虑"},
                    {"type": "judgment", "text": "事业部之间的客户 / 商机数据是否需要共享或隔离?",
                     "why": "影响数据可见性策略"},
                ],
            ),
            SubsectionSpec(
                key="raci",
                title="RACI 与变更控制",
                target_roles=["biz_owner", "it"],
                question_count_target=(8, 10),
                layer="L2",
                must_cover=["需求评审", "变更控制", "上线决策", "运维归属"],
                question_seeds=[
                    {"type": "fact", "text": "需求变更走什么流程?谁批?", "why": "范围管理"},
                    {"type": "fact", "text": "上线决策由谁拍板?需要哪些 sign-off?", "why": "上线门槛"},
                ],
            ),
        ],
    ),

    # ── 主题 3: 业务流程 ──────────────────────────────────────────
    ThemeSpec(
        key="biz_process",
        title="业务流程",
        purpose="L2C / O2C / S2C 全流程现状",
        subsections=[
            SubsectionSpec(
                key="l2c",
                title="线索到合同(L2C)",
                target_roles=["biz_owner", "frontline_sales"],
                question_count_target=(10, 15),
                layer="L2",
                must_cover=["线索获取", "线索分配", "商机推进阶段", "审批节点", "丢单/赢单复盘"],
                question_seeds=[
                    {"type": "fact", "text": "线索的主要来源(展会 / 官网 / 渠道 / 自拓)?各占比?", "why": "渠道效率评估"},
                    {"type": "fact", "text": "线索分配规则(地域/行业/产品/规模)?", "why": "分配引擎设计"},
                    {"type": "fact", "text": "商机阶段定义?每个阶段的进入/退出条件?", "why": "销售漏斗模型"},
                    {"type": "judgment", "text": "目前商机推进过程中最大的卡点是什么?", "why": "实施重心"},
                ],
            ),
            SubsectionSpec(
                key="o2c",
                title="订单到回款(O2C)",
                target_roles=["biz_owner", "finance"],
                question_count_target=(8, 12),
                layer="L2",
                must_cover=["订单创建", "发货", "开票", "回款认领", "对账"],
                question_seeds=[
                    {"type": "fact", "text": "订单创建后,发货 / 开票 / 回款分别由谁触发?", "why": "履约环节梳理"},
                    {"type": "data", "text": "平均回款周期(天)?账龄分布?", "why": "应收管理基线"},
                    {"type": "judgment", "text": "对账的难点是什么(数据散 / 口径不一 / 集成断)?", "why": "财务集成需求"},
                ],
            ),
            SubsectionSpec(
                key="project_sales",
                title="项目型销售流程(智能制造专属)",
                target_roles=["biz_owner", "frontline_sales"],
                question_count_target=(10, 15),
                layer="L2",
                industry_filter=["manufacturing"],
                must_cover=["报备", "试样/试机", "投标", "BOM 报价", "决策链"],
                question_seeds=[
                    {"type": "fact", "text": "项目报备机制(谁报 / 怎么查重 / 报备奖励)?", "why": "项目型销售核心"},
                    {"type": "fact", "text": "试样 / 试机的标准流程?试机周期多久?", "why": "工业品 B2B 关键环节"},
                    {"type": "fact", "text": "BOM 报价的当前周期(从询价到出报价单)?报价工具?",
                     "why": "CPQ 实施重点"},
                    {"type": "data", "text": "标品 / 定制品占比?定制品 BOM 嵌套层数?", "why": "CPQ 复杂度"},
                    {"type": "fact", "text": "客户决策链层级?平均参与决策人数?", "why": "B2B 复杂决策建模"},
                ],
            ),
            SubsectionSpec(
                key="service",
                title="售后与备件(S2C,智能制造专属)",
                target_roles=["service", "biz_owner"],
                question_count_target=(8, 12),
                layer="L2",
                industry_filter=["manufacturing"],
                must_cover=["Install Base", "工单", "备件", "维保合约"],
                question_seeds=[
                    {"type": "fact", "text": "Install Base(已售设备)目前在哪记录?有没有序列号档案?",
                     "why": "售后服务的根基"},
                    {"type": "fact", "text": "服务工单流程(报修 → 派工 → 上门 → 关闭)?",
                     "why": "工单管理"},
                    {"type": "fact", "text": "备件库存与配送的当前流程?", "why": "备件管理"},
                    {"type": "data", "text": "维保收入占总营收比例?未来 3 年期望?", "why": "服务转型驱动"},
                ],
            ),
        ],
    ),

    # ── 主题 4: 数据治理 ──────────────────────────────────────────
    ThemeSpec(
        key="data_governance",
        title="数据治理",
        purpose="主数据 / 字段 / 权限 / BOM 嵌套",
        subsections=[
            SubsectionSpec(
                key="master_data",
                title="主数据与字段",
                target_roles=["it", "biz_owner"],
                question_count_target=(10, 15),
                layer="L2",
                must_cover=["客户主数据", "产品/BOM", "员工/组织", "权限模型", "字段标准"],
                question_seeds=[
                    {"type": "fact", "text": "客户主数据现在在哪个系统?是否有 MDM?", "why": "主数据归属决策"},
                    {"type": "fact", "text": "客户分级/分类的当前定义?", "why": "权限和策略基础"},
                    {"type": "fact", "text": "产品 / BOM 数据的当前结构?有没有版本管理?",
                     "why": "CPQ 实施前置",
                     "tags": ["industry:manufacturing"]},
                    {"type": "judgment", "text": "数据质量目前最大的问题是什么(重复 / 缺失 / 口径)?",
                     "why": "数据治理重点"},
                ],
            ),
        ],
    ),

    # ── 主题 5: 集成生态 ──────────────────────────────────────────
    ThemeSpec(
        key="integration",
        title="集成生态",
        purpose="ERP / OA / MES / PLM / IM 集成需求",
        subsections=[
            SubsectionSpec(
                key="erp_integration",
                title="ERP / 业财集成",
                target_roles=["it", "finance"],
                question_count_target=(8, 12),
                layer="L2",
                must_cover=["ERP 厂商", "数据流向", "同步频率", "主数据归属", "异常处理"],
                question_seeds=[
                    {"type": "fact", "text": "现有 ERP 是哪家(金蝶 / 用友 / SAP / Oracle / 其他)?版本?",
                     "why": "选预置接口还是自研"},
                    {"type": "fact", "text": "CRM↔ERP 哪些数据需要双向同步(产品 / 客户 / 订单 / 合同 / 回款)?",
                     "why": "集成范围定义"},
                    {"type": "fact", "text": "主数据归属(客户 / 产品 / 价格)CRM 还是 ERP?",
                     "why": "避免双向冲突"},
                    {"type": "judgment", "text": "现有 ERP 集成最大的痛点是什么?", "why": "经验复用"},
                ],
            ),
            SubsectionSpec(
                key="other_systems",
                title="OA / IM / MES / PLM 集成",
                target_roles=["it"],
                question_count_target=(6, 10),
                layer="L2",
                must_cover=["OA 集成", "IM 推送", "MES/PLM"],
                question_seeds=[
                    {"type": "fact", "text": "OA 系统(泛微 / 致远 / 钉钉 OA)?CRM 哪些审批走 OA?",
                     "why": "审批链统一"},
                    {"type": "fact", "text": "IM(企业微信 / 钉钉 / 飞书)?需要哪些通知/待办推送?",
                     "why": "用户触达"},
                    {"type": "fact", "text": "是否使用 MES / PLM?CRM 是否需要对接?",
                     "why": "工业品场景集成",
                     "tags": ["industry:manufacturing"]},
                ],
            ),
        ],
    ),

    # ── 主题 6: 合规与安全 ────────────────────────────────────────
    ThemeSpec(
        key="compliance",
        title="合规与安全",
        purpose="数据合规 / 审批留痕 / 国央企特殊要求",
        subsections=[
            SubsectionSpec(
                key="data_compliance",
                title="数据合规与权限",
                target_roles=["it", "biz_owner"],
                question_count_target=(6, 10),
                layer="L2",
                must_cover=["数据出境", "个保法", "审批留痕", "数据脱敏", "国央企合规"],
                question_seeds=[
                    {"type": "fact", "text": "是否有数据出境需求(海外子公司 / 跨境业务)?",
                     "why": "合规约束"},
                    {"type": "fact", "text": "客户敏感字段(电话 / 身份证 / 合同金额)的可见性策略?",
                     "why": "权限+脱敏设计"},
                    {"type": "judgment", "text": "重大操作(改单价 / 删客户)是否需要留痕审计?",
                     "why": "审计日志范围"},
                ],
            ),
        ],
    ),

    # ── 主题 7: 资源与变革 ────────────────────────────────────────
    ThemeSpec(
        key="resource_change",
        title="资源与变革管理",
        purpose="预算 / 人天 / 培训 / 推广策略 / 奖惩机制",
        subsections=[
            SubsectionSpec(
                key="resource_plan",
                title="资源计划",
                target_roles=["biz_owner", "it"],
                question_count_target=(6, 10),
                layer="L2",
                must_cover=["预算明细", "客户方人天", "培训计划", "运维归属"],
                question_seeds=[
                    {"type": "fact", "text": "客户方可投入项目的人天分布(IT / 业务 / PMO)?",
                     "why": "联合团队配置"},
                    {"type": "fact", "text": "上线后运维归属谁?是否需要服务运营?",
                     "why": "持续运营规划"},
                ],
            ),
            SubsectionSpec(
                key="adoption",
                title="推广与变革管理",
                target_roles=["biz_owner"],
                question_count_target=(6, 10),
                layer="L2",
                must_cover=["推广策略", "培训机制", "考核挂钩", "经销商上线"],
                question_seeds=[
                    {"type": "fact", "text": "上线推广策略(强制 / 引导 / 奖惩挂钩)?",
                     "why": "采纳率风险"},
                    {"type": "fact", "text": "是否需要经销商上线?经销商培训怎么做?",
                     "why": "渠道延伸",
                     "tags": ["industry:manufacturing"]},
                ],
            ),
        ],
    ),
]


# ── 工具函数 ────────────────────────────────────────────────────────────────────

def list_subsections_for_layer(layer: Literal["L1", "L2"], industry: str | None = None) -> list[SubsectionSpec]:
    """返回某 layer 的所有分卷,按行业过滤。"""
    out = []
    if layer == "L1":
        out.append(L1_EXEC_SUBSECTION)
    else:
        for theme in SURVEY_THEMES:
            for sub in theme.subsections:
                if not sub.industry_filter:
                    out.append(sub)
                elif industry and industry in sub.industry_filter:
                    out.append(sub)
    return out


def get_subsection(key: str) -> SubsectionSpec | None:
    if key == L1_EXEC_SUBSECTION.key:
        return L1_EXEC_SUBSECTION
    for theme in SURVEY_THEMES:
        for sub in theme.subsections:
            if sub.key == key:
                return sub
    return None


def get_theme(key: str) -> ThemeSpec | None:
    for t in SURVEY_THEMES:
        if t.key == key:
            return t
    return None
