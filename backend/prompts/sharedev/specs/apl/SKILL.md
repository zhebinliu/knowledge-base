---
name: apl-specs
description: >
  纷享销客 APL/Groovy 函数自动生成工具。当用户需要：
  (1) 根据需求文档编写 APL 函数代码
  (2) 生成纷享销客的 Groovy 代码  
  (3) 创建按钮触发/工作流/计划任务/UI 事件/导入验证
  (4) 实现客户、订单、商品等对象的数据查询和更新
  (5) 批量导入数据、同步多维表格、跨对象关联处理
  (6) 部门层级判断、大区自动填充等业务逻辑时使用
  
  不用于：简单的代码修改 (直接使用 edit)、阅读现有代码 (使用 read)。
metadata:
  tags: [backend, tool]
  author: "杨亚兴"
  version: "2.0.0"
---

# APL Specs - 纷享销客 APL 开发助手

**维护者**: 杨亚兴 + Claw  
**最后更新**: 2026-03-18  
**版本**: v2.0 (重构版：场景驱动 + 强制规范)

---

## ⚡ 快速导航（给人看的精简版）

| 文档 | 何时用 |
|------|--------|
| **[QUICK-START.md](./QUICK-START.md)** ⭐ | **写新函数前必看** - 5 步法标准流程 |
| **[CORE-RULES.md](./references/CORE-RULES.md)** 🔴 | **八条铁律 + 禁止清单** - 违反必错！ |

### 参考手册（按需查阅）

| 文档 | 用途 |
|------|------|
| [DATA-TYPE-MAPPING.md](./references/DATA-TYPE-MAPPING.md) | 字段类型转换表 |
| [CODE-PATTERNS.md](./references/CODE-PATTERNS.md) | 常用代码模板 |
| [API-SIGNATURES.md](./references/API-SIGNATURES.md) | Fx.object API 签名 |

### AI 内部工作流

| 文档 | 说明 |
|------|------|
| [AI-RULES.md](./AI-RULES.md) | 🤖 AI 处理任务的强制流程（**每次必须遵守**） |

**对象信息**: `.sharedev/object/` - 对象字段信息文件（每个对象一个 .md 文件，objects.md 为索引）

---

## 🎯 典型使用场景

### 场景一：前验证函数（新建/编辑时自动处理）

**用户需求**：
> "客户新建时，负责人默认设为系统用户"

**你会得到**：
```groovy
// ✅ 正确写法（按钮/前验证场景）
Map dataMap = context.data as Map
dataMap.put("owner", "-10000") // 系统用户 ID
return ["error": false, "errorMessage": "成功"]
```

**相关技能文件**: `Vld_AccountCreate_SetOwnerToSystem.groovy`

---

### 场景二：部门层级判断（最常见业务逻辑）

**用户需求**：
> "归属部门大于三级时，把第 3 级作为大区字段值"

**你会得到**：
```groovy
// ✅ 标准做法：用 dept_parent_path 解析层级
String deptPath = deptInfo["dept_parent_path"]  // 例如："999999.1036.2597.2612"
List pathList = deptPath.split("[./]") as List   // [999999, 1036, 2597, 2612]
int deptLevel = pathList.size()                   // 4 级部门

if (deptLevel > 3) {
    String areaDeptId = pathList.get(2)  // 索引 2 = 第 3 级部门
    dataMap.put("sales_area__c", areaDeptId)
}
```

**⚠️ 绝对禁止递归遍历 parent_id！**

**相关技能文件**: `Pln_StoreAreaDepartmentSync.groovy`, `Controller_GetRegionalManager.groovy`

---

### 场景三：大数据量批量处理

**用户需求**：
> "把所有客户的某个字段更新一下，大概有 5000 条"

**你会得到**：
```groovy
// ✅ 正确做法：select + Consumer 分批处理
def pageSize = 500

Fx.object.select(sql, selectAttr, { result ->
    List dataList = result.result as List
    
    Map batchUpdateMap = [:]
    dataList.each { item ->
        String id = item["_id"]
        Map updateData = [:]
        updateData.put("some_field__c", newValue)
        batchUpdateMap.put(id, updateData)
    }
    
    // 批量更新
    Fx.object.batchUpdate("AccountObj", batchUpdateMap, ["some_field__c"])
}).result()
```

**关键参数**：必须设置 `pageSize`，默认只返回 10 条！

---

### 场景四：对象关联查询

**用户需求**：
> "通过客户编码查找到客户 ID，然后再去更新其他字段"

**你会得到**：
```groovy
// ✅ 标准查询流程
String customerCode = "CUST2024001"
String sql = "SELECT _id FROM AccountObj WHERE account_no__c = '" + customerCode + "'"

def (Boolean error, QueryResult qr, String msg) = 
    Fx.object.select(sql, SelectAttribute.builder().pageSize(1).build(), null)

if (!error && qr["dataList"] != null && !qr["dataList"].isEmpty()) {
    String customerId = qr["dataList"][0]["_id"]
    // 使用 customerId 继续操作...
}
```

**三元组解构**：`(Boolean error, QueryResult/Data, String msg)` - 不要用 `.isError()`！

---

## 🛡️ 强制性规则（不可违背！）

### 🔴 禁止行为清单

**发现以下情况立即停止，向用户确认：**

- [ ] ❌ 没有数据字典就凭感觉写对象 API Name
- [ ] ❌ 不知道 record_type/选项字段的 option value
- [ ] ❌ 部门层级递归遍历父级（应该用 dept_parent_path）
- [ ] ❌ FQL 查询没设 limit/pageSize（默认 10 条会出问题！）
- [ ] ❌ 误以为有 `class extends` 这种语法（Groovy 不是这样写的）
- [ ] ❌ 直接用 `context.recordId`（不存在这个属性！）

### 🚫 已知的常见错法（真实踩坑记录）

```groovy
// ❌ 错误 1: Context 取值方式不对
String id = context.recordId           // 不存在！→ 应该是 context.data["_id"]

// ❌ 错误 2: API 返回值搞错
if (result.isError()) { ... }          // 没有这个方法！→ 应该用三元组解构

// ❌ 错误 3: 对象名猜错了
Fx.object.findOne("OrderObj", ...)     // 实际是 SalesOrderObj → 必须查数据字典！
Fx.object.findOne("CustomerObj", ...)  // 实际是 AccountObj  → 必须查数据字典！

// ❌ 错误 4: 部门层级递归死循环
while (parent != null) { level++; ... }  // 查几十次 API！→ 应该用 dept_parent_path 分割

// ❌ 错误 5: 忘记设 pageSize
Fx.object.select(sql, null, consumer)  // 默认只返回 10 条！→ 必须建 SelectAttribute

// ❌ 错误 6: object_reference 用 instanceof
if (objRef instanceof String) { ... }  // 静态类型检查失败！→ 直接 as String
```

---

## 📝 标准开发流程（五步法）

### Step 1️⃣: 检查是否已有实现
```bash
ls ./examples/ | grep -i "关键词"
grep -r "sellers__c\|data_own_department" ./examples/
```
**目的**：避免重复造轮子！

---

### Step 2️⃣: 查看对象信息文件确认字段信息

**查看方式**：
- 查看对象索引文件：`.sharedev/object/objects.md` 获取所有可用对象列表
- 查看具体对象文件：`.sharedev/object/{对象ApiName}.md` 获取该对象的所有字段信息

**示例**：
- 查看客户对象：`.sharedev/object/AccountObj.md`
- 查看销售订单对象：`.sharedev/object/SalesOrderObj.md`

**提取内容**：
- 对象 apiName
- 字段 apiName
- 字段类型
- 选项值（如果是 select_one/select_many）

**记住**：**写代码前必须先查对象信息！不要猜！不能臆造！** —— 2026-03-17 血的教训

---

### Step 3️⃣: 确定查询方式（根据数据量）

| 数据规模 | 方法 | 必要参数 |
|---------|------|---------|
| < 1,000 条 | findByIds / findOne | - |
| 1,000 - 10,000 条 | select + Consumer | pageSize(500) |
| > 10,000 条 | VIP 异步队列 | - |

---

### Step 4️⃣: 套用 Pattern
根据场景选择对应模板：
- 前验证函数 → Vld_* 开头的参考文件
- 计划任务 → Pln_* 或 PlnTask_* 开头的参考文件
- 工作流 → Proc_* 开头的参考文件
- 部门层级 → 看 `Pln_StoreAreaDepartmentSync.groovy`

---

### Step 5️⃣: 输出代码 + 记录学习
生成的代码必须包含：
- 顶部注释块（codeName、description、createTime）
- Step 编号注释
- 详细 log.info 日志

学到的东西记录到：`./memory/YYYY-MM-DD.md`

---

## 📚 更多资源

- **项目代码库**: `./examples/`
- **真实项目参考**: `./examples/`
- **纷享官方文档**: [ObjectDataAPI.md](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md)

**🎯 目标**：让每个人都能写出规范、高效、可维护的 APL 函数代码！  
**💪 口号**：遵守铁律，远离踩坑！

---

## ⚡ 快速开始

```bash
# Step 1: 读 QUICK-START.md 了解标准流程
# Step 2: 牢记 CORE-RULES.md 中的八条铁律（含 Context 使用规范）
# Step 3: 查看对象信息文件确认字段类型
# Step 4: 套用 CODE-PATTERNS.md 中的模板
# Step 5: 学完记得更新 MEMORY.md!
```

---

## 🧠 记忆机制

每次学到的知识点或经验教训，必须记录到:

- `./memory/YYYY-MM-DD.md` (每日记忆)
- `./memory/MEMORY.md` (长期记忆，定期精简)
