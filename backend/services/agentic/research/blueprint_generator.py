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
            "**4.4 对象清单**(SYSTEM PROMPT 里 A 段规范):"
            "  - 列一张总表 — 列「对象中文名 / API Name / 标准 or 自定义(custom__c) / 用途 / 跟哪些对象有 object_reference 关系」"
            "  - 优先复用 11 个标准模块,自定义对象必须各写一行「为什么标准模块装不下」"
            "**4.5 关键字段表**(每个核心对象一张表,**这是蓝图最重要的一环**):"
            "  - 列「字段名 / API Name(field_<id>__c) / 类型(必须用中文显示名,例如「单选(select_one)」「金额(currency)」「查找关联(object_reference)」) / "
            "    必填 / 唯一 / 默认值 / 关联目标对象(若查找关联) / 校验规则(若有) / 依据 [B?]」"
            "  - select 类字段列出取值清单;formula 字段写表达式 + 返回类型;级联字段标父子映射"
            "  - 不能写「需补充」「待定」 — 要写出字段名或者写「**待与客户对齐**:具体问什么」"
            "用表格,每条带「依据」列(引用调研报告 [B1] / 文档 [D?] 哪一章)。"
        ),
    ),
    BlueprintSection(
        key="process_design",
        title="5. 业务流程与状态机",
        instruction=(
            "挑 3-5 个最关键的业务流程,每个流程一个 H3:"
            "### 5.x 流程名(覆盖的 LTC 模块)"
            "- **承载对象**:用哪个对象做主表(必须是第 4 章里的);驱动状态的关键字段(通常是 select_one 或 record_type)"
            "- **触发**:谁 / 什么动作触发流程开始"
            "- **状态机**:状态 1 → 状态 2 → ...(标明每次流转的触发条件 + 责任人 + 写哪些字段);"
            "  状态枚举值就是上面 select_one 字段的选项"
            "- **业务变体**:是否需要用 record_type 区分子类型(如国内 vs 国际)— 各分支字段差异 + 布局差异"
            "- **审批 / 决策节点**:几级审批?谁审批?走 BPM 还是 approval?跳过条件?"
            "- **跨对象联动**:状态切换是否触发派生(如商机→合同自动带字段)— 列源/目标字段映射"
            "- **校验**:状态切换前置条件 — 哪些字段必须满足条件才能切换(走 APL 函数 + UI 事件,记得标 ≤3 数据更新事件 / ≤5 校验事件配额)"
            "- **关键派生数据**:该流程跑完会产生哪些下游数据(给报表 / 集成 / 二次流程)"
            "用 mermaid 状态图(```mermaid stateDiagram-v2 ...```)+ 表格补充字段映射 / 审批 / 派生数据。"
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

【绝不编造数据 — 常识自检清单】
凡是出现下列数字 / 单位,写之前在脑里过一遍是否符合常识:
- 一周工作日 = 5 天(周一~周五),不是 7;周报覆盖周一~周日 5 个工作日的工作记录
- 一年工作日 ≈ 240 天(扣周末 + 法定假),不是 365
- 标准工时 = 8 小时 / 天(中国 996 不是法定),不是 12
- 月平均 30.4 天,季度 91 天,半年 182 天
- 中国法定增值税率 13% / 9% / 6%(2026 现行),企业所得税 25%
- 时区:中国统一 UTC+8
- 公司组织层级:集团 → 股份 → 子公司 → 事业部 → 部门(不要凭空多套一层)

凡是写「N 个/天/人/万元」之类**具体数字**,必须满足以下之一:
1. 这个数字在调研报告 [B1] / 文档 [D?] / 会议 [M?] 里**白纸黑字写过** — 引用对应来源
2. 行业最佳实践 [I1] 里的通用经验值 — 标 [I1] 来源
3. 自己合理推算 — 写明"按 X 假设推算"
4. 否则**不写具体数字**,改成「待与客户对齐:数量级 / 频率 / 规模」

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
- 不要写「附录」「参考资料」

【图表 — 必须 mermaid,严禁 ASCII】
**任何流程图 / 状态机 / 顺序图 / 时序图 / 节点关系图,必须用 mermaid 代码块画,
绝不允许用「→」/「⇒」/「-->」/「箭头」/「方框」拼 ASCII**。
ASCII 流程图前端渲染不出来 — 用户看到的是一堆纯文本,体验极差。

mermaid 围栏:
```mermaid
<语法>
```

具体语法对照:

1. **线性 / 多分支流程** → 用 `flowchart LR`(横排,推荐)或 `flowchart TB`(纵排)
   示例 — Lead 到 Receivable 的 L2C 主流程:
   ```mermaid
   flowchart LR
       Lead[Lead 线索] --> Opp[Opportunity 商机]
       Opp --> Quote[Quote 报价]
       Quote --> Contract[Contract 合同]
       Contract --> Order[Order 订单]
       Order --> Receivable[Receivable 应收]
   ```

2. **状态机**(对象生命周期 / 审批流转 / 应收账款状态) → 用 `stateDiagram-v2`
   示例 — 应收状态机:
   ```mermaid
   stateDiagram-v2
       [*] --> 正常
       正常 --> 逾期: 超期 1 天
       逾期 --> 催收中: 进入催收
       催收中 --> 已核销: 客户付款
       催收中 --> 已坏账: 超 30 天触发 OA 审批
       已核销 --> [*]
       已坏账 --> [*]
   ```

3. **跨角色顺序 / 接口时序** → 用 `sequenceDiagram`
   示例 — 合同推送 ERP:
   ```mermaid
   sequenceDiagram
       客户 ->> 销售: 签合同
       销售 ->> CRM: 创建合同
       CRM ->> OA: 推送审批
       OA -->> CRM: 审批结果
       CRM ->> ERP: 同步合同
   ```

**自检**:写完报告再扫一遍,凡是用「→」/「-->」/「⇒」拼起来的"流程图"
全部改成对应的 mermaid 代码块。**违反此规则视为输出不合规**。

【纷享销客 PaaS 设计规范 — 写第 3/4/5 章必须遵循】

A · 对象层
- **优先复用 11 个标准模块**:客户(account) / 联系人(contact) / 线索(lead) / 商机(opportunity) /
  报价(quote) / 合同(contract) / 订单(order) / 应收(receivable) / 营销活动 / 知识库 / BI 报表。
  不够再上自定义对象(API Name 用 `<name>__c` 后缀)
- 每加一个**自定义对象**都要在第 4 章写明:**为什么标准模块装不下** + 跟哪个标准对象的 object_reference 关系
- **标准对象**(`define_type=package`)只能改功能开关 + 显示名 + 字段,**不可改 API Name**;
  自定义对象(`define_type=custom`)完全可定制
- 新建自定义对象默认带 `name`(主属性)+ `owner`(责任人)字段 + `detail`(详情)+ `list`(移动端摘要)布局

B · 字段层
- 字段类型一旦确定**不可改**,选型必须谨慎。**字段表里的「类型」列必须写中文显示名**,
  可在中文后用括号注英文 API key,例如 `单选(select_one)` `金额(currency)` `查找关联(object_reference)`。
- 类型清单(中文 · API key,以平台实际显示为准):
  - 文本类:单行文本(text) / 多行文本(long_text) / 富文本(html_rich_text)
  - 选项类:单选(select_one) / 多选(select_many)
  - 数值类:数字(number) / 金额(currency) / 百分数(percentile)
  - 时间类:日期(date) / 时间(time) / 日期时间(date_time) / 日期范围(date_time_range)
  - 联系方式:手机(phone_number) / 邮箱(email) / 网址(url)
  - 布尔 / 文件:布尔值(true_or_false) / 图片(image) / 附件(file_attachment)
  - 系统 / 计算:自增编号(auto_number) / 计算字段(formula) / 统计字段(count)
  - 关联:查找关联(object_reference) / 查找关联-多选(object_reference_many) / 主从关系(master_detail) / 引用字段(quote)
  - 组织:人员(employee) / 人员-多选(employee_many) / 外部人员(out_employee) / 部门(department) / 部门-多选(department_many)
  - 地理:定位(location) / 地区定位(area)
  - 业务:业务类型(record_type) / 签名字段(signature)
- **查找关联 / 查找关联-多选 / 主从关系** 必须指定目标对象,目标对象必须先存在
- **计算字段(formula)** 显式标返回类型;**表达式默认值** 要标 `default_is_expression=true`,
  普通字面量默认值则 `default_is_expression=false`
- **级联(父子选项)**:单选/多选/业务类型作父字段,在每个 option 配 `child_options`;
  子字段(单选/多选)配 `cascade_parent_api_name` — 双向同时配置才生效
- 自定义字段 API Name 用 `field_<id>__c` 格式,ID 唯一

C · 校验
- 简单字段层校验(长度 / 格式 / 取值范围)→ validation_rule(校验规则)
- 跨字段 / 业务级校验(如金额 ≥ 0、合同结束日 ≥ 开始日、商机阶段切换前置条件)
  → APL 函数 + UI 事件(挂 detail / edit 布局)
- UI 事件配额硬上限:**数据更新事件(type=1+2+4)≤ 3,校验事件(type=3)≤ 5**,
  每字段只能绑一个数据更新事件

D · 流程
- **同一对象的业务变体** → 用 record_type(如「国内合同」vs「国际合同」走不同字段集 + 不同布局)
- **商机 / 报价 / 订单的阶段流转** → 用 stage_component 做阶段可视化
- **审批 / 工作流** → 走 BPM 或 approval,在 detail 布局挂 bpm_component / approval_component
- **跨对象联动**(如商机转合同自动带字段)→ 写明源对象→目标对象的字段映射"""


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

# LLM 偶尔把 marker 漂成 <<SECTION:..>> / <SECTION:..>>> 等变体 — 宽容匹配。
import re as _re
_SECTION_MARKER_RE = _re.compile(r"^<+\s*SECTION\s*:\s*([A-Za-z_][\w]*)\s*>+$")


# 蓝图 / 调研报告引用占用 module_key="blueprint",前端 CitedReportView 按
# `#cite-blueprint-D1` 这种 link 渲染成可点击的引用 chip。lastIndexOf('-') 切
# moduleKey 和 refId,所以 moduleKey 中不能含 -。
PROVENANCE_MODULE_KEY = "blueprint"

# 引用编号格式:[B1] / [D1] / [P1] / [M1] / [I1] / [R1](调研报告答案,blueprint 暂不用)。
# 单字母 + 1~3 位数字。
_REF_RE = _re.compile(r"\[([BDPMIR]\d{1,3})\]")


def transform_refs_to_links(md: str, module_key: str = PROVENANCE_MODULE_KEY) -> str:
    """把 [B1] [D2] 这种引用占位转成 markdown link `[B1](#cite-blueprint-B1)`,
    前端 CitedReportView 识别 #cite- 前缀渲染成可点击 CitationChip。
    """
    if not md:
        return md
    return _REF_RE.sub(
        lambda m: f"[{m.group(1)}](#cite-{module_key}-{m.group(1)})",
        md,
    )


LINTER_SYSTEM_PROMPT = """你是 markdown 输出审校器。

你**只做一件事**:把报告里用「→」/「-->」/「⇒」/「==>」拼的 ASCII 流程,
**全部**转成 mermaid 代码块。其他什么都不改。

【保留不动 — 一字不改】
- 表格(| ... |)正文 — 表格 cell 内部即使有 → 也不动(那是组织层级 / 字段说明)
- bullet 列表、章节标题(##)
- 引用 chip(形如 `[B1](#cite-blueprint-B1)` 或纯文本 `[B1]` `[D1]`)
- 已经合法的 mermaid 代码块(```mermaid 围栏)
- ASCII 流程图周围的描述文字(转完图前后的解说段落)

【必须转换的 ASCII 流程 — 凡是 3 个以上节点用 → 拼成的「独立段落」都要转】

正例 1 — 单行流程描述(常出现在 H3 后):
**关键流程**:
客户创建→查重校验→MDM主数据同步→资信评级→分级分类生效→黑名单状态检查→允许下单。
↓ 必须转成:
**关键流程**:
```mermaid
flowchart LR
    A[客户创建] --> B[查重校验]
    B --> C[MDM主数据同步]
    C --> D[资信评级]
    D --> E[分级分类生效]
    E --> F[黑名单状态检查]
    F --> G[允许下单]
```

正例 2 — 多步骤单行节点带说明:
Lead(线索) → Opportunity(商机) → Quote(报价) → Contract(合同)
↓ 必须转:
```mermaid
flowchart LR
    Lead[Lead 线索] --> Opp[Opportunity 商机]
    Opp --> Quote[Quote 报价]
    Quote --> Contract[Contract 合同]
```

正例 3 — 状态机:
正常 → 逾期(超期1天) → 催收中 → 已核销
↓ 必须转:
```mermaid
stateDiagram-v2
    [*] --> 正常
    正常 --> 逾期: 超期1天
    逾期 --> 催收中
    催收中 --> 已核销
    已核销 --> [*]
```

正例 4 — 用 +/-/| 字符画拼的多层架构 / 分层方框图(常出现在「总体架构」/
「应用分层」/「系统拓扑」段落):
+-----------------------------+
| 用户层: Web + APP           |
+-----------------------------+
| 应用层: LTC 流程 + 营销 + BI|
+-----------------------------+
| 数据层: 主数据 + 业务数据   |
+-----------------------------+
| 集成层: MDM / ERP / OA      |
+-----------------------------+
↓ 必须转(每层一个节点,自顶向下):
```mermaid
flowchart TB
    User["用户层<br/>Web 端 + APP 端"]
    App["应用层<br/>LTC 流程 / 营销 / 渠道 / BI"]
    Data["数据层<br/>主数据 + 业务数据 + 分析数据"]
    Integ["集成层<br/>MDM / ERP / OA / 第三方 API"]
    User --> App
    App --> Data
    Data --> Integ
```

反例 — 表格 cell 里的 → 不要动(只有 1 个表格行,不是流程图):
| 国内制造业 | 集团→股份→经营单位→事业部 | ... |
↑ 这是表格,**不要碰**

【自检】扫完一遍后再扫一次。**报告里不应该残留任何独立段落级的 ASCII 流程**
(出现在"关键流程:" / "状态机:" / "触发条件:" 这种 H3 / 加粗标签 后的)。

【转换规则】
- 线性 / 多分支流程 → flowchart LR
- 对象状态机(生命周期 / 审批 / 应收状态)→ stateDiagram-v2
- 跨角色交互(角色 → 角色 的动作,出现"销售/客户/CRM/ERP"等)→ sequenceDiagram

【输出】
直接输出修复后的**完整 markdown**(不是 diff,不是 patch,不是说明)。
不要 wrap 在 ``` 里。从第一个字符开始就是 markdown 内容,无前导句。
"""


def _count_independent_ascii_flows(md: str) -> int:
    """统计**独立段落级**的 ASCII 流程行数 + ASCII box 架构图(不是表格 cell 里的 →)。

    判断:
    - 整行没有 `|`(表格)、至少 3 个 → / -->、行长 ≥ 15 字符 → 算一行流程
    - 或:连续 ≥3 行 box-drawing(行起手是 `+-`、`|`、`+--` 等),也算一个图
    """
    if not md:
        return 0
    n = 0
    # 1) 单行 → / --> 流程
    for line in md.splitlines():
        if "|" in line and "→" in line:  # 表格 cell 里的 → 不算
            continue
        if line.lstrip().startswith("#"):
            continue
        arrows = line.count("→") + line.count("-->")
        if arrows >= 3 and len(line) >= 15:
            n += 1
    # 2) ASCII box 架构图(连续 ≥ 3 行 box-drawing 起手)
    lines = md.splitlines()
    box_run = 0
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("+-") or stripped.startswith("+=") or (stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 5):
            box_run += 1
            if box_run == 3:
                n += 1  # 一组 box 图算一处
        else:
            box_run = 0
    return n


# 独立 ASCII 流程超过这个数就跳过 linter:一次 LLM 调用改不动且极易超时挂死。
LINTER_MAX_FLOWS = 40


async def lint_and_fix_ascii_flowcharts(
    markdown: str, model: str, max_passes: int = 2,
    progress_cb=None,  # async (msg: str) -> None,每次 pass 前后调用,用于前端进度显示
) -> str:
    """LLM linter — 扫 markdown,把 ASCII 流程图补救成 mermaid 代码块。

    实测一次 lint 可能漏改"紧跟字段表的关键流程描述",所以加二次扫描:
    若一遍后还有 ≥ 3 处独立段落级 ASCII 流程,再 lint 一次。

    安全网:LLM 失败 / 返空 / 长度异常(<70% 或 >150% 原长)时保留前一版。
    """
    if not markdown or not markdown.strip():
        return markdown

    from services.output_service import _llm_call

    cur = markdown
    for attempt in range(max_passes):
        # 快速判断 — 没有"独立段落级"ASCII 流程就停
        remaining = _count_independent_ascii_flows(cur)
        if remaining == 0:
            if progress_cb:
                try: await progress_cb(f"图表审校通过(无 ASCII 流程残留)")
                except Exception: pass
            break
        # 流程过多(常见于对象字段表这类含大量 "A → B → C" 行的文档):一次 LLM 调用
        # 既改不动也极易超时挂死(曾导致 bundle 卡 generating 数小时),直接跳过,保留原文。
        if remaining > LINTER_MAX_FLOWS:
            if progress_cb:
                try: await progress_cb(f"ASCII 流程过多({remaining} 处),跳过图表审校以避免超时")
                except Exception: pass
            break
        if progress_cb:
            try: await progress_cb(f"审校图表 · 第 {attempt + 1}/{max_passes} 轮(剩 {remaining} 处 ASCII 流程待转 mermaid)…")
            except Exception: pass
        try:
            fixed = await _llm_call(
                f"修复以下 markdown,把所有独立段落级 ASCII 流程图转 mermaid 代码块:\n\n{cur}",
                system=LINTER_SYSTEM_PROMPT,
                model=model,
                max_tokens=20000,
                timeout=600.0,
            )
        except Exception:
            if progress_cb:
                try: await progress_cb("图表审校失败,保留原版本")
                except Exception: pass
            break  # linter 失败保留当前版本
        fixed = (fixed or "").strip()
        if not fixed:
            break
        # 长度异常 → 放弃这一轮 lint 结果
        ratio = len(fixed) / max(1, len(cur))
        if ratio < 0.7 or ratio > 1.5:
            break
        # 收敛检测:本轮 lint 没改善 ASCII 流程数量 → 停(避免死循环)
        new_remaining = _count_independent_ascii_flows(fixed)
        if new_remaining >= remaining:
            cur = fixed  # 改了但没好转,保留至少 lang 提升的部分
            break
        cur = fixed
    return cur


def build_blueprint_provenance(
    *,
    research_report_bundle,
    docs_by_type: dict,
    prior_bundles: list,
    meetings: list,
    industry_pack,
) -> dict:
    """构造 `{module_key: {refId: ProvenanceEntry}}` 给前端 CitationChip。

    refId 编号必须跟 format_*_for_report 系列函数一致,否则点 chip 跳错来源。
    """
    refs: dict[str, dict] = {}

    # [B1] = 调研报告
    if research_report_bundle:
        title = getattr(research_report_bundle, "title", None) or "调研报告"
        snippet = (getattr(research_report_bundle, "content_md", None) or "")[:240]
        refs["B1"] = {
            "type": "prior",
            "label": title,
            "snippet": snippet,
            "prior_kind": "research_report",
        }

    # [D1..Dn] = docs_by_type 展平顺序(跟 format_docs_for_report 一致)
    from models.project import DOC_TYPE_LABELS
    n = 0
    for doc_type, docs in (docs_by_type or {}).items():
        type_label = DOC_TYPE_LABELS.get(doc_type, doc_type)
        for d in docs:
            content = (d.get("markdown") or d.get("summary") or "").strip()
            if not content:
                continue
            n += 1
            refs[f"D{n}"] = {
                "type": "doc",
                "label": f"{type_label} · {d.get('filename', '未命名')}",
                "snippet": content[:240],
                "doc_id": d.get("doc_id") or d.get("id"),
                "filename": d.get("filename"),
                "doc_type": doc_type,
            }

    # [P1..Pn] = prior_bundles(insight / survey_outline / survey 等)
    n = 0
    for pb in (prior_bundles or []):
        md = (pb.get("content_md") or "").strip()
        if not md:
            continue
        n += 1
        kind = pb.get("kind") or "?"
        refs[f"P{n}"] = {
            "type": "prior",
            "label": f"{kind} · {pb.get('title') or kind}",
            "snippet": md[:240],
            "prior_kind": kind,
        }

    # [M1..Mn] = 会议素材
    for i, m in enumerate(meetings or [], 1):
        refs[f"M{i}"] = {
            "type": "doc",  # 用 doc 显色;前端 chip 暖色调
            "label": f"会议 · {m.get('title', '未命名')}",
            "snippet": (m.get("summary") or "")[:240],
        }

    # [I1] = 行业最佳实践
    if industry_pack:
        refs["I1"] = {
            "type": "kb",
            "label": f"行业最佳实践 · {getattr(industry_pack, 'display_name', '未知行业')}",
            "snippet": "",
        }

    return {PROVENANCE_MODULE_KEY: refs}



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
    """LLM 按 <<<SECTION:key>>> 分隔输出,按规范的 H2 标题重新拼成完整 markdown。

    marker 尖括号数量漂了(<<..>> / <..>>>)也能识别。
    """
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
    for sec in BLUEPRINT_SECTIONS:
        out.append(f"## {sec.title}")
        body = chunks.get(sec.key, "").strip()
        body = _strip_leading_h2(body)
        if body:
            out.append(body)
        else:
            out.append("_(本章节未生成,建议重试 / 联系管理员)_")
        out.append("")
    return "\n".join(out).strip()
