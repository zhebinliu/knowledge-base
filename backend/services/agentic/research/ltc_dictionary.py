"""LTC(Lead-to-Cash)标准流程字典。

基于华为 LTC 端到端业务流程,适配通用 CRM 实施场景。
- 8 个主流程模块 (M01-M08):线索 → 商机 → 报价 → 合同 → 订单 → 履约 → 应收 → 服务
- 5 个横向支撑域 (S01-S05):客户 / 产品 / 渠道 / 市场 / 集成

每个模块声明:
- key:稳定标识(用于 DB / 前端路由)
- label:中文显示名
- aliases:常见客户称呼,SOW 解析时同义词归一用(LLM 命中即归并)
- standard_nodes:标准业务节点 — 顾问勾选用,避免漏环节
- typical_audiences:典型受访角色,默认分卷映射
- default_option_pools:常见单选/多选题的预填选项池骨架

注意:这只是基线词典,SOW 中超出的模块作为 extra_modules 挂载,
       客户的同义词由 sow_mapper 持久化到 research_ltc_module_map 表。
"""
from dataclasses import dataclass, field, asdict
from typing import Literal


AudienceRole = Literal[
    "c_level",          # 高管(战略意图、KPI、决策边界)
    "biz_owner",        # 部门负责人(流程目标、跨部门协作、考核口径)
    "frontline_sales",  # 一线销售(操作、痛点、例外)
    "frontline_ops",    # 一线运营/履约(操作、痛点、例外)
    "service",          # 售后服务
    "finance",          # 财务/应收
    "channel_mgr",      # 渠道
    "marketing",        # 市场活动
    "it",               # IT(集成、数据质量、权限边界)
]


@dataclass
class LTCModule:
    key: str
    label: str
    purpose: str
    aliases: list[str]
    standard_nodes: list[str]
    typical_audiences: list[AudienceRole]
    default_option_pools: dict[str, list[str]] = field(default_factory=dict)
    category: Literal["main", "support"] = "main"

    def to_dict(self) -> dict:
        return asdict(self)


# ── M01-M08 LTC 主流程 ────────────────────────────────────────────────────────

LTC_MAIN_MODULES: list[LTCModule] = [
    LTCModule(
        key="M01_lead",
        label="线索管理",
        purpose="从市场/渠道/自拓获得的潜在商机线索,在转商机前的统一管理",
        aliases=["线索", "Leads", "lead", "客户线索", "潜客", "意向客户"],
        standard_nodes=["线索获取", "线索分配", "线索跟进", "线索转化", "线索失效", "线索复盘"],
        typical_audiences=["biz_owner", "frontline_sales", "marketing"],
        default_option_pools={
            "lead_sources": ["市场活动", "展会", "官网/SEO", "渠道报备", "客户推荐",
                             "陌拜/自拓", "电销团队", "分公司/区域", "战略合作"],
            "allocation_rules": ["按地域", "按行业", "按产品线", "按客户规模",
                                 "轮询", "抢单池", "固定客户经理", "渠道独占"],
            "common_pain_points": ["线索质量差", "分配不均", "跟进不及时", "重复报备",
                                   "渠道串货", "线索失效无回收", "数据散在各表格"],
        },
    ),
    LTCModule(
        key="M02_opportunity",
        label="商机管理",
        purpose="从线索转化后到合同签订前的销售推进,核心是阶段管理 + 决策链经营",
        aliases=["商机", "机会", "Opportunity", "销售机会", "商机阶段", "项目机会"],
        standard_nodes=["商机创建", "阶段推进", "决策链分析", "客户拜访",
                        "竞争分析", "赢率评估", "战败/搁置", "复盘"],
        typical_audiences=["biz_owner", "frontline_sales", "c_level"],
        default_option_pools={
            "stage_models": ["华为 LTC 6 阶段", "MEDDIC", "BANT", "CHAMP",
                             "自定义 5 阶段", "自定义 7 阶段", "其他"],
            "win_rate_method": ["阶段固定百分比", "顾问主观打分", "AI 模型预测",
                                "多维度加权", "无评估"],
            "common_pain_points": ["阶段定义模糊", "推进卡点", "决策链不清", "缺少预警",
                                   "赢率不准", "战败无复盘", "看板靠表格手工汇总"],
        },
    ),
    LTCModule(
        key="M03_quote_bid",
        label="报价投标",
        purpose="基于商机,完成成本测算 → 报价 → 投标的端到端响应",
        aliases=["报价", "投标", "招投标", "报价审批", "Quote", "Bid",
                 "招议标", "报价单", "投标响应", "CPQ"],
        standard_nodes=["询价接收", "需求澄清", "成本测算", "报价生成",
                        "审批流转", "投标制作", "投标递交", "中标/未中标", "复盘"],
        typical_audiences=["biz_owner", "frontline_sales", "finance", "it"],
        default_option_pools={
            "approval_dimensions": ["金额", "毛利率", "折扣", "客户等级",
                                    "产品类型", "区域", "业态(国内/海外)"],
            "common_pain_points": ["成本数据不全", "审批链长", "招投标时间紧",
                                   "报价模板散乱", "保证金流程慢", "投标资料散",
                                   "客户定制条款多"],
            "tools_in_use": ["Excel", "ERP 报价单", "OA 审批", "纸质审批",
                             "已有 CRM 报价模块", "无系统"],
        },
    ),
    LTCModule(
        key="M04_contract",
        label="合同管理",
        purpose="合同模板 / 条款 / 审批 / 签订 / 变更 / 履约风险跟踪",
        aliases=["合同", "Contract", "合同管理", "签约", "合同模板",
                 "合同条款", "合同变更", "电子签章"],
        standard_nodes=["模板选择", "条款定制", "会签", "法务审查",
                        "签订(电签/线下)", "归档", "变更", "履约风险跟踪", "关闭"],
        typical_audiences=["biz_owner", "frontline_sales", "finance", "it"],
        default_option_pools={
            "contract_types": ["框架合同", "产品销售合同", "工程承包合同",
                               "服务合同", "采购合同", "渠道合作协议",
                               "保密协议", "补充协议"],
            "signing_methods": ["纸质用印", "电子签章(法大大/e签宝)", "OA 集成签",
                                "对方系统签", "混合"],
            "common_pain_points": ["模板版本混乱", "条款人工核对",
                                   "会签链长", "电签未集成", "履约风险无跟踪",
                                   "变更无版本对比"],
        },
    ),
    LTCModule(
        key="M05_order",
        label="订单管理",
        purpose="销售订单创建 / 拆单 / 产品编码维护 / 履约计划",
        aliases=["订单", "销售订单", "Order", "下单", "订单履约",
                 "订单拆行", "订单编码"],
        standard_nodes=["订单创建", "产品编码维护", "拆单", "排产对接",
                        "发货计划", "订单变更", "订单关闭"],
        typical_audiences=["biz_owner", "frontline_ops", "it", "finance"],
        default_option_pools={
            "common_pain_points": ["下单时无产品编码", "多批发货拆行复杂",
                                   "订单变更无校验", "与 ERP 编码不一致",
                                   "先设计再制造编码延后", "订单状态滞后"],
            "integrations": ["ERP 同步", "MES 排产", "WMS 仓储", "物流系统",
                             "客户门户回写"],
        },
    ),
    LTCModule(
        key="M06_delivery",
        label="履约交付",
        purpose="项目交付 / 里程碑跟踪 / 产销协同 / 现场实施(工程业)",
        aliases=["履约", "交付", "项目交付", "Delivery",
                 "项目实施", "现场服务", "PM 管理", "里程碑"],
        standard_nodes=["项目立项", "里程碑定义", "进度跟踪",
                        "产销协同", "现场服务", "验收", "结算移交", "复盘"],
        typical_audiences=["biz_owner", "frontline_ops", "service", "c_level"],
        default_option_pools={
            "common_pain_points": ["进度滞后无预警", "现场与总部信息不通",
                                   "产销协同弱", "里程碑改无人察觉",
                                   "验收口径不一", "复盘流于形式"],
        },
    ),
    LTCModule(
        key="M07_ar",
        label="应收回款",
        purpose="应收台账 / 款项拆解 / 认款核销 / 账龄分析",
        aliases=["应收", "回款", "AR", "应收账款", "款项核销",
                 "账龄", "催收", "应收管理", "认款"],
        standard_nodes=["应收台账生成", "款项拆解", "回款计划", "认款核销",
                        "账龄分析", "逾期预警", "催收", "坏账"],
        typical_audiences=["finance", "biz_owner", "it"],
        default_option_pools={
            "common_pain_points": ["拆解人工", "认款依赖银企直连/线下",
                                   "ERP 部分功能缺失", "账龄统计不准",
                                   "催收靠台账", "对账口径不一致"],
            "integrations": ["银企直连", "ERP", "财务共享中心", "数据中台"],
        },
    ),
    LTCModule(
        key="M08_service",
        label="售后服务",
        purpose="售后工单 / 备件 / 维保 / 客户满意度",
        aliases=["售后", "服务", "Service", "工单", "维保",
                 "Install Base", "备件", "客户服务", "保修"],
        standard_nodes=["客户报修", "工单派发", "现场服务", "备件领用",
                        "工单关闭", "客户回访", "维保续约"],
        typical_audiences=["service", "biz_owner", "c_level"],
        default_option_pools={
            "common_pain_points": ["Install Base 残缺", "工单流转慢",
                                   "备件库存不准", "维保到期无提醒",
                                   "客户满意度未量化"],
        },
    ),
]


# ── S01-S05 横向支撑域 ────────────────────────────────────────────────────────

LTC_SUPPORT_MODULES: list[LTCModule] = [
    LTCModule(
        key="S01_customer",
        label="客户管理",
        purpose="客户分类分级 / 评分 / 关系经营 / 决策链 / 权利地图",
        aliases=["客户", "客户管理", "Customer", "Account", "客户分级",
                 "客户分类", "客户关系", "客户档案", "决策链", "权利地图"],
        standard_nodes=["客户建档", "分类分级", "评分", "关系经营",
                        "决策链建模", "客户活动", "客户复盘"],
        typical_audiences=["biz_owner", "frontline_sales", "c_level"],
        default_option_pools={
            "tier_dimensions": ["营收贡献", "战略性", "增长潜力", "履约风险",
                                "行业代表性", "TOP 客户名录"],
            "common_pain_points": ["分级靠经验", "评分无系统", "决策链线下",
                                   "六板斧无落地", "客户活动无统计"],
        },
        category="support",
    ),
    LTCModule(
        key="S02_product",
        label="产品管理",
        purpose="产品主数据 / 成本库 / BOM / 价格体系",
        aliases=["产品", "Product", "SKU", "产品主数据", "BOM",
                 "成本库", "价格", "产品编码", "产品分类"],
        standard_nodes=["产品建档", "BOM 维护", "成本核算",
                        "价格体系", "上下架", "版本管理"],
        typical_audiences=["it", "biz_owner", "finance"],
        default_option_pools={
            "common_pain_points": ["编码与 ERP 不一致", "成本库陈旧",
                                   "BOM 版本管理弱", "价格分客户分渠道复杂",
                                   "上下架无审批"],
        },
        category="support",
    ),
    LTCModule(
        key="S03_channel",
        label="渠道管理",
        purpose="渠道准入 / 渠道签约 / 渠道激励 / 渠道权限",
        aliases=["渠道", "Channel", "经销商", "代理商", "合作伙伴",
                 "渠道商", "分销", "二级经销商", "渠道政策"],
        standard_nodes=["渠道准入", "渠道签约", "渠道培训",
                        "返利/价保/折扣", "渠道权限",
                        "渠道库存", "渠道考核", "渠道退出"],
        typical_audiences=["channel_mgr", "biz_owner", "c_level"],
        default_option_pools={
            "channel_tiers": ["五大六小", "省级伙伴", "平台商",
                              "行业精英经销商", "金/银/认证伙伴", "外贸商"],
            "incentive_types": ["返利", "价保", "赠送", "降价", "折扣",
                                "市场费用", "培训补贴"],
            "common_pain_points": ["准入靠线下", "渠道权限不清晰",
                                   "返利计算复杂", "渠道库存不可视",
                                   "串货无监控", "考核无系统"],
        },
        category="support",
    ),
    LTCModule(
        key="S04_marketing",
        label="市场活动",
        purpose="市场活动规划 / 执行 / 费用 / 产出评估",
        aliases=["市场活动", "Marketing", "营销活动", "展会",
                 "技术交流会", "线索拓客活动", "品牌投放"],
        standard_nodes=["年度规划", "活动立项", "费用预算",
                        "执行", "线索回收", "产出评估", "复盘"],
        typical_audiences=["marketing", "biz_owner"],
        default_option_pools={
            "activity_types": ["展会/参展", "技术交流会", "客户答谢会",
                               "高管峰会", "媒体活动", "数字广告",
                               "渠道大会"],
            "common_pain_points": ["费用产出比难评估", "线索回收无系统",
                                   "活动执行率统计靠手工", "重点客户参与度难追踪"],
        },
        category="support",
    ),
    LTCModule(
        key="S05_integration",
        label="集成 / 数据 / 权限",
        purpose="ERP / OA / MES / IM / BI 集成 + 主数据归属 + 权限模型",
        aliases=["集成", "Integration", "ERP 集成", "OA 集成",
                 "数据中台", "主数据", "MDM", "权限", "数据隔离"],
        standard_nodes=["集成现状盘点", "数据流向梳理", "主数据归属",
                        "同步频率", "异常处理", "权限模型", "数据隔离/合规"],
        typical_audiences=["it", "biz_owner", "c_level"],
        default_option_pools={
            "erp_vendors": ["金蝶", "用友", "SAP", "Oracle", "Odoo",
                            "自研", "其他"],
            "oa_vendors": ["泛微", "致远", "钉钉 OA", "蓝凌", "自研", "其他"],
            "im_tools": ["企业微信", "钉钉", "飞书", "Lark", "自研 IM"],
            "common_pain_points": ["数据孤岛", "主数据归属不清",
                                   "海外/国内系统独立", "异常无重试",
                                   "权限模型凌乱", "GDPR/合规不达标"],
        },
        category="support",
    ),
]


ALL_LTC_MODULES: list[LTCModule] = LTC_MAIN_MODULES + LTC_SUPPORT_MODULES


# ── 工具函数 ────────────────────────────────────────────────────────────────────

def get_module(key: str) -> LTCModule | None:
    for m in ALL_LTC_MODULES:
        if m.key == key:
            return m
    return None


def find_module_by_alias(term: str) -> LTCModule | None:
    """词典内查找(精确/包含),用于 sow_mapper 的本地兜底匹配。

    LLM 同义词归一是首选,这里只做最简单的字符串包含匹配作为备份。
    """
    if not term:
        return None
    t = term.strip().lower()
    for m in ALL_LTC_MODULES:
        if t == m.label.lower() or t == m.key.lower():
            return m
        for alias in m.aliases:
            if alias.lower() == t or t in alias.lower() or alias.lower() in t:
                return m
    return None


def list_module_keys() -> list[str]:
    return [m.key for m in ALL_LTC_MODULES]


def modules_for_audience(role: AudienceRole) -> list[LTCModule]:
    return [m for m in ALL_LTC_MODULES if role in m.typical_audiences]
