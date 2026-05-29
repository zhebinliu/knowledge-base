# 纷享销客数据字典类型映射表

> **重要**: 这是生成代码时判断字段类型的**唯一依据**  
> **维护者**: 杨亚兴  
> **最后更新**: 2026-03-09 19:54  
> **来源**: 数据字典 Excel (列 4: field_type)

---

## 📊 完整类型对照表

| 数据字典类型 | API/Python 返回 | Groovy 强类型 | 遍历方式 | 示例代码 |
|------------|----------------|-------------|---------|---------|
| `text` | String | `String` | - | `String name = map["name"] as String` |
| `auto_number` | String | `String` | - | `String code = map["code"] as String` |
| `number` | Number | `Double` | - | `Double amount = map["amount"] as Double` |
| `currency` | Number | `BigDecimal` | - | `BigDecimal price = new BigDecimal(map["price"] as String)` |
| `quote` | Number | `Double` | - | `Double quote = map["quote"] as Double` |
| `percent` | Number | `Double` | - | `Double percent = map["rate"] as Double` |
| `date` | Date | `Date` | - | `Date birthDate = map["birth_date"] as Date` |
| `date_time` | DateTime | `DateTime` | - | `DateTime createTime = map["create_time"] as DateTime` |
| `true_or_false` | Boolean | `Boolean` | - | `Boolean isActive = map["is_active"] as Boolean` |
| `select_one` | String | `String` ⭐ | - | `String status = map["status"] as String` |
| `select_many` | Array of String | `List<String>` ⭐ | `as List` | `List<String> tags = map["tags"] as List` |
| `multi_select_option` | Array of Integer | `List` ⭐ | `as List` | see below |
| `object_reference` | String (ID) | `String` ⭐ | `as String` | `String refId = map["ref"] as String` |
| `object_reference_many` | Array of Map | `List<Map>` ⭐ | `as List` | see below |
| `employee` | String (ID) | `String` | - | `String owner = map["owner"] as String` |
| `department` | String (ID) | `String` | - | `String dept = map["dept_id"] as String` |

---

## 🚨 核心铁律（严禁违反！）

### 1️⃣ 严禁 instanceof 类型判断

**❌ 绝对禁止:**
```groovy
Object storeRef = recordMap["store_name__c"]
if (storeRef instanceof Map) { ... }  // ❌ 不允许！
else if (storeRef instanceof String) { ... }
```

**✅ 正确做法:**
```groovy
// object_reference 直接 as String（返回的就是 ID）
String storeId = recordMap["store_name__c"] as String
```

### 2️⃣ object_reference 就是关联对象的 ID

- 数据字典类型：`object_reference` → 存储的是**关联对象的主键 ID**
- Groovy 处理：**直接 `as String`**，不需要任何 instanceof 判断
- **例如**: `store_name__c` 是 object_reference，它的值就是 AccountObj 的 `_id`

### 3️⃣ multi_select_option 的处理

```groovy
// customer_label 是 multi_select_option
List labels = account["customer_label"] as List ?: []

labels.each { item ->
    Integer lid = item as Integer  // element 是 Integer key
}
```

---

## 🎯 常用模式模板

#### Pattern 1: Option 单选项

```groovy
// 数据字典：customer_application_statu__c | select_one | 客户申请状态
// Column 11: {"审批驳回":["3"],"审批通过":["2"],"审批中":["1"]}

String approvedStatus = "2"  // ✅ String 类型，来自数据字典列 11
QueryTemplate queryTemp = QueryTemplate.AND([
    "customer_application_statu__c": QueryOperator.EQ(approvedStatus)
])
```

#### Pattern 2: Object Reference（单条关联）

```groovy
// 数据字典：store_name__c | object_reference | 门店名称

// ⭐ 直接 as String！严禁 instanceof!
String storeId = recordMap["store_name__c"] as String

if (storeId && !storeId.isEmpty()) {
    qualifiedStoreIds << storeId
}
```

#### Pattern 3: Multi Select Option（多选标签）

```groovy
// 数据字典：customer_label | multi_select_option | 客户标签

List labels = account["customer_label"] as List ?: []

List<Integer> newLabels = []
labels.each { item ->
    Integer lid = item as Integer
    if (lid == 3) {
        log.info("有费用店标签")
    }
    newLabels << lid
}

// 添加新标签
if (!newLabels.contains(5)) {
    newLabels << 5
}
```

#### Pattern 4: SQL + Consumer 大数据量查询

```groovy
String sql = "SELECT store_name__c FROM display_fee_standard__c WHERE ..."

Consumer<List> processRecords = { List batch ->
    batch.each { record ->
        Map recordMap = record as Map
        
        String storeId = recordMap["store_name__c"] as String  // ⭐ 直接 as String!
        
        if (storeId && !storeId.isEmpty()) {
            qualifiedStoreIds << storeId
        }
    }
}

Fx.object.select(sql, SelectAttribute.builder().paginationOptimization(true).build(), processRecords)
```

---

## 📝 待补充说明

| 类型 | 状态 | 备注 |
|------|------|------|
| `file` | ⚠️ 待补充 | 文件对象的详细结构需要实际测试 |
| `location` | ⚠️ 待补充 | 地理位置对象的经纬度字段名 |
| `html_text` | ✅ 已确认 | 和普通 text 一样用 String |
| `phone` | ⚠️ 待补充 | 可能是 String 或特殊格式？ |
| `email` | ⚠️ 待补充 | 可能是 String 或需要验证？ |

---

**维护者**: 杨亚兴  
**最后更新**: 2026-03-09 19:54  
**版本**: v1.1 (修正：object_reference 直接 as String，严禁 instanceof)
