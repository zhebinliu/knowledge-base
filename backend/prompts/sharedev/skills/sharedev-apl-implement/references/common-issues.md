# APL常见问题和解决方案

## 平台限制问题

### 1. API调用次数超限

**问题描述**: 
```
Fx.object调用次数超过300次限制
```

**原因**: 
- 循环中调用API
- 未使用批量操作
- 重复查询相同数据

**解决方案**:

```groovy
// ❌ 错误: 循环调用
dataList.each { item ->
    Fx.object.create("AccountObj", item, CreateAttribute.builder().build())
}

// ✅ 正确: 批量操作
Fx.object.batchCreate("AccountObj", dataList, CreateAttribute.builder().build())

// ✅ 正确: 使用缓存避免重复查询
def cacheKey = "account_${accountId}"
def cachedData = Fx.cache.get(cacheKey)
if (!cachedData) {
    cachedData = Fx.object.findById(...)
    Fx.cache.set(cacheKey, cachedData, 3600)
}
```

### 2. 执行时间超限

**问题描述**: 
```
按钮执行时间超过20秒限制
```

**原因**: 
- 逻辑过于复杂
- 调用外部API响应慢
- 处理大量数据

**解决方案**:

```groovy
// ✅ 方案1: 优化逻辑,减少不必要的操作
// ✅ 方案2: 使用异步处理
// ✅ 方案3: 分批处理数据

// 分批处理示例
def batchSize = 100
def total = dataList.size()
def processed = 0

while (processed < total) {
    def batch = dataList.subList(processed, Math.min(processed + batchSize, total))
    processBatch(batch)
    processed += batchSize
    
    // 检查执行时间
    if (System.currentTimeMillis() - startTime > 15000) {
        log.warn("执行时间即将超限,已处理 ${processed}/${total}")
        break
    }
}
```

### 3. 内存超限

**问题描述**: 
```
内存使用超过256MB限制
```

**原因**: 
- 查询返回大量数据
- 处理大对象
- 内存泄漏

**解决方案**:

```groovy
// ❌ 错误: 一次性查询所有数据
def allData = Fx.object.find("LargeObject", FQLAttribute.builder().build(), ...)

// ✅ 正确: 分页查询
def pageSize = 100
def offset = 0
def hasMore = true

while (hasMore) {
    def result = Fx.object.find(
        "LargeObject",
        FQLAttribute.builder()
            .limit(pageSize)
            .skip(offset)
            .build(),
        ...
    )
    
    // 处理当前页后释放内存
    processData(result.dataList)
    result = null  // 释放引用
    
    hasMore = result.dataList.size() == pageSize
    offset += pageSize
}
```

## 错误处理问题

### 4. 错误信息不友好

**问题描述**: 
```
用户看到的错误信息是技术细节,难以理解
```

**错误示例**:
```groovy
if (error) {
    Fx.message.throwException(errorMessage)  // 直接抛出技术错误
}
```

**解决方案**:

```groovy
if (error) {
    log.error("详细错误: ${errorMessage}")  // 记录详细错误
    
    // 返回用户友好的错误信息
    if (errorMessage.contains("权限")) {
        Fx.message.throwException("您没有权限执行此操作")
    } else if (errorMessage.contains("不存在")) {
        Fx.message.throwException("数据不存在或已被删除")
    } else {
        Fx.message.throwException("操作失败,请联系管理员")
    }
}
```

### 5. 错误处理不完整

**问题描述**: 
```
部分API调用没有错误处理,导致异常中断
```

**错误示例**:
```groovy
def result = Fx.object.find(...)  // 没有错误处理
result.dataList.each { ... }
```

**解决方案**:

```groovy
def (Boolean error, QueryResult result, String msg) = Fx.object.find(...)

if (error) {
    log.error("查询失败: ${msg}")
    Fx.message.throwException("查询失败,请稍后重试")
}

if (!result.dataList || result.dataList.isEmpty()) {
    log.info("查询结果为空")
    return
}

result.dataList.each { ... }
```

## 数据处理问题

### 6. 空值导致异常

**问题描述**: 
```
NullPointerException: Cannot invoke method on null object
```

**错误示例**:
```groovy
def name = context.data.name  // 如果data为null会报错
```

**解决方案**:

```groovy
// 使用安全访问操作符
def name = context.data?.name ?: "默认名称"

// 显式检查
if (context.data?._id) {
    // 处理逻辑
} else {
    log.error("缺少必要参数: _id")
    return
}

// 使用Elvis运算符提供默认值
def phone = context.data?.phone?.trim() ?: ""
```

### 7. 字段类型错误

**问题描述**: 
```
ClassCastException: Cannot cast object to type
```

**原因**: 
- 字段类型与预期不符
- 未正确转换类型

**解决方案**:

```groovy
// 正确的类型转换
def amount = context.data?.amount as BigDecimal
def count = context.data?.count as Integer
def createTime = context.data?.create_time as Long

// 类型检查
if (amount instanceof BigDecimal) {
    // 处理逻辑
} else {
    log.error("字段类型错误: amount=${amount}, 类型=${amount?.getClass()}")
}

// 字段类型映射表
/*
| 字段类型 | APL类型 | 示例 |
|---------|---------|------|
| 文本字段 | String | "测试" |
| 数字字段 | Integer/BigDecimal | 100 |
| 日期字段 | Long (时间戳) | Date.now().toTimestamp() |
| 人员字段 | List<String> | ["1001", "1002"] |
| 附件字段 | List<Map> | [["filename": "test.pdf", "path": "..."]] |
| 单选字段 | String | "option1" |
| 多选字段 | List<String> | ["option1", "option2"] |
*/
```

### 8. 日期时间处理错误

**问题描述**: 
```
日期格式不正确或时间戳转换错误
```

**解决方案**:

```groovy
// 获取当前时间
def now = DateTime.now()
def today = Date.now()

// 时间戳转换
def timestamp = Date.now().toTimestamp()  // 获取时间戳
def date = Date.of(timestamp)              // 时间戳转Date

// 日期格式化
def formattedDate = date.format("yyyy-MM-dd")

// 日期计算
def tomorrow = date.plusDays(1)
def lastMonth = date.minusMonths(1)

// 日期间隔
def days = date1.daysBetween(date2)

// 时间戳字段赋值
Map data = [
    "create_time": Date.now().toTimestamp(),  // 日期时间字段
    "birth_date": Date.now().toTimestamp()    // 日期字段
]
```

## 闭包问题

### 9. 闭包中使用保留字

**问题描述**: 
```
Groovy语法错误: 闭包中不能使用owner, this, delegate
```

**错误示例**:
```groovy
dataList.each { item ->
    def currentOwner = this.owner  // 报错
    def currentThis = this         // 报错
}
```

**解决方案**:

```groovy
// 在闭包外获取需要的变量
def outerOwner = this.owner
def outerThis = this

dataList.each { item ->
    // 使用外部变量
    def currentOwner = outerOwner
    def currentThis = outerThis
}
```

### 10. 闭包中修改外部变量

**问题描述**: 
```
闭包中修改的变量在闭包外不生效
```

**错误示例**:
```groovy
def total = 0
dataList.each { item ->
    total += item.amount  // 可能不生效
}
```

**解决方案**:

```groovy
// 使用返回值
def total = dataList.sum { it.amount as BigDecimal }

// 或使用collect
def total = dataList.collect { it.amount as BigDecimal }.sum()

// 或使用inject
def total = dataList.inject(0) { acc, item ->
    acc + (item.amount as BigDecimal)
}
```

## HTTP调用问题

### 11. HTTP超时

**问题描述**: 
```
HTTP请求超时
```

**解决方案**:

```groovy
// 设置合理的超时时间
def (Boolean error, HttpResult result, String msg) = Fx.http.execute(
    HttpAttribute.builder()
        .url("https://api.example.com/data")
        .method("GET")
        .timeout(30000)  // 设置30秒超时
        .build()
)

// 添加重试机制
def maxRetry = 3
def retryCount = 0
def success = false

while (retryCount < maxRetry && !success) {
    def (error, result, msg) = Fx.http.execute(...)
    
    if (!error && result.statusCode == 200) {
        success = true
    } else {
        retryCount++
        log.warn("HTTP请求失败,重试 ${retryCount}/${maxRetry}")
        Thread.sleep(1000)  // 等待1秒后重试
    }
}

if (!success) {
    Fx.message.throwException("外部系统调用失败")
}
```

### 12. HTTP响应解析错误

**问题描述**: 
```
JSON解析失败或字段不存在
```

**解决方案**:

```groovy
// 安全解析JSON
def response
try {
    response = Fx.json.fromJson(result.content, Map) as Map
} catch (Exception e) {
    log.error("JSON解析失败: ${e.message}, 原始内容: ${result.content}")
    Fx.message.throwException("数据格式错误")
}

// 安全访问字段
def code = response?.code as String
def message = response?.message as String
def data = response?.data as Map

// 检查必要字段
if (!code) {
    log.error("响应缺少code字段: ${result.content}")
    Fx.message.throwException("响应格式错误")
}
```

## 性能问题

### 13. 查询性能慢

**问题描述**: 
```
查询响应时间过长
```

**解决方案**:

```groovy
// 1. 只查询需要的字段
Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])  // 只查询需要的字段
        .build(),
    ...
)

// 2. 使用索引字段查询
// 确保查询条件使用了索引字段

// 3. 限制返回数量
Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .limit(100)  // 限制返回数量
        .build(),
    ...
)

// 4. 使用findOne代替find
Fx.object.findOne(
    "AccountObj",
    FQLAttribute.builder()
        .queryTemplate(QueryTemplate.AND(["_id": QueryOperator.EQ(id)]))
        .build(),
    ...
)
```

### 14. 批量处理性能差

**问题描述**: 
```
批量处理大量数据时性能差
```

**解决方案**:

```groovy
// 分批处理
def batchSize = 100
def total = dataList.size()

for (int i = 0; i < total; i += batchSize) {
    def end = Math.min(i + batchSize, total)
    def batch = dataList.subList(i, end)
    
    // 批量操作
    Fx.object.batchCreate("AccountObj", batch, CreateAttribute.builder().build())
    
    log.info("已处理 ${end}/${total}")
}

// 使用闭包分页查询
Fx.object.select(
    "select _id, name from AccountObj where status = 'active'",
    SelectAttribute.builder().build(),
    { list ->
        list.each { item ->
            processItem(item)
        }
    }
)
```

## 调试问题

### 15. 如何调试APL代码

**问题描述**: 
```
不知道如何调试APL代码
```

**解决方案**:

```groovy
// 1. 使用日志调试
log.info("变量值: ${variable}")
log.info("数据快照: ${Fx.json.toJson(data)}")

// 2. 记录执行路径
log.info("进入分支A")
log.info("执行步骤1")

// 3. 记录耗时
def startTime = System.currentTimeMillis()
// ... 处理逻辑
log.lap("处理耗时: ${System.currentTimeMillis() - startTime}ms")

// 4. 使用try-catch捕获异常
try {
    // 可能出错的代码
} catch (Exception e) {
    log.error("异常详情: ${e.message}", e)
    log.error("堆栈: ${e.getStackTrace()}")
}
```
