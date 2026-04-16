LTC_STAGES = {
    "lead": {
        "name": "线索",
        "description": "客户线索获取、初步接触、需求初判",
        "keywords": ["线索", "初次接触", "市场活动", "客户画像", "行业分析"],
        "typical_docs": ["市场调研报告", "行业分析", "客户背景资料"],
    },
    "opportunity": {
        "name": "商机",
        "description": "商机确认、需求调研、方案规划、竞争分析",
        "keywords": ["商机", "需求调研", "POC", "竞品分析", "解决方案"],
        "typical_docs": ["需求调研报告", "解决方案概要", "竞品分析报告"],
    },
    "quote": {
        "name": "报价",
        "description": "报价方案、产品配置、商务谈判",
        "keywords": ["报价", "产品配置", "许可证", "折扣", "商务条款"],
        "typical_docs": ["报价单", "产品配置表", "商务方案"],
    },
    "contract": {
        "name": "合同",
        "description": "合同签订、法务审核、条款协商",
        "keywords": ["合同", "条款", "SLA", "法务", "签约"],
        "typical_docs": ["合同模板", "SLA 协议", "法务审核意见"],
    },
    "customer": {
        "name": "客户",
        "description": "客户管理、客户档案、客户分级、客户画像、客户生命周期",
        "keywords": ["客户", "客户档案", "客户分级", "客户画像", "KP", "决策链"],
        "typical_docs": ["客户档案模板", "客户分级标准", "客户成功手册"],
    },
    "order": {
        "name": "订单",
        "description": "订单创建、订单审批、订单履行、退换货、订单状态跟踪",
        "keywords": ["订单", "下单", "审批", "履行", "退换货", "发货"],
        "typical_docs": ["订单流程说明", "订单审批规则", "退换货政策"],
    },
    "delivery": {
        "name": "交付",
        "description": "项目实施、系统部署、数据迁移、培训、验收",
        "keywords": ["实施", "部署", "数据迁移", "培训", "验收", "上线"],
        "typical_docs": ["实施方案", "部署手册", "培训计划", "验收报告"],
    },
    "payment": {
        "name": "回款",
        "description": "开票、回款跟踪、续费",
        "keywords": ["回款", "发票", "续费", "增购", "客户成功"],
        "typical_docs": ["回款计划", "续费方案", "客户成功报告"],
    },
    "general": {
        "name": "通用",
        "description": "不属于特定 LTC 阶段的通用知识",
        "keywords": ["产品介绍", "技术架构", "最佳实践", "FAQ"],
        "typical_docs": ["产品白皮书", "技术架构文档", "FAQ"],
    },
}

INDUSTRIES = [
    "manufacturing", "retail", "finance", "healthcare",
    "education", "real_estate", "technology", "logistics",
    "energy", "government", "other",
]

# 用于打标的预定义行业标签
INDUSTRY_TAGS = {
    "manufacturing": "制造业",
    "retail": "零售业",
    "finance": "金融业",
    "healthcare": "医疗健康",
    "education": "教育",
    "technology": "高科技/互联网",
    "logistics": "物流速运",
    "other": "其他",
}

# 预定义的模块标签
MODULE_TAGS = [
    "leads", "accounts", "contacts", "opportunities",
    "quotes", "contracts", "data_migration", "integration",
    "ui_customization", "business_flow", "security",
]


def get_ltc_taxonomy_text() -> str:
    lines = []
    for stage_key, stage in LTC_STAGES.items():
        lines.append(f"- {stage_key}（{stage['name']}）：{stage['description']}")
    return "\n".join(lines)


def get_industry_list_text() -> str:
    return ", ".join(INDUSTRIES)
