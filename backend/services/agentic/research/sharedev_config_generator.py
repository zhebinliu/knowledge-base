"""单 task → tenant-config 文件内容生成器(2026-05-29)。

每个 task 关联一个 sharedev skill,本模块用 skill 的 SKILL.md + references/ + assets/
作为 LLM system prompt,把 task 描述 + 项目素材作为 user prompt → LLM 输出对应的
xml / Groovy 文件内容。

Phase 2 MVP 支持 5 个配置类 skill:
- sharedev-object → tenant-config/objects/<X>/<X>.object-meta.xml
- sharedev-field  → tenant-config/objects/<X>/fields/<Y>.field-meta.xml
- sharedev-validation-rule → tenant-config/objects/<X>/validation-rules/<Y>.validation-rule-meta.xml
- sharedev-layout → tenant-config/objects/<X>/layouts/<Y>.layout-meta.xml
- sharedev-layout-rule → tenant-config/objects/<X>/layout-rules/<Y>.layout-rule-meta.xml

APL/PWC 留 Phase 3(代码类产物要单独的 prompt 工程 + 评审环节)。
"""
from __future__ import annotations

import re
from typing import Optional

import structlog

logger = structlog.get_logger()


# skill → 输出路径模板。占位符:{object} 替换 task.object_api_name,{api} 替换 task.api_name
OUTPUT_PATH_TEMPLATES: dict[str, str] = {
    "sharedev-object": "tenant-config/objects/{object}/{object}.object-meta.xml",
    "sharedev-field": "tenant-config/objects/{object}/fields/{api}.field-meta.xml",
    "sharedev-validation-rule": "tenant-config/objects/{object}/validation-rules/{api}.validation-rule-meta.xml",
    "sharedev-layout": "tenant-config/objects/{object}/layouts/{api}.layout-meta.xml",
    "sharedev-layout-rule": "tenant-config/objects/{object}/layout-rules/{api}.layout-rule-meta.xml",
}


SKILLS_AVAILABLE: set[str] = set(OUTPUT_PATH_TEMPLATES.keys())


# 通用约束 — 加到 sharedev 自家 SKILL.md 之后,告诉 LLM 改"agent 工作模式"为"直接输出 xml"
GENERATOR_GLUE_PROMPT = """

---

# 当前调用上下文(KB System 项目实施工作台)

你不是在交互式 IDE 里面对话,而是在 **KB System 项目实施工作台**里被调用做单次「文件内容生成」。
以下规则覆盖上面 sharedev skill 原文里"跟用户交互""trace 埋点""读 tenant-config 目录"等
不适用于本上下文的指令:

1. **不要执行 sharedev trace 命令** — 你不在终端环境,trace 跳过。
2. **不要要求用户进一步确认 / 提问** — 项目实施工作台已经一次性给齐 task 上下文,
   你直接按上下文生成 xml,不要追问。
3. **不要假设本地有 tenant-config/ 目录** — KB 后端会替你管理输出路径。
4. **HARD-GATE 中关于"先读已存在对象/字段"的约束** — KB 已经在 user message 里提供了
   该项目已生成的其他 task 配置上下文。你假设它们是"已存在"参考即可。如果上下文里没
   提到冲突字段,就当作 API Name 不冲突。
5. **关于命名规范** — 严格按 SKILL.md / references/naming-conventions.md 校验 task 给的
   apiName(`__c` 后缀等),不符合规范时**仍尝试生成**但在 xml 头部 `<!-- ... -->` 注释
   里写明合规问题。

# 输出格式 — 严格遵守

直接输出**单个完整 xml 文件**,从 `<?xml version="1.0" encoding="UTF-8"?>` 开始,到对应
根元素闭合结束。

- 禁止 markdown 围栏(```xml ... ```)
- 禁止前后加任何解释 / 问候语 / 元描述
- 禁止"以下是生成的 xml:"这种引导句
- 禁止在 xml 之外输出 markdown / json / 任何其他东西

xml 内部:
- `<content>` 标签内的 JSON 必须是合法 JSON(可压一行或缩进,但必须能 JSON.parse)
- `<status>` 标签按 task 上下文判断:新建 = `new`,修改已有 = `modified`,本工具不会
  跑 `unchanged` 路径
- 模板里 {{XXX}} 这种占位符必须全部替换成实际值,不允许遗留
"""


def _resolve_path(skill: str, object_api_name: Optional[str], api_name: Optional[str]) -> str:
    template = OUTPUT_PATH_TEMPLATES[skill]
    obj = object_api_name or "UnknownObject"
    api = api_name or "unknown"
    return template.format(object=obj, api=api)


def _extract_xml(raw: str) -> str:
    """从 LLM 输出里抽出 xml 内容。容错:有 markdown 围栏就剥掉,有引导句就裁掉。"""
    s = (raw or "").strip()
    if not s:
        return ""

    # 1) 剥 markdown 围栏
    if s.startswith("```"):
        # ```xml\n...\n``` 或 ```\n...\n```
        first_nl = s.find("\n")
        if first_nl > 0:
            s = s[first_nl + 1:]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
        s = s.strip()

    # 2) 找 <?xml 起点,丢前面引导句
    m = re.search(r"<\?xml\s+version", s)
    if m:
        s = s[m.start():]

    # 3) 找最后一个闭合根标签,丢后面解释句(只裁尾,不裁前)
    # 常见根标签:Object / ObjectField / ValidationRule / Layout / LayoutRule
    for tag in ("Object", "ObjectField", "ValidationRule", "Layout", "LayoutRule"):
        close = f"</{tag}>"
        idx = s.rfind(close)
        if idx >= 0:
            s = s[:idx + len(close)]
            break

    return s.strip()


def build_user_prompt(
    *,
    task: dict,
    project_meta: str,
    research_report_excerpt: str,
    blueprint_excerpt: str,
    other_tasks_context: str,
) -> str:
    """构造单 task 生成的 user prompt。"""
    return f"""【项目元信息】
{project_meta}

【当前任务】
task_id:        {task.get('task_id', '?')}
sharedev_skill: {task.get('sharedev_skill', '?')}
对象 apiName:   {task.get('object_api_name') or '(未指定)'}
字段/规则/布局 apiName: {task.get('api_name') or '(未指定)'}
优先级:         {task.get('priority', 'P2')}
LTC 模块:       {task.get('ltc_module') or '(未指定)'}
来源需求:       {', '.join(task.get('req_ids') or []) or '(未关联)'}

【任务描述】
{task.get('description', '(无)')}

【上游素材(节选,作为业务上下文,用于推断字段含义 / 默认值 / 校验逻辑)】

调研报告节选:
{research_report_excerpt or '(无)'}

蓝图设计节选:
{blueprint_excerpt or '(无)'}

【同项目已生成的其他 task 配置(作为 API Name 冲突检查参考)】
{other_tasks_context or '(本项目尚未生成其他 task 配置)'}

【输出要求】
1. 严格按上方 sharedev skill 的方法论 + assets 模板生成 xml
2. 只输出 xml,不要任何其他文字
3. 模板里 {{XXX}} 占位符必须全部填好,不能遗留
4. xml 必须可被 sharedev push 直接接受(标准 sharedev metadata 格式)"""


async def generate_config_for_task(
    *,
    task: dict,
    project_meta: str,
    research_report_excerpt: str = "",
    blueprint_excerpt: str = "",
    other_tasks_context: str = "",
    model: Optional[str] = None,
) -> dict:
    """对单个 task 生成 tenant-config 文件内容。

    Returns:
        {
          "ok": bool,
          "file_path": str,           # tenant-config/objects/.../X.field-meta.xml
          "file_content": str,        # 完整 xml 字符串
          "raw_chars": int,           # LLM 原始输出长度
          "error": str | None,
        }
    """
    skill = (task.get("sharedev_skill") or "").strip()
    if skill not in SKILLS_AVAILABLE:
        return {
            "ok": False,
            "file_path": None,
            "file_content": None,
            "raw_chars": 0,
            "error": f"skill {skill!r} 暂未上线配置生成(Phase 2 仅 5 个配置类 skill,APL/PWC 留 Phase 3)",
        }

    # 加载 skill 包(SKILL.md + references + assets)
    from services.sharedev.skill_loader import load_skill_prompt
    try:
        skill_prompt = load_skill_prompt(skill)
    except FileNotFoundError as e:
        return {"ok": False, "file_path": None, "file_content": None, "raw_chars": 0, "error": str(e)}

    system_prompt = skill_prompt + GENERATOR_GLUE_PROMPT
    user_prompt = build_user_prompt(
        task=task,
        project_meta=project_meta,
        research_report_excerpt=research_report_excerpt[:6000],
        blueprint_excerpt=blueprint_excerpt[:6000],
        other_tasks_context=other_tasks_context[:4000],
    )

    from services.output_service import _llm_call
    try:
        raw = await _llm_call(
            user_prompt, system=system_prompt, model=model,
            max_tokens=8000, timeout=300.0,
        )
    except Exception as e:
        logger.warning("sharedev_config_llm_failed", skill=skill, error=str(e)[:200])
        return {"ok": False, "file_path": None, "file_content": None, "raw_chars": 0, "error": f"LLM 调用失败: {e}"}

    xml = _extract_xml(raw)
    if not xml or not xml.startswith("<?xml"):
        return {
            "ok": False,
            "file_path": None,
            "file_content": None,
            "raw_chars": len(raw or ""),
            "error": f"LLM 输出不是合法 xml(前 200 字符: {(raw or '')[:200]})",
        }

    file_path = _resolve_path(skill, task.get("object_api_name"), task.get("api_name"))

    logger.info("sharedev_config_generated", skill=skill, task_id=task.get("task_id"),
                file_path=file_path, xml_chars=len(xml))
    return {
        "ok": True,
        "file_path": file_path,
        "file_content": xml,
        "raw_chars": len(raw or ""),
        "error": None,
    }
