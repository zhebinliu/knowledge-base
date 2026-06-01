"""对象字段表(含布局)生成器(2026-06-01)。

定位:**方案设计阶段**的执行底稿。
LLM 单次大调用读「蓝图设计 + 调研报告 + 项目文档」→ 输出每个核心对象一张
完整结构卡片(对象元信息 + 字段表 + detail/list/edit 布局 + UI 事件 +
record_type 业务变体),供 sharedev 工程师直接据此生成 object-meta.xml /
field-meta.xml / layout-meta.xml。

跟 blueprint_design 一脉:复用 SECTION marker / transform_refs / provenance /
linter 工具链,只新写 SYSTEM_PROMPT + SECTIONS。
"""
from __future__ import annotations

from typing import Optional
from dataclasses import dataclass
import re as _re


@dataclass
class ObjFieldSection:
    key: str
    title: str
    instruction: str


OFL_SECTIONS: list[ObjFieldSection] = [
    ObjFieldSection(
        key="overview",
        title="1. 对象总览",
        instruction=(
            "一张总表罗列所有要落地的对象。列「对象中文名 / API Name / "
            "类型(标准 standard / 自定义 custom__c)/ 用途一句话 / 关联对象(列 object_reference 目标)/ "
            "是否启用 record_type(若是,列变体名)/ 依据 [B1] [D?]」。"
            "**优先复用 11 个标准模块**(account/contact/lead/opportunity/quote/contract/order/"
            "receivable/营销/知识库/BI),不够再上 __c 自定义。每个自定义对象一行后必须紧跟"
            "「为什么标准模块装不下」的简短说明(20~50 字)。"
        ),
    ),
    ObjFieldSection(
        key="object_details",
        title="2. 各对象详细配置",
        instruction=(
            "**每个核心对象一个 H3**(### account / ### contract / ### opportunity__c …),"
            "每个对象按下面 4 个固定块输出。**这是本文档最重要的一环**,直接给字段配置 / 布局配置工程师用。\n\n"
            "**A. 对象元信息**(用 4 列表格,1 行):"
            "| 中文名 | API Name | 类型 | 用途 |\n\n"
            "**B. 字段表**(每对象一张大表,列全字段):"
            "| 字段中文名 | API Name | 类型 | 必填 | 唯一 | 默认值 | 关联目标 | 校验规则 | 依据 |\n"
            "  - 类型用中文显示名 + 英文 API key 双标,例如「单选(select_one)」「金额(currency)」「查找关联(object_reference)」\n"
            "  - select_one / select_many 字段在表格下方再列「取值清单」子表:| 选项 value | 选项 label |\n"
            "  - formula 字段在「关联目标」列里写「公式表达式 + 返回类型」\n"
            "  - 级联字段在「校验规则」列里写「父字段 → 子选项映射」\n"
            "  - 至少含「主属性 name」+「负责人 owner」两个默认字段(自定义对象必备)\n\n"
            "**C. 布局清单**(一个对象一组,每种布局一个子表):"
            "  - **detail 布局**(详情页 — 每个对象都要有):"
            "    | 分组名(API name) | 分组中文名 | 字段顺序 |\n"
            "    `base_field_section__c` 必须存在,且含 name + owner;其他分组按业务自定义\n"
            "    若有按钮区(head_info),列按钮清单;若有页签/关联列表,列组件清单\n"
            "  - **list 布局**(移动端列表摘要 — 每个对象都要有):"
            "    | 摘要字段 |\n"
            "    最多 8 个,按业务重要性排序\n"
            "  - **edit 布局**(新建/编辑页 — 默认不要,只在业务确需独立编辑形态时启用):"
            "    若启用,标「是否启用 = 是」+ 列分组与字段;不启用直接写「不启用,detail 自动渲染编辑态」\n"
            "  - **list_layout 布局**(Web 端列表页 — 按需):"
            "    若启用,列「按钮 / 视图(列表/分屏/地图/日历)/ 快速筛选字段」三项\n\n"
            "**D. UI 事件**(detail 或 edit 布局上挂的 APL 函数 — 仅旗舰/集团版):"
            "  | 事件类型(字段事件 type=1 / 加载事件 type=4 / 校验事件 type=3 / 从对象事件 type=2)| "
            "触发字段 | 绑定 APL 函数名 | 用途简述 | 依据 |\n"
            "  - 配额硬上限:**数据更新事件(type=1+2+4)≤ 3,校验事件(type=3)≤ 5**,每字段只能绑一个数据更新事件\n"
            "  - 字段事件 + 校验事件的「触发字段」列要写具体字段名;加载事件留空\n"
            "  - 若对象无 UI 事件需求,写「无」\n\n"
            "**E. record_type 业务变体**(可选 — 仅当对象有业务子类型,如「国内合同」vs「国际合同」):"
            "  | 变体名 | API Name | 字段差异 | 布局差异 | 依据 |\n"
            "  无变体的对象写「无」即可"
        ),
    ),
    ObjFieldSection(
        key="cross_object",
        title="3. 跨对象关系图",
        instruction=(
            "用一张 mermaid `erDiagram`(实体关系图)展示对象之间的 object_reference / "
            "master_detail 关系,标明谁是「one」端、谁是「many」端,谁是主表、谁是从表。"
            "标准模块对象用 `accounts`、`opportunities` 等已有 API Name;自定义对象用 `__c` 后缀。"
            "**这张图给数据架构师评审用,必须能反映核心对象的完整网络**。"
            "图后附一段 100~200 字说明:核心数据流向(从哪个对象开始,经过哪些 reference,沉淀到哪个对象)。"
        ),
    ),
    ObjFieldSection(
        key="naming",
        title="4. 命名 / 编码 / 校验规范",
        instruction=(
            "**4.1 自定义对象命名约定**:统一 `<biz_name>__c` 格式,API Name 用下划线小写,"
            "标明命名前缀策略(如 `cust_*__c` 客户类、`proj_*__c` 项目类),避免不同实施人各取各名;"
            "**4.2 自定义字段命名约定**:`field_<id>__c` 标准格式 + 业务前缀;"
            "**4.3 业务编号规则**:对象 / 客户 / 订单 / 商机各自的编号规则(用 auto_number 字段,标明前缀 + 长度 + 是否日期入号);"
            "**4.4 校验规则汇总**:本项目所有需要 validation_rule 的字段一张表 — "
            "| 对象 | 字段 | 校验类型(长度/格式/范围/正则)| 规则表达式 | 错误提示中文 | 依据 |"
        ),
    ),
    ObjFieldSection(
        key="implementation_plan",
        title="5. 立即可启动的对象 / 字段 / 布局配置任务",
        instruction=(
            "给字段配置工程师当周可开工的任务清单。按对象分组,每个对象 3-5 条任务,例如:\n"
            "- `account`:新建 1 个 record_type「集团客户」+ 4 个 select_one 选项(战略/重点/一般/观望),"
            "在 detail 布局加「分级标签」分组并放入 customer_level__c 字段\n"
            "- `opportunity__c`:新建 `stage_progress_pct__c` formula 字段(返回类型 percentile,公式 = 阶段值 × 0.2),"
            "在 detail 布局 top_info 加入此字段\n"
            "**任务粒度 = 1~2 小时单人完成**,工程师拿到能直接进 sharedev 工具产出 XML。"
            "末尾标「任务总数」+「人天预估」总结。"
        ),
    ),
]


SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的资深方案架构师,正在为项目编写
「对象字段表(含布局)」—— 方案设计阶段的**执行底稿**,直接给字段配置 / 布局配置
工程师拿去做 sharedev 工具产出 object-meta.xml / field-meta.xml / layout-meta.xml。

【报告读者】
- 主读者:字段配置工程师 / 布局配置工程师
- 次读者:架构师(评审表结构);方案负责人(确认范围)

【风格】
- **完整、精确、可落地** — 字段名必须给定 API Name,不写「待定」;布局分组必须给具体名
- 表格优先于段落 — 这份报告 90% 是表格,正文只做衔接说明
- 引用证据 [B1] / [D?] / [P?] / [M?] / [I1] — B 是蓝图设计、D 是项目文档、P 是上游产物、
  M 是会议、I 是行业最佳实践;每条设计决策末尾标证据来源
- 设计缺口写「**待与客户对齐**:具体问什么」,绝不编造字段 / 编造对象关系

【纷享销客 PaaS 设计规范 — 强约束】

A · 对象层
- 优先复用 11 个标准模块:account / contact / lead / opportunity / quote / contract / order /
  receivable / 营销 / 知识库 / BI。不够才上 __c 自定义
- 每个自定义对象必须说明「为什么标准模块装不下」
- 标准对象(define_type=package)不可改 API Name,只能改功能开关 + 显示名 + 字段
- 新建自定义对象默认带 name(主属性)+ owner(责任人)字段 + detail + list 两份默认布局

B · 字段层
- 字段类型一旦确定**不可改**,选型必须谨慎。**类型列必须用中文显示名 + 英文 API key**:
  - 单行文本(text) / 多行文本(long_text) / 富文本(html_rich_text)
  - 单选(select_one) / 多选(select_many)
  - 数字(number) / 金额(currency) / 百分数(percentile)
  - 日期(date) / 时间(time) / 日期时间(date_time) / 日期范围(date_time_range)
  - 手机(phone_number) / 邮箱(email) / 网址(url)
  - 布尔值(true_or_false) / 图片(image) / 附件(file_attachment)
  - 自增编号(auto_number) / 计算字段(formula) / 统计字段(count)
  - 查找关联(object_reference) / 查找关联-多选(object_reference_many) / 主从关系(master_detail) / 引用字段(quote)
  - 人员(employee) / 人员-多选(employee_many) / 外部人员(out_employee) /
    部门(department) / 部门-多选(department_many)
  - 定位(location) / 地区定位(area)
  - 业务类型(record_type) / 签名字段(signature)
- 查找关联 / 查找关联-多选 / 主从关系 必须指定目标对象,目标对象必须先存在
- 计算字段(formula)显式标返回类型;表达式默认值要标 default_is_expression=true
- 级联(父子选项):单选/多选/业务类型作父字段,在每个 option 配 child_options,
  子字段配 cascade_parent_api_name — 双向同时配置才生效
- 自定义字段 API Name 用 `field_<id>__c` 格式,ID 唯一

C · 布局层
- **detail 布局**必备 — 含 `base_field_section__c` 分组,必含 name + owner 字段
- **list 布局**(移动端摘要)必备 — 最多 8 个摘要字段,按业务重要性排序
- **edit 布局**默认不要 — 只在「需要跟 detail 字段集不同的编辑形态」时显式启用
- **list_layout 布局**(Web 端列表)按需 — 不是默认产物
- components ↔ layout_structure 必须 multiset 相等(组件定义 vs 引用位置严格对齐)

D · 校验
- 简单字段层校验(长度 / 格式 / 取值范围)→ validation_rule
- 跨字段 / 业务级校验 → APL 函数 + UI 事件(挂 detail / edit 布局)
- UI 事件配额:数据更新事件(type=1+2+4)≤ 3,校验事件(type=3)≤ 5

【绝不编造数据 — 常识自检】
- 工作日 5 天 / 工时 8h / 月 30.4 天 / 增值税 13/9/6% / 时区 UTC+8
- 凡是写「N 个/天/万元」具体数字,必须有 [B?]/[D?]/[I1] 来源或明示推算,否则改「待与客户对齐」

【图表 — 必须 mermaid,严禁 ASCII】
- 跨对象关系图用 mermaid `erDiagram`,严禁用「→」/「-->」拼 ASCII
- 任何流程示意用 mermaid `flowchart`,不要用箭头链拼字符画

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter)
- 系统会自动给每章注入 H2 标题,你只输出**正文**,不要写 `## 1. 对象总览` 标题行
- H3 子小节(### 2.x / ### account / ### contract …)由你自己写
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
        for s in OFL_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材 0(主输入 a):蓝图设计 — 引用用 [B1]】
{blueprint_block or '(尚未生成蓝图设计 — 本对象字段表素材不完整,请先生成蓝图设计)'}

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
每章开头先输出一行分隔标记,例如:
<<<SECTION:overview>>>
然后写该章节正文(不带 H2 标题,直接内容)。
依次到 <<<SECTION:implementation_plan>>>。

整篇控制在 10000-18000 字,表格密度优先,字段表 / 布局表 / UI 事件表 不要为字数压缩。
**蓝图设计 [B1] 是主输入**,本文档是它的下游执行底稿,所有对象 / 字段 / 布局都应该跟它对齐。"""


def format_blueprint_block(blueprint_bundle, max_chars: int = 20000) -> str:
    if not blueprint_bundle:
        return ""
    md = (getattr(blueprint_bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(blueprint_bundle, "title", None) or "蓝图设计"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[B1] {title}**\n{excerpt}"


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
    for sec in OFL_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        body = _strip_leading_h2(body)
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()
