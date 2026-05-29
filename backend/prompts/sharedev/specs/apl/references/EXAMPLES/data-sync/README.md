# 数据同步场景

**触发时机**: 通常是计划任务定时执行，或者工作流审批后触发

**核心模式**: 查询源对象 → 关联目标对象 → 批量更新

---

## 📋 典型场景

### 场景 1: 门店大区和归属部门同步
- **需求**: "根据销售商客户的归属部门，自动填充门店的大区字段"
- **参考**: `Pln_StoreAreaDepartmentSync.groovy`
- **关键步骤**:
  1. 查询门店 (`record_type='default__c'`)
  2. 获取销售商 ID (`sellers__c`)
  3. 查销售商的归属部门
  4. 通过 `dept_parent_path` 解析层级
  5. 计算大区值 (第 3 级部门)
  6. 批量更新门店数据

### 场景 2: 批量更新客户归属部门
- **需求**: "从自定义对象读取配置，批量更新客户的大区和归属部门"
- **参考**: `Pln_BatchUpdateCustomerDepartmentSync.groovy`
- **核心技巧**:
  - `select + Consumer` 分批处理
  - `batchUpdate` 会触发工作流
  - 构建映射表 `{ customerId: updateData }`

---

## ⚠️ 关键要点

### 1. 部门层级判断（高频场景）

```groovy
// ✅ 正确：用 dept_parent_path 分割
String deptPath = deptInfo["dept_parent_path"]  // "999999.1036.2597.2612"
List pathList = deptPath.split("[./]") as List   // [999999, 1036, 2597, 2612]
int deptLevel = pathList.size()                    // 4 级部门

// 获取第 N 级部门 ID（索引从 0 开始）
String level3DeptId = pathList.get(2)  // 第 3 级部门 ← 注意索引！
```

**❌ 绝对禁止**: 递归遍历 `parent_id` 找层级（会 API 超时）

---

### 2. 大数据量处理

```groovy
// ✅ pageSize 必须设置（默认只返回 10 条！）
Fx.object.select(sql, 
    SelectAttribute.builder().pageSize(500).build(),
    { result ->
        List dataList = result.result as List
        // 处理 dataList...
    }).result()
```

**分页逻辑**:
```groovy
def pageSize = 2000
def pageToken = ''
while (true) {
    // 构建带 pageToken 的 SelectAttribute
    // ...
    if (accountList.size() < pageSize) break
}
```

---

### 3. 批量更新最佳实践

```groovy
// 构建映射表
Map batchUpdateMap = [:]
dataList.each { item ->
    String id = item["_id"]
    Map updateData = [:]
    
    // 只添加非空字段
    if (region) {
        updateData.put("sales_area__c", region)
    }
    if (department) {
        updateData.put("data_own_department", [department]) // List 类型
    }
    
    if (!updateData.isEmpty()) {
        batchUpdateMap.put(id, updateData)
    }
}

// 执行批量更新（会触发工作流）
Fx.object.batchUpdate("AccountObj", batchUpdateMap, ["sales_area__c", "data_own_department"])
```

---

## 🔍 相关文档

- [QUICK-START.md](../../QUICK-START.md) Step 3 - 大数据量处理
- [CORE-RULES.md](../CORE-RULES.md) 铁律 3 - 部门层级判断
- [CODE-PATTERNS.md](../CODE-PATTERNS.md) Pattern 4 - SQL + Consumer
