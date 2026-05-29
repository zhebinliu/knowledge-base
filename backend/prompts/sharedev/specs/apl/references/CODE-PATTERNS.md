# Groovy 代码模式库

## 概述

基于 `./examples/` 中 240+ 个现有函数的分析，总结出以下核心模式。

---

## ⚡️ 2026 年最新 API 语法变更 (重要!)

根据纷享销客官方文档 ([ObjectDataAPI.md](../../../docs/apl/pages/func-apl/api/ObjectDataAPI.md))，以下是最新的 API 签名:

### Fx.object.* 标准调用方式

```groovy
// ✅ findById - 查询单条记录
def(boolean error, Map data, String errorMsg) = Fx.object.findById(
    "ObjectApiName",              // 对象 API 名
    "record_id_123...",           // 记录 ID  
    null,                         // FQLAttribute (可选：字段过滤)
    null                          // SelectAttribute (可选：查询属性)
)

// ✅ find - 条件查询多条记录
def(boolean error, FindResult result, String errorMsg) = Fx.object.find(
    "ObjectApiName",
    FQLAttribute.builder()
        .queryTemplate(QueryTemplate.AND([["status": QueryOperator.EQ("active")]]))
        .columns(["_id", "name", "field_xxx__c"])
        .build(),
    SelectAttribute.builder()
        .needCount(false)         // 是否需要总数统计
        .limit(100)               // 限制返回数量
        .dbSource(true)           // 直连数据库 (后台任务推荐)
        .build()
)

// ✅ update - 单条更新
def(boolean error, Object data, String errorMsg) = Fx.object.update(
    "ObjectApiName",
    "record_id_123...",
    ["field_xxx__c": newValue],   // 要更新的字段
    UpdateAttribute.builder().build()  // 可选参数
)

// ✅ batchUpdate - 批量更新 (使用 Map 格式!)
def(boolean error, List<Map> successIds, List<Map> failInfo, String errorMsg) = 
    Fx.object.batchUpdate(
    "ObjectApiName",
    [                                    // ✨ Map 格式：ID → 更新字段
        "id1": ["field_a": valueA, "field_b": valueB],
        "id2": ["field_c": valueC]
    ],
    ["field_a", "field_b", "field_c"],  // 涉及的字段列表
    BatchUpdateAttribute.builder().build()
)

// ✅ create - 创建单条
def(boolean error, CreateResult result, String errorMsg) = Fx.object.create(
    "ObjectApiName",
    ["field_name": value],             // 主表数据
    [:],                               // 子表数据 (可选)
    CreateAttribute.builder().build()  // 可选参数
)

// ✅ batchCreate - 批量创建
def(boolean error, CreateResult result, String errorMsg) = Fx.object.batchCreate(
    "ObjectApiName",
    [                                  // ✨ List<Map> 格式
        ["field_name": "value1"],
        ["field_name": "value2"]
    ],
    CreateAttribute.builder().build()  // 最大单次 500 条!
)
```

### 📝 关键变化总结

| 旧写法 | 新标准 | 说明 |
|--------|--------|------|
| `Fx.object.findById(obj, id)` | + 可选参数 `FQLAttribute`, `SelectAttribute` | 明确指定需要查询的字段 |
| `batchUpdate(obj, list_of_maps, fields)` | `batchUpdate(obj, map_id_to_fields, fields)` | Map 格式更易维护 |
| `find(obj, fql, limit: 100)` | `find(obj, fql, SelectAttribute.limit(100))` | 统一使用 Attribute 对象 |
| `result.dataList.size()` | `result.totalCount` | 直接使用 totalCount 属性 |

### 🎯 最佳实践建议

1. **总是检查返回值**:
```groovy
def(err, result, msg) = Fx.object.*(...)
if(err){
    log.error("API 调用失败：" + msg)
    return
}
```

2. **明确指定查询字段** (性能优化):
```groovy
FQLAttribute.builder()
    .columns(["_id", "name", "required_field"])  // 只查需要的
    .build()
```

3. **limit 设置建议** ⚠️:
- ❌ 不传 `limit` → 默认只返回 **10 条** (容易遗漏数据!)
- ✅ 推荐设置 `limit(100)` → 每次最多 100 条
- ✅ 大批量数据需配合分页逻辑
- ✅ 后台任务可以设置 `limit(500)` 

4. **dbSource 使用场景** ⚠️:
- ❌ 前端函数/UI 事件/前验证 → **不传 dbSource** (走缓存，性能好)
- ✅ 后台任务/计划任务/异步队列 → `dbSource(true)` (需要最新数据)
- ⚠️ dbSource 会增加数据库压力，谨慎使用

5. **批量操作注意上限**:
- `batchCreate`: 单次最大 **500 条**
- `batchUpdate`: 单次最大 **500 条** (实际值需确认)
- `findByIds`: 单次最大 **500 条**

---

## 🔗 主从表关联对象的最佳实践

### ⚠️ 重要：不要从 context.data 获取子表数据!

#### ❌ 不推荐的方式 (已有问题)

```groovy
// 错误示范：从 context.data 直接获取子表
List subTableData = data["subObjectName"] as List

// 问题:
// 1. 数据可能不是最新的 (前端缓存状态)
// 2. 可能包含未提交的临时数据
// 3. 无法精确控制查询条件
// 4. 性能差：加载了整个子表数据结构
```

#### ✅ 官方推荐方式 (使用 FQL 查询)

```groovy
// 正确做法：通过 FQL 查询子表
String mainRecordId = context.recordId as String

def(boolean error, FindResult result, String errorMsg) = Fx.object.find(
    "SubObjectApiName",             // 子对象 API 名
    FQLAttribute.builder()
        .columns(["_id", "field_a__c", "field_b__c"])  // 只查询需要的字段
        .queryTemplate(QueryTemplate.AND([
            ["master_id": QueryOperator.EQ(mainRecordId)]  // WHERE master_id = ?
        ]))
        .build(),
    SelectAttribute.builder()
        .limit(100)                 // ⚠️ 重要！默认限制 100 条 (不传的话默认为 10 条)
        .needCount(false)           // 不需要总数统计时关闭
        .build()                    // ❌ 不传 dbSource，走缓存层
)

if(error){
    log.error("查询子表失败：" + errorMsg)
    return
}

List subTableData = result.dataList ?: []
log.info("查询到 ${subTableData.size()} 条子记录")
```

### 📊 对比分析

| 特性 | context.data | FQL 查询 |
|------|-------------|----------|
| **数据准确性** | ❌ 可能包含脏数据 | ✅ 直接从数据库读取 |
| **性能** | ❌ 加载完整结构 | ✅ 可指定 fields,dbSource |
| **扩展性** | ❌ 无过滤能力 | ✅ 支持 WHERE,分页，排序 |
| **官方推荐** | ❌ 不推荐 | ✅ 推荐方式 |
| **适用场景** | - | 新建前验证、审批流程等 |

### 🎯 实战示例：前验证中校验子表数据

```groovy
/**
 * @description 订单新建前验证：校验子表商品数量总和不超过库存
 */
Map data = context.data as Map
String orderId = context.recordId as String

// 1. FQL 查询子表
def(err, result, msg) = Fx.object.find(
    "OrderItemObj",
    FQLAttribute.builder()
        .queryTemplate(QueryTemplate.AND([
            ["master_id": QueryOperator.EQ(orderId)]
        ]))
        .build(),
    SelectAttribute.builder()
        .limit(100)                 // ⚠️ 限制 100 条，避免默认 10 条的限制
        .build()                    // ❌ 不传 dbSource，走缓存层
)

List items = result.dataList ?: []

// 2. 循环校验每条子表记录
for(item in items){
    String sku = item["product_sku__c"] as String
    BigDecimal qty = item["quantity__c"] as BigDecimal
    
    if(qty.compareTo(0) <= 0){
        return ValidateResult.builder()
            .success(false)
            .errorMessage("SKU ${sku} 的数量必须大于 0")
            .build()
    }
}

// 3. 使用 aggregate() 聚合计算总和 (比循环更高效!)
def(aggErr, aggResults, aggMsg) = Fx.object.aggregate(
    "OrderItemObj",
    Aggregate.SUM,                 // SUM 函数
    "quantity__c",                // 求和字段
    [["master_id": QueryOperator.EQ(orderId)]],  // WHERE
    SelectAttribute.builder().build()
)

BigDecimal totalQty = aggResults[0] as BigDecimal
if(totalQty > availableStock){
    return ValidateResult.builder()
        .success(false)
        .errorMessage("总数量超出库存限制")
        .build()
}

return ValidateResult.builder().success(true).build()
```

### 💡 master_id 字段说明

在纷享销客的主从表关系中:
- **主表 ID**: 每个主表记录有唯一 `_id`
- **子表关联字段**: `master_id` (系统自动生成，存储主表记录的 `_id`)
- **查询方式**: `WHERE master_id = '<主表 ID>'`

```groovy
// Step 1: FQL 查询子表
def(err, result, msg) = Fx.object.find(
    "SalesOrderItem__c",
    FQLAttribute.builder()
        .queryTemplate(QueryTemplate.AND([
            ["master_id": QueryOperator.EQ(salesOrderId)]  // 精确匹配
        ]))
        .build(),
    SelectAttribute.builder()
        .limit(100)                 // ⚠️ 限制 100 条，避免默认 10 条的限制
        .build()                    // ❌ 不传 dbSource，走缓存层
)
```

### 📚 其他聚合函数用法

```groovy
// COUNT - 统计子表记录数
def(err, countResults, msg) = Fx.object.aggregate(
    "SubObject",
    Aggregate.COUNT,               // COUNT
    "*",                           // 统计所有行
    [["master_id": QueryOperator.EQ(mainId)]]
)
int itemCount = countResults[0] as int

// AVG - 平均值
def(err, avgResults, msg) = Fx.object.aggregate(
    "SubObject", 
    Aggregate.AVG,                 // AVG
    "price__c"                     // 价格字段平均值
)
BigDecimal avgPrice = avgResults[0] as BigDecimal

// MAX/MIN - 最大值/最小值
def(err, maxResults, msg) = Fx.object.aggregate(
    "SubObject",
    Aggregate.MAX,
    "amount__c"
)
```

---

---

## 1️⃣ UI 事件型 (UIEvt_*)

**特征**: `UIEvent.build(context)` + `return event`

**典型场景**: 
- 加载关联数据到表单
- 字段联动显示/隐藏
- 动态计算字段值

### 标准模板

```groovy
/**
 * @author [姓名]
 * @codeName [函数 ApiName]
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

// 获取输入参数
String field_value = context.data["field_xxx__c"] as String;

if(field_value != null && field_value != ""){
    // 查询关联数据
    def(error, data, errorMsg) = Fx.object.findById("ObjectApiName", field_value);
    
    if(!error){
        // 提取需要的字段
        List related_list = data["field_related__c"] as List;
        String year = data["field_year__c"].substring(0, 4);
        
        log.info("日志信息：" + year);
    }
}

// 构建 UI 事件
UIEvent event = UIEvent.build(context) { 
    // 主对象修改
    editMaster("field_a__c": valueA, "field_b__c": valueB)
    
    // 从对象操作 (可选)
    // showChild("SubObjectName")
    // hideField("field_hidden__c")
}
return event
```

**关键点**:
- ✅ `context.data` 获取当前表单数据
- ✅ `Fx.object.findById()` 快速查询单条
- ✅ `editMaster()` 回写主对象字段
- ✅ 必须返回 `UIEvent` 对象

---

## 2️⃣ 导入验证型 (Import_* / *_Check)

**特征**: `ValidateResult.builder()` + 批量数据处理

**典型场景**:
- 导入前数据预处理
- 校验必填项/唯一性
- 数据转换和缓存

### 标准模板

```groovy
/**
 * @author [姓名]
 * @codeName [函数名称]
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

def taskId = context.task.taskId as String
log.info("任务 Id===========" + context.task.taskId)

List<Map> dataList = context.dataList as List  // 一批 20 条
log.info("批次数据数量：" + dataList.size())

Cache cache = Fx.cache.defaultCache

boolean isPass = true
String errorMessage = ""

dataList.each { data ->
    def key = data._UnionMark + taskId
    
    // 提取字段
    String field_id = data["field_id__c"] as String
    
    // 查询关联数据
    def (Boolean error, Map result, String msg) = Fx.object.findOne(
        "RelatedObject__c",
        FQLAttribute.builder()
            .columns(["_id", "field_name__c"])
            .queryTemplate(QueryTemplate.AND([["_id": QueryOperator.EQ(field_id)]]))
            .build(),
        SelectAttribute.builder().build()
    )
    
    if (error) {
        log.info("查询失败：" + msg)
        isPass = false
        errorMessage = "关联数据不存在"
        return
    }
    
    // 缓存处理后的数据
    Map cachedData = ["field_from_query": result["field_name__c"]]
    cache.put(key, Fx.json.toJson(cachedData), 1200)  // 20 分钟过期
}

return ValidateResult.builder()
    .success(isPass)
    .errorMessage(errorMessage)
    .build()
```

**关键点**:
- ✅ `context.dataList` 批量处理 (每批 20 条)
- ✅ `Fx.cache` 跨批次共享数据
- ✅ `ValidateResult.success(true/false)` 控制导入是否继续
- ✅ 用 `_UnionMark + taskId` 作为缓存 Key

---

## 3️⃣ 计划任务型 (PlnTask_*)

**特征**: `context.objectIds` + 批量更新逻辑

**典型场景**:
- 定时刷字段值
- 数据同步
- 定期清理

### 标准模板

```groovy
/**
 * @author [姓名]
 * @codeName PlnTask_xxx
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

// 获取符合条件的主对象 ID 列表
List ids = context.objectIds as List
log.info("处理对象数量：" + ids.size())

// 批量查询
def(boolean error, List dataList, String errorMessage) = Fx.object.findByIds(
    "ObjectApiName", 
    ids,
    FQLAttribute.builder()
        .columns(["_id", "field_a__c", "field_b__c"])
        .build()
)

if(error){
    log.info("查询失败：" + errorMessage)
    return
}

Map batchUpdateMap = [:]  // _id → {field: value}

dataList.each { item ->
    Map map = item as Map
    String dataId = map["_id"] as String
    String relatedId = map["field_related__c"] as String
    
    // 关联查询
    def(boolean err, Map relData, String errMsg) = Fx.object.findOne(
        "RelatedObj__c",
        FQLAttribute.builder()
            .columns(["field_target__c"])
            .queryTemplate(QueryTemplate.AND([["_id": QueryOperator.EQ(relatedId)]]))
            .build(),
        SelectAttribute.builder().build()
    )
    
    if(!err && relData){
        String targetValue = relData["field_target__c"] as String
        
        // 添加到批量更新
        batchUpdateMap.put(dataId, ["field_update__c": targetValue])
    }
}

// 执行批量更新
if(!batchUpdateMap.isEmpty()){
    List fields = Lists.newArrayList('field_update__c')
    def result = Fx.object.batchUpdate("ObjectApiName", batchUpdateMap, fields).result()
    log.info("批量更新结果：" + result)
}
```

**关键点**:
- ✅ `context.objectIds` 是查询条件过滤后的 ID 列表
- ✅ `Fx.object.findByIds()` 批量查询更高效
- ✅ `Fx.object.batchUpdate()` 一次更新多条
- ✅ 使用 `Maps.newLinkedHashMap()` 或 `[:].put()` 构建更新 Map

---

## 4️⃣ 按钮触发型 (Btn_* / btn_*)

**特征**: 直接执行业务逻辑，返回值灵活

**典型场景**:
- 手动触发的复杂操作
- 数据初始化/重置
- 批量执行某个动作

### 标准模板

```groovy
/**
 * @author [姓名]
 * @codeName Btn_xxx
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

// 获取选中记录 ID
List selectedIds = context.objectIds as List
log.info("选中记录数：" + selectedIds.size())

// 或者获取当前记录 ID
String currentId = context.data._id as String

// 查询数据
def (boolean error, List dataList, String errorMsg) = Fx.object.select(
    "select _id, name from ObjectApiName where _id in (${selectedIds.join(',')})",
    SelectAttribute.builder().needCount(false).build(),
    new Consumer<List>() {
        @Override
        void accept(List list) {
            // 分批处理逻辑
            list.each { record ->
                // 业务逻辑
            }
        }
    }
)

if(error){
    log.info("查询失败：" + errorMsg)
    return
}

// 调用外部 API (可选)
def (boolean apiError, Map apiData, String apiMsg) = Fx.biz.callAPI(
    "Fx.namespace.apiName",
    [param1],
    param2List,
    "token1",
    "token2"
)

if(apiError){
    log.info("API 调用失败：" + apiMsg)
    return
}
```

**关键点**:
- ✅ `context.objectIds` 列表页按钮的选中 ID
- ✅ `context.data` 详情页按钮的当前数据
- ✅ 支持 `Fx.biz.callAPI()` 调用外部服务
- ✅ SQL 查询适合复杂条件

---

## 5️⃣ 工作流型 (*Handler / *Trigger)

**特征**: Consumer 回调 + 异步队列

**典型场景**:
- 创建/编辑后自动触发
- 审批流动作
- 流程自动化

### 标准模板 - Trigger (触发器)

```groovy
/**
 * @author [姓名]
 * @codeName xxxTrigger
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

Integer count = 0

Consumer<List> consumer = { List list ->
    // 调用异步处理器
    def (Boolean error, String traceId, String message) = 
        Fx.function.asyncOnVipQueue("HandlerFunctionName__c", [
            "params": ["dataList": list]
        ])
    
    if(error){
        log.info("异步调用失败：" + message)
    }
    
    count += list.size()
}

// SQL 查询条件
String sql = """
    select _id, name, field_status__c
    from ObjectApiName
    where field_trigger_field__c = 'value'
"""

SelectAttribute selectAttr = SelectAttribute.builder()
    .needCount(false)
    .dbSource(true)  // 直接查数据库
    .build()

Fx.object.select(sql, selectAttr, consumer)

log.info("总共触发：" + count + " 条")
```

### 标准模板 - Handler (处理器)

```groovy
/**
 * @author [姓名]
 * @codeName xxxHandler
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

Map params = context.params as Map
List dataList = params["dataList"] as List

log.info("处理批次数据：" + dataList.size())

dataList.each { record ->
    String id = record._id as String
    
    // 业务逻辑
    def (boolean error, Map data, String msg) = Fx.object.findById(
        "ObjectApiName", id
    )
    
    if(!error){
        // 更新操作
        Fx.object.update("ObjectApiName", id, [
            "field_updated__c": true,
            "field_update_time__c": System.currentTimeMillis()
        ])
    }
}
```

**关键点**:
- ✅ Trigger 用 `Fx.function.asyncOnVipQueue()` 异步调用 Handler
- ✅ Handler 接收 `context.params["dataList"]`
- ✅ SQL 可以用 `${variable}` 插值
- ✅ `.dbSource(true)` 直连数据库提升性能

---

## 6️⃣ 前验证型 (*PreVerification / *Before*)

**特征**: `ValidateResult` 返回 + 字段级校验

**典型场景**:
- 新增/编辑前必填校验
- 数据合法性检查
- 重复性检测

### 标准模板

```groovy
/**
 * @author [姓名]
 * @codeName xxxPreVerification
 * @description [功能描述]
 * @createTime YYYY-MM-DD
 */

Map data = context.data as Map
log.info("校验数据：" + Fx.json.toJson(data))

boolean isPass = true
List<String> errorMessages = []

// 1. 必填项校验
String requiredField = data["field_required__c"] as String
if(requiredField == null || requiredField == ""){
    isPass = false
    errorMessages.add("必填项：[必需字段] 不能为空")
}

// 2. 格式校验
String email = data["field_email__c"] as String
if(email != null && !email.matches('.+@.+\\..+')){
    isPass = false
    errorMessages.add("邮箱格式不正确")
}

// 3. 唯一性校验
if(requiredField != null){
    def (boolean err, Map exist, String msg) = Fx.object.findOne(
        "ObjectApiName",
        FQLAttribute.builder()
            .columns(["_id"])
            .queryTemplate(QueryTemplate.AND([
                ["field_unique__c": QueryOperator.EQ(requiredField)],
                ["_id": QueryOperator.NE(data._id)]  // 排除自己
            ]))
            .build(),
        SelectAttribute.builder().build()
    )
    
    if(exist && !err){
        isPass = false
        errorMessages.add("[必需字段] 已存在，请检查重复")
    }
}

// 4. 关联数据校验
String relatedId = data["field_related_id__c"] as String
if(relatedId != null && relatedId != ""){
    def (boolean err, Map relData, String msg) = Fx.object.findById(
        "RelatedObject__c", relatedId
    )
    
    if(err || !relData){
        isPass = false
        errorMessages.add("关联的 [相关对象] 不存在")
    }
}

String finalMessage = isPass ? "校验通过" : errorMessages.join("；")

return ValidateResult.builder()
    .success(isPass)
    .errorMessage(finalMessage)
    .build()
```

**关键点**:
- ✅ 收集所有错误一次性返回 (`List<String>`)
- ✅ 编辑时排除自身 (`_id NE`)
- ✅ `ValidateResult.success(false)` 会阻断保存
- ✅ 错误消息要清晰友好

---

## 🛠️ 通用工具函数

### 金额转大写

```groovy
static String amountToCapital(BigDecimal amount) {
    if(amount == null) return ""
    
    String[] units = {"零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"}
    String[] digits = {"", "拾", "佰", "仟"}
    String[] bigUnits = {"", "万", "亿", "兆"}
    
    // 实现略...
    return result
}
```

### 日期解析

```groovy
static Map parseYearMonth(String yearMonthStr) {
    // "2024-03" → {year: "2024", month: "03"}
    if(yearMonthStr == null || yearMonthStr.length() < 7) return null
    
    return [
        year: yearMonthStr.substring(0, 4),
        month: yearMonthStr.substring(5, 7)
    ]
}
```

### 安全类型转换

```groovy
// 推荐写法
String strVal = data["field_str__c"] as String ?: ""
Integer intVal = data["field_int__c"] as Integer ?: 0
BigDecimal decVal = data["field_dec__c"] as BigDecimal ?: 0
List listVal = data["field_list__c"] as List?: []
Map mapVal = data["field_map__c"] as Map?: [:]
```

---

## 🔗 对象关联关系处理 (Object Reference)

**场景**: 订单的"客户"字段、合同的"线索"字段等都是 object_reference 类型

### 标准处理流程

```groovy
// Step 1: 从 context.data 获取关联字段的值 (这就是对方的_id)
String relatedId = data["关联字段 api 名"] as String

if(relatedId != null && relatedId != ""){
    
    // Step 2: 查询关联对象的完整数据
    def (boolean error, Map relatedData, String errorMsg) = Fx.object.findById(
        "目标对象 API 名",  // 如 AccountObj
        relatedId          // 从关联字段获取的 ID
    )
    
    if(!error && relatedData){
        // Step 3: 使用关联对象的数据
        String name = relatedData["name"] as String
        String field = relatedData["某个字段"] as String
        
        log.info("关联对象：" + name)
    }
}
```

### 性能优化：批量查询避免 N+1 问题

```groovy
// ❌ 错误：每行都查一次数据库 (N+1 问题)
dataList.each { item ->
    def (e,d,m) = Fx.object.findById("AccountObj", item.account_id)
}

// ✅ 正确：批量查询后构建索引
Set allIds = dataList*.account_id
def (e, list, m) = Fx.object.findByIds("AccountObj", allIds as List)
Map idMap = list.collectEntries { [(it._id): it] }  // 建立 ID→数据的映射

dataList.each { item ->
    Map account = idMap.get(item.account_id)  // O(1) 快速查找
}
```

### 关键要点

- ⚠️ 关联字段存储的是**被关联对象的 _id** (字符串)
- ⚠️ 必须先检查 ID 是否为空再查询
- ⚠️ 所有 Fx.object.* 都要检查 error 返回值
- ✅ 大批量操作优先用 findByIds 批量查询
- ✅ 限制 columns 只查需要的字段提升性能

更多示例见：`assets/templates/object-reference-template.groovy`

## 📚 常见 API 速查

| 操作 | 方法 | 示例 |
|------|------|------|
| **查询单条 (by ID)** | `Fx.object.findById(objName, id)` | `Fx.object.findById("AccountObj", "xxx")` |
| **查询单条 (by 条件)** | `Fx.object.findOne(objName, query)` | 见各模板 |
| **批量查询** | `Fx.object.findByIds(objName, ids, columns)` | `Fx.object.findByIds("Obj", [_id1, _id2], ...)` |
| **SQL 查询** | `Fx.object.select(sql, attr, consumer)` | 见工作流模板 |
| **单条更新** | `Fx.object.update(objName, id, map)` | `Fx.object.update("Obj", id, ["f": v])` |
| **批量更新** | `Fx.object.batchUpdate(objName, updateMap, fields)` | 见计划任务模板 |
| **调用 API** | `Fx.biz.callAPI(name, params...)` | 见按钮模板 |
| **异步队列** | `Fx.function.asyncOnVipQueue(name, params)` | 见工作流模板 |

---

**维护者**: 杨亚兴  
**最后更新**: 2026-03-04  
**数据来源**: `./examples/` 中 240+ 文件分析
