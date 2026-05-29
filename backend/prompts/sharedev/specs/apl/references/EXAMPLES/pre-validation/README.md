# 前验证函数场景

**触发时机**: 新建/编辑记录时，在数据保存之前执行

**文件命名**: `Vld_对象名_功能描述.groovy`

---

## 📋 典型场景

### 场景 1: 设置默认值
- **需求**: "客户新建时，负责人默认设为系统"
- **参考**: `Vld_AccountCreate_SetOwnerToSystem.groovy`
- **核心代码**:
```groovy
Map dataMap = context.data as Map
dataMap.put("owner", "-10000") // 系统用户 ID
return ["error": false, "errorMessage": "成功"]
```

### 场景 2: 字段联动更新
- **需求**: "选择业务类型后，自动填充大区字段"
- **参考**: `Vld_AccountCreateAndUpdate_SyncArea.groovy` (2026-03-18 新建)
- **核心逻辑**:
  1. 跳过门店业务类型
  2. 获取归属部门
  3. 通过 `dept_parent_path` 解析层级
  4. 计算第 3 级部门作为大区
  5. 写入 `sales_area__c` 字段

### 场景 3: 数据校验
- **需求**: "提交前检查必填字段、数据格式、业务规则"
- **返回失败**:
```groovy
return ["error": true, "errorMessage": "客户编码不能为空"]
```

---

## ⚠️ 关键要点

1. **Context 取值**: `context.data` 是单条记录的 Map
2. **修改方式**: 直接调用 `dataMap.put()` 修改要保存的数据
3. **返回值格式**:
   - 成功：`["error": false, "errorMessage": "成功"]`
   - 失败：`["error": true, "errorMessage": "错误信息"]`
4. **禁止操作**: 不要在这里查询其他数据（性能问题）

---

## 🔍 相关文档

- [QUICK-START.md](../../QUICK-START.md) Step 4 - Context 使用规范
- [CORE-RULES.md](../CORE-RULES.md) 铁律 8 - Context 正确取值
