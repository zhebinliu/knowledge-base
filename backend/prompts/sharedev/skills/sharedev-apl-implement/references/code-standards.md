# APL代码规范检查清单

## 命名规范

### API命名规范
- [ ] API名称必须以 `__c` 结尾
- [ ] **API名称中不能包含下划线**（除了结尾的 `__c`）
- [ ] 使用驼峰命名法（camelCase）
- [ ] 名称清晰表达功能意图

**正确示例**:
```groovy
// API名称示例
EvtMatchContactOnAccountCreate__c    // ✅ 正确：不含下划线
BtnUpdateAccount__c                  // ✅ 正确：不含下划线
UIEvtFormValidate__c                 // ✅ 正确：不含下划线
AccountQuery__c                      // ✅ 正确：不含下划线
```

**错误示例**:
```groovy
// API名称示例
Evt_MatchContactOnAccountCreate__c   // ❌ 错误：包含下划线
Btn_UpdateAccount__c                 // ❌ 错误：包含下划线
UIEvt_FormValidate__c                // ❌ 错误：包含下划线
Account_Query__c                     // ❌ 错误：包含下划线
```

### 变量命名
- [ ] 使用驼峰命名法(camelCase)
- [ ] 变量名清晰表达用途
- [ ] 避免使用单字母变量(循环变量除外)
- [ ] 避免使用保留字

**正确示例**:
```groovy
def accountName = "测试客户"
def dataList = []
def userId = context.userId
```

**错误示例**:
```groovy
def n = "测试客户"  // 不清晰
def a = []         // 不清晰
def owner = "xxx"  // 使用了保留字
```

### 常量命名
- [ ] 使用大写字母和下划线
- [ ] 常量定义在文件顶部

**正确示例**:
```groovy
def static final MAX_RETRY_COUNT = 3
def static final DEFAULT_PAGE_SIZE = 100
```

### 函数命名
- [ ] 使用动词开头
- [ ] 清晰表达函数功能
- [ ] 遵循驼峰命名法

**正确示例**:
```groovy
def queryAccountById(String id) { }
def sendNotificationToUser(String userId) { }
def calculateTotalAmount(List items) { }
```

## 错误处理规范

### API调用错误处理
- [ ] 所有API调用都有错误处理
- [ ] 错误日志包含详细信息
- [ ] 用户友好的错误提示
- [ ] 区分业务错误和系统错误

**标准模式**:
```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.create(...)

if (error) {
    log.error("操作失败: ${errorMessage}, 参数: ${params}")
    Fx.message.throwException("操作失败,请联系管理员")
}
```

### 空值处理
- [ ] 使用安全访问操作符(?.)
- [ ] 提供合理的默认值
- [ ] 检查关键数据是否为空

**正确示例**:
```groovy
def name = context.data?.name ?: "默认名称"
def phone = context.data?.phone?.trim() ?: ""

if (!context.data?._id) {
    log.error("缺少必要参数: _id")
    return
}
```

### 异常处理
- [ ] 捕获特定异常而非通用异常
- [ ] 记录异常堆栈信息
- [ ] 提供有意义的错误消息

**正确示例**:
```groovy
try {
    def result = Fx.json.fromJson(jsonString, Map)
} catch (Exception e) {
    log.error("JSON解析失败: ${e.message}", e)
    Fx.message.throwException("数据格式错误")
}
```

## 性能规范

### 批量操作
- [ ] 使用批量操作代替循环单条操作
- [ ] 批量操作数量不超过500条
- [ ] 大批量数据分批处理

**正确示例**:
```groovy
// 批量创建
Fx.object.batchCreate("AccountObj", dataList, CreateAttribute.builder().build())

// 批量更新
Fx.object.batchUpdate("AccountObj", updateMap, ["field1", "field2"], BatchUpdateAttribute.builder().build())
```

**错误示例**:
```groovy
// 循环单条创建
dataList.each { item ->
    Fx.object.create("AccountObj", item, CreateAttribute.builder().build())
}
```

### 查询优化
- [ ] 只查询需要的字段
- [ ] 使用合理的limit
- [ ] 避免重复查询相同数据

**正确示例**:
```groovy
Fx.object.find(
    "AccountObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])  // 只查询需要的字段
        .limit(100)                // 合理的limit
        .build(),
    SelectAttribute.builder().build()
)
```

### 缓存使用
- [ ] 合理使用Fx.cache缓存频繁访问的数据
- [ ] 设置合适的过期时间
- [ ] 避免缓存大对象

**示例**:
```groovy
def cacheKey = "account_${accountId}"
def cachedData = Fx.cache.get(cacheKey)

if (!cachedData) {
    cachedData = queryAccountFromDB(accountId)
    Fx.cache.set(cacheKey, cachedData, 3600) // 缓存1小时
}
```

## 安全规范

### 输入验证
- [ ] 验证必填参数
- [ ] 验证参数类型和范围
- [ ] 防止SQL注入

**示例**:
```groovy
def objectId = context.data?._id as String

if (!objectId || objectId.trim().isEmpty()) {
    log.error("缺少必要参数: objectId")
    Fx.message.throwException("缺少必要参数")
}

// 验证格式
if (!objectId.matches("^[a-fA-F0-9]{24}$")) {
    log.error("参数格式错误: objectId=${objectId}")
    Fx.message.throwException("参数格式错误")
}
```

### 权限检查
- [ ] 检查数据权限
- [ ] 检查功能权限
- [ ] 使用数据权限过滤

**示例**:
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
    log.error("无权限访问该数据")
    Fx.message.throwException("无权限访问")
}
```

### 敏感信息保护
- [ ] 不记录敏感信息到日志
- [ ] 不在代码中硬编码密钥
- [ ] 使用加密存储敏感数据

**错误示例**:
```groovy
// 记录敏感信息
log.info("用户密码: ${password}")  // ❌ 错误

// 硬编码密钥
def apiKey = "sk-xxxxx"  // ❌ 错误
```

## 代码结构规范

### 函数长度
- [ ] 单个函数不超过50行
- [ ] 复杂逻辑拆分为多个函数
- [ ] 每个函数只做一件事

### 注释规范
- [ ] 复杂逻辑添加注释
- [ ] 注释说明"为什么"而非"是什么"
- [ ] 保持注释与代码同步

**示例**:
```groovy
// 使用批量操作提高性能,避免超出API调用次数限制
Fx.object.batchCreate("AccountObj", dataList, CreateAttribute.builder().build())
```

### 代码组织
- [ ] 相关代码放在一起
- [ ] 按功能模块组织
- [ ] 避免深层嵌套

**推荐结构**:
```groovy
// 1. 参数验证
// 2. 数据查询
// 3. 业务处理
// 4. 结果返回
```

## 平台限制规范

### API调用次数
- [ ] Fx.object调用不超过300次/函数
- [ ] Fx.http调用不超过50次/函数
- [ ] Fx.function调用不超过50次/函数
- [ ] Fx.message调用不超过50次/函数

### 执行时间
- [ ] 按钮执行时间不超过20秒
- [ ] 流程执行时间不超过300秒
- [ ] 计划任务执行时间不超过600秒

### 内存使用
- [ ] 不处理超过内存限制的大对象
- [ ] 及时释放不需要的变量
- [ ] 避免内存泄漏

### HTTP调用
- [ ] 连接超时不超过2秒
- [ ] 读取超时不超过120秒
- [ ] POST数据大小不超过5MB
