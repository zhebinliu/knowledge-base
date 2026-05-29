---
name: sharedev-apl-lite
description: |
  APL开发流程助手（简版）。跳过 PRD/ARCH/TASKS 文档生成环节，适用于简单的函数需求。
  从需求确认直接进入代码实现，仍然强制执行编译检查、代码审查和发布授权流程。

  触发场景:
  - 简单APL函数开发（按钮/流程/计划任务/自定义控制器/事件监听等）
  - 用户明确不需要文档产出的快速开发
  - 单文件、单函数的轻量开发任务

  对比完整版 sharedev-apl-implement: 省去 Phase 0.5 需求文档生成（PRD/ARCH/TASKS）
  保留: 需求确认 → 代码实现 → 编译+分析 → 代码审查(硬停止) → 发布授权
---

> ## 🔴 阻塞级首步 — SHARE DEV TRACE（全任务暂停，立即执行）
>
> 当你读到这行字时，**停止一切分析和编码动作**，立即在终端执行以下命令。
> **在此之前不得执行任何其他命令、不得读取任何文件、不得输出任何代码。**
>
> ```bash
> sharedev trace -m skill --str1 sharedev-apl-lite
> ```
>
> 执行成功后方可继续后续内容。此命令用于记录技能调用轨迹。
> **如果跳过此步骤，本次任务视为流程违规，需从 Step 0 重新开始。**

---

# 🔴 执行前必读 - 强制检查点

本技能为 **简版 APL 开发流程**，跳过文档生成环节，适用于简单的函数需求。

### ⚠️ 核心规则（必须遵守）

1. **Step 1 不可跳过**：必须确认开发场景和基本信息
2. **Step 4 不可跳过**：编译 + 静态分析必须通过
3. **Step 5 是硬停止点**：代码审查前必须询问用户
4. **Step 6 是发布确认点**：只有用户明确要求才能执行 push

### 🚦 Phase Gate 状态机

```
Phase 0 (需求确认) → Phase 1 (代码实现) → Phase 2 (规范检查) → Phase 3 (代码审查) → Phase 4 (发布)
```

| 当前状态 | 转换条件 | 目标状态 | 阻断条件 |
|---------|---------|---------|---------|
| Phase 0 | 需求确认完成 | Phase 1 | 信息缺失 |
| Phase 1 | 代码实现完成 | Phase 2 | 实现失败 |
| Phase 2 | compile + analyze 通过 | Phase 3 | 编译/分析失败 |
| Phase 3 | 用户确认审查 | Phase 4 或 完成 | 无（用户可跳过审查） |
| Phase 4 | 用户明确授权 push | 完成 | 用户未授权 |

### 硬停止点

| 硬停止点 | 必须动作 | 允许跳过 |
|---------|---------|---------|
| Phase 2 → Phase 3 | compile + analyze 必须通过 | ❌ 不可跳过 |
| Phase 3 → Phase 4 | **必须询问用户**是否代码审查 | 用户选择跳过审查 |
| Phase 4 → 完成 | **必须用户明确授权** push | 用户选择不发布 |

### 🔴 强制流程检查清单

```
🔴 强制流程（遗漏任一项即为流程违规）：
- [ ] Step 1: 确认函数名、namespace、return type、关联对象
- [ ] Step 2: 创建或更新 APL 函数/类（如需要）
- [ ] Step 3: 实现业务逻辑
- [ ] Step 4: 编译检测（sharedev apl compile）+ 静态分析（sharedev apl analyze）
- [ ] Step 5: 🛑 硬停止！询问是否进行代码审查
- [ ] Step 6: 询问是否发布到服务端（sharedev apl push）
```

### ⚠️ 强制交互点

| 场景 | Phase | 说明 |
|------|-------|------|
| 询问是否进行代码审查 | Phase 3 | **硬停止点** |
| 询问是否发布到服务端 | Phase 4 | **必须用户明确授权** |

### 阶段退出条件

| 阶段 | 退出条件 |
|------|----------|
| 需求确认 | 已确认函数名、namespace、return type、关联对象 |
| 代码实现 | 代码已落盘并说明文件路径 |
| 规范检查 | `sharedev apl compile` 和 `sharedev apl analyze` 均通过 |
| 代码审查 | 已调用 `sharedev-apl-code-review` 或完成本地审查，生成 `REVIEW.md` |
| 发布确认 | 用户明确回复允许发布 |

## 运行时路径变量

| 变量 | 含义 |
|------|------|
| `<enterpriseEA>` | 当前企业工程根目录，包含 `.sharedev/`、`package/` 的目录 |
| `<sharedevSettings>` | `<enterpriseEA>/.sharedev/settings.json` |
| `<domain>` | 从 `<sharedevSettings>` 读取的服务域名 |
| `<certificate>` | 从 `<sharedevSettings>` 读取的认证信息 |
| `<TARGET_PLATFORM>` | 当前代理平台：`trae` / `claude` / `codex` |
| `<spec-dir>` | 与 `<TARGET_PLATFORM>` 对应的 spec 根目录：`.trae` / `.claude` / `.codex` |
| `<aplApiDocs>` | `<enterpriseEA>/.sharedev/docs/apl/pages/func-apl/api/` |
| `<aplDataTypeDocs>` | `<enterpriseEA>/.sharedev/docs/apl/pages/func-apl/data-type/` |
| `<objectsRoot>` | `<enterpriseEA>/.sharedev/dev-metadata/objects/` |
| `<deliverablesRoot>` | `<enterpriseEA>/deliverables/` |

---

## Phase 0: 需求确认（简版）

**跳过 PRD/ARCH/TASKS 文档生成，直接确认核心信息。**

### 0.1 场景识别

| 场景 | 触发关键词 | 参考文档 |
|------|-----------|---------|
| 按钮开发 | "按钮", "button" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/button/summary.md` |
| 流程开发 | "流程", "flow", "审批流" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/flow/summary.md` |
| 计划任务 | "计划任务", "定时", "scheduler" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/scheduler_task/summary.md` |
| 自定义控制器 | "控制器", "controller", "API" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-class-scene/apl_controller/summary.md` |
| 事件监听 | "事件监听", "event", "监听器" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-class-scene/event_listener/summary.md` |
| 范围规则 | "范围规则", "scope rule", "限制可选" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/business-process/scope_rule/1.summarize.md` |
| 数据校验 | "校验", "验证", "validate" | `<enterpriseEA>/.sharedev/docs/apl/pages/func-introduce/apl-func-scene/business-process/pre-validation/1.summarize.md` |

### 0.2 确认开发信息

必须从用户需求中提取/确认以下信息：

| 信息项 | 说明 | 示例 |
|-------|------|------|
| 函数名称 | ApiName，以 `__c` 结尾 | `ClassNameSearch__c` |
| Namespace | 命名空间 | `controller` / `button` / `flow` |
| Return Type | 返回类型（仅 function） | `Map` / `void` / `UIAction` |
| 关联对象 | 绑定的业务对象 ApiName | `AccountObj` |
| 功能描述 | 一句话描述功能 | 根据名称模糊搜索客户 |

### 0.3 平台限制检查

| 限制项 | 限制值 | 检查点 |
|--------|--------|--------|
| Fx.object调用 | 300次/函数 | 是否需要大量数据操作? |
| Fx.http调用 | 50次/函数 | 是否需要频繁外部调用? |
| 按钮执行时间 | 20秒 | 逻辑是否复杂? |
| 流程执行时间 | 300秒 | 是否需要长时间处理? |
| 计划任务时间 | 600秒 | 批量数据量多大? |
| 内存限制 | 256MB | 是否处理大对象? |

**门控**: 如果需求超出平台限制，必须先与用户确认调整方案。

---

### 0.4 函数/类自动决策规则

**⚠️ 决策原则：根据场景自动选择 function 或 class，不询问用户。**

#### 自动决策表

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

#### 决策伪代码

```
IF namespace ∈ {button, ui_event, validate_function, scope_rule, related_scope, flow}
  → 跳过询问，直接使用 --type function --bind <关联对象>，确认 return type
  → 关联对象从 Phase 0.2 中提取的「关联对象」获得（如 AccountObj）
ELSE IF namespace ∈ {scheduler_task, controller}
  → 跳过询问，直接使用 --type function，确认 return type（不绑定对象）
ELSE IF namespace ∈ {library, event_listener, object_handler}
  → 跳过询问，直接使用 --type class（object_handler 需要 --bind）
ELSE
  → 使用 AskUserQuestion 询问用户选择 function 或 class：
  
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

---

## Phase 1: 代码实现

### 1.0 输出目录

所有 APL 代码文件输出到 `<enterpriseEA>/package/fx/custom/apl/script/`。

### 1.1 命名规范

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 按钮函数 | `BtnXXX__c.function.groovy` | `BtnUpdateAccount__c.function.groovy` |
| 普通函数 | `XXX__c.function.groovy` | `AccountQuery__c.function.groovy` |
| UI事件 | `UIEvtXXX__c.function.groovy` | `UIEvtFormValidate__c.function.groovy` |
| 数据校验 | `VldXXX__c.function.groovy` | `VldAccountCreate__c.function.groovy` |
| 范围规则 | `ScopeXXX__c.function.groovy` | `ScopeStoreChannel__c.function.groovy` |
| 关联对象范围规则 | `RelScopeXXX__c.function.groovy` | `RelScopeContact__c.function.groovy` |
| 计划任务 | `SchdXXX__c.function.groovy` | `SchdBatchLead__c.function.groovy` |
| APL类 | `XXX__c.class.groovy` | `WebHookController__c.class.groovy` |

**⚠️ API 名称中不能包含下划线**（除了结尾的 `__c`）：
- ❌ `Evt_MatchContact__c`（包含下划线）
- ✅ `EvtMatchContact__c`（不含下划线）

### 1.2 创建 APL 函数/类（使用 sharedev）

#### Function 类型 Namespace（需指定 return-type）

| Group | Namespace | 常用返回类型 | 适用场景 |
|-------|-----------|--------------|----------|
| OBJECT | button | UIAction, void | 按钮点击触发 |
| OBJECT | ui_event | UIEvent | UI 事件处理 |
| OBJECT | validate_function | ValidateResult | 数据校验（提交时校验） |
| OBJECT | scope_rule | QueryTemplate, List, RangeRule | 范围规则（控制字段下拉可选范围） |
| OBJECT | related_scope | RelatedObject | 关联对象范围规则 |
| PLATFORM | scheduler_task | void | 定时任务 |
| PLATFORM | controller | Map | 自定义 API |
| OBJECT | flow | void, Boolean | 流程节点 |

> ⚠️ **重要区分**：
> - `scope_rule` = 范围规则：绑定到**查找关联字段**，控制该字段下拉列表的可选数据范围，返回 `QueryTemplate`（推荐）/ `List` / `RangeRule`
> - `related_scope` = 关联对象范围规则：控制关联对象的可选范围，返回 `RelatedObject`
> - `validate_function` = 校验函数：绑定到**对象**，在提交保存时进行数据校验，返回 `ValidateResult`
>
> **关键词识别**：
> - "范围"、"可选"、"限制可选"、"筛选" → `scope_rule`
> - "校验"、"验证"、"阻止保存" → `validate_function`
> - "范围规则函数" → **必然是 `scope_rule`**，不是 `validate_function`

#### Class 类型 Namespace（不需要 return-type）

| Group | Namespace | 适用场景 |
|-------|-----------|----------|
| PLATFORM | library | 公共库 |
| PLATFORM | event_listener | 事件监听器 |
| OBJECT | object_handler | 对象业务处理器 |

#### 创建命令

**创建 Function**:
```bash
sharedev apl create \
  --apiname <ApiName>__c \
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
  --apiname <ApiName>__c \
  --function-name <ClassName> \
  --type class \
  --namespace <namespace> \
  --remark "<描述>" \
  --package script
```

**创建 Class（绑定对象）**:
```bash
sharedev apl create \
  --apiname EvtSyncDeliveryOrderOnSalesOrderChange__c \
  --function-name EvtSyncDeliveryOrderOnSalesOrderChange \
  --type class \
  --namespace object_handler \
  --bind SalesOrderObj \
  --remark "销售订单变更时自动同步出货单" \
  --package script
```

> ⚠️ **硬规则**：所有 `sharedev apl create` 命令必须显式携带 `--package script`。该参数虽在 CLI 帮助中显示为可选，但实际执行时缺少会导致函数落盘到错误包目录，禁止省略。

### 1.3 Context 上下文

```groovy
context.tenantId      // 租户ID
context.userId        // 用户ID
context.data          // 主对象数据(Map)
context.details       // 从对象数据(Map)
context.dataList      // 批量数据(List)
context.objectIds     // 对象ID列表(List)
context.arg           // 业务参数
```

### 1.4 标准错误处理模式

```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.create(...)

if (error) {
    log.error("操作失败: " + errorMessage)
    Fx.message.throwException("操作失败: " + errorMessage)
    return
}

log.info("操作成功: " + data)
```

### 1.5 常用 API 调用模板

**对象查询**
```groovy
def (Boolean error, QueryResult result, String msg) = Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])
        .queryTemplate(QueryTemplate.AND(["name": QueryOperator.EQ("测试")]))
        .limit(100)
        .build(),
    SelectAttribute.builder().pageSize(500).build()
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
```

**消息发送**
```groovy
Fx.message.send(["1001"], "测试消息", MessageChannelEnum.WORK)
```

### 1.6 性能优化最佳实践

```groovy
// ❌ 禁止：循环内 API 调用
dataList.each { item ->
    Fx.object.create("AccountObj", item, [:], CreateAttribute.builder().build())
}

// ✅ 允许：简单数据遍历（无 API 调用）
result.dataList.each { item ->
    def map = item as Map
    log.info("客户ID: ${map._id}, 客户名称: ${map.name}")
}

// ✅ 推荐：批量操作
Fx.object.batchCreate("AccountObj", dataList, [:], CreateAttribute.builder().build())
```

### 1.7 更新已有 APL 函数/类（原地修改流程）

**⚠️ 重要：更新场景下禁止删除重建或全量覆写原文件！**

当需要修改已有的 APL 函数/类代码时，必须遵循以下原地修改流程：

#### 1.7.1 拉取远端最新代码

```bash
sharedev apl pull <apiName>
```

确保本地代码与远端同步，避免版本冲突。

#### 1.7.2 读取现有源文件

使用 `Read` 工具读取目标 `.groovy` 文件：
- 路径：`<enterpriseEA>/package/fx/custom/apl/script/<ApiName>.function.groovy`（function）
- 路径：`<enterpriseEA>/package/fx/custom/apl/script/<ApiName>.class.groovy`（class）

#### 1.7.3 使用 SearchReplace 做定向修改

**必须**使用 `SearchReplace` 工具对目标代码段做精确替换：

| 参数 | 说明 |
|------|------|
| `old_str` | 需要被替换的原代码段，必须精确匹配源文件中的内容（包括缩进、空格） |
| `new_str` | 替换后的新代码段 |

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

#### 1.7.4 修改完成后验证

完成后进入 Phase 2 执行编译检查 + 静态分析。

#### 1.7.5 禁止行为（更新场景）

| ❌ 禁止 | ✅ 正确做法 |
|---------|-----------|
| 使用 `DeleteFile` 删除原 `.groovy` 文件 | 使用 `SearchReplace` 在原文件上修改 |
| 使用 `Write` 重建整个文件 | 使用 `SearchReplace` 做定向替换 |
| 跳过 `sharedev apl pull` 直接修改 | 先 pull 拉取最新代码，再修改 |
| 不读取文件就修改 | 先用 `Read` 读取，理解现有逻辑后再改 |

> **新建 vs 更新工具选择**：
> - 新建场景（文件不存在）：使用 `sharedev apl create` 创建 + `Write` 写入新文件（见 1.2 节）
> - 更新场景（文件已存在）：使用 `SearchReplace` 定向修改，禁止 `Write` 全量覆写

---

## Phase 2: 规范检查（编译 + 静态分析）

**⚠️ 强制性流程**: 代码完成后，必须立即执行以下检查。

### 2.1 强制执行步骤

```bash
# 步骤1: 编译检查（必须通过）
sharedev apl compile <apiName>

# 步骤2: 静态分析（必须通过）
sharedev apl analyze <apiName>
```

### 2.2 失败处理

1. 编译失败 → 记录错误详情，修复代码，阻断后续流程
2. 静态分析失败 → 记录违规项，修复问题，阻断后续流程
3. 只有两者都通过，才能继续

### 2.3 质量门控

| 门控项 | 标准 | 不通过后果 |
|--------|------|-----------|
| 编译检测 | 通过 | 阻断提交 |
| 静态分析 | 通过 | 阻断提交 |
| 错误处理完整性 | 所有API调用有错误处理 | 阻断提交 |
| 日志记录 | 关键步骤有日志 | 警告提示 |
| 平台限制 | 未超出调用次数和时间限制 | 阻断提交 |

---

## Phase 3: 代码审查（硬停止点）

**🔴 硬停止点：在代码审查前必须询问用户。**

### 3.1 询问用户

**必须使用 AskUserQuestion 询问用户**：

```markdown
AskUserQuestion:
questions:
  - header: "代码审查"
    question: "代码已完成并通过编译和静态分析。\n\n是否进行代码审查？"
    options:
      - label: "执行代码审查"
        description: "调用 sharedev-apl-code-review 技能进行审查"
      - label: "跳过审查"
        description: "跳过代码审查，直接完成开发"
    multiSelect: false
```

### 3.2 用户确认后的处理

- 用户确认审查 → 优先调用 `Skill("sharedev-apl-code-review")`；若不可用，执行本地代码审查清单
- 用户跳过审查 → 继续发布流程

### 3.3 本地代码审查清单（降级方案）

- [ ] 所有 API 调用都有错误处理
- [ ] 错误日志包含详细信息
- [ ] 循环内无 API 调用
- [ ] 无 owner/this/delegate 引用
- [ ] QueryTemplate.AND 每个 Map 只含一个键值对
- [ ] 批量操作替代循环单条操作
- [ ] 对象 API 名称来自对象字典
- [ ] option value 使用 String 类型
- [ ] 输入参数已校验
- [ ] 日志不包含敏感信息

---

## Phase 4: 发布确认

**🔴 发布前必须获得用户明确授权。**

### 4.1 发布前置检查

```
🛑 代码推送前置检查（必须全部通过）：
- [ ] 代码已通过 sharedev apl compile
- [ ] 代码已通过 sharedev apl analyze
- [ ] 已询问用户是否进行代码审查
- [ ] 如用户确认审查，已完成审查
- [ ] 已执行 sharedev apl diff 确认变更
- [ ] 用户已明确要求发布
```

### 4.2 执行步骤

```bash
# 1. 查看变更
sharedev apl diff <apiName>

# 2. 用户确认后发布
sharedev apl push <apiName> -m "提交说明"

# 3. 验证提交
sharedev apl diff <apiName>  # 应显示无差异
```

### 4.3 提交说明规范

```bash
# ✅ 好的提交说明
sharedev apl push ClassNameSearch__c -m "feat: Class班级名称搜索联想API - searchByName单对象模糊搜索"

# ❌ 不好的提交说明
sharedev apl push ClassNameSearch__c -m "update"
```

### 4.4 强制交互

**必须使用 AskUserQuestion 获得用户明确授权**：

```markdown
AskUserQuestion:
questions:
  - header: "发布确认"
    question: "代码已通过所有检查！\n\n是否发布到服务端？\n\n发布操作将覆盖远端代码。"
    options:
      - label: "发布到服务端"
        description: "执行 sharedev apl push 推送到远端"
      - label: "仅查看变更"
        description: "只执行 sharedev apl diff，不推送"
    multiSelect: false
```

---

## APL 代码规范注意事项（八条铁律）

- ⚠️ **循环使用限制**：允许 `each` 简单遍历，禁止循环内 API 调用
  - ✅ `result.dataList.each { item -> log.info(...) }`
  - ❌ `dataList.each { item -> Fx.object.create(...) }`
- ❌ **禁止使用 Range 表达式**（`0..<n` 等）— 触发 SecurityException
- ❌ **禁止导入外部 Java 包和外部 Groovy 包**
- ❌ **禁止在闭包里使用变量**：`owner`；`this`；`delegate`
- ⚠️ **Map 取值需要类型转换**：`map[key]` 返回 Object，需显式转换
  - 错误：`map[key] << item`
  - 正确：`List list = map[key] as List; list << item`
- ⚠️ **QueryTemplate.AND() 参数格式**：每个 Map 只能包含一个键值对
  - 错误：`QueryTemplate.AND(["field1": value1, "field2": value2])`
  - 正确：`QueryTemplate.AND(["field1": value1], ["field2": value2])`
- ⚠️ **QueryTemplate.OR() 使用限制**：不接受 List 参数
  - 错误：`QueryTemplate.OR(queryConditionsList)`
  - 正确：`QueryTemplate.OR(template1, template2)`
- ⚠️ **log.error() 方法限制**：只接受一个 String 参数
  - 错误：`log.error("错误信息", exception)`
  - 正确：`log.error("错误信息: ${e.message}")`
- 🔴 **Fx.object.create() 必须传入4个参数**：`apiName, objectData, details, createAttribute`
  - 错误：`Fx.object.create("ContactObj", data, CreateAttribute.builder().build())`
  - 正确：`Fx.object.create("ContactObj", data, [:], CreateAttribute.builder().build())`
- 🔴 **API 返回解构三元组**：`def (Boolean error, Data, String msg) = Fx.object.xxx(...)`，没有 `.isError()`
- 🔴 **对象引用返回 String**：`as String` 直接，不用 `instanceof Map` / `instanceof String`
- 🔴 **部门层级**：使用 `dept_parent_path` 拆分，禁止递归 `parent_id`
- 🔴 **FQL 默认10行**：必须传 `SelectAttribute.builder().pageSize(500).build()`，用 Consumer 循环分页

---

## 核心规范文件

| 规范文件 | 说明 | 路径 |
|---------|------|------|
| CORE-RULES.md | APL 开发八条铁律 | [CORE-RULES.md](../../specs/apl/CORE-RULES.md) |
| CODE-PATTERNS.md | 常用代码模式 | [CODE-PATTERNS.md](../../specs/apl/CODE-PATTERNS.md) |
| DATA-TYPE-MAPPING.md | 数据类型映射 | [DATA-TYPE-MAPPING.md](../../specs/apl/DATA-TYPE-MAPPING.md) |
| NS-RANGE.md | Namespace 和 Return Type 对照表 | [ns_range.md](../../specs/apl/ns_range.md) |

---

## 文档索引

### 核心 API 快速导航

| API | 功能 | 文档 |
|-----|------|------|
| Fx.object | 对象数据操作 | `<aplApiDocs>ObjectDataAPI.md` |
| Fx.http | HTTP请求 | `<aplApiDocs>HttpAPI.md` |
| Fx.message | 消息通知 | `<aplApiDocs>MessageAPI.md` |
| Fx.log | 日志记录 | `<aplApiDocs>LogAPI.md` |
| Fx.org | 组织架构 | `<aplApiDocs>OrganizationAPI.md` |

### 常用对象导航

| 对象名称 | ApiName | 文档 |
|---------|---------|------|
| 客户 | AccountObj | `<objectsRoot>AccountObj.md` |
| 联系人 | ContactObj | `<objectsRoot>ContactObj.md` |
| 商机 | NewOpportunityObj | `<objectsRoot>NewOpportunityObj.md` |
| 销售线索 | LeadsObj | `<objectsRoot>LeadsObj.md` |
| 产品 | ProductObj | `<objectsRoot>ProductObj.md` |
| 销售订单 | SalesOrderObj | `<objectsRoot>SalesOrderObj.md` |
| 回款 | PaymentObj | `<objectsRoot>PaymentObj.md` |
| 人员 | PersonnelObj | `<objectsRoot>PersonnelObj.md` |
| 部门 | DepartmentObj | `<objectsRoot>DepartmentObj.md` |

完整对象索引：`<objectsRoot>objects.md`

---

## sharedev CLI 参考

| 命令 | 功能 |
|------|------|
| `sharedev apl pull --all` | 拉取全部 APL 函数 |
| `sharedev apl pull <apiName>` | 拉取单个函数 |
| `sharedev apl push <apiName> -m "..."` | 发布函数到远端 |
| `sharedev apl compile <apiName>` | 编译检测 |
| `sharedev apl analyze <apiName>` | 静态分析 |
| `sharedev apl diff <apiName>` | 版本对比 |
| `sharedev apl debug <apiName>` | 调试运行 |
| `sharedev object search <text>` | 搜索对象 |
| `sharedev object info <apiName>` | 查询对象详情 |

### 完整使用流程

**新建 APL 函数/类**：
```bash
# 1. 创建函数（OBJECT 组需 --bind，PLATFORM 组不需要）
sharedev apl create --apiname <Name>__c --function-name <Name> --type function --namespace <ns> --return-type <rt> --bind <Obj> ...

# 2. 编写代码后编译 + 分析
sharedev apl compile <apiName>
sharedev apl analyze <apiName>

# 3. 用户确认后发布
sharedev apl diff <apiName>
sharedev apl push <apiName> -m "commit message"
```

**更新已有 APL 函数/类**：
```bash
# 1. 拉取远端最新代码
sharedev apl pull <apiName>

# 2. 使用 SearchReplace 在原文件上修改代码（不删除、不重建）

# 3. 编译 + 分析
sharedev apl compile <apiName>
sharedev apl analyze <apiName>

# 4. 用户确认后发布
sharedev apl diff <apiName>
sharedev apl push <apiName> -m "commit message"
```

---

## 参考资源

完整版技能引用文档：`../sharedev-apl-implement/references/`

| 参考文件 | 说明 |
|---------|------|
| [development-workflow.md](../sharedev-apl-implement/references/development-workflow.md) | 开发流程详细指导 |
| [code-standards.md](../sharedev-apl-implement/references/code-standards.md) | 代码规范检查清单 |
| [quality-gates.md](../sharedev-apl-implement/references/quality-gates.md) | 质量门控定义 |
| [best-practices.md](../sharedev-apl-implement/references/best-practices.md) | 最佳实践集合 |
| [common-issues.md](../sharedev-apl-implement/references/common-issues.md) | 常见问题和解决方案 |
| [compilation-issues.md](../sharedev-apl-implement/references/compilation-issues.md) | 常见编译问题 |
| [api-index.md](../sharedev-apl-implement/references/api-index.md) | API 完整索引 |

---

## 与完整版对比

| 维度 | sharedev-apl-implement（完整版） | sharedev-apl-implement-lite（简版） |
|------|-------------------------------|----------------------------------|
| 流程阶段数 | 7 phases (-1 到 6) | 5 phases (0 到 4) |
| 刷新 docs/specs | ✅ Phase -1 | ❌ 跳过 |
| PRD 文档生成 | ✅ Phase 0.5 生成 PRD/ARCH/TASKS | ❌ 跳过 |
| 需求文档检查 | ✅ 查找 deliverables/ 目录 | ❌ 跳过 |
| 场景识别 | ✅ Phase 1 | ✅ Phase 0（简化合并） |
| 代码实现 | ✅ Phase 3 | ✅ Phase 1 |
| 编译 + 分析 | ✅ Phase 4（强制） | ✅ Phase 2（强制） |
| 代码审查 | ✅ Phase 5（硬停止） | ✅ Phase 3（硬停止） |
| 发布授权 | ✅ Phase 6（强制授权） | ✅ Phase 4（强制授权） |
| 八条铁律 | ✅ | ✅ |
| 适用场景 | 复杂需求、多文件项目 | 简单函数、快速开发 |
