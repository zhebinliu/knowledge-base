"""项目验收报告生成器(2026-05-29)。

定位:**项目验收阶段**的核心产物 — 项目交付后的"对账单"。
读「调研报告 + 蓝图设计 + 实施任务清单 + 测试计划」→ 一次 Opus 大调用 → 出 5 章。

报告 5 章:
  1. 验收摘要(总体结论 + 关键数字)
  2. 验收范围与达成(SOW / 蓝图 / 实施任务清单逐项 ✅/⚠️/❌ 对账)
  3. 测试结果与缺陷(对照测试计划:用例通过率 + 遗留缺陷分级)
  4. 上线运营状况(上线后稳定性 / 一线反馈 / KPI 初步)
  5. 后续运维与下期规划(运维交接 + 培训情况 + 下期路线图建议)
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class AcceptanceSection:
    key: str
    title: str
    instruction: str


ACCEPTANCE_SECTIONS: list[AcceptanceSection] = [
    AcceptanceSection(
        key="exec_summary",
        title="1. 验收摘要",
        instruction=(
            "120-180 字。一句话定调(本项目是否达到验收标准),再补 3-5 个关键数字:"
            "需求覆盖率 / 测试通过率 / 上线后稳定性 / 一线接受度 / 关键 KPI 初步表现。"
            "用 2-3 段流畅文字,不要 bullet。最后一句:推荐验收结论(通过 / 有条件通过 / 不通过 + 理由)。"
        ),
    ),
    AcceptanceSection(
        key="scope_delivery",
        title="2. 验收范围与达成",
        instruction=(
            "对照 SOW + 蓝图 + 实施任务清单,逐项对账。"
            "**2.1 SOW 范围对账**:表格列「SOW 条款 / 实际交付状态(✅ 完成 / ⚠️ 部分 / ❌ 未做)/ 说明 / 来源 [R1][B1]」;"
            "**2.2 LTC 模块覆盖**:表格列「LTC 模块 / 计划任务数 / 已生成配置数 / 已部署数 / 已 UAT 验收数 / 状态」(数字来自实施任务清单 [I1]);"
            "**2.3 超 SOW 交付**(实施期间客户追加的需求,如果有);"
            "**2.4 减项说明**(SOW 内但本期未做的,需说明原因 + 下期承接方式)。"
        ),
    ),
    AcceptanceSection(
        key="test_results",
        title="3. 测试结果与缺陷",
        instruction=(
            "**3.1 测试用例执行汇总**(对照测试计划 [T1]):表格「TC 总数 / 已执行 / 通过 / 失败 / 阻塞 / 跳过 / 通过率」,按测试层(冒烟/功能/集成/UAT/性能)分组;"
            "**3.2 缺陷统计**:表格「缺陷数量 / 按 P0-P3 分布 / 已修复 / 未修复 / 待回归 / 修复率」;"
            "**3.3 遗留缺陷清单**(未修复的缺陷,列出每条 + 客户接受度 + 下期承接方案);"
            "**3.4 性能 / 稳定性数据**(关键接口响应时间 / 列表加载时间 / 历史数据迁移完整性 / 集成接口成功率);"
            "用具体数字 + 表格,**不要写「基本通过」「稳定运行」这种没数据的话**。"
        ),
    ),
    AcceptanceSection(
        key="post_launch",
        title="4. 上线运营状况",
        instruction=(
            "**4.1 上线时间线**(关键里程碑实际时点 vs 计划时点,延期项说明原因);"
            "**4.2 一线使用情况**(上线后 N 周的 日活 / 周活 / 关键操作完成率 / 客户主数据增长曲线 — 有数据就给数据,没数据就明确说「未启用前端埋点,无法量化」);"
            "**4.3 客户反馈**(分高管 / 部门负责人 / 一线三层 — 各 2-3 条具体反馈,正面 + 改进都列);"
            "**4.4 KPI 初步表现**(如调研报告里设过 KPI 比如「销售周期缩短 X%」,这里给上线 30 天观察值,数据不足时说「观察期不够,建议 90 天复盘」)。"
        ),
    ),
    AcceptanceSection(
        key="next_phase",
        title="5. 后续运维与下期规划",
        instruction=(
            "**5.1 运维交接清单**(账号 / 文档 / 配置变更流程 / 故障升级路径 — 谁交给谁、什么时候交、有没有签字);"
            "**5.2 培训情况**(管理员培训 / 一线培训 — 各覆盖了多少人、考核结果、待补人员);"
            "**5.3 下期承接路线图**(本期遗留 + 客户新增诉求,给出下期建议优先级 + 工时 + 时间窗口);"
            "**5.4 验收签字位**(我方项目负责人 / 客户业务负责人 / 客户 IT 负责人,留 3 行签字 + 日期空位)。"
        ),
    ),
]


SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的项目交付总监,正在为项目编写「验收报告」——
这是**项目验收阶段**的核心产物,**直接交付给客户签字确认,作为项目交付的官方对账单**。

【报告读者】
- 主读者:客户决策层(签字)、客户 IT(运维交接)、客户业务(确认达成度)
- 次读者:我方 PM / 顾问 / 销售(总结 + 留档,作为后续续约 / 加单依据)

【风格】
- **数字优先于形容词** — 这是验收报告,所有结论必须有数字支撑
- 对账表是这份报告的主载体 — 第 2 章 + 第 3 章总篇幅占 60% 以上是表格
- 客户读完应该清楚:做了什么、达成了什么、剩了什么、下一步怎么办
- 不写"圆满完成 / 客户满意 / 显著提升"这种没数字的空话

【术语统一】
- TC = 测试用例 / REQ = 需求编号
- 缺陷 / Bug 都用「缺陷」
- 通过 / 失败 / 阻塞 / 跳过 — 标准 4 状态
- Owner / owner → 责任人
- 保留:CRM / API / UAT / KPI / SOW / LTC / TC / REQ

【禁止】
- 禁止 emoji
- 禁止前导句
- 禁止形容词堆砌("全面" "深度" "高质量" "高效")
- 禁止编数据 — 没数据就明确说"无埋点数据,建议下期补"
- 验收结论不要含糊,推荐结论必须是 通过 / 有条件通过 / 不通过 三选一 + 理由

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter)
- 系统会自动给每章注入 H2 标题,你只输出**正文**,不要写 `## 1. 验收摘要`
- 章节之间用 <<<SECTION:exec_summary>>> 这种标记分隔
- 表格用 markdown 标准语法"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    research_report_block: str,
    blueprint_block: str,
    implementation_plan_block: str,
    test_plan_block: str,
    industry_pack_block: str,
) -> str:
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in ACCEPTANCE_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材一:调研报告 — 引用用 [R1]】
{research_report_block or '(尚未生成)'}

【素材二:蓝图设计 — 引用用 [B1]】
{blueprint_block or '(尚未生成)'}

【素材三:实施任务清单 — 引用用 [I1]】
{implementation_plan_block or '(尚未生成)'}

【素材四:测试计划 — 引用用 [T1]】
{test_plan_block or '(尚未生成)'}

【素材五:行业最佳实践 — 引用用 [P1]】
{industry_pack_block or '(无)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
每章开头先输出一行分隔标记,例如:
<<<SECTION:exec_summary>>>
然后写该章节正文(不带 H2 标题,直接内容)。
不要在分隔标记前后加任何空行 / 注释。

整篇控制在 6000-10000 字 — 表格密 + 数字硬,客户读完就能签字。
**没数据的地方明确说"无数据,建议下期补"**,不要瞎编。"""


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
    for sec in ACCEPTANCE_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()


def format_test_plan_block(bundle, max_chars: int = 10000) -> str:
    if not bundle:
        return ""
    md = (getattr(bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(bundle, "title", None) or "测试计划"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[T1] {title}**\n{excerpt}"
