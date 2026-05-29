---
name: sharedev-apl-implement
description: |
  APL开发流程助手。提供从需求分析、需求文档生成、代码实现、代码审查到发布确认的完整开发流程指导，
  强制执行阶段门槛、文档产物和硬停止点，适配 Trae IDE、Claude Code、Codex。
  
  触发场景:
  - 开始APL开发任务(按钮/流程/计划任务/自定义控制器等)
  - 需要代码规范检查
  - 需要开发流程指导
  - 需要查找API文档
  - 需要错误处理和调试帮助
  - 检测到prd.md存在时自动开始开发
---

> ## 🔴 阻塞级首步 — SHARE DEV TRACE（全任务暂停，立即执行）
>
> 当你读到这行字时，**停止一切分析和编码动作**，立即在终端执行以下命令。
> **在此之前不得执行任何其他命令、不得读取任何文件、不得输出任何代码。**
>
> ```bash
> sharedev trace -m skill --str1 sharedev-apl-implement
> ```
>
> 执行成功后方可继续后续内容。此命令用于记录技能调用轨迹。
> **如果跳过此步骤，本次任务视为流程违规，需从 Step 0 重新开始。**

---

# 🔴 执行前必读 - 强制检查点

本技能严格遵循以下强制流程，遗漏任一检查点即为流程违规：

### ⚠️ 核心规则（必须遵守）

1. **Step 1 不可跳过**：必须先刷新 docs/specs
2. **Step 2 不可跳过**：必须检查 PRD 是否存在
3. **Step 3 不可跳过**：prd 不存在时，必须询问用户是否生成文档
4. **Step 4 不可跳过**：用户选择生成文档时，必须先完成 prd/arch/plan
5. **Step 11 是硬停止点**：代码审查前必须询问用户
6. **Step 14 是发布确认点**：只有用户明确要求才能执行 push

### 🚦 Phase Gate 状态机

```
Phase -1 (刷新) → Phase 0 (prd检查) → Phase 1 (需求分析) → Phase 2 (目录判断) → Phase 3 (代码实现) → Phase 4 (规范检查) → Phase 5 (代码审查) → Phase 6 (发布)
```

每个 Phase 转换前必须验证前置条件，不满足则阻断。

### ⚠️ 阻断条件

| 阻断条件 | 阻断阶段 | 恢复方式 |
|---------|---------|---------|
| PRD不存在且用户未选择 | Phase 1 及之后 | 用户选择生成或跳过 |
| 文档生成未完成 | Phase 3 及之后 | 完成文档生成 |
| 编译失败 | Phase 4 及之后 | 修复代码 |
| 静态分析失败 | Phase 4 及之后 | 修复违规项 |

### 🔴 强制流程检查清单

```
🔴 强制流程（遗漏任一项即为流程违规）：
- [ ] Step 1: 刷新 `<enterpriseEA>/.sharedev/docs/` 和 `<enterpriseEA>/.sharedev/specs/`
- [ ] Step 2: 检查 PRD 文档是否存在
- [ ] Step 3: PRD 不存在时，询问是否生成需求文档
- [ ] Step 4: 如用户选择生成，创建 prd.md / arch.md / plan.md
- [ ] Step 5: 需求分析 + 场景识别
- [ ] Step 6: 输出目录判断
- [ ] Step 7: 创建或更新 APL 函数/类（如需要）
- [ ] Step 8: 实现业务逻辑
- [ ] Step 9: 编译检测（sharedev apl compile）
- [ ] Step 10: 静态分析（sharedev apl analyze）
- [ ] Step 11: 🛑 硬停止！询问是否进行代码审查
- [ ] Step 12: 执行代码审查（优先调用 sharedev-apl-code-review，缺失时本地审查）
- [ ] Step 13: 查看变更（sharedev apl diff）
- [ ] Step 14: 询问是否发布到服务端（sharedev apl push）
- [ ] Step 15: 开发完成总结
```

### ⚠️ 强制交互点（必须使用 AskUserQuestion）

以下场景**必须**使用当前环境的交互能力（AskUserQuestion）询问用户：

| 场景 | Phase | 说明 |
|------|-------|------|
| PRD 不存在，询问是否生成文档 | Phase 0 | **不可跳过** |
| 询问是否生成 prd/arch/plan 文档 | Phase 0 | 用户选择后执行 |
| 询问是否进行代码审查 | Phase 5 | **硬停止点** |
| 询问是否发布到服务端 | Phase 6 | **必须用户明确授权** |

## 🚦 Phase Gate 状态机详解

### 状态转换图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Phase Gate 状态机                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────┐    刷新成功     ┌──────────┐    PRD存在/用户选择    ┌──────────┐        │
│  │ Phase -1 │ ───────────────>│ Phase 0  │ ──────────────────────>│ Phase 1  │        │
│  │  (刷新)  │                  │(PRD检查) │                        │(需求分析)│        │
│  └──────────┘                  └──────────┘                        └──────────┘        │
│       │                              │                                   │           │
│       │ 刷新失败                     │ PRD不存在                         │ 分析完成   │
│       │ (阻断)                       │ (询问用户)                        │            │
│       ↓                              ↓                                   ↓           │
│  ┌──────────┐                  ┌──────────┐                        ┌──────────┐        │
│  │  阻断    │                  │ 用户选择 │                        │ Phase 2  │        │
│  │          │                  │          │                        │(目录判断)│        │
│  └──────────┘                  └──────────┘                        └──────────┘        │
│                                     │                                   │           │
│                                     │ 选择生成文档                       │ 判断完成   │
│                                     ↓                                   ↓           │
│                                ┌──────────┐                        ┌──────────┐        │
│                                │ Phase 0.5│                        │ Phase 3  │        │
│                                │(文档生成)│                        │(代码实现)│        │
│                                └──────────┘                        └──────────┘        │
│                                     │                                   │           │
│                                     │ 文档完成                          │ 实现完成   │
│                                     └───────────────────────────────────┘           │
│                                                                         ↓           │
│                                                                  ┌──────────┐        │
│                                                                  │ Phase 4  │        │
│                                                                  │(规范检查)│        │
│                                                                  └──────────┘        │
│                                                                       │              │
│                                          ┌────────────────────────────┤              │
│                                          │                            │              │
│                                          ↓ 编译/分析通过              ↓ 失败(阻断)   │
│                                   ┌──────────┐                  ┌──────────┐         │
│                                   │ Phase 5  │                  │  阻断    │         │
│                                   │(代码审查)│                  │ 修复代码 │         │
│                                   └──────────┘                  └──────────┘         │
│                                        │                                            │
│                          ┌─────────────┴─────────────┐                              │
│                          │                           │                              │
│                          ↓ 用户确认审查              ↓ 用户跳过审查                  │
│                   ┌──────────┐                ┌──────────┐                          │
│                   │ 执行审查 │                │ 跳过审查 │                          │
│                   └──────────┘                └──────────┘                          │
│                          │                           │                              │
│                          └───────────┬───────────────┘                              │
│                                      ↓                                              │
│                               ┌──────────┐                                         │
│                               │ Phase 6  │                                         │
│                               │  (发布)  │                                         │
│                               └──────────┘                                         │
│                                    │                                               │
│                          ┌─────────┴─────────┐                                     │
│                          │                   │                                     │
│                          ↓ 用户明确授权       ↓ 用户未授权                          │
│                   ┌──────────┐          ┌──────────┐                              │
│                   │ 执行push │          │ 跳过push │                              │
│                   └──────────┘          └──────────┘                              │
│                          │                   │                                     │
│                          └─────────┬─────────┘                                     │
│                                    ↓                                               │
│                             ┌──────────┐                                          │
│                             │   完成   │                                          │
│                             └──────────┘                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 状态转换条件表

| 当前状态 | 前置条件 | 转换条件 | 目标状态 | 阻断条件 |
|---------|---------|---------|---------|---------|
| Phase -1 | 无 | 刷新成功 | Phase 0 | 刷新失败 |
| Phase 0 | 刷新成功 | PRD存在 或 用户选择 | Phase 1 或 Phase 0.5 | PRD不存在且用户未选择 |
| Phase 0.5 | 用户选择生成文档 | 文档生成完成 | Phase 1 | 文档生成失败 |
| Phase 1 | PRD确认 | 需求分析完成 | Phase 2 | 信息缺失 |
| Phase 2 | 需求分析完成 | 目录判断完成 | Phase 3 | 目录不存在 |
| Phase 3 | 目录确认 | 代码实现完成 | Phase 4 | 实现失败 |
| Phase 4 | 代码完成 | 编译+分析通过 | Phase 5 | 编译/分析失败 |
| Phase 5 | 规范检查通过 | 用户确认 | Phase 6 或 完成 | 无 |
| Phase 6 | 代码审查完成 | 用户明确授权 | 完成 | 用户未授权push |

### 硬停止点说明

| 硬停止点 | 位置 | 必须动作 | 允许跳过 |
|---------|------|---------|---------|
| Phase 0 → Phase 1 | PRD检查 | 询问用户是否生成文档 | 用户选择跳过文档生成 |
| Phase 4 → Phase 5 | 规范检查 | 编译+分析必须通过 | ❌ 不可跳过 |
| Phase 5 → Phase 6 | 代码审查 | **必须询问用户** | 用户选择跳过审查 |
| Phase 6 → 完成 | 发布确认 | **必须用户明确授权** | 用户选择不发布 |

# 严格审批模式（默认开启）

本技能默认按"流程优先于实现"执行。除非用户明确要求跳过某一阶段且该阶段不是强制门槛，否则必须遵循以下硬规则：

1. 必须先给出当前阶段清单和状态，再进入执行。
2. 未完成 `prd.md / arch.md / plan.md` 生成或确认前，禁止进入代码实现阶段。
3. 每完成一个阶段，都必须向用户回报：
   - 已完成步骤
   - 新生成或更新的文件
   - 未完成步骤
   - 当前阻断项
4. 遇到信息缺失、工具缺失、环境不支持时，不得自行跳过，必须明确报告为阻断或降级处理。
5. 进入代码审查前必须硬停止并等待用户确认。
6. 进入发布前必须硬停止并等待用户确认。
7. 未经用户明确授权，禁止执行 `sharedev apl push`。
8. 最终输出必须按流程清单逐项对账，不能只汇报代码结果。

### 阶段退出条件

只有满足以下条件，才允许进入下一阶段：

| 阶段 | 退出条件 |
|------|----------|
| PRD 检查 | 已确认存在有效 PRD，或用户已明确选择“生成文档”/“跳过文档生成” |
| 文档生成 | `prd.md`、`arch.md`、`plan.md` 已生成并向用户报告位置 |
| 需求分析 | 已确认开发场景、绑定对象、关键字段/对象来源 |
| 代码实现 | 代码已落盘并说明文件路径 |
| 规范检查 | `sharedev apl compile` 和 `sharedev apl analyze` 均通过 |
| 代码审查 | 已执行 `sharedev-apl-code-review` 或完成等价本地审查，并生成/更新 `REVIEW.md` |
| 发布确认 | 用户明确回复允许发布 |

## 平台行为矩阵

| 平台 | 任务跟踪 | 用户确认 | 文档落盘 | 发布动作 |
|------|----------|----------|----------|----------|
| Trae IDE | 优先用 IDE 提供的任务能力 | 优先用 IDE 交互能力 | 写入 `deliverables/` | 只有用户明确允许才 push |
| Claude Code | 优先用环境内任务/对话能力 | 直接提问并等待用户回复 | 写入 `deliverables/` | 只有用户明确允许才 push |
| Codex | 优先用当前线程计划/评论更新能力 | 直接提问并等待用户回复 | 写入 `deliverables/` | 只有用户明确允许才 push |

无论在哪个平台：
- 都不能把“用户说继续”解释为“允许 push”，除非用户明确提到发布、推送、push。
- 都不能把“先写代码”解释为“允许跳过文档”，除非用户明确要求跳过且该步骤不是强制门槛。
- 都必须在最终交付中同时汇报代码产物和文档产物。

## 跨环境执行约定

本技能需要同时适配 Trae IDE、Claude Code、Codex。执行时不得假设某个 IDE 或 Agent 专属工具一定存在，应按以下能力抽象执行：

| 能力 | 优先方式 | 降级方式 |
|------|----------|----------|
| 任务跟踪 | 使用当前环境的任务/Todo 工具（如 TodoWrite） | 在回复中维护简洁 checklist，并随进度更新 |
| 用户确认 | 使用当前环境的交互提问工具（如 AskUserQuestion） | 直接向用户提出明确问题，等待回复后继续 |
| 技能链调用 | 调用已安装的相关技能 | 相关技能不可用时，按本技能内置流程执行等价检查 |
| 代码审查 | 调用 `sharedev-apl-code-review` | 技能不可用时执行本地代码审查清单 |
| 命令执行 | 使用可用终端工具执行 `sharedev` 命令 | 工具不可用时给出精确命令和阻断原因 |

后文出现 `TodoWrite`、`AskUserQuestion`、`Skill("...")` 时，均表示上述抽象能力，不表示硬性绑定某个环境的专属工具。

## 运行时路径变量

执行技能前先定位当前企业工程根目录，并使用变量代替写死路径：

| 变量 | 含义 |
|------|------|
| `<enterpriseEA>` | 当前企业工程根目录，例如包含 `.sharedev/`、`package/` 的目录 |
| `<sharedevSettings>` | `<enterpriseEA>/.sharedev/settings.json` |
| `<domain>` | 从 `<sharedevSettings>` 读取的服务域名 |
| `<certificate>` | 从 `<sharedevSettings>` 读取的认证信息 |
| `<TARGET_PLATFORM>` | 当前代理平台，对应 `trae` / `claude` / `codex` |
| `<spec-dir>` | 与 `<TARGET_PLATFORM>` 对应的 spec 根目录：`.trae` / `.claude` / `.codex` |
| `<aplApiDocs>` | `<enterpriseEA>/.sharedev/docs/apl/pages/func-apl/api/` |
| `<aplDataTypeDocs>` | `<enterpriseEA>/.sharedev/docs/apl/pages/func-apl/data-type/` |
| `<objectsRoot>` | `<enterpriseEA>/.sharedev/dev-metadata/objects/` |
| `<deliverablesRoot>` | `<enterpriseEA>/deliverables/` |

兼容规则：
- 不得写死具体工程名。
- `<enterpriseEA>` 只能解析为“直接包含 `.sharedev/` 与 `package/` 的目录”，不能取技能源码目录，也不能在已是工程根目录的基础上再次拼接项目名。
- 若当前工作目录已经位于 `<enterpriseEA>`，则后续路径必须继续指向 `<enterpriseEA>/.sharedev/...`，严禁再拼成 `<enterpriseEA>/<project-name>/.sharedev/...`。
- 旧路径 `<enterpriseEA>/.sharedev/dev-metadata/objects/` 只作为历史兼容线索，查找对象时必须优先使用 `<objectsRoot>`。
- 如果 `<objectsRoot>` 不存在，先提示用户执行初始化或拉取元数据流程，不要退回到旧 `<enterpriseEA>/.sharedev/dev-metadata/objects/` 作为主路径。

## ⚠️ 重要提示：流程执行规范

**在执行本技能时，必须遵循以下原则：**

1. **严格按流程执行**: 必须按照文档定义的流程顺序执行，不得跳过任何步骤
2. **强制性检查点**: 标有"⚠️ 强制性流程"的步骤必须严格执行
3. **使用可用能力**: 优先使用当前环境提供的交互、任务和命令工具；不可用时按跨环境执行约定降级
4. **流程状态跟踪**: 在执行过程中必须维护流程状态，确保不遗漏任何步骤
5. **阶段审批优先**: 阶段未关闭前，不得提前执行下一阶段动作
6. **文档先行**: 对于缺少 PRD 的新需求，必须先询问是否生成文档；如果用户选择生成，则必须先完成文档再写代码
7. **发布单独授权**: `sharedev apl push` 必须被视为单独授权动作

## 流程状态跟踪机制

在执行本技能时，必须使用当前环境可用的任务跟踪能力维护以下流程状态：

```markdown
当前流程状态：
- [ ] Phase -1: 刷新 docs/specs
- [ ] Phase 0: 检查 PRD
- [ ] Phase 0.3: PRD 不存在时，询问是否生成文档
- [ ] Phase 0.5: 需求文档生成流程（如用户选择生成）
- [ ] Phase 1: 需求分析
- [ ] Phase 2: 输出目录判断
- [ ] Phase 3: 实现指导
- [ ] Phase 4: 规范检查（compile + analyze）
- [ ] Phase 5: 代码审查（硬停止点）
- [ ] Phase 6: 发布确认
```

**执行规则**：
- 每完成一个阶段，应更新对应任务状态为 completed
- Phase -1 不可跳过
- Phase 5（代码审查）是硬停止点，必须询问用户
- Phase 6（发布）必须获得用户明确授权

## Phase -1: 刷新 docs/specs

### -1.1 目标

每次使用本技能时，都必须先重新获取以下目录内容，保证后续读取的是最新参考资料：

- `<enterpriseEA>/.sharedev/docs/`
- `<enterpriseEA>/.sharedev/specs/`

### -1.2 执行步骤

1. 先解析 `<enterpriseEA>`：
   - 从当前工作目录开始向上查找
   - 找到第一个同时包含 `.sharedev/`、`package/` 的目录后立即停止
   - 该目录就是 `<enterpriseEA>`
   - 如果已经命中工程根目录，后续所有命令都直接使用这个绝对路径，禁止再附加一次项目目录名
2. 读取 `<sharedevSettings>`，确认当前工程已有有效的 `domain` 和 `certificate`
3. 确定 `<TARGET_PLATFORM>` 必须与当前执行环境一致：
   - Trae IDE → `trae`
   - Claude Code → `claude`
   - Codex → `codex`
4. 优先执行非交互刷新命令，重新拉取 docs 及相关资源：

```bash
cd <enterpriseEA>
sharedev init --yes --agent <TARGET_PLATFORM> --pull-all-apl --pull-all-pwc -e . -d <domain> -c <certificate>
```

说明：当前 `sharedev init` 对绝对 `-e` 路径存在重复拼接风险，因此在已经 `cd <enterpriseEA>` 的前提下，统一使用 `-e .`，避免生成 `<enterpriseEA>/<enterpriseEA>` 一类错误路径。

5. 执行刷新命令前必须做一次路径自检：

```bash
test -d <enterpriseEA>/.sharedev
test -d <enterpriseEA>/package
test ! -d <enterpriseEA>/$(basename <enterpriseEA>)/.sharedev
```

若第 3 条失败，说明出现了“项目名重复拼接”的路径错误，必须先修正 `<enterpriseEA>`，禁止继续刷新。

6. 如果刷新后目标平台 spec 目录存在，则强制同步到 `.sharedev/specs/`：

```bash
mkdir -p <enterpriseEA>/.sharedev/specs
rsync -a <enterpriseEA>/<spec-dir>/specs/ <enterpriseEA>/.sharedev/specs/
```

### -1.3 刷新判定

刷新完成后，至少验证以下内容：

- `<enterpriseEA>/.sharedev/docs/` 存在且可读取
- `<enterpriseEA>/.sharedev/specs/` 存在且可读取
- `<objectsRoot>` 存在
- `<aplApiDocs>` 存在

### -1.4 失败处理

1. 如果 `<sharedevSettings>` 缺失，或缺少 `<domain>` / `<certificate>`，则阻断后续开发流程，并提示用户先执行初始化
2. 如果刷新命令失败，且本地 `docs/specs` 目录缺失或明显不可用，则阻断后续开发流程
3. 如果刷新命令失败，但本地目录仍存在，可继续开发，但必须明确告知用户当前参考资料可能不是最新状态
4. 不允许跳过刷新步骤后直接读取旧文档并假设其为最新

## Phase 0: 检查 PRD

### 0.1 PRD 检查逻辑

在开始开发前，检查是否存在需求分析文档：

```
检查流程:
1. 扫描 deliverables/ 目录下的子目录
2. 查找最新的需求目录（按 YYYY-MM-DD- 前缀排序）
3. 检查是否存在 prd.md 文件
4. 如果存在 → 读取 prd.md 内容，提取开发场景信息
5. 如果不存在 → 优先引导用户运行 prd-analysis 技能；若该技能不可用，则使用本技能内置的简化需求分析
```

**目录结构**:
```
deliverables/
└── YYYY-MM-DD-<功能名称>/
    ├── prd.md
    ├── arch.md
    ├── plan.md
    └── REVIEW.md
```

### 0.2 prd.md 存在时

当 prd.md 存在时，应：

1. 读取 prd.md 内容
2. 提取以下关键信息：
   - 开发场景类型（按钮/流程/计划任务/控制器/事件监听）
   - 关联对象
   - API需求
   - 推荐方案
3. 跳转到对应的开发场景流程

### 0.3 prd.md 不存在时

**⚠️ 强制交互点：必须使用 AskUserQuestion 询问用户**

当 prd.md 不存在时，应：

1. 提示用户："未找到需求分析文档"
2. **必须使用当前环境的交互能力**询问用户是否需要生成需求文档
3. 如果用户选择生成文档 → 进入 Phase 0.5 需求文档生成流程
4. 如果用户选择跳过文档生成 → 直接进入 Phase 1 场景识别

**⚠️ 注意**: 即使 PRD 不存在，也必须询问用户是否生成文档，不得直接跳过进入 Phase 1。

**AskUserQuestion 调用示例：**
```markdown
AskUserQuestion:
questions:
  - header: "需求文档检查"
    question: "未找到 prd.md 需求分析文档。\n\n是否需要生成需求文档？\n\n生成文档可以帮助您：\n- 清晰记录需求细节\n- 评估技术风险\n- 规划开发任务"
    options:
      - label: "生成文档"
        description: "创建 prd.md、arch.md、plan.md 需求文档"
      - label: "跳过文档生成"
        description: "直接开始开发，不生成文档"
    multiSelect: false
```

### 0.4 简化版需求分析

当用户选择直接描述需求时，进行简化版分析：

1. 询问核心问题："你想要实现什么功能？"
2. 询问关联对象："涉及哪个对象？"
3. 询问触发场景："在什么情况下触发？"
4. 确认需求后，进入需求文档生成流程

### 0.5 需求文档生成流程

简化版需求分析完成后，应按以下流程生成需求文档：

#### 0.5.1 询问用户是否生成文档

使用当前环境可用的交互工具询问用户：

```markdown
AskUserQuestion:
questions:
  - header: "需求文档生成"
    question: "需求分析已完成！\n\n是否生成完整的需求文档？\n\n生成文档包括：\n- prd.md (需求分析文档)\n- arch.md (架构评审文档)\n- plan.md (任务计划文档)\n\n这些文档将帮助您：\n- 清晰记录需求细节\n- 评估技术风险\n- 规划开发任务"
    options:
      - label: "生成完整文档"
        description: "创建需求文件夹并生成 prd.md、arch.md、plan.md"
      - label: "跳过文档生成"
        description: "直接开始开发，不生成文档"
    multiSelect: false
```

#### 0.5.2 创建需求文件夹

当用户选择"生成完整文档"时：

1. 在 `deliverables/` 目录下创建需求文件夹
2. 文件夹命名格式：`YYYY-MM-DD-<功能名称>`
   - 日期：格式为 `YYYY-MM-DD`（如：2024-03-15）
   - 功能名称：从需求分析中提取的关键词（如：客户数据同步、审批流程优化）
   - 示例：`deliverables/2024-03-15-客户数据同步/`

**命名规则**：
- 功能名称使用中文或英文，简洁明了
- 名称中不包含特殊字符（除连字符 `-`）
- 日期精确到日，确保可排序

#### 0.5.3 生成 prd.md（Skill 调用）

调用 `Skill: sharedev-pwc-write-prd-spec`，以 APL 适配模式生成产品需求文档。

**调用方式**：
```markdown
Skill("sharedev-pwc-write-prd-spec")
```

**执行说明**：
- 该 skill 会通过协作对话探索用户意图、明确需求边界
- 输出结构化的 prd.md，包含需求概述、功能范围、验收标准等
- 生成位置：`deliverables/YYYY-MM-DD-<功能名称>/prd.md`

**预期输出**：
- `prd.md` — 结构化的产品需求文档，明确功能边界和验收条件

#### 0.5.4 生成 arch.md（Skill 调用）

调用 `Skill: sharedev-pwc-write-arch`，以 APL 适配模式生成架构设计文档。

**调用方式**：
```markdown
Skill("sharedev-pwc-write-arch")
```

**执行说明**：
- 该 skill 基于 prd.md 设计技术方案
- 定义平台 API 调用、接口契约和技术选型
- 对 APL 场景特别关注：平台限制检查（调用次数、执行时间）、对象字段校验

**预期输出**：
- `arch.md` — 技术架构文档，包含数据流分析、API 选型、平台限制检查

#### 0.5.5 生成 plan.md（Skill 调用 — 编排器模式 Mode 2）

调用 `Skill: sharedev-pwc-write-plans`，使用编排器模式 Mode 2 生成任务执行计划。

**调用方式**：
```markdown
Skill("sharedev-pwc-write-plans")
```

**执行说明**：
- 该 skill 基于 prd.md 和 arch.md 拆解开发任务
- 使用编排器模式（Mode 2），按执行顺序编排任务
- plan.md 格式要求：仅包含 3 个顶级章节（关联文档 → 任务调度表 → 逐任务说明）
- 每个任务仅包含 5 个字段：调用、做什么、关键输入、输出文件、验证
- **禁止**包含代码块、mermaid 图、subtask checkbox、文件结构列表

**预期输出**：
- `plan.md` — 任务执行计划，轻量级编排器格式

#### 0.5.6 文档生成完成后的流程

文档生成完成后：

1. 提示用户："需求文档已生成到 deliverables/YYYY-MM-DD-<功能名称>/ 目录"
2. 列出生成的文档清单（prd.md / arch.md / plan.md）
3. 询问用户是否继续开发：
   - 如果继续 → 进入 Phase 1 场景识别
   - 如果暂停 → 提示用户可以稍后继续

#### 0.5.7 用户选择跳过文档生成

如果用户选择"跳过文档生成"：

1. 提示用户："已跳过文档生成，直接开始开发"
2. 直接进入 Phase 1 场景识别
3. 提醒用户："建议后续补充需求文档以便追溯"

### 0.6 检查 arch.md

在检查 prd.md 后，还应检查架构评审文档：

```
检查流程:
1. 在同一需求目录下检查 arch.md 文件是否存在
2. 如果存在 → 读取架构评审结果，关注风险点和建议
3. 如果不存在 → 提示用户可以先进行架构评审
```

### 0.7 arch.md 存在时

当 arch.md 存在时，应：

1. 读取 arch.md 内容
2. 关注以下关键信息：
   - 平台限制检查结果
   - 性能风险点
   - 安全检查结果
   - 边缘情况处理建议
3. 在开发过程中遵循架构评审的建议

### 0.8 架构评审未通过时

当 arch.md 显示"不通过"状态时：

1. 提示用户："架构评审未通过，建议先解决以下问题："
2. 列出需要解决的问题
3. 询问用户是否仍要继续开发

### 0.9 检查 plan.md

在检查 arch.md 后，还应检查任务计划文档：

```
检查流程:
1. 在同一需求目录下检查 plan.md 文件是否存在
2. 如果存在 → 读取任务列表，按编排器顺序执行任务
3. 如果不存在 → 按原有流程进行开发
```

### 0.10 plan.md 存在时（编排器模式）

当 plan.md 存在时，应：

1. 读取 plan.md 内容
2. 解析任务调度表（## 2. 任务调度表）
3. 按调度表依赖顺序执行逐任务说明（## 3. 逐任务说明）
4. 每个任务完成后：
   - 执行验证步骤
   - 更新任务状态
   - 记录执行日志

plan.md 格式要求（详见 sharedev-pwc-write-plans 编排器模式）：
- 仅 3 个顶级章节：关联文档 → 任务调度表 → 逐任务说明
- 每个任务仅 5 个字段：调用、做什么、关键输入、输出文件、验证
- 无代码块、无 mermaid 图、无 subtask checkbox、无文件结构列表

### 0.11 编排器任务执行模式

执行任务时应遵循编排器模式：

1. **读取任务**: 从 plan.md 逐任务说明中获取任务详情（调用方式、关键输入、输出文件）
2. **执行任务**: 根据任务描述调用对应 skill 或执行代码实现
3. **验证任务**: 执行验证步骤确认正确性
4. **更新状态**: 将任务调度表中的状态更新为"已完成"
5. **继续下一个**: 按调度表依赖顺序执行下一个任务

### 0.12 编排器任务执行示例

```markdown
**Task: 生成产品需求文档**
- 调用: Skill("sharedev-pwc-write-prd-spec")
- 做什么: 通过协作对话明确需求边界，输出结构化 prd.md
- 关键输入: 用户需求描述
- 输出文件: deliverables/YYYY-MM-DD-<功能名称>/prd.md
- 验证: 确认 prd.md 包含需求概述、功能范围、验收标准
```

### 0.13 编排器任务完成后流转（⚠️ 强制性流程）

**🔴 重要**: 本步骤为强制性流程，必须严格执行，不得跳过！

当 plan.md 中所有任务执行完成后，必须按照以下流程执行：

#### 0.13.1 流程检查清单

在执行任何"完成"操作前，必须完成以下检查：

- [ ] **检查1**: plan.md 任务调度表中所有任务是否已标记为"completed"状态？
- [ ] **检查2**: 是否已读取本技能文档的"编排器任务完成后流转"流程？
- [ ] **检查3**: 是否已准备询问用户是否进行代码审查？
- [ ] **检查4**: 是否已准备调用 sharedev-apl-code-review 技能？
- [ ] **检查5**: 是否已准备执行 sharedev apl diff 查看变更？
- [ ] **检查6**: 是否已准备在用户明确授权后发布到服务端？

**⚠️ 警告**: 如果以上任何一项检查未通过，不得进入"开发完成总结"阶段！

#### 0.13.2 强制执行流程

```
步骤1: 检查 plan.md 任务调度表所有任务状态
  ↓
步骤2: 确认所有任务已完成
  ↓
步骤3: 【强制性】询问用户是否进行代码审查
  ↓
步骤4: 根据用户选择执行下一步
  ├─ 用户确认 → 调用 sharedev-apl-code-review 技能或执行本地审查
  └─ 用户跳过 → 提示开发完成
```

#### 0.13.3 询问用户的标准格式

**⚠️ 强制交互点（硬停止点）：必须使用 AskUserQuestion 询问用户**

此步骤为**硬停止点**，在代码审查前必须询问用户：
- 用户选择"继续执行技能链" → 执行代码审查
- 用户选择"跳过当前步骤" → 跳过审查，继续发布流程
- 用户选择"结束技能链" → 结束流程

**使用当前环境可用的交互方式**，格式如下：

```markdown
AskUserQuestion:
questions:
  - header: "代码审查"
    question: "所有开发任务已完成！\n\n📄 文件路径: ./deliverables/YYYY-MM-DD-<功能名称>/\n\n是否进行代码审查？\n\n代码审查可以帮您：\n- 检查代码规范\n- 发现潜在问题\n- 优化代码质量"
    options:
      - label: "继续执行技能链"
        description: "自动调用 sharedev-apl-code-review 技能进行代码审查"
      - label: "跳过当前步骤"
        description: "跳过代码审查，直接完成开发"
      - label: "结束技能链"
        description: "结束当前流程，不再继续后续步骤"
    multiSelect: false
```

#### 0.13.4 用户确认后的处理

与 Phase 4/5/6 的标准流程一致：
1. 【强制性】执行 sharedev apl compile / analyze
2. 优先调用 Skill("sharedev-apl-code-review")；若技能不可用，执行本地审查
3. 审查通过后，等待用户明确确认再执行发布流程

### 0.14 完整流转链

```
用户需求 → sharedev-pwc-write-prd-spec → deliverables/YYYY-MM-DD-<功能名称>/prd.md → sharedev-pwc-write-arch → deliverables/YYYY-MM-DD-<功能名称>/arch.md → sharedev-pwc-write-plans → deliverables/YYYY-MM-DD-<功能名称>/plan.md → sharedev-apl-implement → 代码 → sharedev-apl-code-review → deliverables/YYYY-MM-DD-<功能名称>/REVIEW.md → 完成
```

### 0.15 开发完成状态

当开发流程完成时，应：

1. 汇总生成的文件列表
2. 显示开发统计信息（任务数、代码行数等）
3. 提示用户可以进行的后续操作：
   - 查看审查报告
   - 部署到测试环境
   - 发布到服务端

### 0.16 发布到服务端（sharedev push）

**⚠️ 强制交互点：必须使用 AskUserQuestion 获得用户明确授权**

开发完成并通过质量门控后，必须询问用户是否发布：

```markdown
AskUserQuestion:
questions:
  - header: "发布确认"
    question: "代码已通过编译和静态分析检查！\n\n📄 文件: <apiName>\n\n是否发布到服务端？\n\n发布操作将覆盖远端代码。"
    options:
      - label: "发布到服务端"
        description: "执行 sharedev apl push 推送到远端"
      - label: "仅查看变更"
        description: "只执行 sharedev apl diff 查看变更，不推送"
    multiSelect: false
```

只有用户**明确选择"发布到服务端"**时，才执行 push 命令。

```bash
# 1. 查看本地变更
sharedev apl diff <apiName>

# 2. 用户确认后发布到远端
sharedev apl push <apiName>

# 3. 验证提交结果
sharedev apl diff <apiName>  # 应显示无差异
```

**发布前检查清单**：
- [ ] 代码已通过 `sharedev apl compile` 编译检测
- [ ] 代码已通过 `sharedev apl analyze` 静态分析
- [ ] 代码已通过代码审查（如适用）
- [ ] 已更新相关文档

**注意**: 
- `sharedev apl push` 会覆盖远端代码，请确保团队成员知晓
- 提交前建议先 `sharedev apl diff` 确认变更内容
- 如有版本冲突，需要先解决冲突再提交
- 若用户未明确要求发布，则只输出差异与结果，不执行 `sharedev apl push`

## 开发流程概览

### 完整技能链模式（推荐）

当用户从需求开始时，遵循完整的技能链流转：

```
用户需求 → sharedev-pwc-write-prd-spec（若已安装）→ sharedev-pwc-write-arch（若已安装）→ sharedev-pwc-write-plans（若已安装）→ sharedev-apl-implement → sharedev-apl-code-review（若已安装）→ 完成
```

### 独立开发模式

当用户直接请求开发（无前置技能文档）时，遵循以下内部流程：

```
prd检查 → 【询问是否生成需求文档】→ 需求文档生成（prd/arch/plan）→ 需求分析 → 场景识别 → 输出目录判断 → 实现指导 → 规范检查 → 🛑硬停止:询问是否代码审查 → 代码审查（技能或本地）→ 发布确认 → 经验回写
```

**⚠️ 注意事项**：
- 如果检测到 prd.md、arch.md 或 plan.md 存在，应优先使用完整技能链模式
- **"询问是否生成需求文档"不可跳过**，即使 prd 不存在也必须询问
- **"🛑硬停止:询问是否代码审查"不可跳过**，在代码审查前禁止执行 sharedev apl push

## Phase 1: 需求分析

### 1.1 场景识别

首先识别开发场景,加载对应的规范和参考文档:

| 场景 | 触发关键词 | 参考文档 |
|------|-----------|---------|
| 按钮开发 | "按钮", "button", "业务按钮", "UI按钮" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/button/summary.md` |
| 流程开发 | "流程", "flow", "审批流", "工作流" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/flow/summary.md` |
| 计划任务 | "计划任务", "定时", "scheduler" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/scheduler_task/summary.md` |
| 自定义控制器 | "控制器", "controller", "API端点" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-class-scene/apl_controller/summary.md` |
| 事件监听 | "事件监听", "event", "监听器" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-class-scene/event_listener/summary.md` |
| 范围规则 | "范围规则", "scope rule", "限制可选", "筛选可选范围" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/business-process/scope_rule/1.summarize.md` |
| 数据校验 | "校验", "验证", "validate", "前校验", "前验证" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/business-process/pre-validation/1.summarize.md` |

### 1.2 平台限制检查

在开始开发前,必须检查平台限制是否满足需求:

| 限制项 | 限制值 | 检查点 |
|--------|--------|--------|
| Fx.object调用 | 300次/函数 | 是否需要大量数据操作? |
| Fx.http调用 | 50次/函数 | 是否需要频繁外部调用? |
| 按钮执行时间 | 20秒 | 逻辑是否复杂? |
| 流程执行时间 | 300秒 | 是否需要长时间处理? |
| 计划任务时间 | 600秒 | 批量数据量多大? |
| 内存限制 | 256MB | 是否处理大对象? |

**门控**: 如果需求超出平台限制,必须先与用户确认调整方案。

## Phase 2: 输出目录判断

### 2.1 目录检测逻辑

在生成代码文件前,必须检测项目目录结构

```
判断流程:
1. 检测 {项目根目录}/package/fx/custom/apl/script/ 目录是否存在
2. 如果存在 → 输出到该目录,使用项目规范命名
3. 如果不存在 → 创建该目录,然后输出代码文件
```

**重要**: 所有APL代码文件必须输出到 `{项目根目录}/package/fx/custom/apl/script/` 目录下。

### 2.2 命名规范

#### 项目APL目录存在时

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 按钮函数 | `BtnXXX__c.function.groovy` | `BtnUpdateButton__c.function.groovy` |
| 普通函数 | `XXX__c.function.groovy` | `AccountQuery__c.function.groovy` |
| UI事件 | `UIEvtXXX__c.function.groovy` | `UIEvtFormValidate__c.function.groovy` |
| APL类 | `XXX__c.class.groovy` | `WebHookController__c.class.groovy` |

**⚠️ 重要命名规则**:
- 所有文件名都以 `__c` 结尾
- **API 名称中不能包含下划线**（除了结尾的 `__c`）
  - ❌ 错误：`Evt_MatchContactOnAccountCreate__c`（包含下划线）
  - ✅ 正确：`EvtMatchContactOnAccountCreate__c`（不含下划线）
  - ❌ 错误：`Btn_UpdateAccount__c`（包含下划线）
  - ✅ 正确：`BtnUpdateAccount__c`（不含下划线）

## Phase 3: 实现指导

### 3.0 新建 APL 函数/类

**⚠️ 场景判断（Phase 3 入口必做）**：

在进入实现指导前，必须先判断当前是**新建**还是**更新**场景：

```
判断流程:
1. 检查 sharedev apl list 中是否已存在该 apiName
2. 如果不存在 → 走"3.0 新建 APL 函数/类"流程
3. 如果已存在 → 跳至"3.0.6 更新已有 APL 函数/类"流程
```

**触发条件**：在实现指导阶段，当确定需要创建**新的** APL 函数或类时执行此子流程。

#### 3.0.1 确定创建类型（自动决策）

**⚠️ 决策原则：根据场景自动选择 function 或 class，仅在无法判断时询问用户。**

##### 自动决策表

| 场景 | Namespace | 创建类型 | 关联对象 | 是否询问 |
|------|-----------|----------|----------|----------|
| 按钮开发 | button | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| UI 事件 | ui_event | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 数据校验 | validate_function | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 范围规则 | scope_rule | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 关联对象范围规则 | related_scope | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 计划任务 | scheduler_task | `--type function` | 不绑定对象 | ❌ 自动，不询问 |
| 自定义控制器 | controller | `--type function` | 不绑定对象 | ❌ 自动，不询问 |
| 流程节点 | flow | `--type function --bind <Obj>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 公共库 | library | `--type class` | 不绑定对象 | ❌ 自动，不询问 |
| 事件监听器 | event_listener | `--type class` | 不绑定对象 | ❌ 自动，不询问 |
| 对象处理器 | object_handler | `--type class --bind <Object>` | 必须（从需求提取） | ❌ 自动，不询问 |
| 无法判断 | — | — | — | ✅ 询问用户 |

##### 决策伪代码

```
IF namespace ∈ {button, ui_event, validate_function, scope_rule, related_scope, flow}
  → 跳过询问，直接使用 --type function --bind <关联对象>，确认 return type
  → 关联对象从 Phase 1 需求分析中提取的「关联对象」获得（如 AccountObj）
ELSE IF namespace ∈ {scheduler_task, controller}
  → 跳过询问，直接使用 --type function，确认 return type（不绑定对象）
ELSE IF namespace ∈ {library, event_listener, object_handler}
  → 跳过询问，直接使用 --type class（object_handler 需要 --bind）
ELSE
  → 弹出 AskUserQuestion 询问用户选择 function 或 class
```

##### 仅在无法判断时询问

当场景无法从关键词或需求中确定 namespace 时，使用以下 AskUserQuestion：

```markdown
AskUserQuestion:
questions:
  - header: "APL类型"
    question: "无法从需求自动判断 APL 类型。\n\n请选择创建哪种类型？"
    options:
      - label: "函数 (function)"
        description: "单次执行的代码单元，需要指定返回类型。适用于：按钮、计划任务、流程节点、自定义控制器等"
      - label: "类 (class)"
        description: "可复用的代码库，包含多个方法。适用于：公共库、事件监听器、对象插件等"
    multiSelect: false
```

**注意**：OBJECT 组函数场景（button / ui_event / validate_function / scope_rule / related_scope / flow）已明确时，直接按决策表执行，不询问用户。如果用户指明了关联对象，必须在 create 命令中加入 `--bind <ObjectApiName>`。PLATFORM 组（scheduler_task / controller）不需要 `--bind`。

#### 3.0.2 查询 Namespace 和 Return Type

**参考文档**: [ns_range.md](../../specs/apl/ns_range.md)

根据用户选择的类型，提供相应的 namespace 参考：

**Function 类型 Namespace**（需指定 return-type）：

| Group | Namespace | 常用返回类型 | 适用场景 |
|-------|-----------|--------------|----------|
| OBJECT | button | UIAction, void | 按钮点击触发 |
| OBJECT | ui_event | UIEvent | UI 事件处理 |
| OBJECT | validate_function | ValidateResult | 数据校验（提交时校验） |
| OBJECT | scope_rule | QueryTemplate, List, RangeRule | 范围规则（控制字段下拉可选范围） |
| OBJECT | related_scope | RelatedObject | 关联对象范围规则（控制关联对象的可选范围） |
| PLATFORM | scheduler_task | void | 定时任务 |
| PLATFORM | controller | Map | 自定义 API |
| OBJECT | flow | void, Boolean | 流程节点 |

> ⚠️ **重要区分**：
> - `scope_rule` = 范围规则：绑定到**查找关联字段**，控制该字段下拉列表的可选数据范围，返回 `QueryTemplate`（推荐）/ `List` / `RangeRule`
> - `related_scope` = 关联对象范围规则：控制关联对象的可选范围，返回 `RelatedObject`
> - `validate_function` = 校验函数：绑定到**对象**，在提交保存时进行数据校验并返回校验结果，返回 `ValidateResult`
>
> **关键词识别**：
> - 用户提到"范围"、"可选"、"限制可选"、"筛选"、"缩小范围" → 优先考虑 `scope_rule`
> - 用户提到"校验"、"验证"、"必填检查"、"阻止保存" → 优先考虑 `validate_function`
> - 用户提到"范围规则函数" → **必然是 `scope_rule`**，不是 `validate_function`

**Class 类型 Namespace**（不需要 return-type）：

| Group | Namespace | 适用场景 |
|-------|-----------|----------|
| PLATFORM | library | 公共库，可复用代码 |
| PLATFORM | event_listener | 事件监听器 |
| OBJECT | object_handler | 对象业务处理器 |

#### 3.0.3 执行创建命令

根据用户选择的类型执行相应的命令：

**创建 Function**:
```bash
sharedev apl create \
  --api-name <ApiName>__c \
  --function-name <FunctionName> \
  --type function \
  --namespace <namespace> \
  --return-type <ReturnType> \
  --remark "<描述>" \
  --package script
```

**创建 Function（绑定对象）** — 当用户明确指定了关联对象时：
```bash
sharedev apl create \
  --apiname <ApiName>__c \
  --function-name <FunctionName> \
  --type function \
  --namespace <namespace> \
  --return-type <ReturnType> \
  --bind <ObjectApiName> \
  --remark "<描述>" \
  --package script
```

**创建 Class**:
```bash
sharedev apl create \
  --api-name <ApiName>__c \
  --function-name <ClassName> \
  --type class \
  --namespace <namespace> \
  --remark "<描述>" \
  --package script
```

**创建 Class（绑定对象 - 如 Object Handler）**:
```bash
sharedev apl create \
  --api-name EvtSyncDeliveryOrderOnSalesOrderChange__c \
  --function-name EvtSyncDeliveryOrderOnSalesOrderChange \
  --type class \
  --namespace object_handler \
  --bind SalesOrderObj \
  --remark "销售订单变更时自动同步出货单" \
  --package script
```

**命令参数说明**:

| 参数 | 说明 | 必填 | 示例 |
|------|------|------|------|
| `--api-name` | API 名称，需以 `__c` 结尾，**不能包含下划线**（除了结尾的 `__c`） | 是 | `TestFunction__c` |
| `--function-name` | 函数/类名称 | 是 | `TestFunction` |
| `--type` | 类型：`function` 或 `class` | 是 | `function` |
| `--namespace` | 命名空间 | 是 | `controller` |
| `--return-type` | 返回类型（**仅 type=function 时必填**） | 条件必填 | `Map` |
| `--bind` | 绑定对象 API 名称 | 否 | `AccountObj` |
| `--remark` | 描述 | 否 | `测试函数` |
| `--package` | 包名，固定为 `script` | 是 | `script` |

> ⚠️ **硬规则**：所有 `sharedev apl create` 命令必须显式携带 `--package script`。该参数虽在 CLI 帮助中显示为可选，但实际执行时缺少会导致函数落盘到错误包目录，禁止省略。

**`--bind` 参数使用场景**:

| 场景类型 | Namespace | 是否需要 `--bind` | 说明 |
|---------|-----------|------------------|------|
| 按钮函数 | button | ✅ 需求明确时 | 如需求指定了对象则绑定 |
| UI 事件 | ui_event | ✅ 需求明确时 | 如需求指定了对象则绑定 |
| 数据校验 | validate_function | ✅ 需求明确时 | 如需求指定了对象则绑定 |
| 范围规则 | scope_rule | ✅ 需求明确时 | 如需求指定了关联对象则绑定 |
| 关联对象范围规则 | related_scope | ✅ 需求明确时 | 如需求指定了关联对象则绑定 |
| 流程节点 | flow | ✅ 需求明确时 | 如需求指定了对象则绑定 |
| 计划任务 | scheduler_task | ❌ 否 | 系统定时触发 |
| 自定义控制器 | controller | ❌ 否 | 通过 API 调用 |
| 公共库 | library | ❌ 否 | 被其他代码调用 |
| **对象处理器** | **object_handler** | ✅ **是** | **必须绑定到具体业务对象** |
| 事件监听器 | event_listener | 可选 | 根据需求决定是否绑定 |

**示例说明**:
- **Object Handler（对象处理器）**: 用于监听对象的新增、修改、删除事件，必须绑定到具体对象
  ```bash
  --namespace object_handler --bind SalesOrderObj
  ```
- **Event Listener（事件监听器）**: 如果是监听特定对象事件，建议绑定；如果是全局事件，可不绑定
  ```bash
  --namespace event_listener --bind AccountObj  # 监听客户对象事件
  ```

**⚠️ API 命名规范**:
- API 名称必须以 `__c` 结尾
- API 名称中不能包含下划线（除了结尾的 `__c`）
- ❌ 错误示例：
  - `Evt_MatchContact__c`（包含下划线）
  - `Btn_UpdateAccount__c`（包含下划线）
  - `UIEvt_FormValidate__c`（包含下划线）
- ✅ 正确示例：
  - `EvtMatchContact__c`（不含下划线）
  - `BtnUpdateAccount__c`（不含下划线）
  - `UIEvtFormValidate__c`（不含下划线）

#### 3.0.4 创建后验证

**⚠️ 强制性流程**: 创建成功后必须执行编译和静态分析检查！

```bash
# 1. 编译检查
sharedev apl compile <apiName>

# 2. 静态分析
sharedev apl analyze <apiName>
```

**验证结果处理**:
- ✅ 两者都通过：提示用户创建成功，可开始编写业务逻辑
- ❌ 编译失败：记录错误详情，提示用户检查参数
- ❌ 静态分析失败：记录违规项，提示用户修复

#### 3.0.5 创建完成

创建并验证通过后：
1. 显示生成的文件路径（如 `package/fx/custom/apl/script/<ApiName>.function.groovy`）
2. 提示用户可以开始编写业务逻辑
3. 继续实现指导流程

#### 3.0.6 更新已有 APL 函数/类（原地修改流程）

**⚠️ 重要：更新场景下禁止删除重建或全量覆写原文件！**

当需要修改已有的 APL 函数/类代码时，必须遵循以下原地修改流程：

##### 3.0.6.1 拉取远端最新代码

```bash
sharedev apl pull <apiName>
```

确保本地代码与远端同步，避免版本冲突。

##### 3.0.6.2 读取现有源文件

使用 `Read` 工具读取目标 `.groovy` 文件：
- 路径：`{项目根目录}/package/fx/custom/apl/script/<ApiName>.function.groovy`（function）
- 路径：`{项目根目录}/package/fx/custom/apl/script/<ApiName>.class.groovy`（class）

##### 3.0.6.3 使用 SearchReplace 做定向修改

**必须**使用 `SearchReplace` 工具对目标代码段做精确替换，参数说明：

| 参数 | 说明 |
|------|------|
| `old_str` | 需要被替换的原代码段，必须精确匹配源文件中的内容（包括缩进、空格） |
| `new_str` | 替换后的新代码段 |

**SearchReplace 使用要点**：
- `old_str` 必须是源文件中**精确存在**的连续代码段
- 包含足够的上下文行以确保唯一匹配
- `new_str` 应是最小化的变更，仅修改需要改动的部分
- 一次 SearchReplace 调用处理一处逻辑修改，多次修改分多次调用

**示例**：
```
SearchReplace:
  old_str: |
    def status = data.status as String
    if (status == "pending") {
        return WebAction.builder()
    }
  new_str: |
    def status = data.status as String
    if (status == "pending" || status == "approved") {
        return WebAction.builder()
    }
```

##### 3.0.6.4 修改完成后验证

```bash
# 编译检查
sharedev apl compile <apiName>

# 静态分析
sharedev apl analyze <apiName>
```

##### 3.0.6.5 禁止行为（更新场景）

| ❌ 禁止 | ✅ 正确做法 |
|---------|-----------|
| 使用 `DeleteFile` 删除原 `.groovy` 文件 | 使用 `SearchReplace` 在原文件上修改 |
| 使用 `Write` 重建整个文件 | 使用 `SearchReplace` 做定向替换 |
| 跳过 `sharedev apl pull` 直接修改 | 先 pull 拉取最新代码，再修改 |
| 不读取文件就修改 | 先用 `Read` 读取，理解现有逻辑后再改 |

> **新建 vs 更新工具选择**：
> - 新建场景（文件不存在）：使用 `Write` 写入新文件
> - 更新场景（文件已存在）：使用 `SearchReplace` 定向修改，禁止 `Write` 全量覆写

### 3.1 Context上下文使用

```groovy
// 通用变量
context.tenantId      // 租户ID
context.userId        // 用户ID
context.data          // 主对象数据(Map)
context.details       // 从对象数据(Map)
context.dataList      // 批量数据(List)
context.objectIds     // 对象ID列表(List)
context.arg           // 业务参数
```

### 3.2 标准错误处理模式

```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.create(...)

if (error) {
    log.error("操作失败: " + errorMessage)
    // 选择一种处理方式:
    // 1. 抛出异常终止执行
    Fx.message.throwException("操作失败: " + errorMessage)
    // 2. 返回终止执行
    return
}

log.info("操作成功: " + data)
```

### 3.3 常用API调用模板

**对象查询**
```groovy
def (Boolean error, QueryResult result, String msg) = Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])
        .queryTemplate(QueryTemplate.AND(["name": QueryOperator.EQ("测试")]))
        .limit(100)
        .build(),
    SelectAttribute.builder().build()
)

if (error) {
    log.error("查询失败: " + msg)
    return
}

result.dataList.each { item ->
    def map = item as Map
    log.info("查询结果: ${map.name}")
}
```

**HTTP请求**
```groovy
def (Boolean error, HttpResult result, String msg) = Fx.http.execute(
    HttpAttribute.builder()
        .url("https://api.example.com/data")
        .method("GET")
        .header(["Content-Type": "application/json"])
        .build()
)

if (error) {
    log.error("HTTP请求失败: " + msg)
    return
}

log.info("响应状态: ${result.statusCode}")
```

**消息发送**
```groovy
Fx.message.send(["1001"], "测试消息", MessageChannelEnum.WORK)
```

## Phase 4: 规范检查

### 4.0 sharedev CLI 工具

sharedev 是 APL 开发的官方 CLI 工具，提供代码拉取、提交、编译检测、静态分析等能力。

**⚠️ 强制性流程**: 在代码完成后，必须立即执行 sharedev 的编译和静态分析检查！

#### 4.0.1 强制执行步骤

**在完成代码实现后，必须按以下顺序执行**:

```bash
# 步骤1: 执行编译检查（必须通过）
sharedev apl compile <apiName>

# 步骤2: 执行静态分析（必须通过）
sharedev apl analyze <apiName>
```

**执行时机**:
- 在代码实现完成后立即执行
- 在代码审查之前执行
- 作为质量门控的第一道关卡

**失败处理**:
1. 如果编译失败：
   - 🔴 记录编译错误详情
   - 🔴 提示用户修复代码
   - 🔴 阻断后续流程，不允许继续
2. 如果静态分析失败：
   - 🔴 记录违规项详情
   - 🔴 提示用户修复问题
   - 🔴 阻断后续流程，不允许继续
3. 只有两者都通过，才能继续进行代码审查

**成功示例**:
```bash
$ sharedev apl compile UIEvt_FillStoreName__c
[sharedev] APL function UIEvt_FillStoreName__c passed compile check.

$ sharedev apl analyze UIEvt_FillStoreName__c
[sharedev] APL function UIEvt_FillStoreName__c passed analysis.
{
  "success": true,
  "forceSave": false,
  "logInfo": "E-E.cli-sharedev-1775010030009",
  "violations": []
}
```

**失败示例**:
```bash
$ sharedev apl compile UIEvt_FillStoreName__c
[sharedev] Pre-submit compile check failed: com.facishare.function.exception.FunctionCompileException: 
[Static type checking] - Cannot find matching method com.fxiaoke.functions.model.QueryTemplate#AND(java.util.List).
@ line 54, column 24.
```

#### 4.0.2 发布到服务端（sharedev push）

**🔴 硬停止检查点**: 在执行 `sharedev apl push` 之前，**必须确认以下条件全部满足，且用户已明确要求发布**：

```
🛑 代码推送前置检查（必须全部通过才能执行 push）：
- [ ] 代码已通过 sharedev apl compile 编译检测
- [ ] 代码已通过 sharedev apl analyze 静态分析
- [ ] 已询问用户是否进行代码审查（Phase 0.13）
- [ ] 如用户确认代码审查，已调用 sharedev-apl-code-review 技能或完成本地审查
- [ ] 已执行 sharedev apl diff 确认变更内容
- [ ] 用户已明确要求发布到服务端
```

**⚠️ 如果以上任何一项未完成，禁止执行 sharedev apl push！**

**执行步骤**:

```bash
# 步骤1: 查看本地变更（可选但推荐）
sharedev apl diff <apiName>

# 步骤2: 用户确认后发布到远端
sharedev apl push <apiName> -m "提交说明"

# 步骤3: 验证提交结果（可选）
sharedev apl diff <apiName>  # 应显示无差异
```

**执行时机**:
- 在 sharedev apl compile 通过后
- 在 sharedev apl analyze 通过后
- 在代码审查通过后（如适用）
- 在用户明确要求发布后

**发布前检查清单**:
- [ ] 代码已通过 `sharedev apl compile` 编译检测
- [ ] 代码已通过 `sharedev apl analyze` 静态分析
- [ ] 代码已通过代码审查（如适用）
- [ ] 已更新相关文档
- [ ] 已填写清晰的提交说明

**提交说明规范**:
```bash
# ✅ 好的提交说明
sharedev apl push UIEvt_FillStoreName__c -m "新增门店名称自动填充功能"
sharedev apl push UIEvt_FillStoreName__c -m "修复查询条件格式错误"
sharedev apl push UIEvt_FillStoreName__c -m "优化日志记录，添加详细上下文信息"

# ❌ 不好的提交说明
sharedev apl push UIEvt_FillStoreName__c -m "update"
sharedev apl push UIEvt_FillStoreName__c -m "fix"
```

**失败处理**:
1. 如果 push 失败：
   - 检查网络连接
   - 检查是否有版本冲突
   - 使用 `sharedev apl diff` 查看差异
   - 解决冲突后重新 push

**注意事项**:
- `sharedev apl push` 会覆盖远端代码，请确保团队成员知晓
- 提交前建议先 `sharedev apl diff` 确认变更内容
- 如有版本冲突，需要先解决冲突再提交
- 提交说明必须清晰描述本次变更的内容
- 若用户未明确要求发布，则停留在 diff 和总结阶段

**成功示例**:
```bash
$ sharedev apl push UIEvt_FillStoreName__c -m "新增门店名称自动填充功能"
[sharedev] Successfully pushed APL function UIEvt_FillStoreName__c to remote.
```

**失败示例**:
```bash
$ sharedev apl push UIEvt_FillStoreName__c -m "update"
[sharedev] Error: Commit message is too short. Please provide a more descriptive message.
```

#### 常用命令

| 命令 | 功能 | 说明 |
|------|------|------|
| `sharedev apl pull --all` | 拉取全部函数 | 从远端拉取所有 APL 函数到本地 |
| `sharedev apl pull <apiName>` | 拉取单个函数 | 拉取指定函数并建立跟踪关系 |
| `sharedev apl push <apiName>` | 发布函数 | 将本地变更推送到远端 |
| `sharedev apl compile <apiName>` | 编译检测 | 检查代码编译是否通过 |
| `sharedev apl analyze <apiName>` | 静态分析 | 代码质量和规范分析 |
| `sharedev apl diff <apiName>` | 版本对比 | 对比本地与远端版本差异 |
| `sharedev apl debug <apiName>` | 调试运行 | 本地调试函数执行 |
| `sharedev object search <text>` | 搜索对象 | 搜索对象元数据 |
| `sharedev object info <apiName>` | 对象详情 | 查询对象字段信息 |

#### 使用流程

```bash
# 1. 初始化项目（首次使用）
sharedev init

# 2. 每次使用技能前刷新 docs/specs
cd <enterpriseEA>
sharedev init --yes --agent <TARGET_PLATFORM> --pull-all-apl --pull-all-pwc -e . -d <domain> -c <certificate>
mkdir -p <enterpriseEA>/.sharedev/specs
rsync -a <enterpriseEA>/<spec-dir>/specs/ <enterpriseEA>/.sharedev/specs/

# 3. 拉取远端代码（建立跟踪）
sharedev apl pull --all

# 4. 开发完成后编译检测
sharedev apl compile <apiName>

# 5. 静态分析
sharedev apl analyze <apiName>

# 6. 用户确认后发布代码（可选）
sharedev apl push <apiName>
```

#### 配置文件

配置文件位于 `.sharedev/settings.json`：
```json
{
  "certificate": "<token>",
  "domain": "https://www.fxiaoke.com/"
}
```

### 4.1 代码规范检查清单

实现完成后,必须进行以下检查:

#### 命名规范
- [ ] 变量名使用驼峰命名法
- [ ] 常量名使用大写字母和下划线
- [ ] 函数名清晰表达功能意图
- [ ] 避免使用保留字(owner, this, delegate)

#### 错误处理
- [ ] 所有API调用都有错误处理
- [ ] 错误日志包含详细信息
- [ ] 用户友好的错误提示
- [ ] 区分业务错误和系统错误

#### 性能优化
- [ ] 使用批量操作代替循环单条操作
- [ ] 避免重复查询相同数据
- [ ] 合理使用缓存
- [ ] 控制查询返回字段数量

#### 安全检查
- [ ] 验证输入参数
- [ ] 检查数据权限
- [ ] 不记录敏感信息到日志
- [ ] 不在代码中硬编码密钥

### 4.2 质量门控

**必须通过以下门控，才能进入发布确认阶段:**

| 门控项 | 标准 | 检查命令 | 不通过后果 |
|--------|------|----------|-----------|
| 编译检测 | 通过 | `sharedev apl compile <apiName>` | 阻断提交 |
| 静态分析 | 通过 | `sharedev apl analyze <apiName>` | 阻断提交 |
| 错误处理完整性 | 所有API调用都有错误处理 | 代码审查 | 阻断提交 |
| 日志记录 | 关键步骤有日志记录 | 代码审查 | 阻断提交 |
| 平台限制 | 未超出调用次数和时间限制 | 代码审查 | 阻断提交 |
| 命名规范 | 符合驼峰命名法 | 代码审查 | 警告提示 |
| 性能优化 | 使用批量操作 | 代码审查 | 警告提示 |

### 4.3 使用 sharedev 进行规范检查

在代码完成后，应使用 sharedev 进行自动化检查：

```bash
# 编译检测
sharedev apl compile <apiName> --verbose

# 静态分析
sharedev apl analyze <apiName> --verbose

# 查看与远端差异
sharedev apl diff <apiName>
```

**注意**: 使用 sharedev 命令前，必须先执行 `sharedev apl pull` 建立跟踪关系。

## Phase 5: 文档索引

### 5.1 核心API快速导航

以下路径均基于 `<enterpriseEA>` 解析，技能安装到全局目录后不要再依赖相对路径跳转。

| API | 功能 | 文档 |
|-----|------|------|
| Fx.object | 对象数据操作 | `<aplApiDocs>ObjectDataAPI.md` |
| Fx.http | HTTP请求 | `<aplApiDocs>HttpAPI.md` |
| Fx.message | 消息通知 | `<aplApiDocs>MessageAPI.md` |
| Fx.log | 日志记录 | `<aplApiDocs>LogAPI.md` |
| Fx.org | 组织架构 | `<aplApiDocs>OrganizationAPI.md` |

### 5.2 数据类型快速导航

| 类型 | 说明 | 文档 |
|------|------|------|
| String | 字符串操作 | `<aplDataTypeDocs>String.md` |
| List | 列表集合 | `<aplDataTypeDocs>List.md` |
| Map | 键值对集合 | `<aplDataTypeDocs>Map.md` |
| DateTime | 日期时间 | `<aplDataTypeDocs>DateTime.md` |

### 5.3 对象快速索引

**常用对象导航**（完整对象列表见 `<objectsRoot>objects.md`）

| 对象名称 | ApiName | 文档 | 常用场景 |
|---------|---------|------|---------|
| 客户 | AccountObj | `<objectsRoot>AccountObj.md` | 客户管理、销售流程 |
| 联系人 | ContactObj | `<objectsRoot>ContactObj.md` | 联系人管理 |
| 商机 | NewOpportunityObj | `<objectsRoot>NewOpportunityObj.md` | 商机跟进、销售预测 |
| 销售线索 | LeadsObj | `<objectsRoot>LeadsObj.md` | 线索管理、线索转化 |
| 产品 | ProductObj | `<objectsRoot>ProductObj.md` | 产品管理、报价 |
| 销售订单 | SalesOrderObj | `<objectsRoot>SalesOrderObj.md` | 订单处理 |
| 回款 | PaymentObj | `<objectsRoot>PaymentObj.md` | 财务回款 |
| 人员 | PersonnelObj | `<objectsRoot>PersonnelObj.md` | 人员管理 |
| 部门 | DepartmentObj | `<objectsRoot>DepartmentObj.md` | 组织架构 |

**自定义对象导航**
- 查找目录：`<objectsRoot>`
- 自定义对象文档通常以 `__c.md` 结尾
- 旧说明中的 `<enterpriseEA>/.sharedev/dev-metadata/objects/` 统一视为历史路径，执行时必须映射到 `<objectsRoot>`

### 5.4 完整索引

- [API完整索引](references/api-index.md)
- [数据类型索引](references/data-types-index.md)
- [场景示例索引](references/scenarios-index.md)
- 对象索引(动态更新)：`<objectsRoot>objects.md` - 由平台自动生成，包含所有对象

## Phase 6: 最佳实践

### 6.1 性能优化最佳实践

```groovy
// ❌ 禁止：循环内 API 调用（严重影响性能）
dataList.each { item ->
    Fx.object.create("AccountObj", item, [:], CreateAttribute.builder().build())
}

// ✅ 允许：简单数据遍历（无 API 调用）
result.dataList.each { item ->
    def map = item as Map
    log.info("客户ID: ${map._id}, 客户名称: ${map.name}")
}

// ✅ 推荐：批量操作（替代循环内单条操作）
Fx.object.batchCreate("AccountObj", dataList, [:], CreateAttribute.builder().build())
```

### 6.2 错误处理最佳实践

```groovy
// ❌ 错误: 忽略错误
def result = Fx.object.find(...)

// ✅ 正确: 完整错误处理
def (Boolean error, QueryResult result, String msg) = Fx.object.find(...)
if (error) {
    log.error("查询失败: " + msg)
    Fx.message.throwException("查询失败,请联系管理员")
}
```

### 6.3 日志记录最佳实践

```groovy
// ✅ 记录关键步骤
log.info("开始处理数据,总数: ${dataList.size()}")

// ✅ 记录耗时
def startTime = System.currentTimeMillis()
// ... 处理逻辑
log.lap("数据处理耗时: ${System.currentTimeMillis() - startTime}ms")

// ✅ 记录错误详情
log.error("处理失败,对象ID: ${objectId}, 错误: ${errorMessage}")
```

## Phase 7: 常见问题

### 7.0 常见编译问题

在 APL 开发过程中，编译错误是常见问题。详细的编译问题和解决方法请参考：

**[常见编译问题文档](references/compilation-issues.md)**

该文档包含以下内容：
- 多重赋值返回类型问题
- Map 类型转换问题
- API 参数数量问题
- 变量类型声明问题

每个问题都包含：错误信息、原因分析、解决方案、错误示例、正确示例。

---

### 7.1 闭包限制

**问题**: 闭包中不能使用 owner, this, delegate

**解决方案**:
```groovy
// ❌ 错误
dataList.each { item ->
    def owner = this.owner  // 报错
}

// ✅ 正确
def outerOwner = this.owner
dataList.each { item ->
    // 使用外部变量
}
```

### 7.2 字段类型映射

| 字段类型 | APL类型 | 示例 |
|---------|---------|------|
| 文本字段 | String | `"测试"` |
| 数字字段 | Integer/BigDecimal | `100` / `new BigDecimal("100.5")` |
| 日期字段 | Long (时间戳) | `Date.now().toTimestamp()` |
| 人员字段 | List<String> | `["1001", "1002"]` |
| 附件字段 | List<Map> | `[["filename": "test.pdf", "path": "..."]]` |
| 单选字段 | String | `"option1"` |
| 多选字段 | List<String> | `["option1", "option2"]` |

### 7.3 空值处理

```groovy
// ✅ 安全访问
def name = context.data?.name ?: "默认值"

// ✅ 空值判断
if (context.data?.name) {
    // 非空处理
}
```

## 自我进化机制

### 经验回写

当发现新的最佳实践或常见问题时,应回写到技能文件:

1. **最佳实践**: 添加到 Phase 6 最佳实践部分
2. **常见问题**: 添加到 Phase 7 常见问题部分
3. **代码模板**: 添加到 Phase 3 实现指导部分
4. **规范检查**: 添加到 Phase 4 规范检查部分

### 经验记录模板

```markdown
### [日期] [经验类型]

**场景**: [描述使用场景]

**问题**: [描述遇到的问题]

**解决方案**: [描述解决方案]

**代码示例**:
```groovy
// 代码示例
```

**经验总结**: [总结关键要点]
```

### 2026-04-10 API 调用问题

**场景**: 使用 Fx.object.create 创建联系人对象

**问题**: 编译错误 - Cannot find matching method com.fxiaoke.functions.api.ObjectDataAPI#create()

**原因**: 
1. 未查看官方文档，凭经验猜测 API 签名
2. 只传入了3个参数，缺少 details 参数

**解决方案**: 
1. 查看官方文档 `<aplApiDocs>ObjectDataAPI.md`
2. 确认 create 方法签名：`create(String apiName, Map objectData, Map details, CreateAttribute attribute)`
3. details 参数可以为空 Map（表示不创建从对象）

**代码示例**:
```groovy
// ❌ 错误：缺少 details 参数
def (Boolean error, Map result, String msg) = Fx.object.create(
    "ContactObj",
    contactData,
    CreateAttribute.builder().build()
)

// ✅ 正确：传入4个参数，details 为空 Map
Map detailData = [:]
def (Boolean error, Map result, String msg) = Fx.object.create(
    "ContactObj",
    contactData,
    detailData,  // details 参数，空 Map 表示不创建从对象
    CreateAttribute.builder().build()
)
```

**经验总结**: 
- 🔴 **遇到 API 调用问题时，必须优先查看官方文档**（`<aplApiDocs>`）
- 不要凭经验猜测 API 签名，不同版本的 API 可能有差异
- Fx.object.create 必须传入4个参数，details 参数可以为空 Map

### 2026-04-10 QueryTemplate.OR 使用问题

**场景**: 构建多条件查询（手机号或邮箱匹配）

**问题**: 编译错误 - Cannot find matching method QueryTemplate#OR(List)

**原因**: 
1. 尝试使用 `QueryTemplate.OR(queryConditions)` 传入 List
2. QueryTemplate.OR 不接受 List 参数，需要传入多个 QueryTemplate 对象

**解决方案**: 
1. 查看示例代码和 API 文档
2. 使用条件判断构建不同的 QueryTemplate
3. 正确使用 QueryTemplate.OR(template1, template2)

**代码示例**:
```groovy
// ❌ 错误：传入 List 参数
List queryConditions = []
if (phone) {
    queryConditions.add(["mobile": QueryOperator.EQ(phone)])
}
if (email) {
    queryConditions.add(["email": QueryOperator.EQ(email)])
}
QueryTemplate.OR(queryConditions)  // 编译错误

// ✅ 正确：根据条件构建 QueryTemplate
QueryTemplate queryTemplate = null
if (phone != null && !phone.trim().isEmpty() && email != null && !email.trim().isEmpty()) {
    QueryTemplate phoneTemplate = QueryTemplate.AND(["mobile": QueryOperator.EQ(phone)])
    QueryTemplate emailTemplate = QueryTemplate.AND(["email": QueryOperator.EQ(email)])
    queryTemplate = QueryTemplate.OR(phoneTemplate, emailTemplate)
} else if (phone != null && !phone.trim().isEmpty()) {
    queryTemplate = QueryTemplate.AND(["mobile": QueryOperator.EQ(phone)])
} else if (email != null && !email.trim().isEmpty()) {
    queryTemplate = QueryTemplate.AND(["email": QueryOperator.EQ(email)])
}
```

**经验总结**: 
- QueryTemplate.OR 不接受 List 参数，需要传入多个 QueryTemplate 对象
- 使用条件判断构建不同的查询模板
- 复杂查询逻辑需要分步构建，避免一次性传入所有条件

### 2026-04-10 官方文档的重要性

**场景**: 开发过程中遇到 API 使用问题

**问题**: 编译错误频发，多次尝试仍未解决

**原因**: 
1. 未优先查看官方文档
2. 凭经验猜测 API 用法
3. 未参考 `<enterpriseEA>/.sharedev/docs/apl/pages/` 下的文档

**解决方案**: 
用户提醒："你遇到问题没有查看 `<enterpriseEA>/.sharedev/docs/apl/pages/` 这里的文档吗？"

立即查看官方文档：
- `<aplApiDocs>ObjectDataAPI.md` - API 文档
- `<aplDataTypeDocs>` - 数据类型文档
- `<objectsRoot>` - 对象定义文档

**经验总结**: 
- 🔴 **遇到任何 API 使用问题，必须优先查看官方文档**
- 官方文档路径：`<aplApiDocs>`
- 不要凭经验猜测，不同版本 API 可能有差异
- 官方文档是最权威的参考来源

---

## APL 代码规范注意事项

- ⚠️ **循环使用限制**：允许使用 `each` 进行简单数据遍历，但禁止在循环内进行 API 调用
  - ✅ 允许：`result.dataList.each { item -> log.info(...) }` - 简单遍历
  - ❌ 禁止：`dataList.each { item -> Fx.object.create(...) }` - 循环内 API 调用
  - **建议**：使用批量操作替代循环内单条操作
- ❌ **禁止使用 Range 表达式**（0..<n 等）- 会触发 SecurityException
- ❌ **禁止导入外部 Java 包和外部 Groovy 包**
- ❌ **禁止在闭包里使用变量**：owner；this；delegate
- ⚠️ **Map 取值需要类型转换**：`map[key]` 返回 Object 类型，需要显式转换
  - 错误：`map[key] << item` - Object 不能使用 << 操作符
  - 正确：`List list = map[key] as List; list << item`
- ⚠️ **QueryTemplate.AND() 参数格式**：每个 Map 只能包含一个键值对
  - 错误：`QueryTemplate.AND(["field1": value1, "field2": value2])` - Map 包含多个键值对会报错
  - 正确：`QueryTemplate.AND(["field1": value1], ["field2": value2])` - 每个参数是一个只包含一个键值对的 Map
- ⚠️ **QueryTemplate.OR() 使用限制**：不接受 List 参数，需要传入多个 QueryTemplate 对象
  - 错误：`QueryTemplate.OR(queryConditionsList)` - 不接受 List 参数
  - 正确：`QueryTemplate.OR(template1, template2)` - 传入多个 QueryTemplate 对象
- ⚠️ **log.error() 方法限制**：只接受一个 String 参数，不支持两个参数
  - 错误：`log.error("错误信息", exception)` - 不支持传入异常对象
  - 正确：`log.error("错误信息: ${e.message}")` - 只传入错误信息字符串
- ⚠️ **HashSet 操作限制**：避免使用 `<<` 操作符，使用 `add()` 方法替代
  - 错误：`emailSet << userInfo.email as String` - 类型转换问题
  - 正确：`String email = userInfo.email as String; emailSet.add(email)` - 先转换再添加
- 🔴 **Fx.object.create() 必须传入4个参数**：apiName, objectData, details, createAttribute
  - 错误：`Fx.object.create("ContactObj", contactData, CreateAttribute.builder().build())` - 缺少 details 参数
  - 正确：`Fx.object.create("ContactObj", contactData, [:], CreateAttribute.builder().build())` - details 为空 Map 表示不创建从对象
  - **重要**：遇到 API 调用问题时，必须优先查看官方文档（`<aplApiDocs>`）
---

## 规范参考

### ⚠️ 核心规范文件（必须遵循）

**在开发过程中，必须严格遵守以下核心规范文件，违反规范将导致代码无法运行或业务逻辑错误：**

| 规范文件 | 说明 | 强制性 | 路径 |
|---------|------|--------|------|
| CORE-RULES.md | APL 开发八条铁律 | 🔴 **必须遵守** | [CORE-RULES.md](../../specs/apl/CORE-RULES.md) |
| CODE-PATTERNS.md | 常用代码模式和最佳实践 | 🔴 **必须遵守** | [CODE-PATTERNS.md](../../specs/apl/CODE-PATTERNS.md) |
| DATA-TYPE-MAPPING.md | 数据类型映射和转换规则 | 🔴 **必须遵守** | [DATA-TYPE-MAPPING.md](../../specs/apl/DATA-TYPE-MAPPING.md) |
| API-SIGNATURES.md | API 签名和使用规范 | 🟡 **强烈建议** | [API-SIGNATURES.md](../../specs/apl/API-SIGNATURES.md) |

**强制要求**：
- 开发前必须阅读 CORE-RULES.md，了解八条铁律
- 开发中必须遵循 CODE-PATTERNS.md 的代码模式
- 数据处理必须查阅 DATA-TYPE-MAPPING.md 确保类型正确
- 违反核心规范的代码视为不合格，必须修改

### Namespace 和 Return Type 参考

**创建 APL 函数/类时，必须参考以下文档确定 namespace 和 return type**：

| 参考文件 | 说明 | 路径 |
|---------|------|------|
| ns_range.md | Namespace 和 Return Type 完整对照表 | [ns_range.md](../../specs/apl/ns_range.md) |

**Namespace 分类说明**：

#### Function 类型 Namespace（需指定 return-type）

| Group | Namespace | 常用返回类型 | 适用场景 |
|-------|-----------|--------------|----------|
| OBJECT | button | UIAction, void | 按钮点击触发 |
| OBJECT | ui_event | UIEvent | UI 事件处理 |
| OBJECT | validate_function | ValidateResult | 数据校验 |
| PLATFORM | scheduler_task | void | 定时任务 |
| PLATFORM | controller | Map | 自定义 API |
| PLATFORM | flow | void, Boolean | 流程节点 |

#### Class 类型 Namespace（不需要 return-type）

| Group | Namespace | 适用场景 |
|-------|-----------|----------|
| PLATFORM | library | 公共库，可复用代码 |
| PLATFORM | event_listener | 事件监听器 |
| OBJECT | object_handler | 对象业务处理器 |

### 代码模板参考

#### 模板目录

代码模板位于 `.sharedev/specs/apl/assets/templates/` 目录，提供各类场景的代码模板：

| 模板类型 | 说明 | 路径 |
|---------|------|------|
| 按钮函数模板 | 按钮场景的标准代码模板 | [templates/button/](../../specs/apl/assets/templates/) |
| 流程函数模板 | 流程场景的标准代码模板 | [templates/flow/](../../specs/apl/assets/templates/) |
| 计划任务模板 | 计划任务场景的标准代码模板 | [templates/scheduler/](../../specs/apl/assets/templates/) |
| 控制器模板 | 自定义控制器的标准代码模板 | [templates/controller/](../../specs/apl/assets/templates/) |

#### 示例代码

完整的示例代码位于 `.sharedev/specs/apl/references/EXAMPLES/` 目录：

| 示例类型 | 说明 | 路径 |
|---------|------|------|
| 完整示例 | 各场景的完整代码示例 | [EXAMPLES/](../../specs/apl/references/EXAMPLES/) |

### 规范使用建议

1. **开发前**：阅读 CORE-RULES.md，了解 APL 开发的八条铁律
2. **开发中**：参考 CODE-PATTERNS.md，使用推荐的代码模式
3. **数据处理**：查阅 DATA-TYPE-MAPPING.md，确保数据类型正确
4. **API 调用**：参考 API-SIGNATURES.md，使用正确的 API 签名
5. **代码模板**：从 templates 目录复制合适的模板，快速开始开发
6. **示例参考**：查看 EXAMPLES 目录的完整示例，学习最佳实践

---

## 参考资源

- [开发流程详细指导](references/development-workflow.md)
- [代码规范检查清单](references/code-standards.md)
- [质量门控定义](references/quality-gates.md)
- [最佳实践集合](references/best-practices.md)
- [常见问题和解决方案](references/common-issues.md)

## sharedev CLI 参考

### 命令详解

#### sharedev init
初始化项目，生成 `.sharedev/settings.json` 配置文件。

#### sharedev apl pull
```bash
sharedev apl pull --all          # 拉取全部函数
sharedev apl pull <apiName>      # 拉取单个函数
```

#### sharedev apl push
```bash
sharedev apl push <apiName>      # 用户确认后发布函数到远端
```

#### sharedev apl compile
```bash
sharedev apl compile <apiName>   # 编译检测
```
检查代码是否能正确编译，依赖远端元数据。

#### sharedev apl analyze
```bash
sharedev apl analyze <apiName>   # 静态分析
```
分析代码质量，检查潜在问题。

#### sharedev apl diff
```bash
sharedev apl diff <apiName>      # 对比本地与远端版本
```

#### sharedev apl debug
```bash
sharedev apl debug <apiName>     # 调试运行函数
```

#### sharedev object
```bash
sharedev object search <text>    # 搜索对象
sharedev object info <apiName>   # 查询对象详情
```

### 本地工作区结构

```
<workspace>/
├── package/
│   └── fx/custom/apl/script/    # APL 函数源码目录
│       └── <apiName>.<type>.groovy
└── .sharedev/
    ├── settings.json            # 配置文件
    └── apl/
        ├── snapshot.json        # 远端快照
        ├── versions.json        # 版本号
        └── metadata.json        # 元信息
```
