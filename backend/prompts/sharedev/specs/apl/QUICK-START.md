# Quick Start - APL 函数开发五步法

> **最后更新**: 2026-03-18  
> **维护者**: 杨亚兴 + Claw  
> **版本**: v2.0 (场景驱动版)

---

## 🚨🚨🚨 铁律：数据字典优先原则 ⭐⭐⭐⭐⭐

### ⚠️ 如果用户提供了数据字典文件，**绝对不能凭空猜测字段名！**

**正确流程：**
```bash
# Step 1. 查看对象索引文件，找到目标对象
# 打开 .sharedev/object/objects.md 查看所有可用对象

# Step 2. 查看具体对象的字段信息
# 例如查看订单对象：打开 .sharedev/object/SalesOrderObj.md
# 例如查看客户对象：打开 .sharedev/object/AccountObj.md

# Step 3. 从对象信息文件中提取准确的 API Name
#   - 对象 apiName: SalesOrderObj (不是 OrderObj!)
#   - 字段 apiName: order_amount (不是 total_amount_cny__c!)

# Step 4. 用查到的真实值替换代码中的占位符
Fx.object.findOne("SalesOrderObj", ...)  # ✅ 正确
```

**❌ 错误示范（2026-03-17 血的教训）：**
- ❌ `"OrderObj"` → 实际是 `"SalesOrderObj"`
- ❌ `"total_amount_cny__c"` → 实际是 `"order_amount"`
- ❌ `"CustomerObj"` → 实际是 `"AccountObj"`

**核心原则**：
> **"有数据字典必须先查！不要猜！不能臆造！"**

---

## 📋 五步法标准流程

### Step 1️⃣: 检查是否已有类似实现（最关键！）

```bash
# 在写任何代码之前必须执行：
ls ./examples/ | grep -iE "customer|department|account"

# 搜索相似逻辑
grep -r "sellers__c\|data_own_department\|sales_area__c" ./examples/
```

**如果发现相似文件 → 问用户**：
> "这个需求已有实现了 (`Pln_StoreAreaDepartmentSync.groovy`)，需要修改它吗？还是创建新版本？"

**目的**：避免重复造轮子！（2026-03-12 的教训：创建了重复文件）

---

### Step 2️⃣: 理解需求并查对象信息

#### 2.1 确认关键信息
- **触发类型**：按钮 / 工作流 / 计划任务 / UI 事件 / 导入验证
- **涉及对象**：客户 (AccountObj)? 订单 (SalesOrderObj)? 商品?
- **数据量**：<1000 / 1000-10000 / >10000？

#### 2.2 查对象信息文件（如果有）
```bash
# 方式 A: 查看对象索引，找到目标对象
# 打开 .sharedev/object/objects.md 查看所有可用对象列表

# 方式 B: 查看具体对象的所有字段
# 打开对应的对象文件，例如：
#   - .sharedev/object/AccountObj.md    (客户对象)
#   - .sharedev/object/SalesOrderObj.md (订单对象)

# 方式 C: 搜索特定字段
# 在对象文件中搜索字段名称，例如搜索 "record_type"
```

**从对象信息文件中提取**：
| 信息类型 | 说明 |
|---------|------|
| 对象 apiName | 文件名即为对象 apiName，如 `AccountObj` |
| 字段 apiName | 文件中列出的字段 apiName，如 `sales_area__c` |
| 字段类型 | 文件中标注的类型，转 Groovy 类型（查 DATA-TYPE-MAPPING.md） |
| 选项值 | 如果是 select_one/select_many，从文件中的选项列表取值 |

---

### Step 3️⃣: 确定查询方式和 Context 取值

#### 3.1 根据数据规模选择方法

| 数据规模 | 方法 | 必要参数 | 参考文件 |
|---------|------|---------|---------|
| < 1,000 条 | findByIds / findOne | - | Btn_*.groovy |
| 1,000 - 10,000 条 | select + Consumer | pageSize(500) | Pln_*.groovy |
| > 10,000 条 | VIP 异步队列 | - | *_Handler.groovy |

**必设参数**：`limit` 或 `pageSize`（默认只返回 10 条！）

#### 3.2 根据触发类型取 Context

| 触发类型 | 前缀标识 | 数据获取 | 数据类型 | 示例 |
|---------|---------|---------|---------|------|
| 按钮触发 | Btn_* | `context.data` | Map | Btn_7mYmQ.groovy |
| 流程触发 | Proc_* | `context.data` | Map | Proc_generateCustomerQRCode.groovy |
| UI 事件 | UIEvt_* | `context.data` | Map | UIVt_YBNCN.groovy |
| 工作流 Handler | *_Handler (绑定对象) | `context.data` | Map | 已验证 |
| 异步队列回调 | *_Handler | `params["dataList"]` | List<Map> | ActivityRequestDetailsHandler.groovy |
| 计划任务（绑定对象）| PlnTask_* | `context.objectIds` | List<String> | PlnTask_j8Rkn.groovy |
| 计划任务（不绑定对象）| PlnTask_* | 直接 select + Consumer | - | sync_business.groovy |

**快速记忆口诀**：
> "Button/Process/UI Event → data 单条  
>  Planed Task → objectIds 列表  
>  异步队列 → params 里取  
>  计划不绑定 → select 自己跑"

---

### Step 4️⃣: 套用正确 Pattern

根据业务场景选择对应模板：

#### 场景 A: 前验证函数
**参考文件**: `Vld_AccountCreate_SetOwnerToSystem.groovy`

```groovy
// 通用结构
Map dataMap = context.data as Map

// 修改字段
dataMap.put("some_field__c", newValue)

// 返回验证结果
return ["error": false, "errorMessage": "成功"]
```

#### 场景 B: 部门层级判断
**参考文件**: `Pln_StoreAreaDepartmentSync.groovy`

```groovy
// 查询部门（必须包含 dept_parent_path）
def (Boolean err, List depts, String msg) = Fx.object.findByIds("DepartmentObj",
    [deptId],
    FQLAttribute.builder()
        .columns(["_id", "name", "dept_parent_path"])
        .build(),
    SelectAttribute.builder().build())

// 解析层级
String deptPath = deptInfo["dept_parent_path"]  // 例如："999999.1036.2597.2612"
List pathList = deptPath.split("[./]") as List   // [999999, 1036, 2597, 2612]
int deptLevel = pathList.size()                    // 4 级部门

// 获取第 N 级部门 ID（索引从 0 开始）
String level3DeptId = pathList.get(2)  // 第 3 级部门
```

#### 场景 C: 大数据量批量处理
**参考文件**: `Pln_BatchUpdateCustomerDepartmentSync.groovy`

```groovy
def pageSize = 500

Fx.object.select(sql, 
    SelectAttribute.builder().pageSize(pageSize).build(),
    { result ->
        List dataList = result.result as List
        
        Map batchUpdateMap = [:]
        dataList.each { item ->
            String id = item["_id"]
            Map updateData = [:]
            updateData.put("field__c", value)
            batchUpdateMap.put(id, updateData)
        }
        
        // 批量更新（会触发工作流）
        Fx.object.batchUpdate("AccountObj", batchUpdateMap, ["field__c"])
    }).result()
```

#### 场景 D: 对象关联查询
**参考文件**: 多个 `Proc_*` 文件

```groovy
// 三元组解构（不要用 def!）
def (Boolean error, QueryResult qr, String msg) = Fx.object.select(sql, attr, null)

if (!error && qr["dataList"] != null && !qr["dataList"].isEmpty()) {
    String recordId = qr["dataList"][0]["_id"]
    // 使用 recordId 继续操作...
}
```

---

### Step 5️⃣: 生成代码并遵守八条铁律

#### 5.1 八条铁律（来自 CORE-RULES.md）

1. ✅ option value 必须从对象信息文件的选项列表获取
2. ✅ object_reference 直接 `as String`，禁止 `instanceof`
3. ✅ department 用 `dept_parent_path` 分割，禁止递归父级
4. ✅ 多个候选字段标注 TODO 问用户
5. ✅ FQL 必须设置 limit/pageSize
6. ✅ API 返回值三元组解构：`(Boolean error, Data, String msg)`
7. ✅ 优先用 FQL 不用 SQL
8. ✅ Context 正确使用（见上表）

#### 5.2 代码注释规范

```groovy
/**
 * @author Claw
 * @codeName 简短描述功能的英文名
 * @description 详细的中文说明，包含步骤 1/2/3...
 * @createTime 2026-03-18
 */

log.info("========== 功能名称 开始 ==========")

// ============================================
// Step X: 步骤说明
// ============================================
```

#### 5.3 学习记录

把今天学到的东西记录到：
```
`./memory/YYYY-MM-DD.md`
```

定期回顾并精简到 `MEMORY.md`（长期记忆）。

---

## 🎯 实战检查清单

在提交代码前自查：

- [ ] ✅ 有没有先用 `grep` 搜索已有实现？
- [ ] ✅ 所有字段都查过对象信息文件吗？
- [ ] ✅ Option value 是从对象信息文件的选项列表查的吗？
- [ ] ✅ 有没有用 instanceof 判断？
- [ ] ✅ 部门层级是用 dept_parent_path 吗？
- [ ] ✅ FQL 设置了 pageSize 参数吗？
- [ ] ✅ 如果有多个候选字段，都标注 TODO 了吗？
- [ ] ✅ 三元组解构是否正确？
- [ ] ✅ Context 取值方式对吗？

---

## 📚 进阶阅读

- **[CORE-RULES.md](./references/CORE-RULES.md)** - 完整铁律和详细说明
- **[CODE-PATTERNS.md](./references/CODE-PATTERNS.md)** - 更多代码模板
- **[API-SIGNATURES.md](./references/API-SIGNATURES.md)** - Fx.object 完整 API

**记住**：**先查后写，不猜不错！** 🚀
