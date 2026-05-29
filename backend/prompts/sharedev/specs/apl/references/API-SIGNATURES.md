# Fx.object API 最新语法 (2026 年版本)

> **最后更新**: 2026-03-09  
> **数据来源**: 
> - 蒙牛实际项目代码 `./examples/.../functions/`
> - 官方函数 API 导出文档（422 个 API）

---

## ⚠️ 重要规则

### 1. 返回值类型必须明确声明

```groovy
// ❌ 错误：def 会导致静态类型检查失败
def result = Fx.object.find(...)

// ✅ 正确：明确返回类型
def (Boolean error, QueryResult result, String message) = Fx.object.find(...)
```

### 2. QueryResult vs Map

```groovy
// find/select返回QueryResult对象，不是Map！
def (Boolean error, QueryResult qr, String msg) = Fx.object.find(...)
List dataList = qr["dataList"] as List  // ✅ 从QueryResult取dataList

// findOne/findById返回Map
def (Boolean error, Map data, String msg) = Fx.object.findOne(...)
String name = data["name"] as String
```

### 3. 参数数量已变更（2026 版）

```groovy
// batchCreate: 现在需要 3 个参数（第 3 个是 CreateAttribute）
Fx.object.batchCreate(apiName, dataList, CreateAttribute.builder().build())

// batchUpdate: 现在需要 4 个参数（第 4 个是 BatchUpdateAttribute，可选）
Fx.object.batchUpdate(apiName, updateMap, fields, BatchUpdateAttribute.builder().build())
```

---

## 🔴 查询方法

### findById

**签名**: `findById(String apiName, String id, FQLAttribute fqlAttribute, SelectAttribute selectAttribute)`

**返回值**: `def (Boolean error, Map data, String message)`

```groovy
def (Boolean error, Map data, String message) = Fx.object.findById(
    "AccountObj",
    "6177cde7a0cb410001930ad0",
    FQLAttribute.builder()
        .columns(["_id", "name"])
        .build(),
    SelectAttribute.builder().build()
)

if (!error && data) {
    log.info("查询到：" + data.name)
}
```

---

### findByIds

**签名**: `findByIds(String apiName, List ids, FQLAttribute fqlAttribute, SelectAttribute selectAttribute)`

**返回值**: `def (Boolean error, List data, String message)`

```groovy
def (Boolean error, List data, String message) = Fx.object.findByIds(
    "AccountObj",
    ["xn_xxx1", "xn_xxx2", "xn_xxx3"],
    FQLAttribute.builder()
        .columns(["_id", "name", "status__c"])
        .build(),
    SelectAttribute.builder().build()
)

if (!error && data) {
    data.each { item ->
        Map record = item as Map
        log.info(record._id + ": " + record.name)
    }
}
```

---

### find

**签名**: `find(String apiName, FQLAttribute fqlAttribute, SelectAttribute selectAttribute)`

**返回值**: `def (Boolean error, QueryResult result, String message)` ⚠️ 注意是 QueryResult!

```groovy
def (Boolean error, QueryResult queryResult, String message) = Fx.object.find(
    "ObjectApiName",
    FQLAttribute.builder()
        .columns(["_id", "field_name__c", "status__c"])
        .queryTemplate(QueryTemplate.AND([
            "_id": QueryOperator.EQ("xn_xxxxxxxxxxxxx")
        ]))
        .build(),
    SelectAttribute.builder().build()
)

if (!error && queryResult) {
    // ⚠️ 从 QueryResult 访问 dataList，不是直接从返回结果访问
    List dataList = queryResult["dataList"] as List
    Integer totalCount = queryResult["totalCount"] as Integer
    
    log.info("查询到 ${totalCount} 条记录")
}
```

---

### findOne

**签名**: `findOne(String apiName, FQLAttribute fqlAttribute, SelectAttribute selectAttribute)`

**返回值**: `def (Boolean error, Map data, String message)`

```groovy
def (Boolean error, Map data, String message) = Fx.object.findOne(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])
        .queryTemplate(QueryTemplate.AND([
            "_id": QueryOperator.NE("6177cde7a0cb410001930ad0")
        ]))
        .build(),
    SelectAttribute.builder().build()
)

if (!error && data) {
    log.info("单条查询结果：" + data.name)
}
```

---

### select

**签名**: `select(String sql, SelectAttribute selectAttribute, Consumer<List> consumer)`

**三种调用方式**:

**方式一：三元组返回（可获取总数）**
```groovy
def (Boolean error, QueryResult result, String message) = Fx.object.select(
    "SELECT _id, name FROM object__c WHERE status__c = 'active'",
    SelectAttribute.builder().build(),
    null  // 不传 consumer
)

if (!error && result) {
    Integer totalNum = result["totalNum"] as Integer
    List dataList = result["dataList"] as List
    log.info("总数：${totalNum}, 当前页：${dataList.size()}")
}
```

**方式二：Consumer 分页（大数据量推荐，每批默认 20 条）**
```groovy
Consumer<List> consumer = { List batch ->
    log.info("处理批次：${batch.size()} 条")
    batch.each { record ->
        Map r = record as Map
        log.info("处理：" + r.name)
    }
}

Fx.object.select(
    "SELECT _id, name, field_a__c FROM large_object__c",
    SelectAttribute.builder().needInvalid(false).build(),
    consumer
)
```

**方式三：链式调用（不推荐，无错误检查）**
```groovy
// ⚠️ 这种方式没有错误处理，生产环境不建议使用
QueryResult result = Fx.object.select(sql).result() as QueryResult
```

**实际项目示例**（PlnTask_b8YbF.groovy）:
```groovy
def (boolean error, QueryResult dataResult, String errorMsg) = Fx.object.select(
    sql, 
    att, 
    consumer
)
if (error) {
    log.info("select ${objectApiName} error=${errorMsg}")
}
```

---

### getOptionInfo

**签名**: `getOptionInfo(String apiName, String fieldName)`

**返回值**: `def (Boolean error, Map optionData, String message)` ⭐ 已确认

**两种用法**:

**三元组模式（推荐）**:
```groovy
def (Boolean optionError, Map optionData, String optionMsg) = Fx.object.getOptionInfo(
    "object_CHV5p__c", 
    "field_g8jaz__c"
)

if (!optionError && optionData) {
    List options = optionData["options"] as List
    options.each { opt ->
        Map o = opt as Map
        log.info(o.label + ": " + o.value)
    }
}
```

**链式模式（不推荐）**:
```groovy
// history_reCalculateCLXY.groovy 中的写法（不推荐，无错误检查）
Map hjWz = Fx.object.getOptionInfo("ActivityAgreementDetail__c","field_nYc94__c").result() as Map
```

---

### getTeamMember

**签名**: `getTeamMember(String apiName, String objectId)`

**返回值**: `.result() as List` ⭐ 已确认

```groovy
List accountTeamMember = Fx.object.getTeamMember("AccountObj", accountId2).result() as List

accountTeamMember.each { teamer ->
    Map t = teamer as Map
    String sourceType = t["sourceType"] as String
    log.info("团队成员：${t.userId}, 类型：${sourceType}")
}
```

---

### duplicateSearch

**签名**: `duplicateSearch(String apiName, String action, Map criteria, Object filter, Integer pageNum, Integer pageSize)`

**返回值**: `def (Boolean error, Map duplicateData, String message)`

```groovy
Map searchCriteria = ["unique_field__c": "uniqueValue"]

def (Boolean error, Map data, String errorMessage) = Fx.object.duplicateSearch(
    "object_zPSCw__c", 
    "NEW",  // 或 "EDIT"
    searchCriteria,
    null,   // filter
    1,      // pageNum
    20      // pageSize
)

if (error) {
    log.error("获取查重结果异常：" + errorMessage)
} else if (data && data.hasDuplicates) {
    log.error("发现重复数据：" + data.duplicateRecords)
}
```

---

### findDescribe ⚠️ 待确认

**推测签名**: `findDescribe(String apiName)`

**推测返回值**: `def (Boolean error, Map describe, String message)`

⚠️ 本地代码库未找到实际使用示例，需要确认

---

### getMappingRule ⚠️ 待确认

**推测签名**: `getMappingRule(...)`

**推测返回值**: `def (Boolean error, Map rule, String message)`

⚠️ 本地代码库未找到实际使用示例，需要确认

---

## 🟢 创建和更新方法

### create

**签名**: `create(String apiName, Map data, CreateAttribute attribute)`

**返回值**: `def (Boolean error, Map result, String message)`

```groovy
Map masterData = [
    "name": "主从同时新建 1",
    "owner": ["1000"],
    "field_date__c": Date.now().toTimestamp()
]

def (Boolean error, Map result, String message) = Fx.object.create(
    "ObjectApiName",
    masterData,
    CreateAttribute.builder().build()
)

if (!error && result) {
    log.info("创建成功，ID: " + result._id)
}
```

---

### batchCreate

**签名**: `batchCreate(String apiName, List<Map> dataList, CreateAttribute attribute)` ⚠️ 必须 3 个参数！

**返回值**: `def (Boolean error, List<Map> result, String message)`

```groovy
List<Map> dataList = [
    ["name": "记录 1", "age": 30],
    ["name": "记录 2", "age": 25]
]

def (Boolean error, List<Map> result, String message) = Fx.object.batchCreate(
    "large_object__c",
    dataList,
    CreateAttribute.builder().build()  // ⭐ 必填，不能省略
)

if (!error && result) {
    log.info("批量创建成功 ${result.size()} 条")
}
```

---

### update

**签名**: 
- `update(String apiName, String objectId, Map updateFields, UpdateAttribute attribute)`
- `update(String apiName, QueryTemplate template, Map updateFields, UpdateAttribute attribute)`

**返回值**: `def (Boolean error, Map result, String message)`

**单条更新**:
```groovy
String objectApiName = "object_qs2nb__c"
String objectId = "607d5e3dd02b9f00016507d8"
Map updateData = ["name": "新名称"]

def (Boolean error, Map result, String errorMessage) = Fx.object.update(
    objectApiName, 
    objectId, 
    updateData,
    UpdateAttribute.builder().build()
)
```

**条件更新（满足条件的都更新）**:
```groovy
String objectApiName = "object_1yO4J__c"
QueryTemplate query = QueryTemplate.AND([
    ["name": QueryOperator.EQ("主从同时新建 1")]
])

def (Boolean error, Object result, String errorMessage) = Fx.object.update(
    objectApiName, 
    query, 
    ["field__c": "test"], 
    UpdateAttribute.builder().build()
)
```

---

### batchUpdate

**签名**: `batchUpdate(String apiName, Map objects, List fields, BatchUpdateAttribute attribute)` ⭐ 4 个参数（attribute 可选）

**返回值**: `def (Boolean error, List result, String message)`

**参考真实项目 CstmCtrl_58xPY.groovy**:
```groovy
Map batchUpdateMap = [
    "xn_xxx1": ["name": "新名称 1", "age": 30],
    "xn_xxx2": ["name": "新名称 2", "age": 25]
]

List fields = ["name", "age"]  // 指定更新的字段列表

def (Boolean error, List result, String message) = Fx.object.batchUpdate(
    "ObjectApiName",
    batchUpdateMap,
    fields
    // BatchUpdateAttribute.builder().build()  // 第 4 个参数可选
)

if (!error) {
    log.info("批量更新成功 ${result?.size()} 条")
}
```

---

## 🟡 删除和恢复方法

### remove - 作废数据（放入回收站） ⭐ 2026-03-10 更新

**签名**: `remove(String apiName, String id)`

**返回值**: `def (Boolean error, Object result, String errorMessage)` ⭐ 已确认

**官方文档**: [ObjectDataAPI.md - remove](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md)

**作用**: 将数据作废并放入回收站  
**⚠️ 重要**: 只有生命状态为正常的数据才能被作废！

**标准示例** (Btn_AccountUnbindContact.groovy):
```groovy
// Step 1: 先 remove 作废（进入回收站）
def (Boolean removeError, Object removeResult, String removeMsg) = Fx.object.remove(
    "PublicEmployeeObj", 
    publicEmployeeId
)

if (removeError) {
    throw new RuntimeException("作废失败：" + removeMsg)
}
log.info("✅ 数据已作废：" + publicEmployeeId)
```

**错误写法 ❌ (不要这么干)**:
```groovy
// ❌ 直接 update life_status 字段（这是错的！应该用专门的 API）
Fx.object.update("PublicEmployeeObj", id, ["life_status": "invalid"])
```

---

### batchRemove - 批量作废

**签名**: `batchRemove(String apiName, List objectIds, RemoveAttribute attribute)`

**作用**: 批量将多个数据作废，放入回收站

**示例**:
```groovy
def (Boolean err, Object res, String msg) = Fx.object.batchRemove(
    "AccountObj", 
    invalidIds, 
    RemoveAttribute.builder().build()
)
```

---

### delete - 从回收站彻底删除 ⭐ 2026-03-10 更新

**签名**: `delete(String apiName, String objectId)`

**返回值**: `def (Boolean isError, Map data, String message)` ⭐ 已确认

**官方文档**: [ObjectDataAPI.md - delete](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md)

**作用**: 将回收站数据（已作废）进行永久删除，该操作无法恢复数据，请谨慎使用！

**完整流程示例** (Btn_AccountUnbindContact.groovy):
```groovy
// Step 1: 先 remove 作废
def (Boolean err1, Object res1, String msg1) = Fx.object.remove("PublicEmployeeObj", employeeId)
if (err1) throw new RuntimeException("作废失败：" + msg1)

// Step 2: 再 delete 彻底删除
def (Boolean err2, Map res2, String msg2) = Fx.object.delete("PublicEmployeeObj", employeeId)
if (err2) throw new RuntimeException("删除失败：" + msg2)
```

**⚠️ 警告**: 
- 只能删除已经作废（在回收站里）的数据
- **一旦删除不可恢复！**

---

### bulkDelete

**签名**: `bulkDelete(String apiName, List ids, Boolean forceDelete)`

**返回值**: `APIResult` ⚠️ 特殊类型，不是三元组！⭐ 已确认

**test.groovy 实际示例**:
```groovy
List ids = context.objectIds as List

APIResult result = Fx.object.bulkDelete(
    "object_R1ks7__c", 
    ids, 
    true  // forceDelete: true=彻底删除，false=移入回收站
)

if (result.success) {
    log.info("批量删除成功")
} else {
    log.error("批量删除失败：" + result.message)
}
```

---

### bulkRecover

**签名**: `bulkRecover(String apiName, List ids)`

**返回值**: `def (Boolean error, Object result, String message)` ⭐ 推测，已更新

**PlnTask_fbmFx.groovy 实际示例**:
```groovy
void recover(String accountId) {
    def result = Fx.object.bulkRecover("AccountObj", [accountId])
    log.info("recover result : ${Fx.json.toJson(result)}")
    
    // 后续逻辑...
}
```

⚠️ 注意：实际项目中使用了 `.result()` 链式调用，但未明确声明返回类型。根据其他 API 的模式，推测为三元组返回。

---

### directDelete ⚠️ 危险操作

**签名**: `directDelete(String apiName, String objectId)`

**返回值**: `def (Boolean error, Object result, String message)`

```groovy
def (Boolean error, Object result, String errorMessage) = Fx.object.directDelete(
    "AccountObj",
    "60057c76a3836900012xxxx"
)

if (error) {
    log.error("获取对象异常：" + errorMessage)
    Fx.message.throwErrorMessage("删除失败：" + errorMessage)
}
```

---

## 🔵 团队和权限方法

### addTeamMember

**签名**: `addTeamMember(String apiName, String objectId, TeamMemberAttribute attribute)`

**返回值**: `def (Boolean error, ObjectResult result, String message)`

```groovy
def teamMemberEmployee = TeamMemberEmployee.builder()
    .userId("309175511")
    .outTenantId("301185430")
    .build()

OutTeamMemberAttribute attr = OutTeamMemberAttribute.createEmployMember(
    [teamMemberEmployee], 
    TeamMemberEnum.Permission.READANDWRITE
)

def (Boolean error, ObjectResult result, String message) = Fx.object.addTeamMember(
    "ObjectApiName",
    "xn_xxxxxxxxxxxxx",
    attr
)
```

---

### addOutTeamMember

**签名**: `addOutTeamMember(String apiName, String objectId, OutTeamMemberAttribute attribute)`

**返回值**: `def (Boolean error, ObjectResult result, String message)`

```groovy
def (Boolean error, ObjectResult result, String message) = Fx.object.addOutTeamMember(
    "RedPacketRecordObj", 
    "61848edfd9007e00019ee222", 
    outEmployTeamMember
)
```

---

### editTeamMember ⚠️ 待确认

**推测签名**: `editTeamMember(String apiName, String objectId, TeamMemberAttribute attribute)`

**推测返回值**: `def (Boolean error, ObjectResult result, String message)`

⚠️ 本地代码库未找到实际使用示例

---

### replaceOutTeamMember ⚠️ 待确认

**推测签名**: `replaceOutTeamMember(String apiName, String objectId, OutTeamMemberAttribute attribute)`

**推测返回值**: `def (Boolean error, ObjectResult result, String message)`

⚠️ 本地代码库未找到实际使用示例

---

### unlock

**签名**: `unlock(String apiName, String objectId)`

**返回值**: `def (Boolean error, Object result, String message)`

```groovy
def (Boolean error, Object result, String message) = Fx.object.unlock(
    "ObjectApiName",
    "xn_xxxxxxxxxxxxx"
)
```

---

## 📋 快速对照表

| 方法 | 返回值类型 | 状态 | 备注 |
|------|-----------|------|------|
| findById | `(Boolean, Map, String)` | ✅ 确认 | - |
| findByIds | `(Boolean, List, String)` | ✅ 确认 | - |
| find | `(Boolean, QueryResult, String)` | ✅ 确认 | ⚠️ 返回 QueryResult 不是 Map |
| findOne | `(Boolean, Map, String)` | ✅ 确认 | - |
| select | `(Boolean, QueryResult, String)` | ✅ 确认 | 支持 Consumer 分页 |
| getOptionInfo | `(Boolean, Map, String)` | ✅ 确认 | 从实际代码验证 |
| getTeamMember | `.result() as List` | ✅ 确认 | 链式调用 |
| duplicateSearch | `(Boolean, Map, String)` | ✅ 确认 | - |
| findDescribe | `(Boolean, Map, String)` | ⚠️ 推测 | 需确认 |
| getMappingRule | `(Boolean, Map, String)` | ⚠️ 推测 | 需确认 |
| create | `(Boolean, Map, String)` | ✅ 确认 | - |
| batchCreate | `(Boolean, List<Map>, String)` | ✅ 确认 | 3 参数必需 |
| update | `(Boolean, Map/Object, String)` | ✅ 确认 | 2 种重载 |
| batchUpdate | `(Boolean, List, String)` | ✅ 确认 | 4 参数（attr 可选） |
| remove | `(Boolean, Map, String)` | ✅ 确认 | 从实际代码验证 |
| bulkDelete | `APIResult` | ✅ 确认 | ⚠️ 特殊类型 |
| bulkRecover | `(Boolean, Object, String)` | ⚠️ 推测 | 基于实际代码推断 |
| directDelete | `(Boolean, Object, String)` | ✅ 确认 | ⚠️ 危险操作 |
| addTeamMember | `(Boolean, ObjectResult, String)` | ✅ 确认 | - |
| addOutTeamMember | `(Boolean, ObjectResult, String)` | ✅ 确认 | - |
| editTeamMember | `(Boolean, ObjectResult, String)` | ⚠️ 推测 | 需确认 |
| replaceOutTeamMember | `(Boolean, ObjectResult, String)` | ⚠️ 推测 | 需确认 |
| unlock | `(Boolean, Object, String)` | ✅ 确认 | - |

---

## ⚠️ 常见错误

### 错误 1: 忽略 batchCreate 的第 3 个参数

```groovy
// ❌ 错误：Missing parameter
Fx.object.batchCreate(obj, dataList)

// ✅ 正确：必须有第 3 个参数
Fx.object.batchCreate(obj, dataList, CreateAttribute.builder().build())
```

### 错误 2: find/select直接用当Map

```groovy
// ❌ 错误：返回的是 QueryResult，不是 Map
Map data = Fx.object.find(...)
String name = data["name"]  // Error!

// ✅ 正确：先取 dataList
def (Boolean error, QueryResult qr, String msg) = Fx.object.find(...)
List dataList = qr["dataList"] as List
```

### 错误 3: 使用 def 导致静态类型检查失败

```groovy
// ❌ 错误
def rst = Fx.object.select(sql).result()

// ✅ 正确
def (Boolean error, QueryResult result, String message) = Fx.object.select(...)
```

---

**维护者**: 杨亚兴  
**上次更新**: 2026-03-09  
**数据源**: 蒙牛实际项目 + 官方 API 导出

---

## 📦 属性类参考

### SelectAttribute

**作用**: 控制查询行为（是否查作废数据、是否直连 DB 等）

**完整文档**: [SelectAttribute API 详解](./select-attribute-api.md)

**参数列表**:

| 方法 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `needInvalid(boolean)` | boolean | true | 是否包含已作废/无效的数据 |
| `dbSource(boolean)` | boolean | false | 是否直接从数据库查询（绕过缓存） |

**常用配置**:

```groovy
// ✅ 常规查询（不含作废数据）
SelectAttribute.builder()
    .needInvalid(false)
    .build()

// ⚡ 实时同步（直连 DB）
SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)  // 从数据库直接查询，绕过缓存
    .build()

// 🎯 使用默认配置
SelectAttribute.builder().build()  // needInvalid=true, dbSource=false
```

**实际项目中的典型用法**:
```groovy
// apply_detail_plan_GDnNe.groovy - 排除作废数据
SelectAttribute selectAttribute = SelectAttribute.builder()
    .needInvalid(false)
    .build()

// Proc_DAEHW.groovy - 直连 DB 获取最新数据
SelectAttribute selectAttribute = SelectAttribute.builder()
    .needInvalid(false)
    .dbSource(true)
    .build()
```

---

### FQLAttribute

**作用**: FQL 查询的核心属性

```groovy
FQLAttribute fql = FQLAttribute.builder()
    .columns(["_id", "name", "status__c"])        // 要返回的字段列表
    .queryTemplate(QueryTemplate.AND([...]))      // 查询条件
    .build()
```

---

### UpdateAttribute

**作用**: 更新操作的配置

```groovy
UpdateAttribute attr = UpdateAttribute.builder()
    .triggerWorkflow(false)  // 是否触发工作流
    .build()
```

---

### CreateAttribute

**作用**: 创建操作的配置（2026 版 batchCreate 必需）

```groovy
def (Boolean error, List<Map> result, String msg) = Fx.object.batchCreate(
    "ObjectApiName",
    dataList,
    CreateAttribute.builder().build()  // ⭐ 必须传，不能省略
)
```

---

## 📦 属性类完整参考

所有属性类的详细参数说明请参考：👉 [APL 属性类完整参考](./attribute-classes-reference.md)

包含以下类的完整参数列表和示例：

- **FQLAttribute** - FQL 查询核心属性（columns, queryTemplate, limit, orderBy, skip）
- **SelectAttribute** - 查询行为控制（needInvalid, dbSource, paginationOptimization 等 13+ 个参数）
- **UpdateAttribute** - 更新操作控制（isAllUpdate, triggerWorkflow, modifiedBySelf 等 6 个参数）
- **CreateAttribute** - 创建操作控制（11 个参数，batchCreate 必需）
- **BatchUpdateAttribute** - 批量更新控制（可选）
- **OptionAttribute** - 选项字段配置

### 快速使用

```groovy
// ✅ 最常见用法
SelectAttribute.builder()
    .needInvalid(false)
    .build()

// ⚡ 直连 DB
SelectAttribute.builder()
    .dbSource(true)
    .build()

// 🎯 batchCreate 必须传 CreateAttribute
CreateAttribute.builder().build()

// ⚙️ UpdateAttribute 常用配置
UpdateAttribute.builder()
    .triggerWorkflow(false)
    .modifiedBySelf(true)
    .build()
```
