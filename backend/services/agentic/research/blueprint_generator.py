"""蓝图设计生成器(2026-05-29)。

定位:**方案设计阶段**的核心产物。读「调研报告」+ 项目素材 → 一次 Opus 大调用 → 出蓝图 markdown。

为什么作为独立产物(不是调研报告的章节):
- 调研报告是「调研收尾」面向 PM 的全景输入(需求 / 痛点 / 范围)
- 蓝图设计是「方案设计」面向架构师 / 实施工程师的下一步输出(架构 / 模块 / 流程 / 集成)
- 两者读者不同、章节侧重不同,但**它们之间不需要中间产物了**(用户 2026-05-29 拍板)
- 所以单独成 kind,但生成时把调研报告 bundle 直接作为主输入

跟 research_report 的代码差异:
- sections 完全不同
- 主输入是 research_report bundle(若存在,作为 [B1] 蓝图基线源,优先级最高)
- system prompt 侧重「让架构师 / 实施工程师拿这份蓝图就能下手做对象 / 字段 / 流程配置」

报告 7 个章节:
  1. 设计摘要(从需求到方案的核心映射)
  2. 总体架构(逻辑 / 物理 / 数据流)
  3. 模块化设计(按 LTC 模块拆,每模块的对象 / 关键字段 / 关键流程)
  4. 主数据与对象设计原则
  5. 业务流程与状态机
  6. 集成与数据迁移
  7. 实施节奏与责任划分
"""
from dataclasses import dataclass
from typing import Optional


# ── 章节结构声明 ─────────────────────────────────────────────────────────────

@dataclass
class BlueprintSection:
    key: str
    title: str
    instruction: str


BLUEPRINT_SECTIONS: list[BlueprintSection] = [
    BlueprintSection(
        key="design_summary",
        title="1. 设计摘要",
        instruction=(
            "150-200 字。回答 3 件事:"
            "本方案核心思路一句话(从客户的「需求侧重 + 业务线结构」推出);"
            "技术路线主张(SaaS 标准化 / 半定制 / 重定制,与 SOW 匹配);"
            "实施关键风险与对策(挑 1 个最大的)。"
            "用流畅 2-3 段,不要 bullet。"
        ),
    ),
    BlueprintSection(
        key="overall_architecture",
        title="2. 总体架构",
        instruction=(
            "3 个子小节:"
            "**2.1 逻辑架构**(分层:用户层 / 应用层 / 数据层 / 集成层,标明纷享销客 PaaS 哪些标准模块 + 哪些自定义 + 哪些靠外部系统);"
            "**2.2 数据流向**(以销售 L2C 主流程为例,Lead → Opportunity → Quote → Order → Cash 各节点产生的数据从哪个对象流到哪个对象,哪些靠集成);"
            "**2.3 多组织 / 多业态适配**(如果调研报告第 3 章识别出多业务线,这里给隔离 / 共享方案 — 哪些对象共享、哪些走 BU 隔离、权限怎么切)。"
            "用文字 + 表格,关键节点标证据来源(主要引用调研报告 [B1])。"
        ),
    ),
    BlueprintSection(
        key="module_design",
        title="3. 模块化设计",
        instruction=(
            "这章是给字段配置 / 函数配置 / 流程配置工程师的执行底稿。"
            "按 LTC 模块逐项拆,每个 LTC 模块一个 H3 小节:"
            "### 3.1 模块名(LTC key)"
            "- **覆盖的需求**:列出调研报告第 5 章中归属此模块的 REQ-NNN(前 5 条)"
            "- **使用对象**:纷享销客标准对象 / 需新建的自定义对象,列表加一行说明"
            "- **关键字段**:5-10 个核心字段(字段名 / 类型 / 来源 / 是否必填 / 默认值规则),用表格"
            "- **关键流程**:1-2 个主流程的状态机简述(状态 → 触发条件 → 流转规则)"
            "- **特殊处理**:跟该客户的业务线 / 行业差异(若有)"
            "至少覆盖调研报告里前 5 个高优先级 LTC 模块。模块少时全覆盖。"
            "如果素材里没有足够细节做某模块,明确写「**待与客户对齐字段清单**」而不是凭空编。"
        ),
    ),
    BlueprintSection(
        key="master_data",
        title="4. 主数据与对象设计原则",
        instruction=(
            "**4.1 主数据来源治理**(客户 / 产品 / 区域 / 组织 / 员工 等主数据,各自从哪个系统主推、纷享销客做镜像还是源头);"
            "**4.2 编码规则**(对象编号 / 客户编号 / 订单号 / 商机号的命名规范);"
            "**4.3 数据隔离边界**(多业态客户的数据可见性边界,跟权限设计联动);"
            "**4.4 自定义对象命名约定**(避免后续不同实施人各取各名)。"
            "用表格,每条带「依据」列(引用调研报告 [B1] 哪一章)。"
        ),
    ),
    BlueprintSection(
        key="process_design",
        title="5. 业务流程与状态机",
        instruction=(
            "挑 3-5 个最关键的业务流程,每个流程一个 H3:"
            "### 5.x 流程名(覆盖的 LTC 模块)"
            "- **触发**:谁 / 什么动作触发流程开始"
            "- **状态机**:状态 1 → 状态 2 → ...(标明每次流转的触发条件 + 责任人)"
            "- **审批 / 决策节点**:有几级审批?谁审批?跳过条件?"
            "- **关键派生数据**:该流程跑完会产生哪些下游数据(给报表 / 集成 / 二次流程)"
            "用 mermaid 状态图(```mermaid stateDiagram-v2 ...```)+ 表格补充审批 / 派生数据。"
        ),
    ),
    BlueprintSection(
        key="integration_migration",
        title="6. 集成与数据迁移",
        instruction=(
            "**6.1 集成清单**(跟哪些外部系统集成 — ERP / OA / 财务 / MES / 客户的中台,每个集成的「方向 / 触发 / 数据范围 / 频率 / 失败处理」表格);"
            "**6.2 接口设计原则**(同步 / 异步 / 消息队列 / API / DB 直连 — 选哪种 + 为什么);"
            "**6.3 历史数据迁移**(要迁哪些对象 / 哪些字段 / 数据量级 / 清洗规则 / 验收口径,按对象列表格);"
            "**6.4 切换方案**(灰度上线 / 全量切换 / 双系统并行 — 选哪种 + 切换日 checklist)。"
        ),
    ),
    BlueprintSection(
        key="rollout",
        title="7. 实施节奏与责任划分",
        instruction=(
            "**7.1 实施分期**(Phase 1 MVP / Phase 2 完善 / Phase 3 推广 — 每期的范围 / 周期 / 完成标准。要引用调研报告第 7 章的方案设计建议);"
            "**7.2 关键里程碑**(列 5-7 个 — 蓝图评审 / 字段冻结 / 流程冻结 / UAT 启动 / 上线 / 验收,各带预估时点);"
            "**7.3 责任划分**(用 RACI 表 — 顾问 / PM / 客户 PM / 客户业务 / 客户 IT / 我方实施工程师,横轴是关键交付物,标 R/A/C/I);"
            "**7.4 立即可启动的设计任务**(给字段配置 / 流程配置 / 集成各工程师当周可以开工的具体任务,各列 3-5 条)。"
        ),
    ),
]


# ── Prompt builders ────────────────────────────────────────────────────────

SYSTEM_PROMPT = """你是纷享销客 CRM 实施咨询师的资深方案架构师,正在为项目编写「蓝图设计」——
这是「方案设计」阶段的核心产物,**直接交付给字段配置、流程配置、集成开发工程师做实施的执行底稿**。

【报告读者】
- 主读者:实施工程师团队(字段配置 / 流程配置 / 集成 / 数据)
- 次读者:PM(评估范围与节奏)、架构师(评审方案)、客户 IT(确认对接)

【风格】
- MBB + 实施工程双轨:每段先抛设计决策,再给执行细节
- 表格优先 — 「字段表 / 状态机 / 集成表 / RACI 表」是这份蓝图的主载体,而不是大段文字
- 每个设计决策末尾标证据来源 [B1] [D1] [P1] [M1] [I1]:
   - B = 调研报告(若已生成,是本蓝图的主输入)
   - D = 项目上传文档
   - P = 其他上游产物(insight / survey_outline / survey)
   - M = 会议素材
   - I = 行业最佳实践
- 不写黑话,不写"具备 / 支持 / 实现"这种空泛动词,要写"用 XX 对象的 YY 字段承接,触发 ZZ 流程"
- 设计缺口写「**待与客户对齐**:具体问什么」,绝不编造字段名 / 编造对象关系

【术语统一】
- Owner / owner → 责任人
- Field / field → 字段
- Object / object → 对象
- Status / state → 状态
- Workflow → 流程 / 状态机
- 保留专有缩写:CRM / ERP / SaaS / API / BPM / RACI / MVP / SOW / L2C / KPI

【禁止】
- 禁止 emoji
- 禁止"我们认为 / 建议 / 推荐"这种主观弱表达 — 用「方案为 / 设计为 / 采用」
- 禁止前导句:不要写「以下是...」「接下来...」「我将...」
- 禁止泛泛而谈,要么给字段名 / 对象名 / 状态名 / 接口名 — 要么标「待对齐」

【输出格式】
- 整篇 markdown,纯文本(无 frontmatter 无围栏)
- 系统会自动给每章注入 H2 标题,你只输出**正文**:
   - 不要写 `## 1. 设计摘要` 这种标题行
   - 直接从内容开始
   - 章节之间用一个空行分隔
- H3 子小节(### 2.1 ...)由你自己写
- 表格用 markdown 标准语法
- 状态机用 mermaid stateDiagram-v2 围栏
- 不要写「附录」「参考资料」"""


def build_user_prompt(
    *,
    project_meta: str,
    industry: Optional[str],
    research_report_block: str,
    sources_block: str,
    prior_bundles_block: str,
    meeting_block: str,
    industry_pack_block: str,
) -> str:
    """组装 user message。调研报告作为主输入(优先级最高),其他素材是补充。"""
    sections_brief = "\n".join(
        f"- 【章节标记: {s.key}】{s.title} — {s.instruction}"
        for s in BLUEPRINT_SECTIONS
    )
    return f"""【项目元信息】
{project_meta}
{f'行业:{industry}' if industry else '行业:未指定'}

【素材 0(主输入):调研报告 — 引用用 [B1]】
{research_report_block or '(尚未生成调研报告,本蓝图素材不完整。请在调研报告生成后重新触发本产物。)'}

【素材一(补充):项目文档 — 引用用 [D1] [D2]】
{sources_block or '(没有上传文档)'}

【素材二(补充):其他上游产物 — 引用用 [P1] [P2]】
{prior_bundles_block or '(没有其他上游产物)'}

【素材三(补充):会议素材 — 引用用 [M1]】
{meeting_block or '(本项目暂无完成的会议)'}

【素材四(补充):行业最佳实践 — 引用用 [I1]】
{industry_pack_block or '(无可用的行业 pack)'}

【章节清单(按顺序输出,每章开头用「<<<SECTION:章节标记>>>」分隔)】
{sections_brief}

【输出方式 — 严格遵守】
每章开头先输出一行分隔标记,例如:
<<<SECTION:design_summary>>>
然后写该章节正文(不带 H2 标题,直接内容)。
下一个章节前再写:
<<<SECTION:overall_architecture>>>
依次类推到 <<<SECTION:rollout>>>。

不要在分隔标记前后加任何空行 / 注释 / 解释。

整篇控制在 8000-14000 字 — 表格 + 状态机不要为字数压缩。
**调研报告 [B1] 是主输入**,如果它存在,引用它作为「为什么这样设计」的依据;
如果它缺失,允许在「设计缺口」处标「**待调研报告补足**」并往下尽量推。"""


# ── 素材渲染 ─────────────────────────────────────────────────────────────


def format_research_report_block(research_report_bundle, max_chars: int = 18000) -> str:
    """把调研报告 bundle 渲染成 [B1] 主输入块。"""
    if not research_report_bundle:
        return ""
    md = (getattr(research_report_bundle, "content_md", None) or "").strip()
    if not md:
        return ""
    title = getattr(research_report_bundle, "title", None) or "调研报告"
    excerpt = md[:max_chars]
    if len(md) > max_chars:
        excerpt += f"\n…(余下 {len(md) - max_chars} 字省略)"
    return f"**[B1] {title}**\n{excerpt}"


# ── 结果切分 ─────────────────────────────────────────────────────────────


SECTION_MARKER_PREFIX = "<<<SECTION:"


def assemble_markdown_from_llm_output(llm_raw: str) -> str:
    """LLM 按 <<<SECTION:key>>> 分隔输出,按规范的 H2 标题重新拼成完整 markdown。"""
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
    for sec in BLUEPRINT_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()
