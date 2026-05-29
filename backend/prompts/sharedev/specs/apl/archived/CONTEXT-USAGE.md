# ⚠️ DEPRECATED (2026-03-10)

此文档已合并到 **CORE-RULES.md** 的第 8 条铁律（Context 使用规范）。

请直接查看 [CORE-RULES.md](./CORE-RULES.md) #_铁律 -context-使用规范 章节！

---
# Context 使用指南 - 纷享销客 APL 函数

> **最后更新**: 2026-03-10  
> **来源**: 纷享销客官方文档 + 蒙牛项目实践

---

## 🎯 核心原则

```groovy
// ✅ 按钮执行动作：用 context.data["_id"]
String customerId = context.data["_id"] as String

// ❌ 不要用 context.recordId（不存在！）
String customerId = context.recordId as String  // ⚠️ 报错！
```

---

## 📊 Context 支持的变量

### 通用变量（所有函数都有）

| 变量 | 类型 | 说明 |
|------|------|------|
| `context.tenantId` | String | 当前租户 ID |
| `context.userId` | String | 当前用户 ID (`-10000` 标识系统身份) |

### 按钮/流程触发才有

| 变量 | 类型 | 说明 | 注意事项 |
|------|------|------|----------|
| `context.data` | Map | **主对象数据** | ⭐ 最重要！异步字段可能不准，建议 FQL 重查 |
| `context.details` | Map | 从对象数据 | ⚠️ Debug 时只加载 6 条，正常时全量；2024.4.1 后流程不支持 |
| `context.arg` | Map | 业务传递参数 | 部分场景透传使用 |

### 批量操作才有

| 变量 | 类型 | 说明 |
|------|------|------|
| `context.dataList` | List | 批量选中的对象数据列表 |
| `context.objectIds` | List | 对象 ID 列表（计划任务专用） |

---

## 🔍 各场景 Context 可用情况

| 场景 | 触发动作 | 可用的 Context | Debug 差异 |
|------|---------|---------------|-----------|
| **自定义业务按钮** | 前验证 | `context.data` | 无差异 |
| **自定义 UI 按钮（单条）** | 执行动作 | `context.data`, `context.details`, `context.arg` | details 只有 6 条 |
| **自定义 UI 按钮（批量）** | 执行动作 | `context.dataList` | 无差异 |
| **新建/编辑保存按钮** | 后动作 | `context.data`, `context.details`, `context.arg` | details 只有 6 条 |
| **作废（前验证）** | 前验证 | `context.data`, `context.arg` | 不支持 details |
| **作废（后动作）** | 后动作 | `context.data`, `context.details`, `context.arg` | details 只有 6 条 |
| **流程** | 函数节点 | `context.data`, `context.details` | ⚠️ 2024.2.24 后不再支持 details |
| **计划任务（绑定对象）** | - | `context.objectIds` | 无差异 |

---

## ⚠️ 重要注意事项

### 1. 字段为空的差异

```groovy
// Web 端：空字符串 ''
value == ""  // true

// 移动端/Server 端：null
value == null  // true

// ✅ 安全做法：双重检查
if (value != null && value != "") {
    // 处理逻辑
}
```

### 2. context.data 的局限性

```groovy
// ❌ 异步字段（统计、计算、引用）可能不准确
String asyncValue = context.data["async_field__c"]  // 可能是旧值

// ✅ 建议：重新查询
def (Boolean error, QueryResult qr, String msg) = Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "async_field__c"])
        .queryTemplate(QueryTemplate.AND([
            ["_id": QueryOperator.EQ(customerId)]
        ]))
        .build(),
    SelectAttribute.builder().build()
)
```

### 3. Debug vs 生产环境

```groovy
// Debug 调试时：context.details 最多 6 条
// 正常运行时：context.details 是全部数据

// ✅ 不要依赖 details 的数据数量！
if (context.details && !context.details.isEmpty()) {
    // 可能有更多数据，需要循环查询而不是直接遍历
}
```

---

## 💡 最佳实践

### ✅ 推荐写法

```groovy
// Step 1: 获取主对象 ID
String recordId = context.data["_id"] as String

// Step 2: 如果需要同步数据，建议重新查询
def (Boolean error, QueryResult qr, String msg) = Fx.object.findById(
    "AccountObj", 
    recordId,
    FQLAttribute.builder().build(),
    SelectAttribute.builder().build()
)

Map accountData = qr?.dataList?.size() == 1 ? qr.dataList[0] : [:]
String name = accountData["name"] as String
```

### ❌ 避免写法

```groovy
// ❌ 假设 context.data 里的数据是最新的
String phone = context.data["mobile_phone"]  // 可能是缓存值

// ❌ 依赖 context.details 的数据量
assert context.details.size() > 10  // Debug 时可能失败

// ❌ 不判空直接使用
String value = context.data["some_field"]  // 可能 null/''
```
