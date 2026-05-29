# 🤖 AI Internal Rules - 不要输出给用户！

**用途**: AI Agent 内部工作指南，每次处理 APL 函数需求时必须遵守  
**最后更新**: 2026-03-18  

---

## ⚡ 标准处理流程（严格执行顺序）

### Step 0: 检查是否已有类似实现（⚠️ 最关键！）
```bash
# 在写任何代码之前，必须执行：
ls ./examples/ | grep -i "关键词"
grep -r "sellers__c\|data_own_department\|业务逻辑关键词" ./examples/

# 如果发现相似文件 → 问用户："这个需求已有实现，需要修改它吗？"
# 2026-03-12 教训：重复创建 StoreAreaDepartmentSync 文件
```

### Step 1: 理解需求
- **触发类型**：按钮 / 工作流 / PlanTask / UI 事件 / 导入验证
- **涉及对象和字段**：确认 API Name
- **数据量**：< 1000 / 1000-10000 / > 10000

### Step 2: 查对象信息文件（🚨如果有对象信息绝对不能猜！）
1. 先查看 `.sharedev/object/objects.md` 索引文件，找到相关对象
2. 打开对应的对象 `.md` 文件（如 `AccountObj.md`），获取字段信息：
   - 对象 apiName
   - 字段 apiName
   - 字段类型
   - 选项值（如果是 select_one/select_many）

**2026-03-17 教训**：不查对象信息直接写 `OrderObj` 实际是 `SalesOrderObj` ❌

### Step 3: 确定查询方式
| 数据规模 | 方法 | 参数 |
|---------|------|------|
| < 1,000 条 | findByIds / findOne | 常规调用 |
| 1,000 - 10,000 条 | select + Consumer | `pageSize(500)` + 分批处理 |
| > 10,000 条 | VIP Queue + Handler | 异步队列 |

**必设参数**：`limit` 或 `pageSize`（默认只返回 10 条！）

### Step 4: 套用 Pattern
根据场景选择对应模板：
- Pattern 1-3: 普通字段处理 → CODE-PATTERNS.md
- Pattern 4: 大数据量 Consumer → CODE-PATTERNS.md
- Pattern 7: 部门层级判断 → CODE-PATTERNS.md

### Step 5: Context 正确使用
| 触发类型 | 取值方式 | 数据类型 |
|---------|---------|---------|
| Btn_* (按钮) | `context.data` | Map |
| Proc_* (流程) | `context.data` | Map |
| UIEvt_* (UI 事件) | `context.data` | Map |
| *_Handler (绑定对象) | `context.data` | Map |
| *_Handler (异步队列) | `params["dataList"]` | List<Map> |
| PlnTask_* (绑定对象) | `context.objectIds` | List<String> |
| PlnTask_* (不绑定对象) | 直接 `select` + Consumer | - |

**口诀**：Button/Process/UI Event → data 单条；Planed Task → objectIds 列表；异步队列 → params 里取

### Step 6: 遵守八条铁律
查看 `references/CORE-RULES.md`，特别注意：
1. ✅ 三元组解构：`(Boolean error, Map data, String msg)`
2. ✅ option value 从对象信息文件获取
3. ✅ object_reference 直接 as String，禁止 instanceof
4. ✅ department 用 dept_parent_path 分割，禁止递归父级
5. ✅ FQL 必须设置 limit/pageSize
6. ✅ 多个候选字段标注 TODO 问用户

### Step 7: 输出代码
按标准格式生成，包含：
- 顶部注释块（codeName、description、createTime）
- Step 编号注释
- 详细 log.info 日志

### Step 8: 更新 MEMORY.md
把今天学到的/犯的错记录到：
- `./memory/YYYY-MM-DD.md`
- 定期精简到 `MEMORY.md`

---

## 🔴 常见错误速查（遇到报错先查这里）

### 错误 1: context.recordId 不存在
```groovy
// ❌ 错
String id = context.recordId

// ✅ 对
String id = context.data["_id"] as String
```

### 错误 2: 忘记设置 limit，只查到 10 条
```groovy
// ❌ 错
Fx.object.select(sql, ...)  // 默认 10 条！

// ✅ 对  
SelectAttribute.builder()
    .pageSize(500)  // 明确指定数量
    .build()
```

### 错误 3: department 递归遍历找层级
```groovy
// ❌ 错：递归查几十次 parent_id
while (parent != null) { level++; ... }

// ✅ 对：一次查询解决
String path = deptInfo["dept_parent_path"]
List levels = path.split("[./]")
int level = levels.size()
```

### 错误 4: Fx.object 返回值搞错
```groovy
// ❌ 错
if (result.isError()) { ... }

// ✅ 对
def (Boolean err, Map data, String msg) = Fx.object.findOne(...)
if (err) { log.error(msg); }
```

### 错误 5: object_reference 用 instanceof
```groovy
// ❌ 错
if (objRef instanceof String) { ... }

// ✅ 对
String objId = objRef as String  // 直接强制转换
```

---

## 📂 精简后的文档结构

```
skills/apl-specs/
├── SKILL.md                    # 技能描述（元数据）
├── AI-RULES.md                # 🤖 AI 内部工作流（本文档）
├── QUICK-START.md             # 五步法（给人看的最简流程）
└── references/
    ├── CORE-RULES.md          # 🔴 八条铁律（最重要）
    ├── DATA-TYPE-MAPPING.md   # 类型映射表
    ├── CODE-PATTERNS.md       # 代码模板库
    ├── API-SIGNATURES.md      # Fx.object API 签名
    ├── api-pitfalls-2026.md   # 踩坑记录
    ├── attribute-classes-reference.md  # Attribute 类速查
    ├── prd-template.md        # 需求模板（可选）
    └── select-attribute-api.md  # 分页参数（可选）
└── archived/                  # 已过时的文档（不用看了）
```

---

## 🎯 每次开始前的自检清单

- [ ] 有没有先用 `grep` 搜索已有实现？
- [ ] 有没有查对象信息文件确认 API Name？
- [ ] 有没有问用户数据量大小？
- [ ] 有没有确认正确的 Context 取值方式？
- [ ] 有没有设置 pageSize/limit 参数？
- [ ] option value 是不是从对象信息文件取的？
- [ ] department 层级是不是用 dept_parent_path？
- [ ] API 返回值是不是三元组解构？

**如果以上任意一项不确定 → 停下来查证！**

---

## 💀 真实踩坑案例（2026-03）

| 日期 | 错误 | 教训 |
|------|------|------|
| 03-12 | 没发现已有 `Pln_StoreAreaDepartmentSync.groovy` 又创建了新的 | 必须先 grep 搜索！ |
| 03-13 | 计划任务误用 `params["dataList"]` | PlanTask 要用 `context.objectIds` |
| 03-13 | 客户对象名写成 `CustomerObj` | 实际是 `AccountObj`，查对象信息！ |
| 03-13 | 写个 class extends 的语法 | Groovy 没有这种模式，看真实项目 |
| 03-17 | 凭感觉写 `OrderObj.total_amount_cny__c` | 实际是 `SalesOrderObj.order_amount`，查对象信息！ |

---

## 🧠 核心记忆

> **"先查后写，不猜不错"**  
> **"有对象信息必须先查！没有对象信息再问人！不能凭空捏造！"**  
> —— 2026-03-17 血的教训

> **"FQL 默认 10 条，必须设 pageSize"**  
> **"Context 别乱用，按钮是 data，任务是 IDs"**  
> **"department 看路径，递归是死路"**

---

**本文件仅用于 AI 内部参考，不要输出给用户。**
