# APL 属性类完整参考

> **最后更新**: 2026-03-09  
> **来源**: [ObjectDataAPI.md](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md)

---

## 📋 FQLAttribute

**包**: `com.fxiaoke.functions.model.FQLAttribute`

**作用**: 定义 FQL 查询的核心参数（字段选择、WHERE 条件、排序等）

### 完整参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `queryTemplate` | QueryTemplate | - | WHERE 查询条件 |
| `columns` | List&lt;String&gt; | - | SELECT 字段列表 |
| `limit` | Integer | 10 | LIMIT 查询数量，上限 100 |
| `orderBy` | Map | - | ORDER BY 排序，如 `["_id": 1]` (1=升序，-1=降序) |
| `skip` | Integer | 0 | SKIP 翻页条目数 |

### 常用示例

```groovy
// 基础查询
FQLAttribute fql = FQLAttribute.builder()
    .columns(["_id", "name", "status__c"])
    .queryTemplate(QueryTemplate.AND([["status__c": QueryOperator.EQ("active")]]))
    .build()

// 带分页和排序
FQLAttribute fql = FQLAttribute.builder()
    .columns(["_id", "name", "create_time__c"])
    .queryTemplate(QueryTemplate.AND([["status__c": QueryOperator.EQ("active")]]))
    .limit(50)
    .skip(100)  // 跳过前 100 条
    .orderBy(["create_time__c": -1])  // 按创建时间降序
    .build()

// OR 条件（使用 IN）
List ids = ["xn_xxx1", "xn_xxx2", "xn_xxx3"]
FQLAttribute fql = FQLAttribute.builder()
    .columns(["_id", "name"])
    .queryTemplate(QueryTemplate.AND([
        "_id": QueryOperator.IN(ids),
        "status__c": QueryOperator.EQ("active")
    ]))
    .build()
```

---

## 📋 UpdateAttribute

**包**: `com.fxiaoke.functions.tools.UpdateAttribute`

**作用**: 控制更新操作的行为

### 完整参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isAllUpdate` | boolean | false | 是否更新所有数据<br>• false: 最多只更新 1000 条<br>• true: 不做数量限制 |
| `triggerWorkflow` | boolean | true | 是否触发工作流（不支持审批流） |
| `duplicateSearch` | boolean | true | 是否查重 |
| `modifiedBySelf` | boolean | false | 是否指定当前用户为修改人<br>• false: 系统更新<br>• true: 当前用户更新（可能因权限不足失败） |
| `skipImmutableFieldValidate` | boolean | false | 是否跳过不可变字段验证（同步场景使用） |
| `applyDataPrivilegeCheck` | boolean | false | 是否校验数据权限 |

### 常用示例

```groovy
// ✅ 常规更新
UpdateAttribute attr = UpdateAttribute.builder().build()

// ⚙️ 批量更新超过 1000 条
UpdateAttribute attr = UpdateAttribute.builder()
    .isAllUpdate(true)  // 不限制更新数量
    .build()

// 🔄 不触发工作流
UpdateAttribute attr = UpdateAttribute.builder()
    .triggerWorkflow(false)
    .build()

// 👤 以当前用户身份更新
UpdateAttribute attr = UpdateAttribute.builder()
    .modifiedBySelf(true)  // 更新人为当前用户
    .build()

// 🛠️ 数据同步时跳过不可变字段
UpdateAttribute attr = UpdateAttribute.builder()
    .skipImmutableFieldValidate(true)
    .build()
```

---

## 📋 CreateAttribute

**包**: `com.fxiaoke.functions.tools.CreateAttribute`

**作用**: 控制创建操作的行为（⚠️ batchCreate 必需参数）

### 完整参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `calculateDefaultValue` | boolean | false | 是否计算默认值 |
| `fillOutOwner` | boolean | false | 是否填充外部负责人（业务逻辑接口使用） |
| `designatedCreatedBy` | boolean | false | 是否指定创建人（在 objectData 中用 key: `created_by` 传入人员 ID 列表） |
| `specifyTime` | boolean | false | 指定创建时间（一般使用当前时间） |
| `skipAfterFunction` | boolean | false | 是否跳过后动作函数（业务逻辑接口使用） |
| `triggerWorkflow` | boolean | true | 是否触发工作流 |
| `duplicateSearch` | boolean | true | 是否查重（元数据接口不使用） |
| `enableRealTimeCalculateDataAuth` | boolean | false | 是否实时计算数据权限 |
| `skipFunctionAction` | boolean | false | 是否跳过前验证函数 |
| `forceQueryFromDB` | boolean | false | 是否强制从数据库查询（兼容老接口） |
| `triggerApprovalFlow` | boolean | true | 是否触发审批流 |

### 常用示例

```groovy
// ✅ batchCreate 必需（至少传 builder().build()）
def (Boolean error, List<Map> result, String msg) = Fx.object.batchCreate(
    "ObjectApiName",
    dataList,
    CreateAttribute.builder().build()  // ⭐ 不能省略
)

// 🎯 跳过前验证和后动作
CreateAttribute attr = CreateAttribute.builder()
    .skipFunctionAction(true)   // 跳过前验证
    .skipAfterFunction(true)    // 跳过后动作
    .build()

// 👤 指定创建人
Map dataWithCreator = [
    "name": "新记录",
    "created_by": ["1000"]  // 指定创建人 ID
]
CreateAttribute attr = CreateAttribute.builder()
    .designatedCreatedBy(true)  // 启用指定创建人
    .build()

// 🚫 不触发工作流和审批
CreateAttribute attr = CreateAttribute.builder()
    .triggerWorkflow(false)
    .triggerApprovalFlow(false)
    .build()
```

---

## 📋 BatchUpdateAttribute

**包**: `com.fxiaoke.functions.tools.BatchUpdateAttribute`

**作用**: 控制批量更新的行为（可选参数）

### 推测参数（基于 UpdateAttribute）

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isAllUpdate` | boolean | false | 是否更新所有数据 |
| `triggerWorkflow` | boolean | true | 是否触发工作流 |
| `duplicateSearch` | boolean | true | 是否查重 |

### 常用示例

```groovy
// ✅ 不传也可以（使用默认配置）
Fx.object.batchUpdate(apiName, updateMap, fields)

// ⚙️ 或明确传递
Fx.object.batchUpdate(
    apiName, 
    updateMap, 
    fields,
    BatchUpdateAttribute.builder().build()
)

// 🔄 不触发工作流
Fx.object.batchUpdate(
    apiName,
    updateMap,
    fields,
    BatchUpdateAttribute.builder()
        .triggerWorkflow(false)
        .build()
)
```

---

## 📋 OptionAttribute

**包**: `com.fxiaoke.functions.model.OptionAttribute`

**作用**: 获取选项字段的属性配置

### 完整参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiName` | String | - | 对象 apiName |
| `optionValue` | String | - | 父单选选项值 |
| `fieldApiName` | String | - | 父单选字段 apiName |

### 常用示例

```groovy
OptionAttribute optionAttr = OptionAttribute.builder()
    .apiName("ObjectApiName")
    .fieldApiName("field_option__c")
    .optionValue("option_value_1")  // 可选：指定父选项
    .build()
```

---

## 📋 SelectAttribute

**包**: `com.fxiaoke.functions.model.SelectAttribute`

**作用**: 控制查询行为（分页、作废数据、缓存等）

**👉 详细文档**: [SelectAttribute API 完整参考](./select-attribute-api.md)

### 核心参数速查

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `needInvalid` | false | 是否返回已作废的数据 |
| `dbSource` / `forceQueryFromDB` | false | 是否强制从 DB 查询（绕过缓存） |
| `paginationOptimization` | false | 是否执行分页优化 |
| `needCount` | false | 是否返回总数 |
| `fillExtendInfo` | false | 是否自动填充 __r 扩展字段 |
| `convertQuoteForView` | false | 引用字段返回 label 而非 value |
| `needOptionLabel` | false | 返回选项名称到 {字段}__r |

---

## 🔗 快速对照表

| 属性类 | 使用场景 | 是否必需 | 常用配置 |
|--------|---------|---------|---------|
| **FQLAttribute** | find, findOne, findById | ⭐ 是 | columns + queryTemplate |
| **SelectAttribute** | select, find 系列 | ⭐ 是 | needInvalid(false) |
| **CreateAttribute** | create, batchCreate | ⭐ 是 | builder().build() |
| **UpdateAttribute** | update | ⭐ 是 | triggerWorkflow(false) 可选 |
| **BatchUpdateAttribute** | batchUpdate | 否 | 默认配置即可 |
| **OptionAttribute** | getOptionInfo | 否 | apiName + fieldApiName |

---

## ⚠️ 常见错误

### 错误 1: batchCreate 忘记传 CreateAttribute

```groovy
// ❌ 错误：Missing parameter
Fx.object.batchCreate(obj, dataList)

// ✅ 正确
Fx.object.batchCreate(obj, dataList, CreateAttribute.builder().build())
```

### 错误 2: UpdateAttribute 的 isAllUpdate 误用

```groovy
// ⚠️ 警告：默认只能更新 1000 条
UpdateAttribute.builder().build()

// ✅ 如果要更新超过 1000 条
UpdateAttribute.builder().isAllUpdate(true).build()
```

### 错误 3: FQLAttribute 缺少必要参数

```groovy
// ❌ 错误：至少要有 columns
FQLAttribute.builder().build()

// ✅ 正确
FQLAttribute.builder()
    .columns(["_id", "name"])
    .build()
```

---

**维护者**: 杨亚兴  
**上次更新**: 2026-03-09
