"""调研问卷题目伴随的最佳实践卡片库。

数据源:本地知识库 `2025年项目/知识库/模块/<X>/标准流程.md`
       从 13 个 CRM 实施项目里跨行业提炼出的"标准核心"流程做法。

每个 LTC 模块下挂 3-5 条最佳实践卡片,survey 生成时按 ltc_module_key 自动注入到
对应题目的 best_practice_refs 字段。前端折叠展示,辅助顾问在客户答题时讲解参考。

每条 BestPractice 字段:
- title:卡片标题(<= 15 字)
- summary:1-2 句具体可参考的做法
- source_id:出处(本地 KB 的模块/章节路径,前端展示但不跳转)
- industries:留空表示通用;指定行业才出(e.g. ["manufacturing"] 仅工业品 B2B)
- triggers:题干 / why 命中任一关键词时优先推该卡片(可选;无则模块级匹配)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class BestPractice:
    title: str
    summary: str
    source_id: str
    industries: List[str] = field(default_factory=list)
    triggers: List[str] = field(default_factory=list)


# ── M01 线索管理 ─────────────────────────────────────────────────────────────

M01_LEAD = [
    BestPractice(
        title="线索池化 + 公海回收",
        summary="按地域 / 事务所 / 状态划分多个线索池;跟进超时(如 7/15 天无活动报告)自动回收到公海,避免线索沉睡。",
        source_id="线索管理 / 标准流程 §4.3 §4.4",
        triggers=["线索池", "公海", "回收", "分配", "沉睡"],
    ),
    BestPractice(
        title="录入即查重",
        summary="按 客户名称 + 电话 + 公司 + 来源 多维度查重,命中时阻止新建 / 提示合并 / 提示关联,避免重复线索。",
        source_id="线索管理 / 标准流程 §4.1",
        triggers=["查重", "重复", "录入", "合并"],
    ),
    BestPractice(
        title="线索清洗三分类",
        summary="所有新线索先入「清洗池」,清洗员标记 可跟进 / 无效 / 不明(信息不全),再分流到对应下游池,提升一线销售跟进效率。",
        source_id="线索管理 / 标准流程 §4.2",
        triggers=["清洗", "无效", "信息不全"],
    ),
    BestPractice(
        title="自动分配 + 主管手动 + 公海领取 三套并存",
        summary="自动规则按地域 / 产品 / 负载分配为主;高价值线索保留主管手动指派;闲置线索进公海让一线主动领取,既效率又灵活。",
        source_id="线索管理 / 标准流程 §4.3",
        triggers=["分配", "认领", "领取"],
    ),
    BestPractice(
        title="活动报告驱动跟进",
        summary="每次电话 / 拜访 / 邮件 接触必须登记活动报告,直属领导抄送;跟进时长 + 接触次数自动汇总到客户档案,作为漏斗健康度指标。",
        source_id="线索管理 / 标准流程 §4.4",
        triggers=["活动报告", "拜访", "跟进", "记录"],
    ),
    BestPractice(
        title="一键转化 客户 + 联系人 + 商机",
        summary="线索成熟时一键转化,自动生成 Account + Contact + Opportunity 三件套并保留来源链路,原 Lead 关闭锁定,便于后续转化漏斗分析。",
        source_id="线索管理 / 标准流程 §4.5",
        triggers=["转化", "转客户", "转商机"],
    ),
]


# ── M02 商机管理 ─────────────────────────────────────────────────────────────

M02_OPPORTUNITY = [
    BestPractice(
        title="阶段化推进 5-7 阶段",
        summary="典型阶段:初步沟通 → 验证客户 → 需求确定 → 方案 / 报价 → 商务谈判 → 赢单 / 输单。每阶段配赢率,加权汇总成 weighted pipeline。",
        source_id="商机管理 / 标准流程 §4.2",
        triggers=["阶段", "推进", "漏斗", "赢率", "pipeline"],
    ),
    BestPractice(
        title="阶段任务承载最佳实践",
        summary="每个阶段定义「必须完成的任务」,e.g. 方案阶段必须输出报价单 + 决策链梳理。任务勾选完才能推下一阶段(硬校验 / 软提醒可配)。",
        source_id="商机管理 / 标准流程 §4.3",
        triggers=["阶段任务", "checklist", "推进规则", "必填"],
    ),
    BestPractice(
        title="可跳阶不可回退",
        summary="允许跳阶段前进(适应快单),但不允许回退,保证漏斗历史真实可审计。回退场景用「输单 → 重新立商机」处理。",
        source_id="商机管理 / 标准流程 §4.2",
        triggers=["回退", "跳阶段"],
    ),
    BestPractice(
        title="终态数据锁定",
        summary="赢单 / 输单后填下单日期 + 输单理由(枚举:流标 / 输给竞品 / 价格原因 / 需求消失 ...),状态置终态 + 字段全部锁定,保证统计口径稳定。",
        source_id="商机管理 / 标准流程 §4.5",
        triggers=["赢单", "输单", "终态", "锁定"],
    ),
    BestPractice(
        title="输单必复盘",
        summary="输单商机必须填关键事件 / 行动 / 原因 / 改进点,沉淀进知识库,为同类商机提供前车之鉴。",
        source_id="商机管理 / 标准流程 §4.6",
        triggers=["复盘", "输单", "知识沉淀"],
    ),
]


# ── M03 报价管理 ─────────────────────────────────────────────────────────────

M03_QUOTE_BID = [
    BestPractice(
        title="价目表 + 红线价 双重防线",
        summary="价目表给「一般指导价」,产品配置「红线价」(最低可成交价)。报价单录入时自动取值,跌破红线必须强制审批。",
        source_id="报价管理 / 标准流程 §4 step 3",
        triggers=["价格", "底价", "指导价", "红线"],
    ),
    BestPractice(
        title="按价格水位分级审批",
        summary="销售价 ≥ 指导价 → 直接通过;< 指导价 → 业务负责人审批;< 红线价 → 业务负责人 +1 审批;阶梯化路由,既守住底线又不堵效率。",
        source_id="报价管理 / 标准流程 §4 step 5",
        triggers=["审批", "审批流", "折扣"],
    ),
    BestPractice(
        title="多轮报价保留版本",
        summary="客户砍价 → 编辑原报价单触发新一轮审批,系统保留每轮版本号 + 谈判轨迹,便于商务复盘和合规审计。",
        source_id="报价管理 / 标准流程 §4 step 6",
        triggers=["多轮", "砍价", "谈判", "版本"],
    ),
    BestPractice(
        title="无报价不签合同",
        summary="多数行业以报价单作为合同前置:报价单详情页「转销售合同」按钮带入客户 / 商机 / 产品行,避免合同与报价不一致。",
        source_id="报价管理 / 标准流程 §4 step 8",
        triggers=["合同", "转合同"],
    ),
    BestPractice(
        title="阶梯产品按数量取价",
        summary="同一产品配置 1-10 / 11-50 / 50+ 等阶梯,报价时按数量自动取对应单价,减少销售手工算价 + 错价。",
        source_id="报价管理 / 标准流程 §4 step 3",
        triggers=["阶梯", "批量", "数量"],
    ),
]


# ── M04 合同管理 ─────────────────────────────────────────────────────────────

M04_CONTRACT = [
    BestPractice(
        title="合同类型 + 形态 双维度",
        summary="类型:销售 / 政府项目 / 战略合作 / 保密 等(决定字段集);形态:单次 vs 框架(决定能否再下订单)。两维度独立,模板组合多但数据干净。",
        source_id="合同管理 / 标准流程 §4.2",
        triggers=["合同类型", "框架合同", "单次合同"],
    ),
    BestPractice(
        title="按金额 / 客户 / 产品 路由审批",
        summary="销售 → 销售主管 → 商务 → 法务 → 财务 → 风控 → 高层;按金额 / 客户类型 / 产品类型走不同分支,小单短链路、大单全链路。",
        source_id="合同管理 / 标准流程 §4.3",
        triggers=["合同审批", "审批", "法务"],
    ),
    BestPractice(
        title="生效即建回款计划",
        summary="合同审批通过 → 状态置「执行中」自动生成回款计划(按合同付款方式)+ 推送 ERP,避免商务漏开应收。",
        source_id="合同管理 / 标准流程 §4.4",
        triggers=["生效", "回款", "ERP", "应收"],
    ),
    BestPractice(
        title="合同到期 90/15/7/3 天预警",
        summary="按合同到期日提前 90 / 15 / 7 / 3 天 + 当天连续提醒销售 + 负责人,避免续签错过窗口。",
        source_id="合同管理 / 标准流程 §4.7",
        triggers=["到期", "续签", "提醒"],
    ),
    BestPractice(
        title="框架合同 → N 个订单",
        summary="框架合同生效后可在其下创建多个销售订单,订单编号默认 = 合同号 + 001 序号,自动继承客户 / 产品行,适配 B2B 持续供货场景。",
        source_id="合同管理 / 标准流程 §4.8",
        industries=["manufacturing", "energy", "electronics", "materials"],
        triggers=["订单", "框架", "持续供货"],
    ),
]


# ── M05 订单管理 ─────────────────────────────────────────────────────────────

M05_ORDER = [
    BestPractice(
        title="订单从合同派生不裸建",
        summary="销售订单必须挂在合同(框架或单次)下,继承客户 / 产品 / 价格 / 服务期,避免脱缰订单。无合同直接下单视为流程异常。",
        source_id="合同管理 / 标准流程 §4.8 + 商机标准流程",
        triggers=["订单", "下单"],
    ),
    BestPractice(
        title="订单审批沿用合同流(去法务)",
        summary="订单审批节点同合同主流程,但法务通常不参与(条款已在合同审过),既保合规又快。",
        source_id="合同管理 / 标准流程 §4.8",
        triggers=["订单审批"],
    ),
    BestPractice(
        title="CRM 订单 → ERP 销售订单 双写",
        summary="订单生效后推送 ERP 生成销售订单(关联号双写),发货 / 出库 / 开票回写 CRM,前后端单据一致。",
        source_id="合同管理 / 链路IO + 集成最佳实践",
        triggers=["ERP", "集成", "推送", "发货"],
    ),
]


# ── M07 应收 / 票款管理 ──────────────────────────────────────────────────────

M07_AR = [
    BestPractice(
        title="回款计划随合同自动生成",
        summary="合同生效时按付款方式拆分回款计划(预付 30% / 验收 60% / 质保 10%),计划日期到期前 N 天提醒催收。",
        source_id="合同管理 / 标准流程 §4.4 + 票款管理",
        triggers=["回款", "应收", "催收", "账期"],
    ),
    BestPractice(
        title="开票申请走轻审批",
        summary="销售在 CRM 提开票申请(已有合同 + 已有订单时自动带入金额 / 抬头),财务审批后推送至开票系统,避免线下表单和邮件开票。",
        source_id="票款管理 / 标准流程",
        triggers=["开票", "发票"],
    ),
    BestPractice(
        title="账龄 + 逾期分级预警",
        summary="按 30 / 60 / 90 / 180 天账龄分桶,超期自动升级到销售主管 → 大区负责人 → CFO,催收责任明确不甩锅。",
        source_id="票款管理 / 标准流程",
        triggers=["账龄", "逾期", "坏账"],
    ),
]


# ── M08 服务工单 ─────────────────────────────────────────────────────────────

M08_SERVICE = [
    BestPractice(
        title="多渠道接入统一拉平",
        summary="电话 / Web / Bot / Email / Chat / 现场报修 等渠道工单数据每日批量导入,按产品分类代码自动路由到对应业务部门,避免渠道孤岛。",
        source_id="服务工单管理 / 标准流程 §4 step 2-3",
        triggers=["工单", "渠道", "热线"],
    ),
    BestPractice(
        title="节假日打标驱动 SLA",
        summary="工单建立日按工作日 / 法定节假日 / 调休 自动打标,SLA 计算时只算工作日,客户和坐席双方不踩节假日的坑。",
        source_id="服务工单管理 / 标准流程 §4 step 4",
        triggers=["SLA", "节假日", "响应时长"],
    ),
    BestPractice(
        title="日报数据 → 业务线咨询日报",
        summary="电话 / Web / Bot 日报按业务线自动拆分成多条「咨询日报」,VOC / KPI / CMA 指标月度沉淀,服务运营报表导向(非工作流导向)。",
        source_id="服务工单管理 / 标准流程 §4 step 5-7",
        triggers=["日报", "VOC", "KPI", "运营"],
    ),
    BestPractice(
        title="作废重建走清空回收站",
        summary="工单作废后必须清空回收站才允许重新导入(否则唯一键冲突),日批导入流程要内置该步骤,避免重复工单或导入失败。",
        source_id="服务工单管理 / 标准流程 §4 step 8",
        triggers=["作废", "重建", "回收站"],
    ),
]


# ── S01 客户管理 ─────────────────────────────────────────────────────────────

S01_CUSTOMER = [
    BestPractice(
        title="工商联想 + 多级建档审批",
        summary="客户名称关键字触发工商数据联想,匹配上 → 自动绑定工商资料 + 直接生效;未匹配 → 走多级审批(所长 → 地区经理 → 销售管理 → IT)再生效,确保数据真实。",
        source_id="客户管理 / 标准流程 §4.2 §4.4",
        triggers=["建档", "工商", "审批", "营业执照"],
    ),
    BestPractice(
        title="多维查重 + 范围可配",
        summary="按 客户名称 + 统一社会信用代码 + 电话 + 地址 多维查重,范围可选「全局唯一」或「组织内唯一」,避免重复客户但保留必要的多公司同名场景。",
        source_id="客户管理 / 标准流程 §4.3",
        triggers=["查重", "重复", "客户合并"],
    ),
    BestPractice(
        title="客户 360 + 直属抄送",
        summary="活动报告 / 商机 / 合同 / 工单 / 回款 全部汇总到客户视图;活动报告默认抄送直属领导,既透明又方便上级辅导。",
        source_id="客户管理 / 标准流程 §4.5",
        triggers=["客户视图", "客户档案", "360"],
    ),
    BestPractice(
        title="负责人变更触发 System Key 重算",
        summary="客户负责人变更工作流自动迁移权限 + 触发关联商机 / 合同 / 订单的 System Key 重算(高风险操作),建议放夜间批跑。",
        source_id="客户管理 / 标准流程 §4.6",
        triggers=["负责人", "变更", "权限"],
    ),
    BestPractice(
        title="重要客户工商变更日报",
        summary="标记「重要客户」 → 每日定时抓取工商数据 → 法人 / 注册资本 / 经营范围 变更时自动提醒负责人,提前感知客户风险。",
        source_id="客户管理 / 标准流程 §4.8",
        triggers=["工商变更", "风险", "重要客户"],
    ),
    BestPractice(
        title="协同跟进申请制",
        summary="营业新建客户时若已有他人在跟,系统提示申请「相关团队」(只读 / 读写),避免抢客但留协作通道。",
        source_id="客户管理 / 标准流程 §4.7",
        triggers=["协同", "相关团队", "抢客"],
    ),
]


# ── S02 产品 / BOM ───────────────────────────────────────────────────────────

S02_PRODUCT = [
    BestPractice(
        title="标品 + 定制品 双层 BOM",
        summary="标品独立维护 BOM(从 ERP / PLM 同步),定制品在 CRM 内基于标品「拼配」生成 N 层 BOM(典型 2-5 层),报价时按拼配树取数计算总价。",
        source_id="产品管理 / 链路IO + 智能制造行业包",
        industries=["manufacturing", "electronics", "materials"],
        triggers=["BOM", "定制", "拼配", "嵌套"],
    ),
    BestPractice(
        title="价目表 + 时效版本",
        summary="价目表挂在产品上,带生效起止日期 + 客户分级标签;报价取值时按当前日期 + 客户分级精准命中,避免「老客户用新价表」事故。",
        source_id="报价管理 / 标准流程 + 产品管理",
        triggers=["价目表", "价格", "客户分级"],
    ),
]


# ── S03 渠道 / 经销商 ───────────────────────────────────────────────────────

S03_CHANNEL = [
    BestPractice(
        title="经销商分级 + 数据上报奖惩",
        summary="按销量 / 服务 / 区域贡献分钻 / 金 / 银三级,与数据上报频次 + 奖罚挂钩,让经销商主动报数据(否则降级)。",
        source_id="伙伴管理 / 标准流程 + 智能制造行业包",
        industries=["manufacturing", "energy", "electronics"],
        triggers=["经销商", "渠道", "分级", "奖惩"],
    ),
    BestPractice(
        title="商机报备 + 防串货",
        summary="经销商在线报备客户 / 商机,系统按 客户 + 区域 + 产品 三维查重;先报先得 + 时效保护(如 90 天),期满未推进自动释放。",
        source_id="伙伴管理 / 标准流程 + 智能制造行业包",
        industries=["manufacturing", "energy", "electronics"],
        triggers=["报备", "串货", "渠道冲突"],
    ),
]


# ── 总入口字典 ────────────────────────────────────────────────────────────────

LTC_BEST_PRACTICES: dict[str, list[BestPractice]] = {
    "M01_lead":         M01_LEAD,
    "M02_opportunity":  M02_OPPORTUNITY,
    "M03_quote_bid":    M03_QUOTE_BID,
    "M04_contract":     M04_CONTRACT,
    "M05_order":        M05_ORDER,
    "M07_ar":           M07_AR,
    "M08_service":      M08_SERVICE,
    "S01_customer":     S01_CUSTOMER,
    "S02_product":      S02_PRODUCT,
    "S03_channel":      S03_CHANNEL,
}


def get_best_practices_for(
    ltc_module_key: str,
    *,
    industry: str | None = None,
    question_text: str | None = None,
    why_text: str | None = None,
    limit: int = 3,
) -> list[dict]:
    """根据题目的 LTC 模块 + 行业 + 题干关键词,挑出最相关的最佳实践卡片。

    数据源(双层):
    1. **主源 — LTC_BEST_PRACTICES**(本文件):跨行业的标准核心做法,按 LTC 模块组织。
       命中规则:模块 key 命中即候选;triggers 命中关键词加权;卡片 industries
       声明非空时按本项目 industry 过滤。
    2. **辅源 — IndustryPack.cases**(`industry_packs/<x>.py`):行业标杆案例。
       命中规则:industry 命中本行业;case.name / case.pattern 命中题干关键词。
       最多取 1 条,作为「行业实践包」标签出现,与主源一起返回。

    辅源不强制要求,缺失或行业未注册时静默跳过。

    返回 dict 格式与 questionnaire_schema.BestPracticeRef.to_dict() 一致。
    """
    text = ((question_text or "") + " " + (why_text or "")).lower()
    out: list[dict] = []

    # ── 主源:LTC_BEST_PRACTICES ──
    bucket = LTC_BEST_PRACTICES.get(ltc_module_key) or []
    candidates: list[tuple[int, BestPractice]] = []
    for bp in bucket:
        if bp.industries and industry and industry not in bp.industries:
            continue
        score = sum(10 for trig in bp.triggers if trig.lower() in text)
        candidates.append((score, bp))
    candidates.sort(key=lambda x: -x[0])

    for _, bp in candidates[: max(0, limit - 1) if industry else limit]:
        out.append({
            "title": bp.title,
            "summary": bp.summary,
            "source": "kb",
            "source_id": bp.source_id,
        })

    # ── 辅源:行业标杆案例(industry_pack.cases)─ 至多 1 条 ──
    if industry and len(out) < limit:
        case = _pick_industry_case(industry, text)
        if case is not None:
            out.append(case)

    return out


def _pick_industry_case(industry: str, text: str) -> dict | None:
    """从 IndustryPack.cases 里挑一条与题干最相关的标杆案例。

    匹配:case.name 任意子串命中 → 直接选;否则 case.pattern 关键词命中加分。
    都没命中则不出(避免硬塞噪声)。
    """
    try:
        from services.agentic.industry_packs import get_pack
    except Exception:
        return None
    pack = get_pack(industry)
    if not pack or not pack.cases:
        return None

    best: tuple[int, dict] | None = None
    for c in pack.cases:
        name = (c.get("name") or "").lower()
        pattern = (c.get("pattern") or "").lower()
        # 题干直接提到案例名,优先级最高
        if name and name in text:
            score = 100
        else:
            # 简单关键词重合度:把 pattern 拆成中文 / 英文短词,看命中数
            score = 0
            for tok in pattern.replace("/", " ").split():
                if len(tok) >= 2 and tok in text:
                    score += 5
        if score > 0 and (best is None or score > best[0]):
            best = (score, c)

    if best is None:
        return None

    _, c = best
    summary_parts = []
    if c.get("pattern"):
        summary_parts.append(c["pattern"])
    if c.get("lessons"):
        summary_parts.append("经验:" + c["lessons"])
    return {
        "title": f"标杆案例 · {c.get('name', '')}",
        "summary": " · ".join(summary_parts)[:240],
        "source": "industry_pack",
        "source_id": industry,
    }
