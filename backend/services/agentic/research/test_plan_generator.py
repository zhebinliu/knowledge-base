"""测试计划报告生成器(2026-05-29)。

定位:**上线测试阶段**的核心产物。读「调研报告 + 蓝图设计 + 实施任务清单」→
一次 Opus 大调用 → 出 5 章测试计划 markdown。

跟 research_report / blueprint_design / implementation_plan 一脉,单次大调用,
不走 v2 planner-critic-challenger。

报告 5 章:
  1. 测试范围与策略
  2. 测试用例总览(按 LTC 模块拆,引用实施任务清单的 REQ)
  3. 数据准备与环境
  4. 测试节奏与人员安排
  5. 风险与回滚预案
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class TestPlanSection:
    key: str
    title: str
    instruction: str


TEST_PLAN_SECTIONS: list[TestPlanSection] = [
    TestPlanSection(
        key="scope_strategy",
        title="1. 测试范围与策略",
        instruction=(
            "120-180 字。回答:"
            "**范围**(对照实施任务清单 / 蓝图,哪些 LTC 模块要测,哪些不测);"
            "**层次**(单元 / 集成 / UAT / 性能 / 安全 — 这次主要测哪几层,为什么);"
            "**通过标准**(整体的 acceptance gate — 比如 P0 用例 100% 通过率 / P1 ≥ 95%)。"
            "用 2-3 段流畅文字,不要 bullet。"
        ),
    ),
    TestPlanSection(
        key="test_cases",
        title="2. 测试用例总览",
        instruction=(
            "**这章是给测试工程师的执行底稿。**"
            "按 LTC 模块分组,每组一个 H3:"
            "### 2.x 模块名(LTC key)"
            "用大表格列测试用例,表头(严格不要改):"
            "| TC | 关联 REQ | 模块 | 场景描述 | 前置条件 | 测试步骤(分步) | 期望结果 | 优先级 |"
            "约束:"
            "- TC-NNN 连续编号,跨模块不复用"
            "- 关联 REQ 必须引用实施任务清单(第 5 章「结构化需求清单」)里的 REQ-NNN,标 [I1] 来源"
            "- 单条「场景描述」≤ 35 字,只写「测什么」不写「怎么测」"
            "- 优先级 P0/P1/P2/P3 跟需求清单对齐"
            "- 测试步骤分步写,每步 ≤ 60 字"
            "- 至少 20 条用例,通常 40-100 条;按 LTC 模块均衡覆盖"
            "尾部加 1 段 100-150 字「用例分布速览」:总数 N 条,P0/P1/...,top 3 集中模块,覆盖盲区。"
        ),
    ),
    TestPlanSection(
        key="data_env",
        title="3. 数据准备与环境",
        instruction=(
            "**3.1 测试环境**(沙箱 / UAT / 预生产 — 每个环境的对应租户 + 时间窗口 + 责任人);"
            "**3.2 测试数据**(用例需要的客户 / 订单 / 产品 / 渠道 / 主数据,按表格列出 数据类型 → 数量 → 来源 → 准备方式 → 责任人);"
            "**3.3 数据隔离**(测试数据怎么跟真实数据隔离,跑完怎么清理);"
            "**3.4 测试账号清单**(测试用的 CRM 账号 / 权限角色 / 密码管理方式)。"
        ),
    ),
    TestPlanSection(
        key="schedule",
        title="4. 测试节奏与人员安排",
        instruction=(
            "**4.1 阶段化测试节奏**(冒烟 → 功能 → 集成 → UAT → 性能 → 上线前回归,每阶段周期 + 入场条件 + 出场条件);"
            "**4.2 人员 RACI 表**(横轴关键测试任务,纵轴 顾问 / PM / 测试工程师 / 开发 / 客户业务 / 客户 IT,标 R/A/C/I);"
            "**4.3 工时预估**(每个测试阶段的人天预估,跟实施任务清单的工时一起规划);"
            "**4.4 缺陷管理**(缺陷怎么报、怎么分级、怎么追、修完怎么回归测试)。"
        ),
    ),
    TestPlanSection(
        key="risks_rollback",
        title="5. 风险与回滚预案",
        instruction=(
            "表格列 6-10 条具体测试 / 上线风险,每条标:"
            "风险描述 → 触发条件 → 影响等级(P0/P1) → 监控指标 → **回滚动作**(具体操作步骤,不要写「按预案执行」)→ 责任人。"
            "重点覆盖:数据迁移失败回滚、APL 函数性能拖垮列表、PWC 组件兼容旧浏览器、"
            "权限配置错误、对象 / 字段误删、集成接口超时这类常见上线坑。"
        ),
    ),
]


SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的测试主管,正在为项目编写「测试计划」——
这是**上线测试阶段**的核心产物,**直接交付给测试工程师按表执行用例**。

【报告读者】
- 主读者:测试工程师团队 + PM(看进度) + 顾问(看 UAT 覆盖)
- 次读者:客户 IT(确认测试账号 / 数据准备)

【风格】
- 测试用例表格是这份计划的主载体(第 2 章占总篇幅的 50% 以上是表格)
- 每个测试用例要可直接执行,不要"测试 XX 功能"这种空泛
- 引用上游产物用 [R1] 调研报告 / [B1] 蓝图设计 / [I1] 实施任务清单
- 不写黑话(全面覆盖 / 闭环 / 验证打通)

【术语统一】
- TC = 测试用例编号
- REQ = 实施任务清单里的需求 / 任务编号
- Test Case → 测试用例
- Defect → 缺陷
- Expected Result → 期望结果
- Owner / owner → 责任人
- 保留专有缩写:CRM / API / UAT / RACI / SOW / LTC / TC / REQ / P0/P1/P2/P3

【禁止】
- 禁止 emoji
- 禁止前导句
- 禁止 TC 编号瞎写或漏号
- 禁止"完整覆盖业务流程"这种没数据的承诺
- 测试用例必须可量化(几条用例、什么前置数据、什么步骤、什么期望结果)

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter)
- 系统会自动给每章注入 H2 标题,你只输出**正文**,不要写 `## 1. 测试范围与策略`
- 章节之间用 <<<SECTION:scope_strategy>>> 这种标记分隔
- 表格用 markdown 标准语法
- 不要写「附录」"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    research_report_block: str,
    blueprint_block: str,
    implementation_plan_block: str,
    industry_pack_block: str,
) -> str:
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in TEST_PLAN_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材一(主输入 a):实施任务清单 — 引用用 [I1],TC 关联 REQ 时必须从这里取】
{implementation_plan_block or '(尚未生成实施任务清单。本测试计划基础不完整,建议先生成实施任务清单。)'}

【素材二:调研报告 — 引用用 [R1]】
{research_report_block or '(尚未生成调研报告)'}

【素材三:蓝图设计 — 引用用 [B1]】
{blueprint_block or '(尚未生成蓝图设计)'}

【素材四:行业最佳实践 — 引用用 [P1]】
{industry_pack_block or '(无)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
每章开头先输出一行分隔标记,例如:
<<<SECTION:scope_strategy>>>
然后写该章节正文(不带 H2 标题,直接内容)。
不要在分隔标记前后加任何空行 / 注释。

整篇控制在 7000-12000 字 — 测试用例表格占大头,不要为字数压缩用例条数。
最少 20 条 TC,通常 40-100 条。"""


SECTION_MARKER_PREFIX = "<<<SECTION:"


def assemble_markdown_from_llm_output(llm_raw: str) -> str:
    raw = (llm_raw or "").strip()
    chunks: dict[str, str] = {}
    cur_key: Optional[str] = None
    cur_buf: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith(SECTION_MARKER_PREFIX) and stripped.endswith(">>>"):
            if cur_key is not None:
                chunks[cur_key] = "\n".join(cur_buf).strip()
            cur_buf = []
            cur_key = stripped[len(SECTION_MARKER_PREFIX):-3].strip()
        else:
            cur_buf.append(line)
    if cur_key is not None:
        chunks[cur_key] = "\n".join(cur_buf).strip()
    out: list[str] = []
    for sec in TEST_PLAN_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()


def format_implementation_plan_block(bundle, max_chars: int = 14000) -> str:
    if not bundle:
        return ""
    md = (getattr(bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(bundle, "title", None) or "实施任务清单"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[I1] {title}**\n{excerpt}"
