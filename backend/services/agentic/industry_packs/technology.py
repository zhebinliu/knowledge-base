"""高科技 / 互联网 / IT 服务 行业包。

对齐 Project.industry='technology'。覆盖典型客户:
- SaaS 平台 / AI 算力服务(北电数智 / 商汤 / 旷视型)
- IT 通信网络服务 / NaaS 订阅(上海凯勇 / 中电信人工智能型)
- ICT 硬件 / 专业视听(小鸟科技 / 海康威视型)
"""
from . import register, IndustryPack


TECHNOLOGY = IndustryPack(
    industry="technology",
    display_name="高科技 / 互联网 / IT 服务",
    field_patches={
        "customer_type_mix": {
            "label": "客户类型构成",
            "ask": "企业 / 事业 / 政府 / 个人 / 合作伙伴 各自占比?是否需要差异化的客户编码与查重维度?",
        },
        "subscription_vs_oneoff": {
            "label": "订阅 vs 一次性",
            "ask": "服务形式以订阅(按月/年)为主还是一次性销售?是否区分固定合同 / 框架合同?",
        },
        "channel_partner_tier": {
            "label": "渠道合作伙伴层级",
            "ask": "渠道分几级(商机引荐 / 经销 / 经销+交付 / 经销+运维 / 经销+交付+运维)?各级是否独立录入线索/商机?",
        },
        "marketing_automation": {
            "label": "营销自动化",
            "ask": "上游 SCRM(致趣百川 / Marketo / HubSpot)是否在用?是否需要 MQL 评分 + 工商二次清洗 + 运营中台会签分配?",
        },
        "government_business_pct": {
            "label": "政府业务占比",
            "ask": "政府/央国企 业务占比?是否需要双轨商机模型(销售商机 vs 政府商机)?",
        },
        "billing_model": {
            "label": "计费模型",
            "ask": "按账号 / 按端口 / 按用量 / 按服务期(年)?是否需要阶梯定价 + 红线价 + 多轮报价?",
        },
        "erp_integration": {
            "label": "ERP / 财务集成",
            "ask": "ERP 是哪家(泛微 / SAP / 自研)?是否需要客户主数据双向同步 + 司库流水自动认款?",
        },
        "single_sign_on": {
            "label": "SSO 与协作平台",
            "ask": "是否使用飞书 / 钉钉 / 企微?是否需要单点登录 + 待办/消息双向同步?",
        },
    },

    pain_points=[
        "5 类客户(个人 / 企业 / 事业 / 政府 / 合作伙伴)编码与查重维度不一致(参考 北电数智 — 客户编码按类型差异化)",
        "运营中台分配线索需多人会签,流程冗长导致线索冷却(参考 北电数智)",
        "营销自动化 SCRM 与 CRM 数据双向同步,客户更名后老客户识别失效",
        "双轨商机模型(销售 7 阶段 vs 政府 5 阶段)在同一对象上配置容易冲突",
        "POC / 算力 / 投标 多个子流程并行,审批通过后未自动联动商机阶段",
        "拉新 / 续约 / 增购 三类商机的保护期 + 保有量机制不到位,销售内卷与撞单频发",
        "阶梯产品按数量自定义阶梯报价,跨档计算与多轮报价历史回溯困难",
        "红线价对销售可见 / 不可见 边界模糊,审批权限设计不严谨容易越权",
        "DSO 应收账款回款天数 与 DSO 财务收入预测 散在 Excel,业财一体化无法落地",
        "框架合同月度对账 + 故障扣减日单价 计算复杂,商务认款匹配不上发票",
        "渠道商签约 + 渠道经理审批 + 渠道返点 + 防串货 全链路未数字化",
        "项目交付铁三角(销售 / 解决方案 / 项目经理)协同靠口头,DICT 项目财务计收无结构化拆解",
    ],

    cases=[
        {
            "name": "北电数智(SaaS / AI 算力)",
            "pattern": "国资 AI 公司 + 双轨商机(销售 + 政府) + 5 类客户编码 + 业财一体化",
            "lessons": "运营中台会签分配 + MQL 评分 + 工商二次清洗 + 飞书 SSO + DSO 4 段时间监控。客户停用流程联动下游 ERP 全锁定。",
            "risks": "运营中台流程冗长导致线索冷却 / 致趣百川 SCRM 双向同步时机滞后 / 多子流程并行未联动商机阶段",
        },
        {
            "name": "上海凯勇 NaaS",
            "pattern": "网络订阅服务 L2C 端到端 + 拉新/续约/增购 三类商机 + 阶梯定价 + 红线价制度",
            "lessons": "商机保护期 90 天 + 保有量上限 50 + 售前介入流转(方案对接阶段授权读写) + 自定义阶梯报价(只能从最小阶梯依次删) + OCR 发票识别校验",
            "risks": "续约商机判定标准过严(端口数+金额完全一致) / 红线价泄露给销售 / 多次报价历史阶梯丢失 / 渠道订单回款计划独立审批",
        },
        {
            "name": "中电信人工智能(协同交付管理)",
            "pattern": "电信运营商 AI 子公司 + 总部/省办分层 + 铁三角协作 + DICT 财务计收三层拆解",
            "lessons": "项目集 4 层(项目集 → 项目 / 子项目 → 子目标 → 子任务) + 实施方案交底(交付侧→运维侧) + 后向采购管控(与前向合同关联预警成本超支)",
            "risks": "省办与总部商机归属冲突 / 类产数与产研项目流程混淆 / 后向付款未关联验收形成黑洞 / 收入计划总额与子项目合计不一致",
        },
        {
            "name": "小鸟科技(LTC 优化)",
            "pattern": "专业视听硬件厂商 + 政府/交通/能源/金融 多行业终端客户 + LTC 端到端流程优化",
            "lessons": "LTC 优化作为独立 stage 案例参考;主要价值是端到端流程的连贯性,而非单点功能",
            "risks": "—",
        },
    ],

    extra_question_seeds=[
        # 客户类型与编码
        {"type": "fact", "theme": "data_governance",
         "text": "客户类型有几类(个人 / 企业 / 事业单位 / 政府单位 / 合作伙伴)?各自比例多少?",
         "why": "决定客户编码规则和查重维度差异化"},
        {"type": "fact", "theme": "data_governance",
         "text": "客户主数据归属哪个系统(CRM 主 / ERP 主 / MDM 主)?客户停用是否需要联动下游业务系统全锁定?",
         "why": "客户主数据治理与停用流程"},

        # 营销自动化
        {"type": "fact", "theme": "biz_process",
         "text": "上游 SCRM(致趣百川 / Marketo / HubSpot)是否在用?线索 MQL 评分如何定义?是否需要工商二次清洗?",
         "why": "营销自动化 + 线索质量过滤"},
        {"type": "fact", "theme": "biz_process",
         "text": "线索分配机制是单人决策还是会签?二次会签触发条件是什么?",
         "why": "运营中台模式判断"},

        # 商机
        {"type": "fact", "theme": "biz_process",
         "text": "商机分几类(拉新 / 续约 / 增购 / 政府专项)?各类的阶段是否一致?",
         "why": "双轨/多轨商机模型"},
        {"type": "fact", "theme": "biz_process",
         "text": "商机是否有保护期?是否有保有量上限?延期机制如何?",
         "why": "防止销售内卷"},
        {"type": "fact", "theme": "biz_process",
         "text": "POC / 算力申请 / 项目立项 / 投标 各子流程是否独立?审批通过后是否自动推进商机阶段?",
         "why": "多子流程并行设计"},

        # 报价 / 合同
        {"type": "fact", "theme": "biz_process",
         "text": "服务形式是订阅(按月/年)还是一次性?是否需要阶梯定价?",
         "why": "决定报价模型 + 财务收入预测拆分"},
        {"type": "fact", "theme": "biz_process",
         "text": "是否区分指导价 / 红线价?红线价对销售可见吗?红线突破走什么审批?",
         "why": "价格授权矩阵"},
        {"type": "fact", "theme": "biz_process",
         "text": "合同分几类(销售合同 / 政府项目类 / 战略合作类 / 保密 / 框架 / 单次)?框架合同是否需要月度对账?",
         "why": "合同对象分型"},

        # 财务一体化
        {"type": "data", "theme": "data_governance",
         "text": "DSO 应收账款回款天数当前如何统计?是否分时间段(<15 / 15-30 / 30-45 / 45+)监控?",
         "why": "业财一体化健康度"},
        {"type": "fact", "theme": "biz_process",
         "text": "回款认款是一对一还是多对多?发票如何与回款计划匹配?是否走 OCR 自动识别?",
         "why": "认款核销自动化"},

        # 渠道
        {"type": "fact", "theme": "biz_process",
         "text": "渠道伙伴分几级(商机引荐 / 经销 / 经销+交付 / 经销+运维 / 经销+交付+运维)?各级独立录线索吗?",
         "why": "渠道管理 PRM 复杂度"},

        # 项目交付
        {"type": "fact", "theme": "biz_process",
         "text": "项目交付是否走铁三角(销售 / 解决方案 / 项目经理)?DICT 项目财务计收如何拆解?",
         "why": "交付协同模型"},
        {"type": "fact", "theme": "biz_process",
         "text": "后向采购是否纳入 CRM?与前向销售合同是否关联监控成本超支?",
         "why": "交付域成本管控"},

        # 集成
        {"type": "fact", "theme": "integration",
         "text": "是否使用飞书 / 钉钉 / 企微?是否需要 SSO + 消息/待办/审批 双向?",
         "why": "协作平台集成"},
        {"type": "fact", "theme": "integration",
         "text": "ERP 厂商(泛微 / SAP / 自研)?客户/合同/订单/回款 哪些字段需要双向同步?",
         "why": "ERP 集成范围"},
    ],
)


TECHNOLOGY.must_visit_departments = [
    "销售总部 / 大客户部",
    "产业生态部 / 渠道合作伙伴管理",
    "公共及政府事务部(若涉及政府业务)",
    "运营中台 / 销售运营",
    "解决方案 / 售前架构",
    "商务部 / 法务部 / 风控部",
    "财务部 / 业财 BP / 司库",
    "产品部 / 研发",
    "交付部 / 实施 / 运维",
    "市场部 / SCRM 运营",
    "IT 信息中心",
]

TECHNOLOGY.default_sessions = [
    {"topic": "高管战略对齐 1on1",                       "method": "1on1 访谈",   "target": "总裁 / 销售 VP / CIO",       "duration": "2h"},
    {"topic": "销售总部 — L2C 全流程现状",                "method": "集中访谈",   "target": "销售总监 + 销售运营",         "duration": "3h"},
    {"topic": "运营中台 — 线索分配 / 会签流程",           "method": "集中访谈",   "target": "运营中台 + 销管",             "duration": "3h"},
    {"topic": "产业生态 — 渠道合作伙伴 + 报备 + 返点",     "method": "集中访谈",   "target": "渠道总监 + 渠道经理",         "duration": "3h"},
    {"topic": "公共及政府事务部 — 政府商机 / 项目申报",    "method": "集中访谈",   "target": "公共事务总监(若涉及)",        "duration": "3h"},
    {"topic": "解决方案 / 售前 — POC + 报价 + 投标",      "method": "集中访谈",   "target": "售前总监 + 解决方案架构师",   "duration": "3h"},
    {"topic": "商务部 — 合同 / 红线条款 / 多类型合同",    "method": "集中访谈",   "target": "商务总监 + 合规法务",         "duration": "3h"},
    {"topic": "财务部 — 应收 / 回款 / 认款 / DSO",         "method": "集中访谈",   "target": "财务总监 + 业财 BP + 收入 BP","duration": "3h"},
    {"topic": "交付部 — 铁三角协同 / DICT 财务计收",       "method": "集中访谈",   "target": "交付总监 + 项目经理",         "duration": "3h"},
    {"topic": "市场部 — SCRM / MQL / 营销自动化",          "method": "集中访谈",   "target": "市场总监 + 数字营销",         "duration": "3h"},
    {"topic": "IT — ERP / 飞书 / SSO / 司库 集成方案",    "method": "工作坊",     "target": "IT + 财务 + 业务联合",        "duration": "半天"},
    {"topic": "渠道伙伴代表座谈",                          "method": "工作坊",     "target": "各级渠道商代表 2-3 家",       "duration": "半天"},
    {"topic": "材料收集与现状文档审阅",                    "method": "资料收集",   "target": "客户 PMO 提供",               "duration": "贯穿"},
]

TECHNOLOGY.typical_customer_materials = [
    {"category": "组织",     "items": ["集团组织架构图(含产业线 / 大区 / 子公司)", "RACI 现状", "运营中台职能定义"]},
    {"category": "业务流程", "items": ["L2C 流程图(线索→商机→合同→订单)", "O2C 流程图", "DICT 项目交付流程", "渠道伙伴报备 / 返点流程", "POC + 投标 + 算力申请 子流程图"]},
    {"category": "数据",     "items": ["客户主数据样本(按 5 类客户分别)", "渠道伙伴清单 + 分级", "产品 + 价目表(含阶梯)", "在服务合同清单 + 服务形式"]},
    {"category": "系统",     "items": ["ERP 厂商 + 版本", "SCRM(致趣百川 / Marketo / HubSpot 等)", "飞书 / 钉钉 / 企微 使用情况", "司库资金流水系统", "现有 CRM(若有,导出 schema)"]},
    {"category": "制度",     "items": ["销售奖惩 / 提成方案", "客户停用流程", "红线价管理办法", "渠道防串货 + 报备规则"]},
    {"category": "战略",     "items": ["未来 12 个月业务规划", "Top 3 业务挑战", "AI / 大模型 / 云转型路径", "成功 KPI 定义"]},
]

register(TECHNOLOGY)
