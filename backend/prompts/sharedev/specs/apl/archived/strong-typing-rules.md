> ⚠️ **DEPRECATED (2026-03-10)**: 本文件已合并到新结构中
> - **核心规则** → 请查看 [CORE-RULES.md](./CORE-RULES.md)
> - **快速入门** → 请查看 [QUICK-START.md](../QUICK-START.md)
> - 此文件仅用于历史记录参考

---

# APL 代码强类型规范（强制要求！）

---

## 🚨 第零条铁律：业务字段选择必须问用户！

**❌ 绝对禁止:**
- ❌ 从数据字典看到多个候选字段就自己选一个写进代码
- ❌ 即使查到了字段存在，也不准擅自决定用哪个字段

**✅ 正确做法:**
```groovy
// ⭐ 当数据字典中有多个可选字段时，列出所有选项并标注 TODO

QueryTemplate queryTemp = QueryTemplate.AND([
    // ... 其他确认的条件
    
    // ⚠️ TODO: 需要杨亚兴确认——哪个字段代表"有陈列费用"?
    // 数据字典中 display_fee_standard__c 对象的可选字段:
    //   - display_support_cost__c (number): 标准金额（元）
    //   - standard_amount_per_event__c (quote): 标准金额（元/每场）  
    //   - field_19Fn6__c (currency): 单天申请费用
    // 请指定使用哪个字段判断"有费用"!
    // "{TODO_FIELD}": QueryOperator.EXISTS(true)
])
```

**案例教训 (2026-03-09)**:
- ❌ 我查到 `display_support_cost__c` 存在，就直接用它了
- ✅ 应该把 3 个可选字段都列出来，请求用户确认用哪一个
- **即使字段真实存在，业务逻辑也可能选错！**

---

## 🚨 三大铁律

### 1️⃣ Option 类型的 value 永远是 String

**❌ 禁止行为:**
- ❌ 把 option value 当成数字：`Integer status = "2"`
- ❌ 凭空猜测 format: `"normal"`, `"approval_pass"`, `"approved"`
- ❌ 直接用 label: `"审批通过"`

**✅ 正确做法:**

```groovy
// Step 1: 查数据字典列 11 的 JSON 配置
// {"审批驳回":["3"],"审批通过":["2"],"审批中":["1"]}

// Step 2: 用 String 类型声明（即使看起来像数字！）
String approvedStatusValue = "2"  // ✅ 必须是 String!

// Step 3: 查询时用 EQ(String)
QueryOperator.EQ(approvedStatusValue)  // String 参数
```

**关键点**: 
- Option value 在数据库中存储为 **String**
- 即使是 `"1"`, `"2"`, `"3"` 这样的值，也要用 `String` 类型
- **严禁**写成 `Integer status = 2`

---

### 2️⃣ 字段数据类型必须从数据字典查

**❌ 不准凭经验推断字段类型！**

**✅ 每次遇到新字段时:**
1. 先用脚本查数据字典列 4 (field_type)
2. 根据类型做正确的强类型声明
3. 代码注释中标明数据来源

**常见字段类型对照表**:

⚠️ **完整版本请查看**: [数据字典类型映射表](./data-type-mapping.md)

| 数据字典类型 | Groovy 类型 | 遍历方式 | 示例 |
|------------|-----------|---------|------|
| `text`, `auto_number` | `String` | - | `String name = map["name"] as String` |
| `number`, `currency`, `quote` | `Double`/`BigDecimal` | - | `Double amount = map["amount"] as Double` |
| `date` | `Date` | - | `Date month = Date.of("2024-03")` |
| `date_time` | `DateTime` | - | `DateTime createTime = map["create_time"] as DateTime` |
| `select_one` | `String` ⭐ | - | `String status = map["status"] as String` |
| `select_many` | `List<String>` ⭐ | `as List` | `List<String> tags = map["tags"] as List` |
| `multi_select_option` | `List` ⭐ | `as List` | see data-type-mapping.md |
| `object_reference` | `String` ⭐ | `as String` | `String refId = map["ref"] as String` |
| `object_reference_many` | `List<Map>` ⭐ | `as List` | see mapping.md |
| `true_or_false` | `Boolean` | - | `Boolean isDeleted = map["is_deleted"] as Boolean` |

**铁律**: 
- **严禁 instanceof 类型判断！**
- **object_reference 直接 `as String`（返回的就是关联对象 ID）**

**❌ 禁止行为:**
- ❌ 不查数据字典就写代码
- ❌ 凭经验推断字段类型
- ❌ 使用 `def` 绕过类型检查（特殊情况除外）
- ❌ QueryResult.dataList 遍历时用 `def item` → 必须用 `Map item = record as Map`

---

### 3️⃣ 不允许猜想字段是否存在

**❌ 严重错误案例:**
```groovy
// ❌ 对象名是 display_fee_standard__c，就以为有个同名字段
"display_fee_standard__c": QueryOperator.EXISTS(true)  // 该字段不存在！
```

**✅ 正确流程:**

#### Step 1: 查对象信息文件列出所有字段

```bash
# 查看对象索引
# 打开 .sharedev/object/objects.md 找到目标对象

# 查看具体对象文件
# 打开 .sharedev/object/display_fee_standard__c.md 查看所有字段
```

输出示例:
```
display_fee_standard__c 对象共有 72 个字段:
- store_name__c        (object_reference) | 门店名称
- month__c            (date)             | 月份
- display_support_cost__c (number)       | 标准金额（元）
...
❌ 注意：display_fee_standard__c 字段不存在！
```

#### Step 2: ⚠️ 如果有多个候选字段，必须问用户！

```groovy
// ⭐ 不要自己选一个，而是列出所有选项等待用户确认

QueryTemplate queryTemp = QueryTemplate.AND([
    // ⚠️ TODO: 请指定使用哪个字段？
    // 候选字段列表:
    //   - display_support_cost__c (number): 标准金额（元）
    //   - standard_amount_per_event__c (quote): 标准金额（元/每场）  
    //   - field_19Fn6__c (currency): 单天申请费用
    // "{请选择}": QueryOperator.EXISTS(true)
])
```

#### Step 3: 用户确认后，再修正代码

```groovy
// ✅ 用户确认后，删除 TODO 注释，填入正确的字段
"fashion_brand__c": QueryOperator.EXISTS(true)  // 用户指定的字段
```

---

## 🔧 实际操作模板

### 生成代码前的检查清单

每次生成涉及数据库操作的代码前，**必须执行以下检查**:

```bash
# 1. 确认对象 API Name 和包含的所有字段
# 打开 .sharedev/object/objects.md 找到目标对象
# 打开 .sharedev/object/<对象名>.md 查看所有字段

# 2. 如果有 Option 类型字段，查看选项值配置
# 在对象文件中查看字段的选项值列表

# 3. 记录关键字段的类型
# - text → String
# - number/currency → Double/BigDecimal
# - date → Date
# - object_reference → Map/String
# - select_one → String (value!)
# - select_many → List<String>
```

### 代码中的强类型声明模板

```groovy
// ========================================
// 字段定义（从数据字典获取类型）
// ========================================
// 数据字典日期：2026-03-09
// 对象：display_fee_standard__c (72 个字段)
// 关键字段类型:
//   - store_name__c: object_reference
//   - month__c: date
//   - customer_application_statu__c: select_one → String

String activeApplyObjApi = "display_fee_standard__c"

// Option value（必须是 String）
// 选项配置：{"审批驳回":["3"],"审批通过":["2"],"审批中":["1"]}
String approvedStatusValue = "2"  // ✅ String 类型

String targetMonth = context.params["targetMonth"] as String  // "yyyy-MM" 格式

// ========================================
// QueryTemplate 构建
// ========================================
QueryTemplate queryTemp = QueryTemplate.AND([
    "month__c": QueryOperator.EQ(targetMonth),  // date 字段 + String 参数 ✅
    "customer_application_statu__c": QueryOperator.EQ(approvedStatusValue),  // select_one + String ✅
    
    // ⚠️ TODO: 需要杨亚兴确认——哪个字段代表条件 X?
    // 候选字段列表:
    //   - field_a__c (type): 描述 A
    //   - field_b__c (type): 描述 B
    // "{TODO}": QueryOperator.EXISTS(true)
])
```

---

## 📊 常见错误修复对照表

| 错误写法 | 问题 | 正确写法 |
|---------|------|---------|
| `display_fee_standard__c` (guess) | 字段不存在 | 查数据字典确认 |
| `Integer status = "2"` | Option value 是 String | `String status = "2"` |
| `EQ("审批通过")` | 用了 label | `EQ("2")` (option value) |
| `def amount = map["cost"]` | 缺少类型声明 | `Double amount = map["cost"] as Double` |
| 多个候选字段自己选一个 | 未和用户确认 | 列出所有选项 + TODO 待确认 |

---

## 🎯 总结：六大不准原则

1. **不准猜 Option Value** → 必须查数据字典列 11，提取 JSON 配置
2. **不准猜字段类型** → 必须查数据字典列 4 (field_type)
3. **不准猜字段存在性** → 必须用脚本列出对象的所有字段
4. **不准擅自选择业务字段** → 有多个候选字段时必须问用户！
5. **不准用 def 绕过类型检查** → 所有变量必须声明强类型！
6. **不准用 instanceof 判断类型** → object_reference 直接 `as String`！

违反任一条都可能导致代码无法运行或业务逻辑错误！

---

---

## 🚨 第零条铁律：大数据量查询必须用 SQL+Consumer

### ❌ 错误示范（我已犯过）

```groovy
// ❌ 用 find 只查前 10 条数据！
def (Boolean error, QueryResult result, String msg) = Fx.object.find(
    "display_fee_standard__c",  // 大数据量对象！
    FQLAttribute.builder().build()
)
List dataList = result["dataList"] as List
// 最多返回 10 条！不够！
```

### ✅ 正确做法

```groovy
// ⭐ 大数据量对象必须用 SQL + Consumer 分批处理
String sql = "SELECT field_a, field_b FROM large_object WHERE ..."

Consumer<List> processor = { List batch ->
    batch.each { record ->
        Map recordMap = record as Map  // ✅ dataList 每个元素都是 Map
        Object value = recordMap["field_a"]  // ✅ 强类型声明，不用 def!
        // ... 处理逻辑
    }
}

Fx.object.select(sql, SelectAttribute.builder().paginationOptimization(true).build(), processor)
```

### ⚠️ 必须确认的问题

**生成代码前必须先问用户**:
1. 这个对象的总数据量大概是多少？
2. 每月新增多少条记录？
3. 本次查询可能涉及多少条数据？

**判断标准**:
- < 1000 条：可以用 `find` / `findByIds`
- > 1000 条：**必须用 `select` + Consumer**
- 不确定：**问用户！或者默认按大数据量处理**

### 🔍 QueryResult.dataList 的正确遍历方式

```groovy
def (Boolean error, QueryResult result, String msg) = Fx.object.find(...)

List dataList = result["dataList"] as List  // ✅ 这是 JSON 数组

// ❌ 错误写法
dataList.each { item ->  // def 绕过类型检查
    def value = item["field"]  // 双重 def!
}

// ✅ 正确写法
dataList.each { record ->
    Map recordMap = record as Map  // ✅ as Map
    
    // 强类型声明
    String strField = recordMap["str_field"] as String
    Integer intField = recordMap["int_field"] as Integer
    Object objRef = recordMap["object_ref"]  // object_reference 可能是 Map 或 String
    
    if (objRef instanceof Map) {
        String refId = ((Map) objRef)[("_id")] as String
    }
}
```

---

**维护者**: 杨亚兴  
**上次更新**: 2026-03-09 18:40  
**版本**: 1.0.2 (新增：大数据量查询规则 + QueryResult 遍历规范)
