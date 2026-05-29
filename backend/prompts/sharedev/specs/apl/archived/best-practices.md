> ⚠️ **DEPRECATED (2026-03-10)**: 本文件已合并到新结构中
> - **核心规则** → 请查看 [CORE-RULES.md](./CORE-RULES.md)
> - **代码模板** → 请查看 [CODE-PATTERNS.md](./CODE-PATTERNS.md)
> - 此文件仅用于历史记录参考

---

# APL 开发最佳实践

> **最后更新**: 2026-03-09  
> **维护者**: 杨亚兴


---

## 📊 1. 大数据量场景处理

### ⚠️ 重要原则

**每次编写涉及数据读写/修改的计划任务时，必须先问用户：数据量大不大？**

### 判断标准

| 数据规模 | 处理方式 | 说明 |
|---------|---------|------|
| < 1000 条 | 直接 batchUpdate/batchCreate | 常规批量 API |
| 1000 - 10,000 条 | SQL + Consumer 分批处理 | 每批 20-100 条 |
| > 10,000 条 | **VIP 异步队列** + Consumer | ⭐ 避免超时和内存溢出 |

### VIP 异步队列模式（推荐用于超大数据量）

```groovy
// ✅ 绑定对象版：计划任务只负责查询数据 + 提交队列
/**
 * @codeName PlnTask_Example_Bound
 * @description [绑定对象] 提交到 VIP 队列异步执行
 */

List ids = context.objectIds as List

def (Boolean error, List dataList, String message) = Fx.object.findByIds(
    "AccountObj",
    ids,
    FQLAttribute.builder().columns(["_id", "name"]).build(),
    SelectAttribute.builder().build()
)

if (error) {
    log.error("批量查询失败：" + message)
    return
}

// 提交到 VIP 队列
Map params = ["dataList": dataList, "extraParam": "value"]
def (Boolean queueError, String traceId, String queueMessage) = Fx.function.asyncOnVipQueue(
    "CstmCtrl_ExampleController",  // ⭐ 异步控制器的 CodeName
    ["params": params],
    3  // 重试次数
)

if (queueError) {
    log.error("提交 VIP 队列失败：" + queueMessage)
    Fx.message.throwErrorMessage("任务提交失败：" + queueMessage)
}

log.info("✅ 任务已成功提交到 VIP 队列，TraceID: ${traceId}")
```

**对应的异步控制器代码：**
```groovy
/**
 * @codeName CstmCtrl_ExampleController
 * @description 异步控制器：实际处理业务逻辑
 */

List dataList = context.params["dataList"] as List
String extraParam = context.params["extraParam"] as String

log.info("[CstmCtrl] 开始处理任务，数据量：${dataList?.size() ?: 0}")

// TODO: 在这里写实际的业务逻辑
Map batchUpdateMap = [:]
dataList.each { item ->
    Map record = item as Map
    String id = record["_id"] as String
    
    // 业务逻辑...
    batchUpdateMap[id] = ["field__c": newValue]
}

if (!batchUpdateMap.isEmpty()) {
    Fx.object.batchUpdate("AccountObj", batchUpdateMap, ["field__c"])
}

log.info("[CstmCtrl] 任务执行完成")
```

**优势**:
- ✅ 避免计划任务超时限制
- ✅ 支持自动重试（第 3 个参数指定重试次数）
- ✅ 通过 TraceID 可追踪执行结果
- ✅ 失败不会阻塞主流程

### Consumer 分批处理模板

```groovy
// ✅ 标准分批处理模式
Integer batchSize = 50  // 每批 50 条
Consumer<List> processor = { List batch ->
    log.info("处理批次：${batch.size()} 条")
    
    Map updateMap = [:]
    batch.each { item ->
        // 构建更新数据
        updateMap[item['_id']] = ["field": newValue]
    }
    
    if (!updateMap.isEmpty()) {
        Fx.object.batchUpdate(apiName, updateMap, fields)
    }
}

String sql = "SELECT _id, field1 FROM LargeObject"
Fx.object.select(sql, SelectAttribute.builder().paginationOptimization(true).build(), processor)
```

### UpdateAttribute.isAllUpdate 参数

```groovy
// ❌ 默认只能更新 1000 条
UpdateAttribute.builder().build()

// ✅ 无限制更新所有匹配数据
UpdateAttribute attr = UpdateAttribute.builder()
    .isAllUpdate(true)
    .build()

Fx.object.update(apiName, queryTemplate, dataMap, attr)
```

---

## 🔍 2. 数据字典查询

### 对象信息文件

**使用对象信息文件查询字段信息：**

```
.sharedev/object/
├── objects.md          # 对象索引文件（列出所有可用对象）
├── AccountObj.md       # 客户对象字段信息
├── ContactObj.md       # 联系人对象字段信息
└── ...                 # 其他对象文件
```

**使用方式：**
1. 查看 `objects.md` 找到目标对象
2. 打开对应的对象文件查看字段信息

### ⚠️ 查完类型后的下一步

**根据数据字典列 4 的类型，参考**: [数据类型映射表](./data-type-mapping.md)

- `multi_select_option` → `List<Integer>` (key 列表)
- `select_many` → `List<String>` (value 列表)  
- `object_reference` → `Map` / `String` (判断 instanceof)

---

## ⚙️ 3. Option 类型字段的正确用法

---

### 🚨 重要规则（必读！）

**❌ 永远不要猜 Option Value！**

每次遇到 select_one / select_many 字段时，**必须用 Python 脚本查数据字典确认实际的 option value**！

**常见错误**:
- ❌ 凭经验写 `"normal"`、`"approval_pass"` 等通用值
- ❌ 直接用 label（如 `"审批通过"`）当 value
- ❌ 看类似项目的代码复制粘贴

**正确做法**:
```bash
# 查看对象信息文件确认 option value 格式
# 1. 打开 .sharedev/object/objects.md 找到目标对象
# 2. 打开对应的对象文件查看字段的选项值配置
```

---

### ⚠️ 关键区别：Option 值 vs Label

**单选/多选字段在查询时必须使用 VALUE（选项编码），不是 LABEL（选项名称）！**

| 场景 | 使用值 | 示例 |
|------|-------|------|
| **查询条件** (WHERE) | `value` | `"2"` 或 `"active"` |
| **更新/创建** | `value` | `"2"` 或 `"active"` |
| **返回数据** | `value` (默认) | `"2"` 或 `"active"` |
| **页面展示** | `label` | `"审批通过"` |

### ❌ 错误示范

```groovy
// ❌ 错误 1: 使用 label "审批通过" 做查询条件
QueryTemplate queryTemp = QueryTemplate.AND([
    "customer_application_statu__c": QueryOperator.EQ("审批通过")
])

// ❌ 错误 2: 凭空猜测 option value
QueryTemplate queryTemp = QueryTemplate.AND([
    "status__c": QueryOperator.EQ("normal")  // ❌ 可能是 "2" 或 "approved"！
])

// ❌ 两种都会失败，因为数据库存的是实际的 option value
```

### ✅ 正确做法

#### 步骤 1: 查对象信息文件获取 option value

```bash
# 方式 A: 查看对象索引
# 打开 .sharedev/object/objects.md 找到目标对象

# 方式 B: 直接查看对象文件
# 打开 .sharedev/object/<对象名>.md 查看字段的选项值配置
```

#### 步骤 2: 解析选项值配置

**数据字典列 11 包含选项 JSON:**
```json
{"审批驳回":["3"],"其他":["other"],"审批通过":["2"],"审批中":["1"]}
```

提取规则：**Label → Value**
- "审批驳回" → `"3"`
- "其他" → `"other"`
- **"审批通过" → `"2"`** ⭐
- "审批中" → `"1"`

#### 步骤 3: 在代码中使用正确的 value

```groovy
// ✅ 正确：使用从数据字典查到的 option value
String approvedStatusValue = "2"  // "审批通过" → "2"

QueryTemplate queryTemp = QueryTemplate.AND([
    "month__c": QueryOperator.EQ(month),
    "customer_application_statu__c": QueryOperator.EQ(approvedStatusValue)
])
```

### 📊 Option 值格式类型

纷享销客系统中 option value 有以下几种常见格式:

| 格式类型 | 示例 | 说明 |
|---------|------|------|
| **数字字符串** | `"1"`, `"2"`, `"3"` | 最常见，纯数字但作为字符串 |
| **英文单词** | `"active"`, `"inactive"`, `"normal"` | 语义化命名 |
| **混合格式** | `"opt_xxx"`, `"status_1"` | 带前缀的数字或单词 |
| **中文拼音** | `"shenpi_tongguo"`, `"zaifang"` | 较少见，特定系统定制 |

⚠️ **无法预测格式！必须查数据字典！**

### 💡 代码注释最佳实践

```groovy
// ⭐ 推荐写法：把数据来源和转换关系都注释清楚
// customer_application_statu__c 的选项值配置（来自数据字典）:
// {"审批驳回":["3"],"其他":["other"],"审批通过":["2"],"审批中":["1"]}

String approvedStatusValue = "2"  // ✅ "审批通过" → "2"
```

#### 步骤 2: 使用 value 查询

```groovy
// ✅ 正确：使用 option value
QueryTemplate queryTemp = QueryTemplate.AND([
    "customer_application_statu__c": QueryOperator.EQ("opt_approval_pass")
])

// ✅ 多个选项用 IN
QueryTemplate queryTemp = QueryTemplate.AND([
    "store_type__c": QueryOperator.IN(["opt_store_type_a", "opt_store_type_b"])
])
```

#### 步骤 3: 需要 label 时用 convertQuoteForView

```groovy
// 如果查询后需要返回 label 而不是 value
SelectAttribute attr = SelectAttribute.builder()
    .convertQuoteForView(true)  // 返回 label
    .needOptionLabel(true)      // 同时补充 __r 字段
    .build()

// 结果:
// status__c: "审批通过"          // label
// status__c__v: "opt_approval_pass"  // value
// status__c__r: "审批通过"        // 同 label
```

### 常见 Option 字段类型

| 字段类型 | 查询用 | 更新用 | 备注 |
|---------|-------|--------|------|
| select_one | value | value | 单选 |
| select_many | value (数组) | value (数组) | 多选 |
| boolean | true/false | true/false | 布尔型 |

### 多选字段的处理

```groovy
// 多选字段的更新格式
Map updateData = [
    "tag_field__c": ["opt_tag_1", "opt_tag_2", "opt_tag_3"]  // 数组格式
]

// HASANYOF 查询包含任一选项
QueryTemplate queryTemp = QueryTemplate.AND([
    "tag_field__c": QueryOperator.HASANYOF(["opt_tag_1", "opt_tag_2"])
])

// HASNOT 查询不包含某选项
QueryTemplate queryTemp = QueryTemplate.AND([
    "tag_field__c": QueryOperator.HASNOT("opt_tag_x")
])
```

---

## 🎯 4. 对象引用字段 (Object Reference) 的处理

### 关联字段的存储格式

```groovy
// Object Reference 字段在返回数据中的格式
Map record = [...]
def storeRef = record["store_name__c"]

// 可能是完整的关联对象
if (storeRef instanceof Map) {
    String storeId = storeRef["_id"]
    String storeName = storeRef["name"]
}

// 或只是字符串 ID（取决于 fillExtendInfo）
if (storeRef instanceof String) {
    String storeId = storeRef
}
```

### 查询时指定关联字段内容

```groovy
FQLAttribute fqlAttr = FQLAttribute.builder()
    .columns(["_id", "store_name__c._id", "store_name__c.name"])  // 指定要返回的关联字段
    .build()
```

### 设置关联关系

```groovy
// 创建记录时设置对象引用
Map newData = [
    "store_name__c": targetStoreId,  // 直接传 ID
    "name": "新记录"
]

// 多个引用
Map newRecord = [
    "primary_contact__c": contactId,
    "secondary_contact__c": otherContactId,
    "tags__c": ["tag1", "tag2"]  // 多选字段是数组
]
```

---

## 📝 5. 通用代码模板

### 安全的选项值获取方式

```groovy
// TODO: 从对象信息文件确认 option value
// 查看 .sharedev/object/<对象名>.md 获取字段的选项值
String APPROVED_STATUS_VALUE = "opt_approval_pass"  // 占位符，待替换
```

### 带错误处理的批量操作

```groovy
def safeBatchUpdate(String apiName, Map updateMap, List fields) {
    if (updateMap.isEmpty()) {
        log.info("没有需要更新的数据")
        return 0
    }
    
    def (Boolean error, List result, String message) = Fx.object.batchUpdate(
        apiName,
        updateMap,
        fields
    )
    
    if (error) {
        log.error("批量更新失败：${message}")
        throw new RuntimeException("批量更新失败：" + message)
    }
    
    return updateMap.size()
}
```

---

## 🔗 相关文档

- [FQL 最佳实践](./fql-best-practices.md)
- [SelectAttribute API](./select-attribute-api.md)
- [属性类参考](./attribute-classes-reference.md)

---

**维护者**: 杨亚兴  
**上次更新**: 2026-03-09
