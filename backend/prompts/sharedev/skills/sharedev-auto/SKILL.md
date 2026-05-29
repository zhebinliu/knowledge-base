---
name: sharedev-auto
description: 智能编排技能——接收一句话需求或 Word 文档内容，自动分析并调用相关技能链（PWC/APL/Layout/Layout Rule/Field/Object）完成端到端交付。触发场景：用户提出新功能需求、提供 Word 需求文档、对象配置需求、表单增强需求、布局规则需求、或任何涉及多技能协作的开发任务。
---

# ShareDev 智能编排

## 概述

`sharedev-auto` 是 ShareDev 技能体系的智能入口。用户只需用自然语言或 Word 文档描述需求，此技能自动完成：输入来源检测 → 需求分析 → 产品线判定 → 技能链推荐 → Phase Gate 协调 → 知识库规避 → 部署编排。

**开始时宣告：** "我正在使用 sharedev-auto skill 进行智能编排。正在分析你的需求..."

> ## 🔴 阻塞级首步 — SHARE DEV TRACE（全任务暂停，立即执行）
>
> 当你读到这行字时，**停止一切分析和编码动作**，立即在终端执行以下命令。
> **在此之前不得执行任何其他命令、不得读取任何文件、不得输出任何代码。**
>
> ```bash
> sharedev trace -m skill --str1 sharedev-auto
> ```
>
> 执行成功后方可继续后续内容。此命令用于记录技能调用轨迹。
> **如果跳过此步骤，本次任务视为流程违规，需从 Step 0 重新开始。**

**核心价值：** 避免用户手动判断"该调用哪个技能、按什么顺序、注意哪些坑"，直接端到端交付。

---

## 输入来源检测

进入执行前，首先检测用户需求的输入来源类型：

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| **模式 A — 纯文本** | 用户仅提供自然语言一句话需求 | 直接进入「需求分析与分类」（原有行为） |
| **模式 B — 文件路径** | 用户提供 .docx / .doc / .txt 文件路径并说「根据这份文档来做」 | 使用 Read 工具读取文件内容；若不可读则提示用户提供可访问路径或将内容粘贴到对话中 |
| **模式 C — 粘贴内容** | 用户将 Word 文档内容直接粘贴到对话中作为需求描述 | 将粘贴文本视为结构化需求，进入「文档内容解析」 |

**文件读取失败处理：**
- 若 `<enterpriseRoot>` 下文件不存在 → 提示用户确认文件路径是否正确
- 若文件在 `.gitignore` 或不可访问路径下 → 提示用户移动文件或直接粘贴内容
- 若 `.docx` 格式无法直接解析文本 → 提示用户从 Word 中复制内容并粘贴到对话中

**输入来源标注：** 进入分析模式后，内部始终维护 `inputSource` 字段（`text` / `file` / `paste`），用于后续阶段的条件分支。

---

## 执行模式

此技能在**两种模式**下工作：

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| **分析模式** | 用户首次提出需求 | 分析需求 → 展示分类结果和推荐的技能链 → 等待用户确认 |
| **执行模式** | 用户确认后 / 说"继续" | 按技能链模板依次调用技能 → 在 Phase Gate 暂停 → 部署 |

---

## ⚠️ 强制前置：切换到 `<enterpriseRoot>` 目录

**进入执行模式后，agent 必须立即 `cd` 进入 `<enterpriseRoot>` 目录（即 `<workspaceRoot>/<enterpriseEAName>`）。**

```
cd <enterpriseRoot>
```

**原因：**
- 所有 `sharedev` CLI 命令（`init`、`apl push`、`apl compile`、`pwc deploy`、`object-dev * push` 等）依赖 `<enterpriseRoot>` 下的 `.git` 仓库、`.sharedev/settings.json`、`package/`、`pwc/`、`tenant-config/` 目录
- 从 `<workspaceRoot>` 执行会导致 `.sharedev/traces/` 写入根目录（污染仓库），以及 `pwc deploy`、`apl push` 等命令因找不到源文件而失败

**禁止从 `<workspaceRoot>` 直接执行任何 sharedev CLI 命令。所有命令的 `cwd` 必须设置为 `<enterpriseRoot>`。**

此规则适用于整个技能生命周期的**所有阶段**（不仅是部署阶段），包括环境初始化、资源拉取、代码生成等。

---

## 路径变量约定

所有资源路径使用以下变量，**绝不硬编码具体企业 ID 或绝对路径**：

| 变量 | 含义 | 值来源 | 示例 |
|------|------|--------|------|
| `<workspaceRoot>` | 工作区根目录 | `settings.json` 所在目录 | `/path/to/project` |
| `<enterpriseEAName>` | 企业 EA 标识 | `settings.json` 中的 `enterpriseEA` 字段 | `fktest8507` |
| `<enterpriseRoot>` | 企业工程根目录 | 优先 `<workspaceRoot>`（若其 `.sharedev/settings.json` 存在），否则 `<workspaceRoot>/<enterpriseEAName>` | `<workspaceRoot>` 或 `<workspaceRoot>/fktest8507` |

**资源路径前缀规则：** 所有项目资源均以 `<enterpriseRoot>/` 为前缀：

```
<enterpriseRoot>/
├── .sharedev/
│   ├── settings.json          # sharedev CLI 配置
│   ├── docs/                  # APL/PWC 文档
│   └── dev-metadata/          # 对象元数据文档
├── tenant-config/             # 对象/字段/布局/规则配置
│   └── objects/
├── pwc/plugins/               # PWC 前端插件
├── package/fx/custom/apl/script/  # APL 脚本
└── deliverables/              # 文档产物（PRD/Arch/Plan/Review）
```

---

## 流程

### 第〇步：文档内容解析（仅模式 B / C 触发）

当输入来源为 Word 文档（模式 B 文件路径 或 模式 C 粘贴内容）时，先解析文档提取结构化需求信息，再进入关键词分类。

#### 解析目标

从文档内容中识别以下五类信息，输出结构化摘要供用户确认：

| 类别 | 识别规则 | 映射目标 |
|------|---------|---------|
| **字段定义** | 表格行或文本中描述字段名、类型（文本/数字/日期/下拉）、选项值、必填/只读属性 | `sharedev-field` 输入规格 |
| **业务规则** | 条件逻辑句式："当 XX 字段值为 YY 时，显示/隐藏/只读 ZZ 字段"、"XX 为空时必填 YY" | `sharedev-layout-rule` 输入规格 |
| **页面布局** | 描述字段所在区域："XX 字段放在基本信息区域"、"新建页包含 ZZ 字段"、"编辑页移除 WW 字段" | `sharedev-layout` 输入规格 |
| **后端逻辑** | 关键词：校验/搜索/同步/定时/批量/API/回调/触发器/审批流 | `sharedev-apl-implement` 或 `sharedev-pwc-*` 输入规格 |
| **对象定义** | 描述自定义对象："新建 XX 对象"、对象属性描述 | `sharedev-object` 输入规格 |

#### 解析结果展示模板

解析完成后，向用户展示结构化摘要：

```
📄 文档内容解析结果
━━━━━━━━━━━━━━━━━━━━━━
输入来源：<Word 文档路径 / 粘贴内容>

【字段定义】（N 个）
  • 字段1：<名称> | 类型：<text/number/date/select_one> | <必填/只读/选项值>
  • 字段2：...

【业务规则】（N 条）
  • 规则1：当 <条件字段>=<值> 时 <动作> <目标字段>
  • 规则2：...

【页面布局】（N 处变更）
  • 布局1：<详情页/编辑页/新建页/列表页> — <描述>
  • 布局2：...

【后端逻辑】（N 个）
  • 逻辑1：<描述>
  • 逻辑2：...

【对象定义】（N 个）
  • 对象1：<名称> — <描述>

是否确认以上解析结果？如有遗漏或错误请补充修正。
```

**硬约束：** 解析结果必须等待用户确认后，才能进入关键词分类和技能链编排。用户可修正、补充或删除解析出的条目。

---

### 第一步：需求分析与分类

解析用户输入（纯文本或 Word 文档解析结果），匹配关键词到产品线。使用以下分类规则：

#### 关键词 → 产品线映射

| 关键词/短语 | 产品线 | 涉及技能（含文档阶段） |
|------------|--------|---------|
| 校验、搜索、自动完成、表单、插件、弹窗、列表、按钮、页面交互 | PWC 前端 | prd → arch → plan → subagent-dev → review → finish-dev |
| API、函数、触发器、定时任务、批量、数据同步、回调 | APL 后端 | prd → arch → plan → apl-init → apl-implement → apl-code-review |
| 字段、下拉、选项、必填、文本、数字、日期、新建字段 | Field 配置 | prd（L2+）→ plan → field → layout |
| 布局、详情页、编辑页、新建页、列表页、页面配置 | Layout 配置 | prd（L2+）→ plan → layout |
| 规则、显示条件、隐藏、只读、动态控制、根据XX显示YY、新建页面隐藏 | Layout Rule 配置 | prd（L2+）→ plan → layout（前置检查）→ layout-rule |
| 对象、新建对象、自定义对象 | Object 配置 | prd → plan → object → field → layout |

#### 复杂度判定

| 复杂度 | 判定条件 | 技能链编号 |
|--------|---------|-----------|
| **L1 - 单一配置** | 仅涉及 1 条配置产品线（field/layout/layout-rule 之一） | Template C（子集） |
| **L2 - 完整配置** | 涉及 Object→Field→Layout→Layout Rule 中的多环节 | Template C |
| **L3 - 纯代码** | 仅涉及 PWC 或 APL 之一 | Template A 或 B |
| **L4 - 混合** | PWC + APL（无对象配置） | Template D |
| **L5 - 全栈** | 同时涉及对象配置 + PWC + APL | Template E |

#### 分类结果展示模板

分析完成后，向用户展示。分类器适用于纯文本输入和 Word 文档解析结果。当输入来源为 Word 文档时，模板首行追加输入来源标注：

```
📋 需求分析结果
━━━━━━━━━━━━━━━━━━━━
📄 输入来源：Word 文档                          ← 仅模式 B/C 时显示
• 类型：<需求类型>
• 复杂度：L<1-5> <描述>
• 涉及技能：<技能列表>
• 推荐技能链：<Template X>
• 预计 Phase Gate 数量：<N> 个确认点

是否按此方案执行？
```

### 第1.5步：需求融合（仅同时存在概述 + Word 文档时触发）

当用户既提供了一句话概述又提供了 Word 文档（模式 B/C + 文本概述共存）时，需要对两个来源的需求进行融合。

#### 融合优先级

| 优先级 | 来源 | 说明 |
|--------|------|------|
| **高** | Word 文档内容 | 文档中的详细规格（字段名、类型、规则条件、布局位置）以文档为准 |
| **低** | 一句话概述 | 概述确定整体方向和边界，仅当文档中未覆盖某一维度时作为补充 |

#### 融合规则

1. **字段定义**：以 Word 文档中表格/描述为准；若概述中提到文档未覆盖的字段，追加到末尾并标注 `📝 来自概述`
2. **业务规则**：以 Word 文档中条件描述为准；概述中的规则思路作为验证补充
3. **页面布局**：以 Word 文档中的区域分配为准；概述中的布局偏好仅用于确认整体方向
4. **后端逻辑**：以 Word 文档中的详细描述为准；概述中的总体目标用于校验逻辑完整性
5. **对象定义**：以 Word 文档中的对象描述为准；概述用于补充业务背景

#### 冲突检测

当概述与文档存在矛盾时（如概述说「只需校验」，文档要求「校验+搜索联想」；概述说「详情页显示 5 个字段」，文档列出 10 个字段），执行以下步骤：

1. 列出冲突点，格式如下：

```
⚠️ 需求冲突检测
━━━━━━━━━━━━━━━━━━━━━━
发现 <N> 处冲突，请确认以哪个来源为准：

冲突 1：<维度>
  • 概述：「<概述内容>」
  • 文档：「<文档内容>」
  → 建议：以文档为准（更详细具体）

冲突 2：...
```

2. 默认推荐以文档为准，但必须等待用户明确选择
3. 用户可选择「全部以文档为准」「逐条指定」或「融合两者」

#### 融合后的分类展示

融合完成后，进入分类结果展示（`### 第一步` 的模板），此时模板首行追加：

```
📋 需求分析结果
━━━━━━━━━━━━━━━━━━━━
📄 输入来源：Word 文档 + 文本概述
...
```

---

### 第二步：用户确认

**硬停止点：** 分类结果展示后，必须等待用户明确确认（"确认"/"执行"/"开始"），不得自动进入执行模式。

### 第三步：按技能链模板执行

根据推荐模板，依次调用技能。每个技能的调用方式参见 [技能链模板](#技能链模板) 章节。

### 第四步：Phase Gate 协调

在每个技能的自然硬停止点暂停，等待用户输入。参见 [Phase Gate 协调](#phase-gate-协调) 章节。

### 第五步：部署

所有开发/配置完成后，按顺序部署。参见 [部署顺序编排](#部署顺序编排) 章节。

---

## 技能名称映射表

**编排器在执行每个阶段时，必须使用 `Skill` 工具加载对应的技能文件。** 模板中使用的短名称（如 `field`、`apl-code-review`）与实际技能名称的映射如下：

### 文档类技能（PWC）

| 模板短名称 | Skill 工具调用名称 | 用途 |
|-----------|-------------------|------|
| `write-prd-spec` | `sharedev-pwc-write-prd-spec` | 生成产品需求文档 |
| `write-arch` | `sharedev-pwc-write-arch` | 生成技术架构设计 |
| `write-plans` | `sharedev-pwc-write-plans` | 生成实施计划 |

### 配置类技能

| 模板短名称 | Skill 工具调用名称 | 用途 |
|-----------|-------------------|------|
| `object` | `sharedev-object` | 创建/修改对象定义 |
| `field` | `sharedev-field` | 创建/修改字段配置 |
| `layout` | `sharedev-layout` | 创建/修改页面布局 |
| `layout-rule` | `sharedev-layout-rule` | 创建/修改布局规则 |

### APL 后端技能

| 模板短名称 | Skill 工具调用名称 | 用途 |
|-----------|-------------------|------|
| `apl-init` | `sharedev-apl-init` | APL 开发环境初始化 |
| `apl-implement` | `sharedev-apl-implement` | APL 代码实现 |
| `apl-code-review` | `sharedev-apl-code-review` | APL 代码审查 |

### PWC 前端技能

| 模板短名称 | Skill 工具调用名称 | 用途 |
|-----------|-------------------|------|
| `pwc-create` | `sharedev-pwc` | 在服务端创建 PWC 插件/组件脚手架（pwc create），并拉取到本地 |
| `subagent-driven-dev` | `sharedev-pwc-subagent-driven-development` | 派发子智能体实现 PWC 代码 |
| `review-code` | `sharedev-pwc-review-code` | PWC 代码审查 |
| `finish-development` | `sharedev-pwc-finish-development` | 验证测试、完成发布 |

### 使用方式

在对应的 Phase Gate 通过后，编排器**立即**使用 `Skill` 工具加载技能：

```
Skill 工具调用: { name: "<技能名称>" }
```

例如执行 Template A 的 Phase 1 时：

```
使用 Skill 工具: { name: "sharedev-pwc-write-prd-spec" }
```

**重要：** 只描述技能名称（如 "pwc write prd spec"），**不要**在 Skill 工具调用中描述参数或上下文——技能自身的 SKILL.md 会展开完整的执行指令。

---

## 技能链模板

### Template A: 纯 PWC 开发链

```
write-prd-spec → write-arch → write-plans → pwc-create → subagent-driven-dev → review-code → finish-development
```

| 阶段 | Skill 工具调用 | Phase Gate | 说明 |
|------|--------------|-----------|------|
| 1 | `Skill: sharedev-pwc-write-prd-spec` | ✅ 用户确认 PRD | 生成产品需求文档 |
| 2 | `Skill: sharedev-pwc-write-arch` | ✅ 用户确认架构 | 生成技术架构设计 |
| 3 | `Skill: sharedev-pwc-write-plans` | ✅ 用户确认计划 | 生成实施计划 |
| 4 | `Skill: sharedev-pwc` | ❌ 自动执行 | 在服务端创建 PWC 脚手架（pwc create），拉取到本地 `source/` 目录 |
| 5 | `Skill: sharedev-pwc-subagent-driven-development` | ❌ 自动执行 | 派发子智能体实现 PWC 代码 |
| 6 | `Skill: sharedev-pwc-review-code` → 按统一模板产出 REVIEW.md | ✅ 用户确认审查 | 代码审查（详见下方「审查执行流程」） |
| 7 | `Skill: sharedev-pwc-finish-development` | 🚫 强制停止 | 部署上线；必须等待用户明确授权，不得自动执行 |

### Template B: 纯 APL 开发链

```
prd → arch → plan → apl-init → apl-implement → apl-code-review → (push)
```

| 阶段 | Skill 工具调用 | Phase Gate | 说明 |
|------|--------------|-----------|------|
| 1 | `Skill: sharedev-pwc-write-prd-spec`（APL 适配） | ✅ 用户确认 PRD | 明确函数职责、输入输出、业务规则；产出 `prd.md` |
| 2 | `Skill: sharedev-pwc-write-arch`（APL 适配） | ✅ 用户确认架构 | 确定 namespace、返回类型、API 调用链路、数据流；产出 `arch.md` |
| 3 | `Skill: sharedev-pwc-write-plans` | ✅ 用户确认计划 | 拆解实现任务，确定文件结构；产出 `plan.md` |
| 4 | `Skill: sharedev-apl-init` | ❌ 自动执行 | 环境准备 |
| 5 | `Skill: sharedev-apl-implement` | ✅ 用户确认代码 | 代码实现 |
| 6 | `Skill: sharedev-apl-code-review` → 按统一模板产出 REVIEW.md | ✅ 用户确认审查 | 编译验证 + 代码分析 + 审查报告（详见下方「审查执行流程」） |
| 7 | — | 🚫 强制停止 | APL push；必须等待用户明确授权，不得自动执行 |

### Template C: 对象配置链

```
prd → plan → object → field → layout → layout-rule → (push)
```

| 阶段 | Skill 工具调用 | Phase Gate | 说明 |
|------|--------------|-----------|------|
| 1 | `Skill: sharedev-pwc-write-prd-spec`（配置适配） | ✅ 用户确认 PRD | 明确配置范围和需求（字段名、类型、布局位置、规则逻辑）；产出 `prd.md` |
| 2 | `Skill: sharedev-pwc-write-plans` | ✅ 用户确认计划 | 确定配置顺序和依赖关系；产出 `plan.md` |
| 3 | `Skill: sharedev-object`（如需） | ✅ 用户确认 | 创建对象定义（仅本地文件创建，不推送） |
| 4 | `Skill: sharedev-field`（如需） | ✅ 用户确认 | 创建/修改字段（仅本地文件创建，不推送） |
| 5 | `Skill: sharedev-layout`（如需） | ✅ 用户确认 | 创建/修改布局（仅本地文件创建，不推送） |
| 6 | `Skill: sharedev-layout-rule`（如需） | ✅ 用户确认 | 创建/修改布局规则（仅本地文件创建，不推送） |
| 7 | —（编排器直接执行） | 🚫 强制停止 | 列出所有待推送项目，等待用户确认后执行推送命令 |

**强制推送确认：** Stage 7 为最高优先级硬停止点。编排器必须：
1. 列出所有已创建/修改的配置文件（对象/字段/布局/规则）的完整路径
2. 展示推送顺序和对应命令
3. **硬停止**等待用户明确说"确认发布"/"确认"/"推送"
4. 只有在用户明确确认后，才可执行 `sharedev object-dev * push` 系列命令

**硬约束：**
- `field` 依赖 `object`（如需新建对象）
- `layout` 依赖 `field`（字段必须在布局前存在）
- `layout-rule` 依赖 `layout`（布局必须在规则前存在）
- **严禁跳过前置步骤**。即使用户只提到"加个布局规则"，也必须先确认 layout 存在。
- **L1 简单配置可跳过 PRD/Plan 阶段**（单个字段/布局调整且无歧义时），但 L2 及以上必须产出文档。

### Template D: PWC + APL 混合链

```
write-prd-spec → write-arch → write-plans → [APL ∥ PWC pwc-create → subagent] → review → deploy
```

| 阶段 | Skill 工具调用 | Phase Gate | 并行 |
|------|--------------|-----------|------|
| 1 | `Skill: sharedev-pwc-write-prd-spec` | ✅ | — |
| 2 | `Skill: sharedev-pwc-write-arch` | ✅ | — |
| 3 | `Skill: sharedev-pwc-write-plans` | ✅ | — |
| 4a | `Skill: sharedev-apl-implement` | ❌ | ∥ |
| 4b | `Skill: sharedev-pwc` → `Skill: sharedev-pwc-subagent-driven-development` | ❌ 内部按依赖顺序 | ∥ |
| 5 | `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` → 按统一模板合并产出 REVIEW.md | ✅ 用户确认审查 | 详见下方「审查执行流程」 |
| 6 | `Skill: sharedev-pwc-finish-development` | 🚫 强制停止 | 部署上线；必须等待用户明确授权，不得自动执行 |

**重要：** 阶段 4b 内部严格按 `pwc-create → subagent-driven-dev` 顺序执行（先创建服务端脚手架，再编写代码）。

> 📎 阶段 4a/4b 的并行执行方式 → 详见「多子代理并行执行」

### Template E: 全栈链

```
write-prd-spec → write-arch → write-plans → [Object+Layout+Layout Rule ∥ APL ∥ PWC pwc-create → subagent] → review → deploy
```

| 阶段 | Skill 工具调用 | Phase Gate | 并行 |
|------|--------------|-----------|------|
| 1 | `Skill: sharedev-pwc-write-prd-spec` | ✅ | — |
| 2 | `Skill: sharedev-pwc-write-arch` | ✅ | — |
| 3 | `Skill: sharedev-pwc-write-plans` | ✅ | — |
| 4a | `Skill: sharedev-object` → `Skill: sharedev-field` → `Skill: sharedev-layout` → `Skill: sharedev-layout-rule` | ❌ 内部按依赖顺序 | ∥ |
| 4b | `Skill: sharedev-apl-implement` | ❌ | ∥ |
| 4c | `Skill: sharedev-pwc` → `Skill: sharedev-pwc-subagent-driven-development` | ❌ 内部按依赖顺序 | ∥ |
| 5 | `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` + 配置核查 → 按统一模板合并产出 REVIEW.md | ✅ 用户确认审查 | 详见下方「审查执行流程」 |
| 6 | `Skill: sharedev-pwc-finish-development` → 按顺序部署 | 🚫 强制停止 | 部署上线；必须等待用户明确授权，不得自动执行 |

**重要：** 阶段 4a 内部严格按 `object → field → layout → layout-rule` 顺序执行，不可并行化。阶段 4c 内部严格按 `pwc-create → subagent-driven-dev` 顺序执行（先创建服务端脚手架，再编写代码）。

> 📎 阶段 4a/4b/4c 的并行执行方式 → 详见「多子代理并行执行」

---

## 多子代理并行执行

当 plan.md 调度表中存在 ≥2 个**互不依赖**的任务时，编排器使用 `Task` 工具在单次 assistant 消息中同时启动多个子代理并行执行，提升整体效率。

### 触发条件

读取 plan.md 的任务调度表，识别其中 `依赖` 列为 `—`（无依赖）且互不冲突的任务组。

### 依赖判断规则

| 条件 | 判定 | 说明 |
|------|------|------|
| 任务操作不同对象（如对象 A 配置 vs 对象 B 配置） | ✅ 可并行 | tenant-config 目录隔离 |
| 任务操作不同代码目录（APL `package/` vs PWC `pwc/` vs 配置 `tenant-config/`） | ✅ 可并行 | 文件系统隔离 |
| 任务操作同一对象的不同子资源（field → layout → layout-rule） | ❌ 不可并行 | layout 依赖 field 先存在，layout-rule 依赖 layout 先存在 |
| 任务操作同一代码文件的先后阶段（实现 → 审查 → 发布） | ❌ 不可并行 | 审查依赖实现完成，发布依赖审查通过 |
| 任务操作同一目录的不同文件（如两个 APL 函数互不调用） | ✅ 可并行 | 文件独立，无代码依赖 |

### 并行策略

编排器在单次 assistant 消息中发送多个 `Task` 工具调用：

```
编排器消息:
  ├── Task(description="配置客户对象", subagent_type="general_purpose_task", query="...")
  ├── Task(description="实现 APL 函数", subagent_type="general_purpose_task", query="...")
  └── Task(description="实现 PWC 插件", subagent_type="general_purpose_task", query="...")
```

所有子代理并行启动，各自独立执行后返回结果。

### 子代理指令模板

每个子代理接收以下结构化指令：

```markdown
## 任务：<任务名称>
对 <对象名/函数名/插件名> 执行以下配置/开发：

### 执行阶段（按顺序）
1. 使用 Skill 工具加载 `<skill-name>` → 按技能指令生成/修改产物
2. 使用 Skill 工具加载 `<skill-name>` → ...

### 关键输入
- PRD 路径：`<enterpriseRoot>/deliverables/<日期>-<功能名>/prd.md`
- 需求规格：<从 PRD 摘录的本任务相关段落>

### 预期产出物
- `<enterpriseRoot>/<精确文件路径1>`
- `<enterpriseRoot>/<精确文件路径2>`

### 验收标准
- <标准1>
- <标准2>

### 操作约束
- 仅操作本任务指定的文件/目录，不碰其他对象或模块
- 内部阶段严格按依赖顺序执行
- 完成后返回产出物路径列表
```

### 跨模板并行场景

| 模板 | 并行任务 | 说明 |
|------|---------|------|
| Template C | 多个对象的配置链 | 例如对象 A 的 object→field→layout 与对象 B 的 object→field→layout→layout-rule 同时执行 |
| Template D | APL 实现 ∥ PWC 实现 | APL 代码与 PWC 插件互不依赖 |
| Template E | 对象配置 ∥ APL 实现 ∥ PWC 实现 | 三者完全独立，同时启动 3 个子代理 |

### 汇合流程

所有并行子代理完成后：

1. 编排器收集各子代理的返回结果
2. 汇总所有产出物路径到一个列表
3. 继续执行后续串行阶段（如审查 → 部署）
4. 如后续阶段有依赖顺序（如部署必须先 Object 后 Field），在汇合后按序执行

### 失败处理

- 某个子代理失败 → 不影响其他子代理，已成功的产出物保留不撤销
- 编排器向用户报告：失败任务名、失败原因
- 用户可选择：「重试失败任务」或「修复后继续」

---

## 文档生成流程

### 适用规则

除 L1 简单配置外，所有模板都必须产出文档。各模板的文档要求：

| 模板 | PRD | Arch | Plan | Review |
|------|-----|------|------|--------|
| A (PWC) | ✅ `Skill: sharedev-pwc-write-prd-spec` | ✅ `Skill: sharedev-pwc-write-arch` | ✅ `Skill: sharedev-pwc-write-plans` | ✅ `Skill: sharedev-pwc-review-code` |
| B (APL) | ✅ `Skill: sharedev-pwc-write-prd-spec`（APL 适配） | ✅ `Skill: sharedev-pwc-write-arch`（APL 适配） | ✅ `Skill: sharedev-pwc-write-plans` | ✅ `Skill: sharedev-apl-code-review` |
| C (Config L2+) | ✅ `Skill: sharedev-pwc-write-prd-spec`（配置适配） | — | ✅ `Skill: sharedev-pwc-write-plans` | — |
| C (Config L1) | ❌ 可跳过（单字段/布局调整无歧义时） | — | ❌ 可跳过 | — |
| D (混合) | ✅ `Skill: sharedev-pwc-write-prd-spec` | ✅ `Skill: sharedev-pwc-write-arch` | ✅ `Skill: sharedev-pwc-write-plans` | ✅ `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` |
| E (全栈) | ✅ `Skill: sharedev-pwc-write-prd-spec` | ✅ `Skill: sharedev-pwc-write-arch` | ✅ `Skill: sharedev-pwc-write-plans` | ✅ `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` |

**红线：** 即使是最简单的 APL 函数，也必须产出 PRD 和 Plan。跳过文档导致返工的代价远超写文档的时间。

### PRD 文档生成

所有模板的 PRD 阶段遵循统一流程（参考 `sharedev-pwc-write-prd-spec` 技能的检查清单）：

1. **探索项目背景** — 检查已有对象/字段/函数、近期提交、相关文档
2. **提出澄清问题** — 逐一提问，了解目的/约束/成功标准
3. **呈现设计方案** — 展示理解后的需求摘要，附选项和推荐
4. **用户批准后** — 写入 `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/prd.md`

**APL PRD 核心内容：**
- 函数职责描述（做什么、何时触发）
- namespace 和绑定对象
- 输入（context 可用变量）和输出（返回类型）
- 核心业务规则（状态流转、校验条件、数据联动）

**配置 PRD 核心内容（Template C L2+）：**
- 配置范围（对象/字段/布局/规则，逐项列出）
- 字段定义（API Name、类型、选项值、默认值、必填/只读）
- 布局变更（哪个布局、哪个 section、字段顺序）
- 规则逻辑（显示/隐藏/只读条件、依赖关系）

**反模式：** "这只是一个小函数/小配置，不需要 PRD" — 即使一句话的需求也有隐含假设，未经审视的假设是返工的最大来源。

### Arch 文档生成（APL 适配）

当模板 B 或 D/E 触发 Arch 阶段时：

1. **加载设计约束** — 读取 `ns_range.md` 确认 namespace 和类型约束；读取 `CORE-RULES.md` 确认代码铁律
2. **确定技术选型** — namespace、返回类型、是否需要绑定对象
3. **设计 API 调用链路** — Fx.object 调用计划、Fx.http/SQL 等（如涉及）
4. **设计数据流** — context 可用数据 → 逻辑处理步骤 → 返回结果结构
5. 写入 `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/arch.md`

**Arch 文档核心内容：**
- 技术选型与理由（为什么用 flow 而非 object_handler）
- API 调用拓扑（调用次数、查询字段精简计划）
- 平台限制合规（300 次/300 秒 等）
- 备选方案与取舍

**配置场景不需要 Arch（Template C）。** 配置类需求没有技术选型空间，决策点已在 PRD 中覆盖。

### Plan 文档生成

Plan 是**编排执行指南**——它的核心职责是告诉 agent："在哪个阶段，调用哪个 Skill，做什么事"。

**Plan 不应该内嵌代码。** 代码由各自阶段的 Skill 在加载后生成。Plan 只管任务调度和 Skill 映射。

**⚠️ 模式切换：** 加载 `Skill: sharedev-pwc-write-plans` 后，必须明确告知该技能使用**编排器模式（Mode 2）**，不要使用独立模式的代码内嵌方式。具体指令：

> "你正被 sharedev-auto 编排器调用。请使用编排器模式（Mode 2）生成 plan.md：只描述任务调度和 Skill 映射，不内嵌代码。"

**🚨 Plan 文档格式铁律 — 覆盖 `sharedev-pwc-write-plans` 的默认模板：**

`sharedev-pwc-write-plans` 技能的默认模板（assets/template.md）是为**独立模式（Mode 1，PWC 前端代码内嵌）** 设计的。当被 `sharedev-auto` 编排器调用时，**必须使用以下格式覆盖该默认模板**：

1. Plan 文档**只能包含**三个顶级章节：`## 1. 关联文档` → `## 2. 任务调度表` → `## 3. 逐任务说明`
2. **严禁**包含：文件结构列表（`## 文件结构`）、步骤复选框（`- [ ] **步骤**`）、代码块（\`\`\`groovy / \`\`\`xml / \`\`\`vue）、预期描述
3. Plan 文档头部**不得**包含子技能引用注释（`> **对于智能体工作者：**` 等行），仅保留标题和简介
4. 每个逐任务说明**只能**包含 5 个字段：`- **调用**:`、`- **做什么**:`、`- **关键输入**:`、`- **输出文件**:`、`- **验证**:`

**正确格式（参考 `2026-05-09-class-form-plugin/plan.md`）：**

```
# 实施计划 — <功能名称>

---

## 1. 关联文档
- PRD: <路径>
- Arch: <路径>

---

## 2. 任务调度表

| # | 阶段 | 调用 Skill | 输入 | 输出（产出物） | 验收标准 | 依赖 |
|---|------|-----------|------|--------------|---------|------|
| 1 | ... | Skill: <完整技能名> | ... | ... | ... | — |

---

## 3. 逐任务说明

### 任务 1: <任务名称>
- **调用**: `Skill: <完整技能名>`
- **做什么**: <用自然语言描述>
- **关键输入**: <来自 PRD/Arch 的需求规格>
- **输出文件**: <精确文件路径>
- **验证**: <如何确认完成>
```

#### 任务调度表示例（Template E 全栈）

```markdown
| # | 阶段 | 调用 Skill | 输入 | 输出 | 验收标准 | 依赖 |
|---|------|-----------|------|------|---------|------|
| 1 | 对象定义 | Skill: sharedev-object | PRD 对象定义 | AnnualBudget__c.object-meta.xml + name/owner 字段 + detail/list 布局 | 对象创建成功，API Name 不与已有冲突，副产物齐全 | — |
| 2 | 字段配置 | Skill: sharedev-field | PRD 字段定义 | budgetCode__c.field-meta.xml (×N) | 字段 API Name/类型/必填与 PRD 一致 | 1 |
| 3 | 布局配置 | Skill: sharedev-layout | PRD 布局需求 + 任务2 产出 | detail/edit.layout-meta.xml (×2) | 字段分组合理，readonly 设置正确 | 2 |
| 4 | APL 实现 | Skill: sharedev-apl-implement | PRD 后端逻辑 + Arch API 设计 | EvtXxx.function.groovy (×N) | compile + analyze 通过 | — |
| 5 | APL 审查 | Skill: sharedev-apl-code-review | 任务4 产出 | REVIEW.md（APL 章节） | 代码约束全通过 | 4 |
| 6 | 配置审查 + 合并 REVIEW | 编排器自行执行 | 任务1/2/3 + 任务5 产出 | REVIEW.md（完整） | 需求追溯 100% | 1,2,3,5 |
| 7 | 部署 | Skill: sharedev-pwc-finish-development | 所有代码+配置 | Object→Field→Layout→APL 按序部署 | 功能可用 | 6 |
```

**关键约束：**
1. Plan 文档**只描述做什么、用什么 Skill、输入输出是什么**，不内嵌代码
2. 每个任务的「调用 Skill」列必须使用完整技能名（如 `Skill: sharedev-field`）
3. 并行任务可标注 `∥` 在依赖列
4. Phase Gate 用 `✅` 标注（PRD/Arch/Plan/Review/Deploy 需要用户确认）
5. 文件路径必须精确，便于后续各阶段定位
6. **Plan 文档不得包含 `- [ ]` 复选框、步骤编号、代码块**——这些是独立模式的产物

### REVIEW.md 生成

| 链类型 | Skill 工具调用 | 产出 |
|--------|--------------|------|
| 纯 PWC (A) | `Skill: sharedev-pwc-review-code` → 按下方「PWC 审查」子流程 | `REVIEW.md`（含 PWC 章节） |
| 纯 APL (B) | `Skill: sharedev-apl-code-review` → 按下方「APL 审查」子流程 | `REVIEW.md`（含 APL 章节） |
| 纯配置 (C) | 无需独立审查（PRD/Plan 即审查基准） | — |
| 混合 (D) | `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` → 合并 | `REVIEW.md`（含 APL+PWC 双章节） |
| 全栈 (E) | `Skill: sharedev-apl-code-review` + `Skill: sharedev-pwc-review-code` + 配置核查 → 合并 | `REVIEW.md`（含 APL+PWC+配置三章节） |

### 审查执行流程（所有链通用）

以下流程适用于 **所有需要产出 REVIEW.md 的链类型**（Template A/B/D/E）。编排器在进入 review 阶段时，根据模板选取对应的审查子步骤，但**输出统一使用相同的 REVIEW.md 模板**。

#### 执行方式

**APL 审查：** 使用 `Skill` 工具加载 `sharedev-apl-code-review`，由其内部的 Phase 0-7 流程执行编译验证、静态分析、代码规范检查和问题分级。

**PWC 审查：** 使用 `Skill` 工具加载 `sharedev-pwc-review-code`，由其内部派发 code-reviewer 子智能体执行代码审查。

**配置审查（Template E 专用）：** 编排器自行执行，按照下方 2c 的检查清单逐项核查。

**合并输出：** 编排器收集各审查结果，按统一模板写入 `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/REVIEW.md`。

#### 模板与章节映射

| REVIEW.md 章节 | A (纯PWC) | B (纯APL) | D (混合) | E (全栈) |
|---------------|-----------|-----------|---------|---------|
| 1. 文档信息 | ✅ | ✅ | ✅ | ✅ |
| 2. 审查范围 | ✅ | ✅ | ✅ | ✅ |
| 3. APL 代码审查 | — | ✅ | ✅ | ✅ |
| 4. PWC 代码审查 | ✅ | — | ✅ | ✅ |
| 5. 配置审查 | — | — | — | ✅ |
| 6. 需求追溯矩阵 | ✅ | ✅ | ✅ | ✅ |
| 7. 审查总结 | ✅ | ✅ | ✅ | ✅ |

#### 步骤 1：收集审查素材

根据模板类型，读取已产出的代码和配置文件，建立审查清单：

```
审查清单 = {
  APL:    所有 .groovy 文件（function.groovy / class.groovy）          ← B/D/E 收集
  PWC:    所有 source/*.js 文件（index.js + 各模块）                   ← A/D/E 收集
  Config: 所有新增/修改的 field-meta.xml / layout-meta.xml / …         ← E 收集
  文档:   PRD.md（需求基准）, arch.md（架构基准）, plan.md（实施基准）   ← 全部收集
}
```

#### 步骤 2：逐层审查（按模板选取）

**2a. APL 审查（Template B / D / E 选取）**

- [ ] 读取 `.groovy` 源文件
- [ ] 对照知识库「APL 代码约束」7 条逐项检查（禁止 for/Range/owner、log.error 单参数、== 常量左置、AND 单键值对、controller 返回 Map）
- [ ] 编译验证：`cd <enterpriseRoot> && sharedev apl compile <ApiName>`
- [ ] 静态分析：`cd <enterpriseRoot> && sharedev apl analyze <ApiName>`
- [ ] 业务逻辑核查：对照 PRD 验证输入/输出/查询条件/错误处理

**2b. PWC 审查（Template A / D / E 选取）**

- [ ] 读取 `source/` 下所有 .js 文件
- [ ] 插件入口检查：模块模式（CommonJS/ES6）、事件注册、资源清理
- [ ] 功能完整性：对照 PRD 逐条验证
- [ ] 代码质量：XSS 防护、内存管理、错误处理、DOM 操作
- [ ] 与参考插件对比：确认模式一致性（如 `findNameInput`、`escapeHtml` 等工具函数）

**2c. 配置审查（Template E 选取）**

- [ ] 字段配置：API Name 格式 `field_xxx__c`、类型正确、options 定义完整、default_is_expression 显式
- [ ] 布局配置：section 分组合理、新字段已嵌入、edit/detail 一致性
- [ ] 布局规则（如有）：不成环、主字段唯一、引用字段存在
- [ ] 对比 PRD：逐字段/布局/规则确认配置与需求一致

#### 步骤 3：需求追溯

对照 PRD 建立追溯矩阵，逐条标注实现位置和状态。覆盖率必须 100%。

#### 步骤 4：问题分级

| 级别 | 标记 | 含义 | 是否阻塞发布 |
|------|------|------|------------|
| 严重 | 🔴 | 代码约束违规、安全漏洞、需求缺失 | 是 |
| 注意 | ⚠️ | 潜在风险、非最优实践 | 否 |
| 建议 | 💡 | 改进建议、性能优化 | 否 |

#### 步骤 5：按统一模板输出 REVIEW.md

写入 `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/REVIEW.md`。

所有链类型**使用同一份输出模板**，按上方「模板与章节映射」选取适用的章节，不适用章节直接跳过。

**统一输出模板：**

```markdown
# 代码审查报告 — <功能名称>

## 1. 文档信息
（审查项目、关联文档、审查日期、审查范围）

## 2. 审查范围
（列出所有审查文件及类型）

## 3. APL 代码审查                                     ← B/D/E 必填
### 3.1 审查对象
### 3.2 编译与静态分析
### 3.3 APL 代码规范检查（7 条逐项）
### 3.4 业务逻辑审查
### 3.5 安全性审查
### 3.6 性能审查
### 3.7 APL 审查结论

## 4. PWC 代码审查                                     ← A/D/E 必填
### 4.1 index.js — 插件入口
### 4.2 <模块名>.js — <模块描述>
（每个 source/*.js 文件一个子章节）
### 4.x PWC 审查结论

## 5. 配置审查                                         ← E 必填
### 5.1 字段配置
### 5.2 布局配置
### 5.3 布局规则（如有）

## 6. 需求追溯矩阵
（PRD 需求 → 实现位置 → 状态，覆盖率统计）

## 7. 审查总结
### 7.1 问题汇总（分级列表）
### 7.2 整体评价（各维度评分）
### 7.3 审查结论（通过/不通过，是否建议发布）
```

**输出约束：**
- 审查结论必须明确：`✅ 审查通过，建议发布` 或 `❌ 审查不通过，需修复后重新审查`
- 纯 PWC（Template A）只输出 `## 1/2/4/6/7` 章节
- 纯 APL（Template B）只输出 `## 1/2/3/6/7` 章节
- 混合（Template D）输出 `## 1/2/3/4/6/7` 章节
- 全栈（Template E）输出全部 `## 1/2/3/4/5/6/7` 章节
- 章节编号保持不变，不适用章节直接省略（不保留空标题）

### 文档产出路径

所有文档统一输出到 `<enterpriseRoot>/deliverables/` 下按日期和功能名称组织的子目录：

```
<enterpriseRoot>/deliverables/
├── 2026-05-07-account-approval-flow/
│   ├── prd.md
│   ├── arch.md
│   ├── plan.md
│   └── REVIEW.md
└── 2026-05-08-customer-search-plugin/
    ├── prd.md
    ├── arch.md
    ├── plan.md
    └── REVIEW.md
```

---

## 经验知识库

以下经验规则在对应阶段自动生效。**遇到以下陷阱时，必须使用正确做法。**

### 命令行陷阱

| # | 陷阱 | 错误用法 | 正确用法 |
|---|------|---------|---------|
| 1 | APL create 参数 | `sharedev apl create --api-name X` | `sharedev apl create --apiname X` |
| 2 | APL compile 参数 | `sharedev apl compile --apiname X` | `sharedev apl compile X`（positional arg） |
| 3 | APL push 参数 | `sharedev apl push --apiname X` | `sharedev apl push X`（positional arg） |
| 4 | APL analyze 参数 | `sharedev apl analyze --apiname X` | `sharedev apl analyze X`（positional arg） |
| 5 | Object push 命令 | 手动编辑 `sharedev config push` | `sharedev object-dev object push --objectApiName <Obj>` |
| 6 | Field push 命令 | 手动编辑 `sharedev config push` | `sharedev object-dev field push --objectApiName <Obj> --fieldApiName <Field>` |
| 7 | Layout push 命令 | `sharedev config push` | `sharedev object-dev layout push --objectApiName <Obj> --layoutApiName <Layout> --type <edit|detail>` |
| 8 | Layout Rule push 命令 | 手动 `sharedev config push` | `sharedev object-dev layout-rule push --objectApiName <Obj> --ruleApiName <Rule>` |

### 目录结构陷阱

| # | 陷阱 | 说明 | 解决方案 |
|---|------|------|----------|
| 1 | PWC 源文件路径 | `pwc deploy` 只推送 `source/` 子目录的 JS 文件 | 所有 .js 文件必须放在 `<enterpriseRoot>/pwc/plugins/<name>/source/` 下 |
| 2 | Layout 文件查找 | `object-dev layout push` 从 `<enterpriseRoot>/tenant-config/` 查找 | 确保 `tenant-config/ -> <租户ID>/tenant-config/` 符号链接存在 |
| 3 | .sharedev/settings.json | sharedev CLI 需要此文件存在于 .sharedev/ 目录 | 从根目录 settings.json 复制到 .sharedev/ |
| 4 | Layout 符号链接 | 空目录下的符号链接可能导致路径问题 | 先 `rm -rf tenant-config` 再 `ln -sf <租户ID>/tenant-config tenant-config` |
| 5 | 工作目录错误 | PWC deploy 和 APL push 从 `<workspaceRoot>` 无法找到 git 仓库和源文件 | **所有 sharedev CLI 命令必须在 `<enterpriseRoot>` 目录下执行**（即先 `cd <enterpriseRoot>`）。`object-dev * push` 从根目录可能看似可行（因 tenant-config 符号链接），但 `pwc deploy`、`apl push`、`apl compile` 等命令依赖 `<enterpriseRoot>` 下的 `.git` 仓库和 `package/`、`pwc/` 目录，从根目录执行必定失败 |

### APL 代码约束

| # | 约束 | 错误示例 | 正确示例 |
|---|------|---------|---------|
| 1 | 禁止 for 循环 | `for (int i=0; i<n; i++)` | 使用 `each` 或 `collect` 或 `join` |
| 2 | 禁止 Range 表达式 | `(0..<n).each {}` | 使用 `errors.join('\n')` |
| 3 | owner 是保留字 | `String owner = ...` | `String ownerValue = ...` |
| 4 | log.error 单参数 | `log.error("msg", e)` | `log.error("msg: ${e.message}")` |
| 5 | == 常量放左边(SecurityException) | `"Add" == interfaceCode` | `interfaceCode == "Add"` |
| 6 | AND 参数每个 Map 限一个键值对 | `AND(["a":1, "b":2])` | `AND(["a":1], ["b":2])` |
| 7 | controller 返回类型是 Map | 返回 `List` 或 `String` | `return [data: resultList]`（Map 格式） |

### Layout Rule 配置约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | 布局先行 | layout-rule 只能引用已存在布局中的字段，必须先创建 layout |
| 2 | 数量上限 | 每个布局最多 10 条规则（含字段控制和页面控制两种类型） |
| 3 | 不成环 | 条件字段和叶子字段不能相同，否则规则失效 |
| 4 | 主字段唯一 | 同一布局内不同规则的主字段不可重复 |
| 5 | 页面控制互斥 | 同一字段不能同时配置为 hide_field 和 readonly_field |
| 6 | 从对象限制 | 主从同时新建的从对象不允许页面控制规则 |
| 7 | 从对象字段限制 | 从对象布局规则不支持创建人、归属部门、负责人 |

### 对象配置约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | 先读后写 | 生成对象配置前必须先读取 `<enterpriseRoot>/tenant-config/objects/` 确认对象是否已存在、API Name 是否冲突 |
| 2 | 命名即契约 | 自定义对象 API Name 必须使用 `__c` 后缀；标准对象（package 类型）不可修改 API Name，只能修改功能开关和显示名 |
| 3 | 新建必产副产物 | 新建自定义对象时，**必须**同步产出 4 个副产物：`name` 字段、`owner` 字段、detail 详情布局、list 移动端摘要布局。缺少任何一个都会导致对象不可用 |
| 4 | 不默认生成 edit 布局 | edit 布局（新建/编辑页）和 list_layout（Web 端列表页）不是默认配置，需用户显式触发 `Skill: sharedev-layout` |
| 5 | 功能开关最小化 | 仅启用用户明确需要的功能开关，不默认全开 |
| 6 | 标准与自定义分离 | 标准对象（define_type=package）只能修改功能开关和显示名；新建时状态用 `new`，修改时用 `modified` |

### 字段配置约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | 对象先行 | 字段必须依附于已存在的对象，目标对象不存在时提示先用 `Skill: sharedev-object` 创建 |
| 2 | 先读已有字段 | 生成字段前必须扫描 `<enterpriseRoot>/tenant-config/objects/<Obj>/fields/` 目录，确认新字段 API Name 不冲突 |
| 3 | 命名格式 | 自定义字段 API Name 格式 `field_<id>__c`，新建状态用 `new`，修改用 `modified` |
| 4 | 类型选错不可逆 | 字段类型决定数据存储/校验/UI 渲染，选错后无法更改；必须查阅 field-types.md 确认约束和适用场景 |
| 5 | 公式/表达式先校验 | formula 字段或默认值为表达式时，必须先读 formula-generation.md、收集 availableFields/globalVariables，禁止擅自猜测 |
| 6 | default_is_expression 必须显式 | 表达式默认值须设置 `default_is_expression=true`，字面量默认值须设置 `default_is_expression=false`，不可省略 |
| 7 | 一字段一文件 | 每个字段独立一个 XML 文件，不可将多个字段写在同一文件中 |

### PWC 服务端操作

| # | 操作 | 说明 |
|---|------|------|
| 1 | create 先于 deploy | 插件需先 `pwc create` 在服务端创建，再 `pwc deploy` 推送本地文件 |
| 2 | plugin-type | objectform 插件使用 `edit_plugin` 类型创建，需 `--limit-obj true --scope-objects <ApiName>` |
| 3 | deploy 验证 | 输出中 `files=N, source=N`，source 数量应等于实际 JS 文件数 |

### 服务端限制

| # | 限制 | 说明 |
|---|------|------|
| 1 | `QueryDescribeListByApiName` API | 部分租户不可用，layout push 的 pre-pull 可能失败，重试通常可解决 |
| 2 | APL push 后需等待 | APL push 成功后服务端可能需要几秒生效，后续测试间隔 3-5 秒 |

### 多子代理并行

| # | 规则 | 说明 |
|---|------|------|
| 1 | 并行条件 | 仅当 plan.md 调度表中有 ≥2 个互不依赖的任务时触发 |
| 2 | 子代理隔离 | 每个子代理操作的文件/目录互不重叠，杜绝冲突 |
| 3 | 子代理内串行 | 单个子代理内的任务链仍严格按依赖顺序执行 |
| 4 | Token 预算 | 并行子代理消耗大量 context；每个子代理分配清晰的有限范围指令，避免冗长 |
| 5 | 汇合检查 | 所有子代理完成后，编排器验证每个任务的产出物完整性 |
| 6 | 单消息多调用 | 所有并行子代理必须在单次 assistant 消息中通过多个 `Task` 工具调用同时启动 |

### 推送确认

| # | 规则 | 说明 |
|---|------|------|
| 1 | 强制硬停止 | 所有模板（A/B/C/D/E）的最终推送/部署阶段均为最高优先级硬停止点，必须等待用户明确授权（"确认发布"/"确认"/"推送"） |
| 2 | 推送前预览 | 执行任何 push/deploy 命令前，必须列出所有待推送项目清单（文件路径 + 对应命令），供用户审查 |
| 3 | 不得自动推送 | 任何情况下都不得在无用户确认时自动执行 push/deploy 命令 |

---

## Phase Gate 协调

### 硬停止点规则

以下节点**必须**暂停并等待用户明确输入：

| Phase | 触发条件 | 等待输入 | 继续指令 |
|-------|---------|---------|---------|
| PRD 完成 | `Skill: sharedev-pwc-write-prd-spec` 产出 PRD | 用户确认或修改意见 | "确认"/"继续" |
| Arch 完成 | `Skill: sharedev-pwc-write-arch` 产出 arch.md | 用户确认或修改意见 | "确认"/"继续" |
| Plan 完成 | `Skill: sharedev-pwc-write-plans` 产出 plan.md | 用户确认或修改意见 | "确认"/"继续" |
| 实现完成 | 代码生成/配置完成 | 用户确认进入审查 | "继续审查"/"继续" |
| 审查完成 | `Skill: sharedev-pwc-review-code` / `Skill: sharedev-apl-code-review` 产出 REVIEW.md | 用户确认进入部署 | "确认发布"/"继续" |
| 部署前 | 🔴 所有代码/配置已就绪，审查通过，准备执行 push/deploy 命令 | 🚫 强制停止 | "确认"/"发布"（🚫 此为最高优先级硬停止点，不得在任何模板中跳过） |

### 断点续传

当用户在某个 Phase Gate 说"不"或要求修改时：
1. 保留所有已完成产物（PRD/arch/plan/代码/配置）
2. 记录当前 Phase 位置
3. 用户说"继续"时，从上次暂停的 Phase 恢复
4. 如果用户说"从 PRD 重新来"，清空下游产物并回到 PRD 阶段

### 跨技能状态传递

- PRD 确认后 → 自动携带 PRD 路径进入 Arch 阶段
- Arch 确认后 → 自动携带 arch.md 路径进入 Plan 阶段
- Plan 确认后 → 子智能体自动读取 plan.md
- REVIEW.md 生成后 → 自动关联到部署阶段

### ⚠️ Phase Gate 递进铁律 — 禁止跳过 Skill 调用

**🚨 每个 Phase Gate 用户确认后，agent 必须执行以下两步，缺一不可：**

```
Step 1: Skill 工具加载下一阶段技能  ← 必须先调用 Skill 工具，不得直接读写文件
Step 2: 按技能指令生成/修改产物    ← 技能加载后展开的指令会指导具体操作
```

**具体递进规则（所有模板通用）：**

| 当前 Phase | 用户确认后 | 必须调用 | 禁止行为 |
|-----------|-----------|---------|---------|
| PRD 完成 | "确认"/"继续" | `Skill: sharedev-pwc-write-arch` | 禁止直接读取 arch 模板编写 arch.md |
| Arch 完成 | "确认"/"继续" | `Skill: sharedev-pwc-write-plans` | 禁止直接读取 plan 模板编写 plan.md |
| Plan 完成 | "确认"/"继续" | 按 plan.md 调度表调用 `Skill: sharedev-object` / `Skill: sharedev-apl-implement` 等 | 禁止绕过 Skill 直接创建文件 |
| 实现完成 | "继续审查"/"继续" | `Skill: sharedev-apl-code-review` / `Skill: sharedev-pwc-review-code` | 禁止手动编写 REVIEW.md |
| 审查完成 | "确认发布"/"继续" | `Skill: sharedev-pwc-finish-development` | 禁止手动执行部署命令 |

**为什么这是铁律：**
- 每个 Skill 的 SKILL.md 包含该阶段特有的检查清单、模板、约束和硬停止点
- 跳过 Skill 调用 = 丢失这些指令 = 可能导致遗漏检查项、违反代码约束、产出物格式不一致
- 特别是 `write-plans` 技能包含「编排器模式 vs 独立模式」的模式切换指令，不加载技能则永远看不到这些指令

**验证方法：** 每次准备进入下一 Phase 时，问自己："我是否用 Skill 工具加载了对应的技能？" 如果答案是否，立即停止并执行。

---

## 多技能产物协调

### 目录规范

| 项目类型 | 产物路径 | 说明 |
|---------|---------|------|
| 所有项目 | `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/` | 统一 deliverables 根目录 |
| PRD | `<根>/prd.md` | 产品需求文档 |
| 架构 | `<根>/arch.md` | 技术架构设计 |
| 计划 | `<根>/plan.md` | 实施计划 |
| 审查 | `<根>/REVIEW.md` | 合并审查报告 |
| PWC 代码 | `<enterpriseRoot>/pwc/plugins/<Name>__c/source/` | PWC 插件源文件 |
| APL 代码 | `<enterpriseRoot>/package/fx/custom/apl/script/<Name>.function.groovy` | APL 函数 |
| APL Class | `<enterpriseRoot>/package/fx/custom/apl/script/<Name>.class.groovy` | APL 类 |
| 对象配置 | `<enterpriseRoot>/tenant-config/objects/<ApiName>/` | 对象/字段/布局/规则配置 |

### REVIEW.md 合并规则

> 详细执行流程和输出模板见上方「审查执行流程」章节。

### 配置类项目特殊处理

纯配置项目（Template C：field/layout/layout-rule）不创建 deliverables 目录，配置文件直接写入 `<enterpriseRoot>/tenant-config/` 标准路径。

---

## 部署顺序编排

> ⛔ **强制确认声明：在执行以下任一部署命令之前，必须硬停止并等待用户明确授权（"确认发布"/"确认"/"推送"）。不得自动执行任何 push/deploy 命令。此规则适用于 Template A/B/C/D/E 所有模板，为最高优先级硬停止点。**

### ⚠️ 强制前置步骤：切换到 `<enterpriseRoot>` 目录

**在执行任何部署命令之前，agent 必须先 `cd` 进入 `<enterpriseRoot>` 目录（即 `<workspaceRoot>/<enterpriseEAName>`）。**

```
cd <enterpriseRoot>
```

**原因：**
- `sharedev apl push`、`sharedev apl compile`、`sharedev apl create` 依赖 `<enterpriseRoot>/.git` 仓库和 `<enterpriseRoot>/package/` 目录
- `sharedev pwc deploy`、`sharedev pwc create` 依赖 `<enterpriseRoot>/.sharedev/settings.json` 和 `<enterpriseRoot>/pwc/` 目录
- `sharedev object-dev * push` 依赖 `<enterpriseRoot>/tenant-config/` 符号链接
- 从 `<workspaceRoot>` 执行这些命令会因找不到 git 仓库、源文件而失败

**禁止从 `<workspaceRoot>` 直接执行 sharedev CLI 命令。所有命令的 `cwd` 必须设置为 `<enterpriseRoot>`。**

### 强制部署顺序

```
Object → Field → Layout → Layout Rule → APL → PWC
```

**不可更改此顺序。** 每一步成功后才执行下一步。

### 部署命令

| 步骤 | 资源类型 | 命令 | 前置检查 |
|------|---------|------|---------|
| 1 | Object | `sharedev object-dev object push --objectApiName <Obj>` | 对象目录存在；object-meta.xml 存在；新建自定义对象时 name/owner 字段 + detail/list 布局齐全 |
| 2 | Field | `sharedev object-dev field push --objectApiName <Obj> --fieldApiName <Field>` | 对象已部署；field-meta.xml 存在；API Name 不冲突 |
| 3 | Layout | `sharedev object-dev layout push --objectApiName <Obj> --layoutApiName <Layout> --type <edit\|detail>` | `<enterpriseRoot>/tenant-config/` 符号链接存在；layout 文件存在 |
| 4 | Layout Rule | `sharedev object-dev layout-rule push --objectApiName <Obj> --ruleApiName <Rule>` | 布局已部署；规则数 ≤10；不成环/主字段唯一 |
| 5 | APL | `sharedev apl push <ApiName>` | compile + analyze 通过（0 violations） |
| 6 | PWC | `sharedev pwc deploy <PluginName>` | JS 文件在 source/ 子目录；`files=N, source=N` 一致 |

### 部署步骤展开

#### 步骤 1: Object 部署

```
Pre-check:
  □ 对象目录存在于 <enterpriseRoot>/tenant-config/objects/<Obj>/
  □ object-meta.xml 存在且 status 正确（新建=new，修改=modified）
  □ 命名符合规范（自定义对象 __c 后缀，标准对象不可改 API Name）
  □ 新建自定义对象：确认 name/owner 字段 + detail/list 布局已同步产出

执行: cd <enterpriseRoot> && sharedev object-dev object push --objectApiName <Obj>

错误处理:
  - "API Name conflict" → 检查命名规范，确认不与已有对象冲突
  - "file not found" → 检查 <enterpriseRoot>/tenant-config 符号链接
```

#### 步骤 2: Field 部署

```
Pre-check:
  □ 目标对象已成功部署
  □ field-meta.xml 存在于 <enterpriseRoot>/tenant-config/objects/<Obj>/fields/
  □ 字段 API Name 不与已有字段冲突
  □ 命名符合 field_<id>__c 格式
  □ status 正确（新建=new，修改=modified）
  □ 若为 formula 字段或表达式默认值：formula-generation.md 已校验

执行: cd <enterpriseRoot> && sharedev object-dev field push --objectApiName <Obj> --fieldApiName <Field>
```

#### 步骤 3: Layout 部署

```
Pre-check:
  □ <enterpriseRoot>/tenant-config/ 符号链接存在且可访问
  □ layout 文件存在于 <enterpriseRoot>/tenant-config/objects/<Obj>/layouts/

执行: cd <enterpriseRoot> && sharedev object-dev layout push --objectApiName <Obj> --layoutApiName <Layout> --type <edit|detail>

错误处理:
  - "action entity not found" → 重试（服务端 API 暂时不可用）
  - "file not found" → 检查 <enterpriseRoot>/tenant-config 符号链接
```

#### 步骤 4: Layout Rule 部署

```
Pre-check:
  □ 目标布局已成功部署
  □ 规则文件存在于 <enterpriseRoot>/tenant-config/objects/<Obj>/layout-rules/
  □ 规则引用字段均存在于布局中
  □ 规则总数 ≤10
  □ 字段控制：主字段未被占用且不成环
  □ 页面控制：同布局同页面类型无冲突

执行: cd <enterpriseRoot> && sharedev object-dev layout-rule push --objectApiName <Obj> --ruleApiName <Rule>
```

#### 步骤 5: APL 部署

```
Pre-check:
  □ compile 通过
  □ analyze 通过（0 violations）
  □ 代码约束全部满足（无 for/range/owner/AND 问题）

执行: cd <enterpriseRoot> && sharedev apl push <ApiName>
```

#### 步骤 6: PWC 部署

```
Pre-check:
  □ JS 文件在 <enterpriseRoot>/pwc/plugins/<Name>/source/ 子目录
  □ 插件已在服务端创建（pwc create 先执行）
  □ <enterpriseRoot>/.sharedev/settings.json 存在

执行: cd <enterpriseRoot> && sharedev pwc deploy <PluginName>

验证: 输出 files=N, source=N，source 数量 = 实际 JS 文件数
```

### 仅配置类部署

当仅涉及 object/field/layout/layout-rule 时：
- L2+ 配置：必须先产出 prd.md + plan.md，写入 deliverables 目录
- L1 配置：可跳过文档阶段，直接执行配置操作
- 仅执行步骤 1-4 中涉及的部分
- 跳过步骤 5 和 6（PWC/APL 部署）

---

## 红线（绝不触犯）

**绝不：**
- 跳过需求分类直接开始实现——必须先分析并展示分类结果
- 在用户确认前自动进入执行模式——分类结果展示后必须等待确认
- 跳过 Phase Gate——PRD/Arch/Plan/审查/发布 必须用户明确确认
- 在 L2+ 复杂度场景跳过 PRD——即使"只有一个函数"也必须产出 prd.md
- 在未产出 Plan 的情况下开始 APL 代码编写——必须先有 plan.md 拆解任务
- 颠倒部署顺序——必须 Object → Field → Layout → Layout Rule → APL → PWC
- 在不读取已有配置的情况下生成对象/字段配置——必须先读后写
- 新建自定义对象时不产出 name/owner 字段 + detail/list 布局——缺一不可
- 在字段类型不确认的情况下直接生成 field-meta.xml——选错不可逆
- 在未校验公式/表达式的情况下生成 formula 字段——必须先读 formula-generation.md
- 在 PWC deploy 前不检查 source/ 子目录
- 在 Object/Field/Layout push 前不检查 <enterpriseRoot>/tenant-config 路径
- 在 Layout Rule 生成前不检查布局是否存在
- 在 APL compile 前不使用 positional arg 方式
- 忽略 skill 内部的硬停止点——每个技能有自己的 Phase Gate，必须遵守
- **Phase Gate 递进时跳过 Skill 工具调用**——每个 Phase Gate 用户确认后，必须先调用 `Skill` 工具加载下一阶段技能，再按技能指令操作（详见「Phase Gate 递进铁律」章节）
- 在 `<workspaceRoot>` 直接执行 sharedev 命令——所有 CLI 命令必须先 `cd <enterpriseRoot>`
- 在未硬停止等待用户明确授权的情况下执行任何 sharedev * push / sharedev * deploy 命令——所有推送命令执行前必须展示待推送清单、硬停止等待确认

**如果用户要求跳过某个 Phase：**
- 明确说明跳过该 Phase 的风险
- 记录用户的选择
- 不强行阻止但必须告知后果

---

## 集成

- **关联技能：** 此技能是所有 ShareDev 技能的入口编排层
  - 文档流程（所有链）：`Skill: sharedev-pwc-write-prd-spec` → `Skill: sharedev-pwc-write-arch` → `Skill: sharedev-pwc-write-plans` → `Skill: sharedev-pwc-review-code` / `Skill: sharedev-apl-code-review`
  - PWC 实现：`Skill: sharedev-pwc`、`Skill: sharedev-pwc-subagent-driven-development`、`Skill: sharedev-pwc-finish-development`、`Skill: sharedev-pwc-fix-bug`
  - APL 实现：`Skill: sharedev-apl-init`、`Skill: sharedev-apl-implement`
  - 配置实现：`Skill: sharedev-object`、`Skill: sharedev-field`、`Skill: sharedev-layout`、`Skill: sharedev-layout-rule`
- **输入：** 用户的一句话自然语言需求或 Word 文档内容
- **输出：** 端到端的功能交付（文档 + 代码 + 配置 + 部署）
- **产物位置：** `<enterpriseRoot>/deliverables/YYYY-MM-DD-<功能名称>/`（prd.md、arch.md、plan.md、REVIEW.md）；代码在 `<enterpriseRoot>/pwc/plugins/`、`<enterpriseRoot>/package/fx/custom/apl/script/`；配置在 `<enterpriseRoot>/tenant-config/`

---

## 快速参考

### 典型需求 → 模板映射

| 用户需求示例 | 分类结果 | 模板 |
|-------------|---------|------|
| "在客户新建页面加个校验和搜索" | PWC objectform + APL（L4） | Template D |
| "写一个批量更新客户状态的 APL 函数" | 纯 APL（L3） | Template B（`Skill: sharedev-pwc-write-prd-spec` → `Skill: sharedev-pwc-write-arch` → `Skill: sharedev-pwc-write-plans` → `Skill: sharedev-apl-init` → `Skill: sharedev-apl-implement` → `Skill: sharedev-apl-code-review`） |
| "给客户对象加一个来源渠道下拉字段" | field + layout（L2） | Template C（prd→plan→field→layout） |
| "根据客户等级动态显示信用额度字段" | layout-rule 字段控制（L1） | Template C（layout→layout-rule，L1 可跳过 PRD） |
| "新建页面隐藏审批状态字段" | layout-rule 页面控制（L1） | Template C（layout→layout-rule，L1 可跳过 PRD） |
| "做个客户表单插件，要校验+搜索联想+布局调整+根据类型动态显示字段" | 全栈（L5） | Template E |
| "调整客户详情页布局，把联系方式放前面" | layout（L1） | Template C |
| 📄 "根据这份 Word 文档做客户表单，文档里有字段列表和校验规则" | PWC objectform + APL + Field（L5） | Template E |
| 📄 "这份需求文档描述了一个定时任务，每天同步客户数据" | 纯 APL（L3） | Template B |
| 📄 "做一个客户表单插件，详细需求见客户表单需求.docx" | PWC objectform + 概述补充（L4/L5） | Template D 或 E（视文档内容） |

### 常见坑速查

| 场景 | 陷阱 | 正确做法 |
|------|------|---------|
| Object 创建 | 不读已有配置直接生成，API Name 冲突 | 先读 `<enterpriseRoot>/tenant-config/objects/`，确认不冲突 |
| Object 创建 | 新建自定义对象忘记产生副产物 | 同步产出 name/owner 字段 + detail/list 布局 |
| Object 创建 | 标准对象改了 API Name | 标准对象（package 类型）只能改功能开关和显示名 |
| Field 创建 | 目标对象不存在就创建字段 | 先用 `Skill: sharedev-object` 确认对象存在 |
| Field 创建 | 字段类型随便选，后续后悔 | 查阅 field-types.md 确认约束和适用场景 |
| Field 创建 | formula 字段不校验公式直接生成 | 先读 formula-generation.md，收集上下文再生成 |
| Field 创建 | default_is_expression 忘记设置 | 表达式=true，字面量=false，必须显式填写 |
| PWC 部署 | JS 不在 source/ 只推送了 index.js | 所有 JS 放入 source/ 子目录 |
| Object/Field/Layout 推送 | 命令用错 `sharedev config push` | 用 `sharedev object-dev <type> push` 系列命令 |
| Layout 路径 | tenant-config 找不到文件 | 建立符号链接到 `<enterpriseRoot>/tenant-config` |
| APL 编译 | `--apiname` 标志不识别 | 用 positional arg |
| APL 代码 | for 循环 SecurityException | 用 each/collect/join |
| APL 代码 | owner 编译错误 | 改名 ownerValue |
| 部署顺序 | 先 PWC 后 APL 导致关联失败 | 严格 Object→Field→Layout→Layout Rule→APL→PWC |
| 工作目录 | 从 `<workspaceRoot>` 执行 sharedev CLI，apl push/pwc deploy 找不到 git 或源文件 | **所有 sharedev 命令必须 `cd <enterpriseRoot>` 后执行** |
| Layout Rule | 规则引用不存在的字段 | 先确认布局中字段存在 |
| Layout Rule | 规则数超过 10 条 | 合并相关联的字段控制到同一规则分支 |
| Layout Rule | 字段控制成环 | 条件字段不出现在对应叶子节点中 |
| 文档流程 | APL/配置项目直接写代码，跳过了 PRD/Plan | 即使是 L2 函数也必须先产出 prd.md 和 plan.md |
| 文档流程 | namespace 选错（如把 class 当 function） | Arch 阶段读取 ns_range.md 确认约束 |
| 文档流程 | PRD 完成后直接写代码，没有 Plan | Plan 阶段拆解任务粒度，避免遗漏步骤 |
| 文档流程 | 代码写完直接部署，跳过审查 | APL compile+analyze、PWC `Skill: sharedev-pwc-review-code` 缺一不可 |