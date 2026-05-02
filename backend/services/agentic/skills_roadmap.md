# Skill Graph 2.0 Roadmap

> 灵感来源：[Uxcel Skill Graph 2.0](https://uxcel.com/blog/skill-graph-2-0)（UX Designer / Product Manager 双 path × 6 域结构）
>
> 本文是 KB-System「技能库」的能力分层蓝图。本轮（2026-Q2）只交付文档，不动 `skills` 表的 schema、不动 [skills_seed.py](skills_seed.py)。后续迭代按本文 § F Roadmap 推进。

---

## A. 现状盘点

系统目前装载 **12 条原子 skill**（[skills_seed.py:35](skills_seed.py)）。每条是「最小可复用方法论单元」，由运营在 `/system-config` 「技能库」Tab 关联到具体 output kind，生成时由 `_get_skill_snippets` 拼到 prompt 末尾。

> 下表中的 kind 字符串反映 [skills_seed.py:277](skills_seed.py) `KIND_TO_ATOMIC_SKILLS` 当前定义。此表已对齐 v3 命名归一(无 `_v2` 后缀)。

| # | name | 注入点 | 当前关联 kind |
|---|------|--------|--------------|
| 1 | MBB 输出风格 | output_agent | insight, survey_outline |
| 2 | 禁用黑话清单 | output_agent | insight, survey_outline, survey |
| 3 | 强制中文输出 | output_agent | insight, survey_outline, survey |
| 4 | D/K/W 引用 ID 规则 | output_agent | insight, survey_outline |
| 5 | 严格 JSON 输出契约 | output_agent | survey |
| 6 | 禁止 LLM 输出 H1/H2 标题 | output_agent | insight, survey_outline |
| 7 | Markdown 表格规范 | output_agent | insight, survey_outline, survey |
| 8 | Critic 4 维度 rubric | critic_agent（内置） | （不在 skill_ids，硬编码在 [critic.py](critic.py)） |
| 9 | Challenger 6 维度 rubric | challenger_agent（内置） | （同上，硬编码在 [challenger.py](challenger.py)） |
| 10 | 调研问卷 6 题型规范 | output_agent | survey |
| 11 | LTC 流程骨架 | output_agent | survey_outline, survey |
| 12 | 信息缺失处理规则 | output_agent | insight, survey_outline, survey |

> 注：原 `Challenger 7 维度 rubric` 在 2026-05 已改名为 6 维(下线 timeliness,见 commit `7ba8629`)。skills_seed.py 的 LEGACY_NAME_MIGRATIONS 会在启动时自动重命名 DB 旧记录。

---

## B. 6 大能力域（KB 系统能力地图）

> uxcel 双 path（UX Designer / Product Manager）× 6 域结构。
> KB 系统是 **CRM 实施咨询** 工具链，本质上对应 PM/Consulting 一条 path，外加一条 KB 系统差异化的「评审域」。
> 所以我们的 6 域 = uxcel PM path 的 6 域思路 + 把「Technical Proficiency / Data Analytics」合并为 1 域，腾出位置放「评审域」。

### B.1 业务洞察 Business Insight

**含义**：项目摘要 / 健康评估 / 风险识别 / 决策建议 / 下一步规划。这是顾问拿到一个项目后，最先要给老板 / 客户输出的「我现在怎么看这个项目」。

**对标 uxcel**：Product Thinking + Business Strategy（连接业务目标和决策）

**当前已有 skill**：暂无独立 skill。逻辑内嵌在 [insight_modules.py](insight_modules.py) 的 M1–M10 模块定义里（M1 执行摘要、M2 项目快照、M3 健康雷达 …）。

**未来候选 skill**：
- M3 健康雷达 RAG 评分标准（什么情况打 red / amber / green）
- 风险分级模板（影响 × 概率 × 时效）
- 下一步 SMART 模板（Specific / Measurable / Assignable / Realistic / Time-bound）
- 项目阶段研判模板（pre-kickoff / discovery / build / acceptance）

### B.2 领域知识 Domain Knowledge

**含义**：行业 / 产品 / 流程的硬知识。LLM 凭通识写不出来的、必须靠人类 + 文档喂进去的领域信息。

**对标 uxcel**：Technical Proficiency

**当前已有 skill**：
- LTC 流程骨架（华为 LTC 8 主流程 + 5 横向支撑域）

**未来候选 skill**：
- 纷享销客 CRM 模块 catalog（产品功能图谱 + 配置可达性）
- 行业典型周期参考表（按行业列出销售周期 / 履约周期标杆）
- 竞品对照表（销售易 / 美洽 / SAP CRM 等关键差异点）
- 角色权限模型（销售 / 销售经理 / 区域总 / 大客户经理 / BD …）

### B.3 调研与发现 Discovery & Research

**含义**：提问设计 / 信息缺口识别 / 顾问访谈方法论。从「不知道」到「知道」的工艺。

**对标 uxcel**：User Research（PM 路径中也有调研意味的 stakeholder management）

**当前已有 skill**：
- 调研问卷 6 题型规范（single/multi/rating/number/text/node_pick）
- 信息缺失处理规则（不编造 / 标记缺口 / 引导补访）

**未来候选 skill**：
- 需求归类四象限（要做 / 要砍 / 要谈 / 待定）
- 干系人决策链建模（决策者 / 影响者 / 把关者 / 用户）
- 访谈温度调节（开放问 vs 收敛问 vs 反问 vs 逼问）
- 文档 vs 访谈优先级判定（什么场景优先看文档，什么场景必须访谈）

### B.4 输出与表达 Output Craft

**含义**：风格 / 排版 / 语言。让结论看得懂、看得下去。

**对标 uxcel**：Visual Design + Content Strategy

**当前已有 skill**（5 条，最大类）：
- MBB 输出风格（金字塔原理 + 表格优先 + 克制语气）
- 禁用黑话清单（赋能 / 抓手 / 闭环 / 链路 / 生态 / 数字化转型 / 一站式）
- 强制中文输出（含英文术语强制替换表）
- 禁止 LLM 输出 H1/H2 标题（系统自动注入章节标题）
- Markdown 表格规范（列数 / 引用标注 / 数值列对齐）

**未来候选 skill**：
- 中英术语对照表（在「强制中文输出」基础上扩展）
- 图表选择指引（柱 / 线 / 饼 / 散点 / 桑基 各自适用场景）
- PPT 母版规范（启动会 PPT 的标题层级 / 配色 / 留白）
- 段落-bullet-表格 三选一决策树

### B.5 证据与引用 Evidence Discipline

**含义**：来源管理 / 引用约定 / 数据契约。让 LLM 输出可验证、可追溯。

**对标 uxcel**：（uxcel 没有完全对应的域，PM path 的 Data Analytics 部分接近）

**当前已有 skill**：
- D/K/W 引用 ID 规则（[D1] 项目文档 / [K1] KB 切片 / [W1] Web 检索）
- 严格 JSON 输出契约（双引号 / 无尾逗号 / 无注释 / 无围栏）

**未来候选 skill**：
- Web 引用可信度分级（官方报告 > 行业研究 > 媒体新闻 > 论坛贴）
- 切片引用合并规则（同源多切片 vs 异源相同结论）
- 反编造红线（哪些场景必须引用、哪些可以推断、推断必须显式标注）
- 引用密度阈值（每段 / 每模块的最少引用数）

### B.6 质量评审 Quality Assurance

**含义**：评审标准 / 对抗式审核 / 自我修正闭环。

**对标 uxcel**：（无对应；这是 KB 系统差异化的能力 — 把同行评审 / 反方辩护内化为系统能力）

**当前已有 skill**：
- Critic 4 维度 rubric（Specificity / Evidence / Timeliness / Next Step）— 单模块打分
- Challenger 6 维度 rubric（Specificity / Evidence / Next Step / Completeness / Consistency / Jargon）— 整文挑战 ⚠️ skill 名仍写 7 维

**未来候选 skill**：
- 事实核对 SOP（怎么从 [D1][K1] 反查源文档）
- 自洽性检查清单（M1 vs M3 vs M9 是否互相矛盾）
- 用户视角盲测（拿掉所有引用后，结论是否仍能站住脚）
- 评审风格分层（严苛 / 平衡 / 宽松，按交付场景切换）

---

## C. 现存 skill 归位映射

| 域 | skill |
|----|-------|
| 业务洞察 Business Insight | （无独立 skill） |
| 领域知识 Domain Knowledge | LTC 流程骨架 |
| 调研与发现 Discovery & Research | 调研问卷 6 题型规范、信息缺失处理规则 |
| 输出与表达 Output Craft | MBB 输出风格、禁用黑话清单、强制中文输出、禁止 LLM 输出 H1/H2 标题、Markdown 表格规范 |
| 证据与引用 Evidence Discipline | D/K/W 引用 ID 规则、严格 JSON 输出契约 |
| 质量评审 Quality Assurance | Critic 4 维度 rubric、Challenger 6 维度 rubric |

**密度观察**：
- 输出与表达 Output Craft 是当前最饱和的域（5 条），符合 LLM 输出治理是初期最重要场景的判断
- 业务洞察 Business Insight 0 条独立 skill，全藏在 module 定义里 → 长期看应当抽出，让运营也能改

---

## D. 数据模型扩展提案（不在本轮交付）

### D.1 `skills` 表新增字段

```sql
-- 注：skills.id 在 [models/skill.py](../../models/skill.py) 是 String(36) 存 UUID 字符串，
--     不是 PG 原生 uuid 类型，外键列类型要保持一致。
ALTER TABLE skills
  ADD COLUMN category text,                              -- 6 域之一（'business_insight' / 'domain_knowledge' / ...）
  ADD COLUMN parent_skill_id varchar(36) REFERENCES skills(id) ON DELETE SET NULL;
                                                         -- 支持子 skill（域 → 大类 → 具体 skill 三层）
CREATE INDEX skills_category_idx ON skills(category);
```

### D.2 agent_config 关联升级

当前：
```json
{ "skill_ids": ["uuid1", "uuid2", ...] }
```

升级为：
```json
{
  "skill_categories": ["output_craft", "evidence_discipline"],  // 通配 — 该域所有 skill 自动启用
  "skill_ids":         ["uuid_of_specific_skill"]               // 精确 — 单条单独启用
}
```

注入 prompt 时取 (categories 展开的 skill 集合) ∪ (skill_ids 集合) 去重。

### D.3 SkillsTab UI

- 改成树形：6 域作为顶层折叠节点 → 节点下展示该域 skill 列表
- 每条 skill 上加「跳转到关联的 output kind」反查
- 顶部说明区贴本文 § B 的 6 域定义

---

## E. 与 Uxcel 框架的差异说明

| 维度 | Uxcel Skill Graph 2.0 | KB-System Skill Graph |
|------|----------------------|----------------------|
| Path 数量 | 2（UX Designer / Product Manager） | 1（CRM 实施咨询） |
| 顶层域数量 | 6 / path | 6 |
| 是否区分知识 / 技能 / 工艺 | 隐含，未显式 axes | 隐含；输出与表达偏「工艺」，领域知识偏「知识」，业务洞察偏「技能」 |
| 评审作为独立域 | 否（散落到各域） | **是**（KB 系统差异化能力） |
| skill 颗粒度 | sub-skill 列出但无标准化结构 | 原子 skill = 最小可复用 prompt 单元，有 `prompt_snippet` 字段 |
| 注入 LLM | （非系统化场景） | 通过 agent_config.skill_ids 关联到 output_agent |

---

## F. Roadmap

| 时间 | 目标 |
|------|------|
| **2026-Q2（本轮）** | 交付本文档；运营对照表读懂现存 skill 的归位；不动 schema、不动 skill 内容 |
| **2026-Q3** | `skills` 表加 `category` + `parent_skill_id` 字段；现存 12 条 skill 按 § C 表打 category 标签；SkillsTab UI 改树形折叠 |
| **2026-Q4** | agent_config 关联从 `skill_ids[]` 升级为 `skill_categories[]` + `skill_ids[]` 并集；新建 output kind 时按域自动建议必备 skill 集合（如 insight 默认装 Output Craft + Evidence Discipline 全集） |
| **2027-Q1** | 业务洞察 / 领域知识两个稀疏域至少各补 3 条 skill，把 [insight_modules.py](insight_modules.py) 内嵌的判断规则抽出来 |

---

## G. 维护准则

写 / 改 skill 时遵守：

1. **原子性**：一条 skill 解决一个问题。如果 prompt_snippet > 200 字 / 包含 ≥ 3 个不相关的话题，拆。
2. **不耦合 stage / kind**：skill 只描述方法论，不写「在 insight stage 怎么用」。stage / kind 关联放 KIND_TO_ATOMIC_SKILLS。
3. **域归属唯一**：一条 skill 必须能落到一个域。如果落不到，说明 skill 颗粒度不对（要么太细要么太粗）。
4. **prompt_snippet 自包含**：能直接拼到 LLM prompt 末尾就生效，不依赖外部上下文。
5. **可证伪**：skill 给的规则必须 LLM 能理解、Critic 能验证。「写得有逻辑一点」不行，「每段先抛结论后给证据」可以。
