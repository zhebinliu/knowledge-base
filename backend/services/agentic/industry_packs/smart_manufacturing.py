"""智能制造 / 装备制造 / 工业品 B2B 行业包。

对齐 Project.industry='manufacturing'。覆盖典型客户:
- 装备制造(友发钢管 / 三一重工 / 振华重工型)
- 新能源(特变新能源 / 隆基 / 阳光电源)
- 工业自动化(汇川 / 信捷)
- 矿业 / 冶金(唐山天地矿业)
"""
from . import register, IndustryPack


SMART_MFG = IndustryPack(
    industry="manufacturing",
    display_name="智能制造 / 工业品 B2B",
    field_patches={
        "install_base_size": {
            "label": "Install Base 体量",
            "ask": "已售设备数量级 / 是否有序列号档案 / 是否在 CRM 或 ERP 中管理?",
        },
        "bom_complexity": {
            "label": "BOM 复杂度",
            "ask": "标品占比 / 定制品比例 / BOM 嵌套层数 / 是否有版本管理?",
        },
        "channel_mix": {
            "label": "渠道结构",
            "ask": "直销 vs 经销商比例 / 经销商数量 / 是否分级 / 是否需要伙伴云?",
        },
        "erp_vendor": {
            "label": "ERP 厂商",
            "ask": "现有 ERP 是哪家?",
            "options": ["金蝶", "用友", "SAP", "Oracle", "鼎捷", "自研", "无"],
        },
        "mes_plm": {
            "label": "MES / PLM",
            "ask": "是否使用 MES(西门子 / 鼎捷 / 自研)?是否使用 PLM(达索 / 西门子)?",
        },
        "project_sales_flow": {
            "label": "项目型销售流程",
            "ask": "报备 / 试样 / 试机 / 投标 / 中标 / 交付 各阶段是否有正式流程?",
        },
        "service_revenue_pct": {
            "label": "售后/服务收入占比",
            "ask": "备件 / 维保 / 服务收入占总营收的百分比?未来 3 年期望?",
        },
        "decision_chain_depth": {
            "label": "客户决策链层级",
            "ask": "最终客户的决策层级(采购 / 部门 / 副总 / 一把手)?平均参与决策人数?",
        },
    },

    pain_points=[
        "经销商数据上报口径不一(参考 友发钢管 — 集团-子公司-门店三级架构)",
        "工程业务审批流冗长,招投标时间敏感场景下无法支撑(参考 特变新能源)",
        "Install Base 散落 Excel / ERP / 区域 FAE 手里,售后服务无法追溯",
        "BOM 嵌套报价周期 3 天起,业务等不及报价单出来",
        "ERP 主数据归属不清,CRM↔ERP 同步频繁打架",
        "项目型销售周期 6-24 个月,Pipeline 健康度难以量化",
        "经销商商机报备 + 防串货机制缺失,渠道冲突频发",
        "标品 + 定制品混合,定制品 BOM 报价靠售前工程师人工拆",
        "服务工单 + 备件 + 维保合约 三件事散在三个系统",
        "MES / PLM 跟 CRM 集成断点,产销协同效率低",
    ],

    cases=[
        {
            "name": "友发钢管集团",
            "pattern": "集团化多法人 + 销售可视化驱动 + 高奖惩压力",
            "lessons": "高层强推动 + 配套 25 万实施奖金 + 严格的'奖一罚二'政策。子公司差异大,统一方案后差异化配置。",
            "risks": "范围蔓延 + 推广阻力 + 数据迁移 + 多系统集成 + 时间压力",
        },
        {
            "name": "特变新能源(特变电工)",
            "pattern": "制造+工程双业务 + 一主两翼战略 + 全球化业务",
            "lessons": "工程业务和制造业务分别建模,流程审批单独优化。市场洞察明确不入一期,先聚焦 L2C 闭环。",
            "risks": "流程效率(报价/保证金审批冗长) + 数据断点(合同 OA / 交付 PM / 财务 ERP) + 客户分级模型复杂度",
        },
        {
            "name": "唐山天地矿业",
            "pattern": "标准 6 主题调研问卷模板:组织 / 信息化 / 目标 / 线索 / 客户 / 商机",
            "lessons": "调研提纲覆盖度高,可作为同类项目的问卷起点;按业务模块拆分,角色对应清晰",
            "risks": "—",
        },
    ],

    extra_question_seeds=[
        # 项目型销售
        {"type": "fact", "theme": "biz_process",
         "text": "项目报备机制(谁报、查重维度、报备奖励)是怎样的?",
         "why": "项目型销售的核心反内卷机制"},
        {"type": "fact", "theme": "biz_process",
         "text": "试样 / 试机的标准化程度?平均试机周期多久?",
         "why": "工业品 B2B 决定签单的关键环节"},
        {"type": "fact", "theme": "biz_process",
         "text": "投标流程(标书生成 / 报价审批 / 投标决策)是否走系统?",
         "why": "招投标场景的效率瓶颈"},

        # CPQ / BOM
        {"type": "data", "theme": "data_governance",
         "text": "标品 vs 定制品占比?定制品 BOM 嵌套层数(2 层 / 3 层 / 5 层+)?",
         "why": "决定 CPQ 实施复杂度和报价引擎选型"},
        {"type": "fact", "theme": "data_governance",
         "text": "BOM 数据当前归属(ERP / PLM / Excel)?CRM 报价时怎么取数?",
         "why": "BOM 集成方案"},

        # 经销商
        {"type": "fact", "theme": "biz_process",
         "text": "经销商数量?是否分级(钻 / 金 / 银)?是否有数据上报和奖惩挂钩?",
         "why": "渠道管理(伙伴云 PRM)需求"},
        {"type": "fact", "theme": "biz_process",
         "text": "经销商商机报备机制?如何防串货?",
         "why": "渠道冲突管理"},

        # Install Base / 售后
        {"type": "fact", "theme": "biz_process",
         "text": "已售设备(Install Base)目前在哪记录?有没有序列号体系?能否按客户/区域/型号/年限统计?",
         "why": "售后服务和续约的根基"},
        {"type": "data", "theme": "biz_process",
         "text": "维保 / 服务 / 备件收入占总营收的百分比?未来 3 年期望多少?",
         "why": "服务转型驱动力"},

        # ERP / MES / PLM 集成
        {"type": "fact", "theme": "integration",
         "text": "ERP 厂商 + 版本(金蝶 EAS / K3,用友 U8 / NC,SAP S4HANA / ECC)?",
         "why": "决定接口选型"},
        {"type": "fact", "theme": "integration",
         "text": "MES / PLM 是否使用?是否需要 CRM 对接(产销协同 / 设计变更通知)?",
         "why": "工业品场景特有的集成需求"},
    ],
)


register(SMART_MFG)
