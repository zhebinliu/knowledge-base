# APL 代码自动修复规则

## 1. 可自动修复的问题

### 1.1 API命名不规范（包含下划线）
**修复规则**：移除API名称中的下划线（保留结尾的 `__c`）
**注意**：此问题需要用户手动重命名文件和API名称，无法自动修复

### 1.2 缺少函数入口日志
**修复规则**：自动添加 `log.info("开始执行...")`

### 1.3 缺少错误日志
**修复规则**：自动添加 `log.error("操作失败: ${errorMessage}")`

### 1.4 命名不规范（下划线转驼峰）
**修复规则**：自动修正变量命名

### 1.5 缺少空值检查
**修复规则**：自动添加 `if (!objectId) { return }`

---

## 2. 自动修复示例

### 示例 0：API命名包含下划线（无法自动修复）

**⚠️ 重要提示**：API名称包含下划线是严重问题，但无法自动修复，需要用户手动处理。

```groovy
// ❌ 错误的API命名
// 文件名：Evt_MatchContactOnAccountCreate__c.function.groovy
// API名称：Evt_MatchContactOnAccountCreate__c

// ✅ 正确的API命名（需要手动修改）
// 文件名：EvtMatchContactOnAccountCreate__c.function.groovy
// API名称：EvtMatchContactOnAccountCreate__c
```

**手动修复步骤**：
1. 重命名文件，移除下划线
2. 修改代码中的API名称声明
3. 更新所有引用该API的地方
4. 重新执行 `sharedev apl compile` 和 `sharedev apl analyze`

### 示例 1：Fx.object 调用缺少错误处理

```groovy
// 修复前
def result = Fx.object.find(...)

// 修复后
def (Boolean error, QueryResult result, String msg) = Fx.object.find(...)
if (error) {
    log.error("查询失败: " + msg)
    return
}
```

### 示例 2：缺少函数入口日志

```groovy
// 修复前
def myFunction(String objectId) {
    def result = Fx.object.find(...)
}

// 修复后
def myFunction(String objectId) {
    log.info("开始执行 myFunction, objectId: " + objectId)
    def result = Fx.object.find(...)
}
```

### 示例 3：缺少空值检查

```groovy
// 修复前
def result = Fx.object.find("Account", objectId)

// 修复后
if (!objectId) {
    log.error("objectId 不能为空")
    return
}
def result = Fx.object.find("Account", objectId)
```

---

## 3. 不可自动修复的问题

### 3.1 API命名包含下划线
**原因**：需要重命名文件和修改多处代码引用
**处理方式**：提示用户手动修复，提供修复步骤

### 3.2 超出平台限制
**原因**：需要重新设计代码架构
**处理方式**：提示用户手动重构

### 3.3 安全漏洞
**原因**：需要人工评估风险
**处理方式**：提示用户手动修复

### 3.4 业务逻辑错误
**原因**：需要人工确认业务需求
**处理方式**：提示用户手动修正
