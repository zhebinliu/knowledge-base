# APL最佳实践集合

## 代码输出目录最佳实践

### 1. 目录判断优先级

在生成APL代码文件时,应按以下优先级判断输出目录:

```
1. 首选: {项目根目录}/package/fx/custom/apl/script/
   - 纷享销客标准项目结构
   - 使用项目规范命名(如 Btn_XXX__c.function.groovy)

2. 备选: {项目根目录}/apl-examples/
   - 非标准项目或示例代码
   - 使用简化命名(如 XXXButton.groovy)
```

### 2. 命名规范最佳实践

#### API命名规范

**⚠️ 重要规则**: API名称中不能包含下划线（除了结尾的 `__c`）

```groovy
// ✅ 正确的API命名
EvtMatchContactOnAccountCreate__c    // 事件监听器
BtnUpdateAccount__c                  // 按钮函数
UIEvtFormValidate__c                 // UI事件
AccountQuery__c                      // 普通函数
WebHookController__c                 // 控制器类

// ❌ 错误的API命名
Evt_MatchContactOnAccountCreate__c   // 包含下划线
Btn_UpdateAccount__c                 // 包含下划线
UIEvt_FormValidate__c                // 包含下划线
Account_Query__c                     // 包含下划线
```

**命名规则**:
- 所有API名称必须以 `__c` 结尾
- API名称中不能包含下划线（除了结尾的 `__c`）
- 使用驼峰命名法（camelCase）
- 名称应清晰表达功能意图

#### 项目APL目录存在时

```groovy
// 按钮函数命名: Btn_XXX__c.function.groovy
// 例如: Btn_UpdateAccountButton__c.function.groovy

// 普通函数命名: XXX__c.function.groovy
// 例如: AccountContactQuery__c.function.groovy

// UI事件命名: UIEvt_XXX__c.function.groovy
// 例如: UIEvt_FormValidate__c.function.groovy

// APL类命名: XXX__c.class.groovy
// 例如: WebHookController__c.class.groovy
```

**重要**: 所有文件名都以 `__c` 结尾,表示自定义对象/函数

#### 项目APL目录不存在时

```groovy
// 按钮函数命名: XXXButton.groovy
// 例如: AccountButton.groovy

// 普通函数命名: XXXFunction.groovy
// 例如: QueryFunction.groovy

// APL类命名: XXXClass.groovy
// 例如: ServiceClass.groovy
```

### 3. 文件头部注释规范

```groovy
/**
 * @author 作者名称
 * @codeName 代码名称
 * @description 功能描述
 * @createTime 创建时间
 * @bindingObjectLabel 绑定对象标签
 * @bindingObjectApiName 绑定对象API名称
 */
```

### 4. 返回值规范

| 场景 | 返回值类型 | 示例 |
|------|-----------|------|
| 按钮函数 | `WebAction` | `return WebAction.builder().type("success").data([...]).build()` |
| 普通函数 | `Map` | `return [success: true, message: "成功", data: [...]]` |
| 流程函数 | `Boolean` | `return true` 或 `return false` |

---

## 性能优化最佳实践

### 1. 使用批量操作

**场景**: 需要创建或更新多条数据

**错误做法**:
```groovy
// 循环单条创建 - 低效,容易超限
dataList.each { item ->
    def (Boolean error, Object data, String msg) = Fx.object.create(
        "AccountObj", 
        item, 
        CreateAttribute.builder().build()
    )
}
```

**正确做法**:
```groovy
// 批量创建 - 高效,一次调用
def (Boolean error, List data, String msg) = Fx.object.batchCreate(
    "AccountObj", 
    dataList, 
    CreateAttribute.builder().build()
)

if (error) {
    log.error("批量创建失败: " + msg)
    return
}

log.info("批量创建成功: ${data.size()} 条")
```

### 2. 避免重复查询

**场景**: 需要在多处使用同一数据

**错误做法**:
```groovy
// 多次查询同一数据
def data1 = queryAccount(accountId)
def data2 = queryAccount(accountId)  // 重复查询
```

**正确做法**:
```groovy
// 查询一次,多处使用
def accountData = queryAccount(accountId)

// 使用缓存
def cacheKey = "account_${accountId}"
def cachedData = Fx.cache.get(cacheKey)

if (!cachedData) {
    cachedData = queryAccount(accountId)
    Fx.cache.set(cacheKey, cachedData, 3600)  // 缓存1小时
}
```

### 3. 控制查询字段

**场景**: 查询对象数据

**错误做法**:
```groovy
// 查询所有字段 - 浪费资源
Fx.object.find(
    "AccountObj",
    FQLAttribute.builder().build(),  // 不指定columns
    SelectAttribute.builder().build()
)
```

**正确做法**:
```groovy
// 只查询需要的字段
Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name", "owner"])  // 只查询需要的字段
        .build(),
    SelectAttribute.builder().build()
)
```

### 4. 分页查询大数据

**场景**: 需要处理大量数据

**正确做法**:
```groovy
def pageSize = 100
def offset = 0
def hasMore = true

while (hasMore) {
    def (Boolean error, QueryResult result, String msg) = Fx.object.find(
        "AccountObj",
        FQLAttribute.builder()
            .columns(["_id", "name"])
            .limit(pageSize)
            .skip(offset)
            .build(),
        SelectAttribute.builder().build()
    )
    
    if (error || result.dataList.size() < pageSize) {
        hasMore = false
    }
    
    // 处理当前页数据
    result.dataList.each { item ->
        processItem(item)
    }
    
    offset += pageSize
}
```

## 错误处理最佳实践

### 1. 完整的错误处理

**场景**: API调用

**正确做法**:
```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.create(...)

if (error) {
    // 1. 记录详细错误日志
    log.error("创建对象失败: ${errorMessage}, 参数: ${Fx.json.toJson(params)}")
    
    // 2. 返回用户友好的错误提示
    Fx.message.throwException("操作失败,请联系管理员")
}

// 3. 记录成功日志
log.info("创建对象成功: ${data._id}")
```

### 2. 区分错误类型

**场景**: 根据错误类型采取不同处理

**正确做法**:
```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.findById(...)

if (error) {
    // 区分错误类型
    if (errorMessage.contains("权限")) {
        log.warn("权限不足: ${errorMessage}")
        Fx.message.throwException("您没有权限访问该数据")
    } else if (errorMessage.contains("不存在")) {
        log.info("数据不存在: ${errorMessage}")
        return null  // 数据不存在不算错误
    } else {
        log.error("查询失败: ${errorMessage}")
        Fx.message.throwException("查询失败,请稍后重试")
    }
}
```

### 3. HTTP错误处理

**场景**: 调用外部API

**正确做法**:
```groovy
def (Boolean error, HttpResult result, String msg) = Fx.http.execute(...)

if (error) {
    log.error("HTTP请求失败: ${msg}")
    Fx.message.throwException("外部系统调用失败,请稍后重试")
}

// 检查HTTP状态码
if (result.statusCode != 200) {
    log.error("HTTP状态码异常: ${result.statusCode}, 响应: ${result.content}")
    Fx.message.throwException("外部系统返回异常")
}

// 检查业务返回码
def response = Fx.json.fromJson(result.content, Map) as Map
if (response.code != "0") {
    log.error("业务错误: ${response.message}")
    Fx.message.throwException("业务处理失败: ${response.message}")
}
```

## 日志记录最佳实践

### 1. 记录关键步骤

**正确做法**:
```groovy
log.info("开始处理数据,总数: ${dataList.size()}")

// 处理逻辑
dataList.each { item ->
    log.debug("处理数据: ${item._id}")
    // ...
}

log.info("数据处理完成,成功: ${successCount}, 失败: ${failCount}")
```

### 2. 记录耗时

**正确做法**:
```groovy
def startTime = System.currentTimeMillis()

// 处理逻辑
// ...

def elapsed = System.currentTimeMillis() - startTime
log.lap("处理耗时: ${elapsed}ms")

// 耗时预警
if (elapsed > 10000) {
    log.warn("处理耗时过长: ${elapsed}ms, 建议优化")
}
```

### 3. 记录错误详情

**正确做法**:
```groovy
if (error) {
    log.error("""
    |操作失败详情:
    |错误信息: ${errorMessage}
    |对象ID: ${objectId}
    |操作类型: ${operationType}
    |用户ID: ${context.userId}
    |时间: ${new Date()}
    """.stripMargin())
}
```

## 安全最佳实践

### 1. 参数验证

**正确做法**:
```groovy
def objectId = context.data?._id as String

// 验证必填参数
if (!objectId || objectId.trim().isEmpty()) {
    log.error("缺少必要参数: objectId")
    Fx.message.throwException("缺少必要参数")
}

// 验证参数格式
if (!objectId.matches("^[a-fA-F0-9]{24}$")) {
    log.error("参数格式错误: objectId=${objectId}")
    Fx.message.throwException("参数格式错误")
}

// 验证参数范围
def amount = context.data?.amount as BigDecimal
if (amount < 0 || amount > 1000000) {
    log.error("参数范围错误: amount=${amount}")
    Fx.message.throwException("金额超出允许范围")
}
```

### 2. 权限检查

**正确做法**:
```groovy
// 检查数据权限
def (Boolean error, Map data, String msg) = Fx.object.findById(
    "AccountObj",
    objectId,
    FQLAttribute.builder().columns(["_id", "owner"]).build(),
    SelectAttribute.builder()
        .filterByDataRight(true)  // 启用数据权限过滤
        .build()
)

if (error || !data) {
    log.error("无权限访问该数据: ${objectId}")
    Fx.message.throwException("无权限访问")
}

// 检查功能权限
def hasPermission = checkUserPermission(context.userId, "account_delete")
if (!hasPermission) {
    log.error("用户无删除权限: ${context.userId}")
    Fx.message.throwException("您没有删除权限")
}
```

### 3. 敏感信息保护

**正确做法**:
```groovy
// 不记录敏感信息
def password = context.data?.password
log.info("用户更新密码")  // ✅ 不记录密码内容

// 敏感数据加密存储
def encryptedData = Fx.crypto.encryptAES(sensitiveData, secretKey)
Fx.object.update("UserObj", userId, ["password": encryptedData], UpdateAttribute.builder().build())

// 返回数据脱敏
def userData = queryUser(userId)
userData.remove("password")  // 移除敏感字段
return userData
```

## 代码结构最佳实践

### 1. 函数拆分

**正确做法**:
```groovy
// 主函数 - 清晰的流程
Map execute() {
    // 1. 参数验证
    validateParams()
    
    // 2. 查询数据
    def data = queryData()
    
    // 3. 业务处理
    def result = processBusiness(data)
    
    // 4. 返回结果
    return buildResponse(result)
}

// 子函数 - 单一职责
void validateParams() {
    // 验证逻辑
}

Map queryData() {
    // 查询逻辑
}

Map processBusiness(Map data) {
    // 处理逻辑
}

Map buildResponse(Map result) {
    // 构建响应
}
```

### 2. 避免深层嵌套

**错误做法**:
```groovy
if (condition1) {
    if (condition2) {
        if (condition3) {
            if (condition4) {
                // 深层嵌套 - 难以阅读
            }
        }
    }
}
```

**正确做法**:
```groovy
// 提前返回,减少嵌套
if (!condition1) {
    return
}

if (!condition2) {
    return
}

if (!condition3) {
    return
}

if (!condition4) {
    return
}

// 主逻辑
```

### 3. 使用有意义的变量名

**错误做法**:
```groovy
def a = context.data
def b = a._id
def c = queryData(b)
```

**正确做法**:
```groovy
def accountData = context.data
def accountId = accountData._id
def relatedOrders = queryOrdersByAccountId(accountId)
```
