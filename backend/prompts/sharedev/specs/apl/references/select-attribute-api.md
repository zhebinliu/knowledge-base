# SelectAttribute API 完整参考

> **最后更新**: 2026-03-09  
> **官方文档**: [ObjectDataAPI.md - SelectAttribute](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md)  
> **数据源**: com.fxiaoke.functions.model.SelectAttribute

---

## 📋 完整参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `needRelevantTeam` | Boolean | false | 是否需要相关团队 |
| `needQuote` | Boolean | true | 是否实时计算引用字段 |
| `paginationOptimization` | Boolean | false | 是否执行分页优化（大量数据分页时设为 true） |
| `fillExtendInfo` | Boolean | false | 是否需要自动填充 __r 字段（如人员信息） |
| `needCount` | Boolean | false | 是否返回匹配条件的数量总数 |
| `validateFilterField` | Boolean | 版本依赖 | 是否校验筛选字段<br>• 7.6 日前：默认为 false<br>• 7.6 日后：默认为 true |
| `calculateCount` | Boolean | true | 是否实时计算统计字段 |
| `searchRichTextExtra` | Boolean | false | 是否返回完整的富文本/协同富文本/长文本 |
| `filterByDataRight` | Boolean | false | 是否根据数据权限过滤数据 |
| `needCalculate` | Boolean | true | 查询时是否执行计算字段 |
| `needInvalid` | Boolean | **false** | 是否返回已作废的数据 |
| `convertQuoteForView` | Boolean | false | 是否以页面展示的格式返回引用字段（见下方说明） |
| `needOptionLabel` | Boolean | false | 是否返回选项名称（单选多选 label 放到 {字段 apiName}__r 中） |
| `dbSource` | Boolean | false | ⭐ 是否强制从数据库中查询（绕过缓存） |

---

## 🔥 重点参数详解

### needInvalid(boolean)

**作用**: 是否返回已作废的数据

**默认值**: `false` (不返回作废数据)

**示例**:
```groovy
// ✅ 只查有效数据（推荐）
SelectAttribute.builder()
    .needInvalid(false)
    .build()

// 🔄 包含作废数据
SelectAttribute.builder()
    .needInvalid(true)
    .build()
```

---

### dbSource / forceQueryFromDB(boolean)

**作用**: 是否强制从数据库直接查询（绕过缓存）

**默认值**: `false` (使用缓存)

**适用场景**: 
- 需要同步最新数据
- 刚创建/更新的数据需要立即查询

**示例**:
```groovy
// ⚡ 实时同步场景
SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)  // 或 .forceQueryFromDB(true)
    .build()
```

---

### convertQuoteForView(boolean)

**作用**: 改变引用字段的返回格式

**默认值**: `false` - 返回 value

**设为 true 后**:
- 返回 label（人类可读的名称）
- 原始 value 通过 `{字段 apiName}__v` 返回
- 其他选项通过 `{字段 apiName}__o` 返回

**示例**:
```groovy
// ❌ 默认模式：value = "xn_xxxxxxxxxxxxx"
SelectAttribute.builder().build()

// ✅ 视图模式：label = "张三", store_name__c__v = "xn_xxxxxxxxxxxxx"
SelectAttribute.builder()
    .convertQuoteForView(true)
    .build()
```

---

### needOptionLabel(boolean)

**作用**: 返回单选/多选的选项名称（label）

**默认值**: `false`

**存储位置**: `{字段 apiName}__r`

**示例**:
```groovy
// ✅ 同时返回 value 和 label
SelectAttribute.builder()
    .needOptionLabel(true)
    .build()

// 结果:
// status__c: "active"          // value
// status__c__r: "激活"         // label
```

---

### paginationOptimization(boolean)

**作用**: 优化大量数据的分页性能

**默认值**: `false`

**适用场景**: 大数据量分页查询

**示例**:
```groovy
// 📊 大数据量分页
SelectAttribute.builder()
    .paginationOptimization(true)
    .build()
```

---

### fillExtendInfo(boolean)

**作用**: 自动填充 `__r` 扩展字段（如人员详细信息）

**默认值**: `false`

**示例**:
```groovy
// 👤 需要人员详细信息
SelectAttribute.builder()
    .fillExtendInfo(true)
    .build()
```

---

## 💡 常见配置组合

### 1️⃣ 常规查询（最常用）

```groovy
SelectAttribute attr = SelectAttribute.builder()
    .needInvalid(false)  // 不含作废数据
    .build()
```

### 2️⃣ 实时同步（最新数据）

```groovy
SelectAttribute attr = SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)  // 直连 DB
    .build()
```

### 3️⃣ 大数据量分页

```groovy
SelectAttribute attr = SelectAttribute.builder()
    .needInvalid(false)
    .paginationOptimization(true)  // 开启分页优化
    .needCount(true)  // 返回总数
    .build()
```

### 4️⃣ 需要完整信息的查询

```groovy
SelectAttribute attr = SelectAttribute.builder()
    .needInvalid(false)
    .fillExtendInfo(true)  // 填充人员详情
    .needOptionLabel(true)  // 返回选项 label
    .convertQuoteForView(true)  // 引用字段转 label
    .searchRichTextExtra(true)  // 返回完整富文本
    .build()
```

### 5️⃣ 带数据权限过滤

```groovy
SelectAttribute attr = SelectAttribute.builder()
    .needInvalid(false)
    .filterByDataRight(true)  // 按当前用户数据权限过滤
    .build()
```

---

## 📝 实际项目中的典型用法

### apply_detail_plan_GDnNe.groovy

```groovy
SelectAttribute selectAttribute = SelectAttribute.builder()
    .needInvalid(false)
    .build()

Fx.object.select(sql, selectAttribute, consumer)
```

### Proc_DAEHW.groovy

```groovy
SelectAttribute selectAttribute = SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)  // 强制从 DB 查询
    .build()

Fx.object.select(ydxymxSql, selectAttribute, consumer)
```

### ActivityRequestDetailsTrigger.groovy

```groovy
SelectAttribute selectAttribute = SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)
    .build()
```

---

## ⚠️ 注意事项

### 1. validateFilterField 的版本差异

```groovy
// 7.6 日前版本
SelectAttribute.builder().validateFilterField(false).build()  // 不校验（默认）

// 7.6 日后版本
SelectAttribute.builder().build()  // validateFilterField=true 是默认值
```

### 2. convertQuoteForView 的返回值变化

```groovy
// ❌ convertQuoteForView = false (默认)
record['store_name__c'] = "xn_xxxxxxxxxxxxx"  // 只有 ID

// ✅ convertQuoteForView = true
record['store_name__c'] = "北京门店 A"        // label
record['store_name__c__v'] = "xn_xxxxxxxxxxxxx"  // value
record['store_name__c__o'] = [...]             // 所有选项
```

### 3. dbSource 的性能影响

```groovy
// ✅ 高性能：使用缓存
SelectAttribute.builder().build()

// ⚠️ 低性能但数据新：直连 DB
SelectAttribute.builder().dbSource(true).build()
```

---

## 🔗 相关类

- [FQLAttribute](./fql-best-practices.md) - 查询属性
- [QueryTemplate](./fql-best-practices.md) - 查询条件模板
- [UpdateAttribute](#updateattribute) - 更新属性
- [CreateAttribute](#createattribute) - 创建属性

---

**维护者**: 杨亚兴  
**上次更新**: 2026-03-09
