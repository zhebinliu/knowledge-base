# Core Rules - 纷享销客 APL 开发核心规则

> **重要**: 违反任何一条都会导致代码无法运行或业务逻辑错误！  
> **维护者**: 杨亚兴 + Claw  
> **最后更新**: 2026-03-18 14:55  
> **版本**: v2.0 (新增禁止行为清单)  
> **来源**: 基于蒙牛项目真实踩坑教训总结（2026-03-09 ~ 2026-03-17）

---

## ⚠️🚫 禁止行为清单（发现立即停止！）

**遇到以下情况必须向用户确认，绝对不能继续写代码：**

### 🚫 P0 级禁止（会直接报错或数据错误）

| 禁止项 | 错误示例 | 正确做法 | 后果 |
|--------|---------|---------|------|
| **不查字典猜对象名** | `Fx.object.findOne("OrderObj", ...)` | 实际是 `"SalesOrderObj"` | 查询失败 |
| **不查字典猜字段名** | `item["total_amount_cny__c"]` | 实际是 `"order_amount"` | 取不到值 |
| **乱用 Context** | `context.recordId` | 应该是 `context.data["_id"]` | NPE 错误 |
| **部门层级递归** | `while(parent != null){...}` | 应该用 `dept_parent_path.split()` | API 超时 |
| **FQL 不设 pageSize** | `select(sql, null, consumer)` | 默认只返回 10 条 | 漏数据 |

### 🚫 P1 级禁止（会导致类型错误或逻辑问题）

| 禁止项 | 错误示例 | 正确做法 | 后果 |
|--------|---------|---------|------|
| **option value 当数字** | `Integer status = 2` | `String status = "2"` | 比较失败 |
| **object_ref 用 instanceof** | `if(objRef instanceof String)` | `String id = objRef as String` | 编译失败 |
| **API 返回值用 isError()** | `if(result.isError())` | `def(e,d,m) = ... if(e){}` | 找不到方法 |
| **凭空捏造语法** | `class extends BaseFxFunction` | Groovy 没有这种模式 | 语法错误 |

### 🚫 P2 级禁止（最佳实践层面）

| 禁止项 | 说明 |
|--------|------|
| **在 main 分支直接修改代码** | 必须 checkout 新分支 |
| **删除不确定用途的代码** | 宁可保留也不要删 |
| **重构不理解的复杂逻辑** | 只做明确需求的功能 |
| **假设 record_type 的值** | 必须从数据字典列 11 获取 option value |

---

## 🔴 八条铁律（绝对禁止违反！）

### 铁律 1️⃣：Option Value 永远是 String

**❌ 禁止行为:**
```groovy
// ❌ 把 option value 当成数字
Integer status = 2

// ❌ 凭空猜测 format
String status = "normal"

// ❌ 直接用 label
String status = "审批通过"
```

**✅ 正确做法:**
```groovy
// Step 1: 查数据字典列 11 的 JSON 配置
// {"审批驳回":["3"],"审批通过":["2"],"审批中":["1"]}

// Step 2: 用 String 类型声明（即使看起来像数字！）
String approvedStatusValue = "2"  // ✅ 必须是 String!

// Step 3: 查询时用 EQ(String)
QueryTemplate queryTemp = QueryTemplate.AND([
    "customer_application_statu__c": QueryOperator.EQ(approvedStatusValue)
])
```

**关键点**: Option value 在数据库中存储为 **String**，即使是 `"1"`, `"2"` 也要用 `String` 类型

---

### 铁律 2️⃣：字段数据类型必须从数据字典查

**❌ 不准凭经验推断！每次遇到新字段时必须执行：**

```bash
# 1. 查看对象信息文件
# 对象信息文件位于 .sharedev/object/ 目录下
# - objects.md 是对象索引文件，列出所有对象
# - 每个对象一个 .md 文件，包含字段详细信息

# 2. 查找字段方法：
#    方法一：在 objects.md 中找到目标对象，打开对应的 .md 文件
#    方法二：直接打开 .sharedev/object/<对象名>.md 文件
#    方法三：在对象文件中搜索字段的 Api Name

# 3. 根据 DATA-TYPE-MAPPING.md 转换为正确 Groovy 类型
```

**常见类型速查**（完整表见 [DATA-TYPE-MAPPING.md](./DATA-TYPE-MAPPING.md)）:

| 数据字典类型 | Groovy 类型 | 示例 |
|------------|-----------|------|
| `text`, `auto_number` | `String` | `String code = map["code"] as String` |
| `number`, `currency` | `Double`/`BigDecimal` | `Double amount = map["cost"] as Double` |
| `date` | `Date` | `Date month = Date.of("2024-03")` |
| `select_one` | `String` ⭐ | `String status = map["status"] as String` |
| `select_many` | `List<String>` ⭐ | `List<String> tags = map["tags"] as List` |
| `multi_select_option` | `List` ⭐ | see below |
| `object_reference` | `String` ⭐ | `String refId = map["ref"] as String` |
| `object_reference_many` | `List<Map>` ⭐ | see mapping.md |

---

### 铁律 3️⃣：不允许猜想字段是否存在

**❌ 禁止**: 对象名是 X 就以为有字段 X

**✅ 必须**: 查看对象信息文件列出对象的所有字段

```bash
# 对象信息文件位于 .sharedev/object/ 目录下
# 每个对象一个 .md 文件，包含完整的字段列表

# 示例：查看 display_fee_standard__c 对象的字段
# 打开文件：.sharedev/object/display_fee_standard__c.md
# 文件中包含字段表格，列出所有字段的 Api Name、类型、描述等信息

# ❌ display_fee_standard__c 字段不存在（曾犯的错误！）
# ✅ display_support_cost__c (number): 标准金额（元）
```

**如果有多个候选字段，必须在代码中标注 TODO 并问用户确认哪个符合业务需求！**

---

### 铁律 4️⃣：不准擅自选择业务字段

**❌ 严重错误案例：**
- 查到多个候选字段就自己选一个写进代码
- 即使字段真实存在，**业务逻辑也可能选错**

**✅ 正确做法：**
```groovy
// ⭐ 列出所有选项，等待用户确认
// ⚠️ TODO: 需要杨亚兴确认——哪个字段代表"有陈列费用"?
// 数据字典中的候选字段:
//   - display_support_cost__c (number): 标准金额（元）
//   - standard_amount_per_event__c (quote): 标准金额（元/每场）  
//   - field_19Fn6__c (currency): 单天申请费用
```

---

### 铁律 5️⃣：不准用 def 绕过类型检查

**❌ 禁止**: `def storeRef = map["field"]`

**✅ 正确做法**:
- **知道类型**: 直接强类型 `String name = map["name"] as String`
- **不知道类型时**: 先查 DATA-TYPE-MAPPING.md，确定后再写

---

### 铁律 6️⃣：严禁 instanceof 类型判断

**🚨 这是最严重的错误！绝对禁止！**

```groovy
// ❌ 绝对禁止! 写了整整一晚上都被指出错了!
Object storeRef = recordMap["store_name__c"]
if (storeRef instanceof Map) {
    storeId = ((Map) storeRef)[("_id")] as String
} else if (storeRef instanceof String) {
    storeId = storeRef as String
}

// ✅ 正确做法 (object_reference 就是关联对象 ID，直接 as String!)
String storeId = recordMap["store_name__c"] as String
```

**核心理解**: `object_reference` 字段存储的是**关联对象的主键 ID**，API 返回的就是这个 String 类型的 ID，**绝对不是 Map 或其他类型**！

---

### 铁律 7️⃣：部门层级必须用 dept_parent_path (2026-03-10 新增)

**❌ 禁止**: 递归遍历 `parent_id` 父级来找层级

**✅ 正确做法**:

```groovy
// 查询 DepartmentObj 时必须包含 dept_parent_path
FQLAttribute.builder()
    .columns(["_id", "name", "dept_parent_path"])  // 一定要有 dept_parent_path
    .build()

// 解析层级
String deptPath = deptInfo["dept_parent_path"]  // 格式：999999.1036.2597.2612
List pathList = deptPath.split("[./]") as List
int deptLevel = pathList.size()  // 4 级

// pathList[0] = 999999(根节点)
// pathList[1] = 一级部门
// pathList[2] = 二级部门  
// pathList[3] = 三级部门（第四级 = 大区）

// 获取第 N 级部门 ID:
String levelNDeptId = pathList.get(N - 1)  // N 从 1 开始计数
```

**为什么用这个方法：**
1. **性能高**：一次查询搞定，不用递归查几十次父级
2. **代码简洁**：不需要写复杂的递归函数
3. **统一标准**：项目中所有地方都这样写

**参考文件：**
- `./examples/Pln_StoreAreaDepartmentSync.groovy`

---

### 铁律 8️⃣：Context 使用规范 (2026-03-10 新增)

**❌ 禁止**: 凭空假设 context 属性存在

**错误案例**:
```groovy
// ❌ 不存在 context.recordId!
String customerId = context.recordId as String
```

**✅ 正确做法**: 按钮执行动作时用 `context.data["_id"]`

```groovy
// ✅ 按钮触发时
String recordId = context.data["_id"] as String

// ✅ 批量按钮触发时
context.dataList.each { item ->
    String id = item["_id"] as String
}
```

**⚠️ 重要提醒**:
1. `context.details` Debug 时最多 6 条，正常运行是全量数据 → **不要依赖 details 的数量**
2. Web 端空字段返回 `""`, 移动端/Server 返回 `null` → **双重判空更安全**
3. 异步字段（统计、计算、引用）可能不准确 → **建议 FQL 重查**

---

## ⚠️ 违规后果

| 违规项 | 后果 |
|-------|------|
| 猜 Option Value | 查询结果为空 |
| 不查字段类型 | 编译失败或运行时异常 |
| 猜想字段存在性 | 运行时抛异常（字段不存在） |
| 擅自选择业务字段 | 业务逻辑错误 |
| 用 def 绕过类型 | 丢失类型安全，潜在 bug |
| **用 instanceof** | **代码冗余且逻辑完全错误！** |
| 用 parent_id 递归找层级 | **性能差、代码复杂且不符合规范！** |
| **胡乱假设 context 属性** | **变量未定义，无法运行！** |

---

## 🔗 相关文档

- [QUICK-START.md](../QUICK-START.md) - 生成函数的标准流程
- [DATA-TYPE-MAPPING.md](./DATA-TYPE-MAPPING.md) - ⭐⭐⭐ 类型映射表（唯一依据！）
- [CODE-PATTERNS.md](./CODE-PATTERNS.md) - 常用代码模板
- [API-SIGNATURES.md](./API-SIGNATURES.md) - Fx.object 官方方法签名（含 remove/delete）
