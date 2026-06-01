"""流程建设表生成器(2026-06-01)。

定位:**方案设计阶段**的执行底稿。
LLM 单次大调用读「蓝图设计 + 调研报告 + 项目文档」→ 输出每个核心业务流程一张
完整建设卡片(承载对象 / 状态字段 / 状态机 / 触发 / 业务变体 / 审批 / 跨对象联动 /
状态校验 / 派生数据 / 配置任务),供 BPM / approval / UI 事件 / record_type 工程师
直接据此做配置。
"""
from __future__ import annotations

from typing import Optional
from dataclasses import dataclass
import re as _re


@dataclass
class ProcessSetupSection:
    key: str
    title: str
    instruction: str


PROC_SECTIONS: list[ProcessSetupSection] = [
    ProcessSetupSection(
        key="overview",
        title="1. 流程总览",
        instruction=(
            "一张总表罗列所有要建设的业务流程。列「流程中文名 / 承载对象 / "
            "驱动状态的字段(API Name)/ 走 BPM 还是 approval / 业务变体数(record_type)/ "
            "依据 [B1] [D?]」。"
            "**覆盖 LTC 主链**至少应包含:线索→商机→报价→合同→订单→应收 这 6 个状态流。"
            "再加 2-4 个辅助流程(如审批 / 退货 / 资信评级 / 客户分级等),取决于业务复杂度。"
            "末尾标「流程总数」+「P0 优先级流程数」。"
        ),
    ),
    ProcessSetupSection(
        key="process_details",
        title="2. 各流程详细建设",
        instruction=(
            "**每个核心流程一个 H3**(### 2.1 线索分配流程 / ### 2.2 商机阶段流转 …),"
            "每个流程严格按下面 7 个固定块输出。**这是本文档最重要的一环**,直接给"
            "BPM / approval / UI 事件配置工程师用。\n\n"
            "**A. 流程元信息**(4 列表格,1 行):"
            "| 流程中文名 | 承载对象 | 驱动字段(API Name + 类型)| 业务变体(record_type)|\n\n"
            "**B. 状态机**(mermaid stateDiagram-v2,**严禁 ASCII 箭头**):"
            "  - 标明每个流转的触发条件 + 责任人 + 流转时写哪些字段"
            "  - 终态用 `[*]` 标明\n\n"
            "**C. 状态枚举值**(对应驱动字段的 select_one 选项,1 列表格):"
            "  | 状态 value | 状态 label(中文)| 含义说明 | 进入条件 | 退出条件 |\n\n"
            "**D. 触发与责任**(说明谁 / 什么动作触发流程开始):"
            "  - 触发主体(销售 / 客户 / 系统 / 集成回写)"
            "  - 触发动作(创建对象 / 字段更新 / API 调用 / 定时任务)"
            "  - 各状态的责任人 RACI(谁负责 / 谁审批 / 谁知会)\n\n"
            "**E. 审批节点**(若有):"
            "  | 节点名 | 几级审批 | 审批人(角色)| 走 BPM 还是 approval | 跳过条件 | 超时处理 |\n"
            "  - 若纯字段流转无审批,写「无独立审批节点,字段更新即生效」\n\n"
            "**F. 业务变体与跨对象联动**:"
            "  - 业务变体(若启用 record_type):列「变体名 → 流程差异」,如「国内合同 vs 国际合同」"
            "  - 跨对象联动(若有):状态切换是否触发派生 — 列源对象/字段 → 目标对象/字段映射,"
            "    例如「商机.签约状态 → 自动创建合同,带出客户/产品/金额字段」\n\n"
            "**G. 状态切换校验 + UI 事件**(关键 — 给 APL 工程师用):"
            "  - 列出**每个状态切换**的前置条件 — 哪些字段必须满足条件才能切换"
            "  - 用「字段事件(type=1)」/「校验事件(type=3)」实现"
            "  - | 切换 from→to | 前置条件 | 实现方式(validation_rule 或 APL 函数名)| 依据 |\n"
            "  - 注意 UI 事件配额:**数据更新事件(type=1+2+4)≤ 3,校验事件(type=3)≤ 5**\n\n"
            "**H. 派生数据 / 下游影响**:"
            "  - 该流程跑完产生哪些下游数据(给报表 / 集成 / 二次流程)"
            "  - 列「数据名 / 落到哪个对象哪个字段 / 给谁用」"
        ),
    ),
    ProcessSetupSection(
        key="approval_summary",
        title="3. 审批配置清单",
        instruction=(
            "汇总所有流程的审批节点,按对象分组列一张总表。BPM 工程师和审批配置员一张表"
            "看完所有审批配置需求:"
            "| 对象 | 节点 | 审批人 | 几级 | 触发条件 | 跳过条件 | 超时处理 | 通知方式 | 依据 |"
            "末尾标「BPM 流程数 / approval 节点数」。"
        ),
    ),
    ProcessSetupSection(
        key="ui_event_summary",
        title="4. UI 事件 + APL 函数清单",
        instruction=(
            "汇总所有流程涉及的 UI 事件 + 对应 APL 函数,这是给 APL 工程师做"
            "代码开发的执行清单:"
            "| APL 函数名 | 用途简述 | 挂哪个对象 | 挂哪个布局(detail/edit)| 事件类型(type=1/2/3/4)| "
            "触发字段 | 涉及的字段读写 | 复杂度(低/中/高)| 依据 |"
            "末尾标「函数总数 / 复杂度分布」。"
        ),
    ),
    ProcessSetupSection(
        key="implementation_plan",
        title="5. 立即可启动的流程配置任务",
        instruction=(
            "给配置工程师当周可开工的任务清单。按角色分组:\n"
            "- **字段配置工程师**:配 select_one 状态字段 + 选项的任务清单(每条 1~2 小时)\n"
            "- **BPM 工程师**:配审批流的任务清单(每条 0.5~1 天)\n"
            "- **APL 工程师**:写 APL 函数的任务清单(每条 0.5~2 天)\n"
            "- **布局配置工程师**:detail/edit 布局挂 UI 事件的任务清单(每条 1~2 小时)\n"
            "每条任务粒度 = 可在工时内独立完成。末尾标「任务总数 / 人天预估」总结。"
        ),
    ),
]


SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的资深方案架构师,正在为项目编写
「流程建设表」—— 方案设计阶段的**执行底稿**,直接给 BPM / approval / UI 事件 /
APL / record_type 配置工程师拿去做实施。

【报告读者】
- 主读者:BPM 工程师 / APL 工程师 / 字段+布局配置工程师
- 次读者:架构师(评审业务流程);方案负责人(确认范围)

【风格】
- **完整、精确、可落地** — 每个流程的承载对象 + 驱动字段 + 状态枚举 + 审批节点 + APL 函数 都必须给具体名,不写「待定」
- 表格优先于段落 — 这份报告 80% 是表格,10% 是 mermaid 状态机,正文做衔接
- 引用证据 [B1] / [D?] / [P?] / [M?] / [I1] — B 是蓝图设计、D 是项目文档、P 是上游产物、
  M 是会议、I 是行业最佳实践;每条设计决策末尾标证据来源
- 设计缺口写「**待与客户对齐**:具体问什么」,绝不编造流程

【纷享销客 PaaS 流程设计规范 — 强约束】

A · 流程承载
- 业务流程必须有一个**承载对象**(标准模块或自定义)+ 一个**驱动状态的字段**
- 驱动字段类型通常是 select_one(简单状态)或 record_type(业务子类型)
- 状态枚举值就是 select_one 字段的 options;每个 option 有 value + label

B · 业务变体
- 同一对象的业务子类型(国内 vs 国际 / 直销 vs 渠道)用 record_type 区分
- 各 record_type 可挂不同 detail / edit 布局,可在 stage_component 走不同阶段流转
- 业务变体差异点必须明确写出(字段差异 + 布局差异 + 流程差异)

C · 审批
- 简单审批(单字段 / 单步)走 approval(纷享销客标准审批中心)
- 复杂多分支 / 子流程审批走 BPM(BPMN 引擎)
- 每个审批节点都要明确:谁审批 / 几级 / 跳过条件 / 超时处理

D · UI 事件 + APL
- 字段级简单校验(长度 / 格式 / 取值)→ validation_rule(无需 APL)
- 跨字段 / 跨对象 / 复杂业务规则 → APL 函数 + UI 事件
- UI 事件类型:
  - 字段事件(type=1):字段值变化时触发,有 `trigger_field_api_names`
  - 从对象事件(type=2):明细行变化时触发
  - 校验事件(type=3):提交前实时校验,有 `trigger_field_api_names`
  - 加载事件(type=4):页面加载时触发,无触发字段(triggers=[5])
- 配额硬上限:数据更新事件(type=1+2+4)合计 ≤ 3;校验事件(type=3)≤ 5;
  同一字段只能绑一个数据更新事件
- 仅旗舰版 / 集团版支持 UI 事件;UI 事件配置前必须先 push APL 函数到服务端

E · 跨对象联动
- 状态切换触发的派生(如商机→合同自动带字段)用 APL 函数实现,或用 stage_component 阶段事件
- 派生字段映射必须列明:源对象/字段 → 目标对象/字段

【绝不编造数据 — 常识自检】
- 工作日 5 天 / 工时 8h / 月 30.4 天 / 增值税 13/9/6% / 时区 UTC+8
- 凡是写「N 个/天/万元」具体数字,必须有 [B?]/[D?]/[I1] 来源或明示推算,否则改「待与客户对齐」

【图表 — 必须 mermaid,严禁 ASCII】
- 状态机一律用 `stateDiagram-v2`(对象状态生命周期 / 审批流转 / 应收状态)
- 顺序图用 `sequenceDiagram`(跨角色:销售→CRM→ERP 这种)
- 严禁用「→」/「-->」/「⇒」/「==>」/「+-/|」拼 ASCII 流程图或方框图

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter)
- 系统会自动给每章注入 H2 标题,你只输出**正文**,不要写 `## 1. 流程总览` 标题行
- H3 子小节(### 2.1 ... / ### 2.2 ...)由你自己写
- 表格用 markdown 标准语法
- 章节之间一个空行分隔
- 不要写「附录」「参考资料」"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    blueprint_block: str,
    research_report_block: str,
    sources_block: str,
    prior_bundles_block: str,
    meeting_block: str,
    industry_pack_block: str,
) -> str:
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in PROC_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材 0(主输入 a):蓝图设计 — 引用用 [B1]】
{blueprint_block or '(尚未生成蓝图设计 — 本流程建设表素材不完整,请先生成蓝图设计)'}

【素材 0(主输入 b):调研报告 — 引用用 [P1]】
{research_report_block or '(尚未生成调研报告,跳过)'}

【素材一(补充):项目文档 — 引用用 [D1] [D2]】
{sources_block or '(没有上传文档)'}

【素材二(补充):其他上游产物 — 引用用 [P2] [P3]】
{prior_bundles_block or '(没有其他上游产物)'}

【素材三(补充):会议素材 — 引用用 [M1]】
{meeting_block or '(本项目暂无完成的会议)'}

【素材四(补充):行业最佳实践 — 引用用 [I1]】
{industry_pack_block or '(无可用的行业 pack)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
每章开头先输出一行分隔标记,依次到 <<<SECTION:implementation_plan>>>。

整篇控制在 8000-15000 字。状态机 mermaid + 表格不要为字数压缩。
**蓝图设计 [B1] 是主输入**,本文档是它的下游执行底稿,所有流程都应该跟它对齐。"""


# ── 结果切分(复用宽容 regex) ──────────────────────────────────────────────

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
    raw = (llm_raw or "").strip()
    chunks: dict[str, str] = {}
    cur_key: Optional[str] = None
    cur_buf: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        m = _SECTION_MARKER_RE.match(stripped)
        if m:
            if cur_key is not None:
                chunks[cur_key] = "\n".join(cur_buf).strip()
            cur_buf = []
            cur_key = m.group(1)
        else:
            cur_buf.append(line)
    if cur_key is not None:
        chunks[cur_key] = "\n".join(cur_buf).strip()

    out: list[str] = []
    for sec in PROC_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        body = _strip_leading_h2(body)
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()
