> ⚠️ **DEPRECATED (2026-03-10)**: 本文件已合并到新结构中
> - **查询模板** → 请查看 [CODE-PATTERNS.md](./CODE-PATTERNS.md)
> - 此文件仅用于历史记录参考

---

# FQL 查询最佳实践 (2026 标准)


## ⚠️ 关键参数配置 - 极易出错!

### 1. limit 参数 - 必须显式设置!

```groovy
// ❌ 错误示范：不传 limit
def(err, result, msg) = Fx.object.find("Obj", fql, 
    SelectAttribute.builder().build()
)  // ⚠️ 默认只返回 10 条！容易遗漏数据!

// ✅ 正确做法：明确设置 limit(100)
def(err, result, msg) = Fx.object.find("Obj", fql, 
    SelectAttribute.builder()
        .limit(100)           // ✨ 每次最多 100 条
        .needCount(false)     // 不需要统计总数时关闭
        .build()
)
```

**推荐值**:
- **前端函数/UIEvent/前验证**: `limit(100)` 
- **后台任务/计划任务**: `limit(500)` (最大值)

---

### 2. dbSource 参数 - 谨慎使用!

```groovy
// ❌ 错误场景：在前端函数中走数据库直连
UIEvent event = UIEvent.build(context) {
    def(e,r,m) = Fx.object.find(..., 
        SelectAttribute.dbSource(true)  // ⚠️ 增加 DB 压力！
    )
}

// ✅ 正确场景 1: 前端函数走缓存层 (推荐!)
Map data = context.data
def(e,r,m) = Fx.object.find(..., 
    SelectAttribute.builder()
        .limit(100)              // 限制数量
        .build()                 // 不传 dbSource → 走缓存
)

// ✅ 正确场景 2: 后台任务才用 dbSource(true)
PlnTask_scheduledJob {
    def(e,r,m) = Fx.object.find(..., 
        SelectAttribute.builder()
            .dbSource(true)      // ✨ 需要实时数据
            .limit(500)          // 后台可设更大
            .build()
    )
}
```

**使用原则表**:

| 函数类型 | dbSource 设置 | 理由 |
|----------|-------------|------|
| `UIEvt_*` / `Import_*` / 前验证 | ❌ **不传** | 走缓存，性能好 |
| `PlnTask_*` (计划任务) | ✅ **true** | 需要实时数据 |
| `Btn_*` (按钮触发) | ❌ **不传** | 走缓存即可 |
| `Workflow_*` / 审批流程 | ⚠️ **视情况** | 如需最新数据则传 true |
| `*Handler` (异步队列) | ✅ **true** | 后台处理，需要准确数据 |

---

## 📊 完整示例对比

### ❌ 旧代码模式 (有隐患)

```groovy
// 问题 1: 没传 limit，默认 10 条可能不够
// 问题 2: dbSource=true 在前验证中不必要

List items = data["subTable"] as List  // 从 context 获取子表
if(items.size() > 0){...}

def(e,r,m) = Fx.object.find("SubObj", fql, 
    SelectAttribute.dbSource(true).build()  // ⚠️ 增加了不必要的 DB 压力
)
```

### ✅ 新标准模式 (推荐)

```groovy
// Step 1: FQL 查询子表 (不走 context.data)
String mainRecordId = context.recordId as String

def(boolean error, FindResult result, String errorMsg) = Fx.object.find(
    "SubObjectApiName",
    FQLAttribute.builder()
        .columns(["_id", "field_a__c"])               // 明确字段
        .queryTemplate(QueryTemplate.AND([
            ["master_id": QueryOperator.EQ(mainRecordId)]
        ]))
        .build(),
    SelectAttribute.builder()
        .limit(100)                 // ⭐ 关键！避免默认 10 条的限制
        .needCount(false)           // 不需要统计
        .build()                    // ⭐ 不传 dbSource，走缓存
)

List subData = result.dataList ?: []
log.info("查询到 ${subData.size()} 条记录")
```

---

## 🎯 快速检查清单

在每次写 FQL 查询后自查:

- [ ] ✅ 是否设置了 `.limit(100)`？
- [ ] ✅ 是否需要 `.needCount(false)` 节省资源？
- [ ] ✅ dbSource 是否只在后台任务中使用？
- [ ] ✅ columns 是否只包含需要的字段？
- [ ] ✅ 是否通过 `master_id` 关联主从表？

---

## 🔧 常见错误修复

### 错误 1: 查询结果只有 10 条

```groovy
// ❌ 错误
def(e,r,m) = Fx.object.find("Obj", fql, SelectAttribute.builder().build())
// r.dataList.size() 只有 10，明明应该有 50 条!

// ✅ 修复
def(e,r,m) = Fx.object.find("Obj", fql, 
    SelectAttribute.builder()
        .limit(100)  // ← 加上这个!
        .build()
)
```

### 错误 2: 前端函数执行慢

```groovy
// ❌ 错误
UIEvent build(...) {
    Fx.object.find(..., SelectAttribute.dbSource(true))  // 直连 DB
}

// ✅ 修复
UIEvent build(...) {
    Fx.object.find(..., SelectAttribute.limit(100))  // 走缓存
}
```

### 错误 3: 批量创建超过限制

```groovy
// ❌ 错误：一次性创建 800 条会失败
Fx.object.batchCreate("Obj", records_of_800_items)

// ✅ 修复：分批创建
for(int start=0; start<records.size(); start+=500){
    int end = Math.min(start+500, records.size())
    List batch = records.subList(start, end)
    Fx.object.batchCreate("Obj", batch)
}
```

---

## 📚 相关文档

- [code-patterns.md](./code-patterns.md) - Groovy 核心模式库
- [latest-api-signatures.md](./latest-api-signatures.md) - API 官方签名
- [object-reference-template.groovy](../assets/templates/object-reference-template.groovy) - 对象关联处理
