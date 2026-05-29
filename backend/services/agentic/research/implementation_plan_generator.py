"""项目实施任务清单生成器(2026-05-29)。

定位:**项目实施阶段**的入口产物。读「调研报告」+「蓝图设计」+ 客户租户元数据(若已导入)→
一次 Opus 大调用 → 输出「实施任务清单」:
- markdown 概览(给 PM 看任务分布)
- 结构化 tasks JSON(给前端工作台分组渲染 + 给后续 sharedev_config_generator 用)

每条 task 都关联一个 sharedev skill,后续在 ImplementationWorkspace 里点 task → 触发对应 skill 的 LLM 生成对应 xml / Groovy。

跟 research_report / blueprint_design 一脉:**不走 v2 planner-critic-challenger**,
单次大调用即可。但 tasks 数组保存到 bundle.extra 而不是放在 markdown 里,因为后续每条
task 要独立"生成配置"操作。
"""
from dataclasses import dataclass
from typing import Optional


# 17 个 sharedev skill 的 id(校验用)
KNOWN_SHAREDEV_SKILLS = {
    "sharedev-auto",
    "sharedev-object", "sharedev-field", "sharedev-validation-rule",
    "sharedev-layout", "sharedev-layout-rule",
    "sharedev-apl-implement", "sharedev-apl-lite", "sharedev-apl-code-review",
    "sharedev-pwc", "sharedev-pwc-write-prd-spec", "sharedev-pwc-write-arch",
    "sharedev-pwc-write-plans", "sharedev-pwc-execute-plans",
    "sharedev-pwc-subagent-driven-development",
    "sharedev-pwc-finish-development", "sharedev-pwc-review-code", "sharedev-pwc-fix-bug",
}

VALID_PRIORITIES = {"P0", "P1", "P2", "P3"}


@dataclass
class TaskSection:
    key: str
    title: str
    instruction: str


# 输出 markdown 的 5 章
PLAN_SECTIONS: list[TaskSection] = [
    TaskSection(
        key="exec_summary",
        title="1. 实施摘要",
        instruction=(
            "100-150 字。回答:本项目实施总任务数、按 sharedev skill 类型分布(配置类 / APL / PWC 各多少)、"
            "P0 任务集中在哪些 LTC 模块、关键风险与依赖。流畅 2 段。"
        ),
    ),
    TaskSection(
        key="task_distribution",
        title="2. 任务分布概览",
        instruction=(
            "表格,按 sharedev skill 分组统计任务数和优先级:"
            "| sharedev skill | 任务数 | P0 | P1 | P2 | P3 | 关联 LTC 模块 |"
            "每个 skill 一行(只列出实际有任务的)。"
        ),
    ),
    TaskSection(
        key="critical_path",
        title="3. 关键路径与依赖",
        instruction=(
            "**3.1 实施顺序建议**(用 mermaid stateDiagram 或简单文字图,标明 task 之间的依赖 — "
            "比如对象先建,字段后建,APL/PWC 依赖字段);"
            "**3.2 跨任务依赖**(列 5-10 个关键依赖,每行:依赖方 → 被依赖方 → 依赖原因);"
            "**3.3 客户租户准备工作**(部署前需要客户 IT 做的事 — 权限授予 / 沙箱启用 / 测试账号等)。"
        ),
    ),
    TaskSection(
        key="rollout_phases",
        title="4. 分批实施计划",
        instruction=(
            "**4.1 第一批 (Sprint 1)**:列 P0 + 部分 P1 任务,目标"
            "「打通主流程闭环」(从 Lead 到 Order)。给出预估工时 + 责任人建议;"
            "**4.2 第二批 (Sprint 2)**:剩余 P1 + 部分 P2,目标「完善细节 + 集成」;"
            "**4.3 第三批 (Sprint 3+)**:P2 / P3,目标「精修 + 上线准备」;"
            "**4.4 验收里程碑**:每批结束时的验收清单(对客户 / 对我方)。"
        ),
    ),
    TaskSection(
        key="risk_mitigation",
        title="5. 实施风险与对策",
        instruction=(
            "表格列 5-10 条具体实施风险(不是范围风险,聚焦执行层面 — "
            "如「APL 函数性能可能影响列表加载」「PWC 组件跟客户主题色冲突」「字段迁移可能数据丢失」),"
            "每条标:风险描述 → 影响等级 → 触发条件 → 缓解措施 → 监控指标。"
        ),
    ),
]


# tasks JSON schema 的描述(给 LLM 看)
TASKS_SCHEMA_INSTRUCTION = """除了 markdown 章节外,严格输出一段 JSON 数组(tasks),用 <<<TASKS_JSON_START>>> 和
<<<TASKS_JSON_END>>> 包起来。schema:

[
  {
    "task_id": "TASK-001",         // 连续编号
    "req_ids": ["REQ-001"],        // 来自调研报告第 5 章的需求清单 REQ-NNN(若证据里能对得上)
    "sharedev_skill": "sharedev-field",  // 必须是这 17 个之一:
                                          // sharedev-object / sharedev-field / sharedev-validation-rule /
                                          // sharedev-layout / sharedev-layout-rule /
                                          // sharedev-apl-implement / sharedev-apl-lite / sharedev-apl-code-review /
                                          // sharedev-pwc / sharedev-pwc-write-prd-spec / sharedev-pwc-write-arch /
                                          // sharedev-pwc-write-plans / sharedev-pwc-execute-plans /
                                          // sharedev-pwc-subagent-driven-development /
                                          // sharedev-pwc-finish-development / sharedev-pwc-review-code /
                                          // sharedev-pwc-fix-bug
    "object_api_name": "AccountObj",    // 关联对象(可为 null,如 APL 通用函数)
    "api_name": "industry_segment__c",  // 字段 / 规则 / 布局的 apiName(可为 null,如 PWC 整组件)
    "description": "客户行业细分枚举字段...",  // ≤ 60 字
    "depends_on": ["TASK-002"],     // 依赖的其他 task_id(可空)
    "priority": "P0",                 // P0/P1/P2/P3
    "ltc_module": "M02_opportunity",  // 来自蓝图第 3 章的 LTC 模块 key
    "estimated_hours": 2              // 预估工时
  },
  ...
]

**约束**:
1. 至少 15 条,通常 30-80 条
2. task_id 连续不跳号
3. sharedev_skill 必须是上面 17 个之一,**不要瞎编**
4. 配置类任务(object/field/validation/layout/layout-rule)每个对象/字段一条
5. APL / PWC 任务每个独立函数 / 组件一条
6. 已经明确不需要的(SOW 排除的)就不要写进任务清单
7. depends_on 用于:对象建完才能建字段 / 字段建完才能写 APL / 等等"""


SYSTEM_PROMPT = """你是纷享销客 CRM 实施工程经理,正在为项目编写「实施任务清单」——
这是**项目实施阶段**的入口产物,核心是把蓝图设计拆成顾问 / 实施工程师可逐条执行的
原子任务,每条任务都关联一个 sharedev skill(纷享自家的 17 个 CRM 实施技能包)。

【报告读者】
- 主读者:项目经理(PM)、实施工程师团队
- 次读者:顾问(确认哪些任务由顾问驱动 vs 工程师驱动)

【sharedev skill 体系简介】
17 个 skill 分 4 组:
- 配置类(5):sharedev-object / sharedev-field / sharedev-validation-rule / sharedev-layout / sharedev-layout-rule
- APL(3):sharedev-apl-implement / sharedev-apl-lite / sharedev-apl-code-review
- PWC(9):sharedev-pwc + 8 个子链(write-prd-spec / write-arch / write-plans / execute-plans / subagent-driven-development / finish-development / review-code / fix-bug)
- 元(1):sharedev-auto(智能编排)

每条任务关联其中一个 skill,后续会用这个 skill 的方法论 + 模板 → 生成对应的
xml / Groovy / PWC source 文件 → 推到客户租户。

【风格】
- MBB 风格,每段先抛结论后给细节
- 表格优先,bullet 次之,段落最少
- 每条任务的"描述"字段 ≤ 60 字,聚焦"做什么"而非"为什么"
- 任务粒度足够细,**实施工程师拿到一条就能上手做**:不要写"配置 CRM"这种大颗粒,要写"AccountObj 加 industry_segment__c 字段(单选枚举,5 个选项)"
- 不写黑话(赋能 / 闭环 / 中台)

【术语统一】
- Owner / owner → 责任人
- Field / field → 字段
- Object / object → 对象
- Workflow → 流程
- 保留专有缩写:CRM / API / APL / PWC / xml / Groovy / Object / Field

【禁止】
- 禁止 emoji
- 禁止"我们认为 / 建议"等弱表达,直接写"任务为 / 实施为"
- 禁止前导句
- 禁止 sharedev_skill 字段瞎写不存在的值

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter)
- 系统会自动给每章注入 H2 标题,你只输出**正文**:
  - 不要写 `## 1. 实施摘要` 这种标题行
  - 直接从内容开始
  - 章节之间用 <<<SECTION:exec_summary>>> 这种标记分隔
- markdown 章节之后,在最末尾输出 <<<TASKS_JSON_START>>>...<<<TASKS_JSON_END>>> 包裹的 JSON 数组(tasks)
- 严格 JSON,不要 markdown 围栏,不要尾随逗号"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    research_report_block: str,
    blueprint_block: str,
    tenant_metadata_block: str,
    industry_pack_block: str,
) -> str:
    """组装 user message。调研报告 + 蓝图作为主输入(优先级最高),其他素材是补充。"""
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in PLAN_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材 0(主输入 a):调研报告 — 引用用 [R1]】
{research_report_block or '(尚未生成调研报告。本任务清单基础不完整,建议先生成调研报告。)'}

【素材 0(主输入 b):蓝图设计 — 引用用 [B1]】
{blueprint_block or '(尚未生成蓝图设计。本任务清单基础不完整,建议先生成蓝图设计。)'}

【素材 1:客户租户当前元数据(若已导入)— 引用用 [T1]】
{tenant_metadata_block or '(未导入客户租户元数据。任务清单按 SOW + 蓝图全量推导,会包含部分已存在的对象/字段需求,实施时核对客户租户现状再决定 new / migrate / skip。)'}

【素材 2:行业最佳实践 — 引用用 [I1]】
{industry_pack_block or '(无可用的行业 pack)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
1. 先按顺序输出 5 个章节,每章开头用 <<<SECTION:key>>> 分隔
2. 5 章 markdown 完成后,输出 <<<TASKS_JSON_START>>>
3. 中间紧跟严格 JSON 数组(tasks 列表)
4. 然后输出 <<<TASKS_JSON_END>>>

{TASKS_SCHEMA_INSTRUCTION}

markdown 整篇 3000-5000 字。tasks JSON 总数 15-80 条,不要为压字数砍任务。"""


# ── 素材渲染 ─────────────────────────────────────────────────────────────


def format_research_report_block(bundle, max_chars: int = 16000) -> str:
    if not bundle:
        return ""
    md = (getattr(bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(bundle, "title", None) or "调研报告"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[R1] {title}**\n{excerpt}"


def format_blueprint_block(bundle, max_chars: int = 16000) -> str:
    if not bundle:
        return ""
    md = (getattr(bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(bundle, "title", None) or "蓝图设计"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[B1] {title}**\n{excerpt}"


# ── 结果切分 ─────────────────────────────────────────────────────────────


SECTION_MARKER_PREFIX = "<<<SECTION:"
TASKS_START = "<<<TASKS_JSON_START>>>"
TASKS_END = "<<<TASKS_JSON_END>>>"


def split_llm_output(llm_raw: str) -> tuple[str, list[dict]]:
    """从 LLM 输出里切出 markdown(按 SECTION 标记)+ tasks JSON。

    返回 (assembled_markdown, tasks_list)。tasks 解析失败返回空 list。
    """
    import json

    raw = (llm_raw or "").strip()

    # 1) 切 markdown / tasks
    tasks_block = ""
    md_part = raw
    start_idx = raw.find(TASKS_START)
    end_idx = raw.find(TASKS_END)
    if start_idx >= 0 and end_idx > start_idx:
        md_part = raw[:start_idx].strip()
        tasks_block = raw[start_idx + len(TASKS_START):end_idx].strip()

    # 2) 按 SECTION 切章 + 重组
    chunks: dict[str, str] = {}
    cur_key: Optional[str] = None
    cur_buf: list[str] = []
    for line in md_part.splitlines():
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

    assembled: list[str] = []
    for sec in PLAN_SECTIONS:
        assembled.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        if body:
            assembled.append(body)
        else:
            assembled.append("_(本章节未生成,建议重试 / 联系管理员)_")
        assembled.append("")
    markdown = "\n".join(assembled).strip()

    # 3) 解析 tasks
    tasks: list[dict] = []
    if tasks_block:
        # 容错:去掉可能的 markdown 围栏
        cleaned = tasks_block
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
        try:
            parsed = json.loads(cleaned)
        except Exception:
            # 二次容错:抓 [...] 部分
            i, j = cleaned.find("["), cleaned.rfind("]")
            if 0 <= i < j:
                try:
                    parsed = json.loads(cleaned[i:j+1])
                except Exception:
                    parsed = []
            else:
                parsed = []
        if isinstance(parsed, list):
            tasks = _validate_tasks(parsed)

    return markdown, tasks


def _validate_tasks(raw_tasks: list) -> list[dict]:
    """清洗 LLM 输出的 tasks 数组,过滤掉非法项 + 加默认值。"""
    out: list[dict] = []
    seen_ids: set[str] = set()
    for idx, t in enumerate(raw_tasks, 1):
        if not isinstance(t, dict):
            continue
        task_id = str(t.get("task_id") or "").strip()
        if not task_id:
            task_id = f"TASK-{idx:03d}"
        if task_id in seen_ids:
            continue
        seen_ids.add(task_id)

        skill = (t.get("sharedev_skill") or "").strip()
        if skill not in KNOWN_SHAREDEV_SKILLS:
            # 不在白名单的 skill 丢弃整条任务(避免下游崩)
            continue

        priority = (t.get("priority") or "P2").strip().upper()
        if priority not in VALID_PRIORITIES:
            priority = "P2"

        out.append({
            "task_id": task_id,
            "req_ids": [str(r) for r in (t.get("req_ids") or []) if r],
            "sharedev_skill": skill,
            "object_api_name": (t.get("object_api_name") or "").strip() or None,
            "api_name": (t.get("api_name") or "").strip() or None,
            "description": (t.get("description") or "")[:200],
            "depends_on": [str(d) for d in (t.get("depends_on") or []) if d],
            "priority": priority,
            "ltc_module": (t.get("ltc_module") or "").strip() or None,
            "estimated_hours": int(t.get("estimated_hours") or 1),
            # 状态初始化(后续 generate-config 会改成 configured / deployed)
            "status": "pending_config",
        })
    return out
