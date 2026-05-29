# APL开发流程详细指导

## 完整开发流程

```
需求分析 → 场景识别 → 平台限制检查 → 输出目录判断 → 实现指导 → 测试验证 → 代码Review → 经验回写
```

## Phase 1: 需求分析

### 1.1 需求澄清清单

在开始开发前,必须明确以下问题:

- [ ] **开发场景**: 按钮开发 / 流程开发 / 计划任务 / 自定义控制器 / 事件监听
- [ ] **数据操作**: 需要查询哪些对象? 需要创建/更新/删除哪些数据?
- [ ] **外部调用**: 是否需要调用外部API? 调用频率如何?
- [ ] **消息通知**: 是否需要发送消息? 发送给谁?
- [ ] **权限控制**: 是否需要检查数据权限?
- [ ] **异常处理**: 遇到错误如何处理?

### 1.2 场景识别

根据需求关键词,识别开发场景:

| 场景 | 关键词 | 典型特征 |
|------|--------|---------|
| 按钮开发 | 按钮, button, 业务按钮, UI按钮 | 用户主动触发, 短时间执行 |
| 流程开发 | 流程, flow, 审批流, 工作流 | 流程节点触发, 需要状态判断 |
| 计划任务 | 计划任务, 定时, scheduler | 定时执行, 批量处理 |
| 自定义控制器 | 控制器, controller, API端点 | 外部系统调用, RESTful接口 |
| 事件监听 | 事件监听, event, 监听器 | 系统事件触发, 异步处理 |

### 1.3 平台限制检查

在开始开发前,必须检查平台限制:

| 限制项 | 限制值 | 检查问题 |
|--------|--------|---------|
| Fx.object调用 | 300次/函数 | 是否需要大量数据操作? 能否优化? |
| Fx.http调用 | 50次/函数 | 是否需要频繁外部调用? 能否批量? |
| Fx.function调用 | 50次/函数 | 是否需要调用其他函数? |
| Fx.message调用 | 50次/函数 | 是否需要发送大量消息? |
| 按钮执行时间 | 20秒 | 逻辑是否复杂? 能否异步处理? |
| 流程执行时间 | 300秒 | 是否需要长时间处理? |
| 计划任务时间 | 600秒 | 批量数据量多大? |
| 内存限制 | 256MB | 是否处理大对象? |
| HTTP超时 | 默认5s, 最大120s | 外部API响应时间? |

**门控**: 如果需求超出平台限制,必须先与用户确认调整方案。

## Phase 1.5: 输出目录判断

### 1.4 目录检测逻辑

在生成代码文件前,必须检测项目目录结构:

```
判断流程:
1. 检测 {项目根目录}/package/fx/custom/apl/script/ 目录是否存在
2. 如果存在 → 使用项目规范命名,输出到该目录
3. 如果不存在 → 使用简化命名,输出到 {项目根目录}/apl-examples/ 目录
```

### 1.5 命名规范选择

#### 项目APL目录存在时

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 按钮函数 | `Btn_XXX__c.function.groovy` | `Btn_UpdateButton__c.function.groovy` |
| 普通函数 | `XXX__c.function.groovy` | `AccountQuery__c.function.groovy` |
| UI事件 | `UIEvt_XXX__c.function.groovy` | `UIEvt_FormValidate__c.function.groovy` |
| APL类 | `XXX__c.class.groovy` | `WebHookController__c.class.groovy` |

**注意**: 所有文件名都以 `__c` 结尾,表示自定义对象/函数

#### 项目APL目录不存在时

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 按钮函数 | `XXXButton.groovy` | `AccountButton.groovy` |
| 普通函数 | `XXXFunction.groovy` | `QueryFunction.groovy` |
| APL类 | `XXXClass.groovy` | `ServiceClass.groovy` |

## Phase 2: 实现指导

### 2.1 Context上下文使用

#### 通用变量

```groovy
// 租户和用户信息
context.tenantId      // 租户ID
context.userId        // 用户ID

// 数据对象
context.data          // 主对象数据(Map)
context.details       // 从对象数据(Map<String, List<Map>>)
context.dataList      // 批量数据(List<Map>)
context.objectIds     // 对象ID列表(List<String>)

// 业务参数
context.arg           // 业务参数(根据场景不同而不同)
```

#### 互联变量

```groovy
context.outTenantId   // 外部租户ID
context.outUserId     // 外部用户ID
context.appId         // 应用ID
```

#### Context使用注意事项

1. **异步字段**: context中的字段可能是异步加载的,使用前需要检查
2. **Details限制**: context.details只包含从对象数据,不包含主对象数据
3. **Debug差异**: 调试模式和正式模式的context可能有差异

### 2.2 标准代码模板

#### 按钮场景模板

```groovy
// 业务按钮 - 返回Map
Map execute() {
    def data = context.data as Map
    def objectId = data._id as String
    
    // 1. 参数验证
    if (!objectId) {
        return [
            "success": false,
            "message": "缺少必要参数: objectId"
        ]
    }
    
    // 2. 业务逻辑
    def (Boolean error, Map result, String msg) = Fx.object.findById(
        "AccountObj",
        objectId,
        FQLAttribute.builder().columns(["_id", "name"]).build(),
        SelectAttribute.builder().build()
    )
    
    if (error) {
        log.error("查询失败: " + msg)
        return [
            "success": false,
            "message": "查询失败: " + msg
        ]
    }
    
    // 3. 返回结果
    return [
        "success": true,
        "message": "操作成功",
        "data": result
    ]
}
```

#### 流程场景模板

```groovy
// 流程节点 - 返回Boolean
Boolean execute() {
    def data = context.data as Map
    def objectId = data._id as String
    
    // 1. 检查数据状态
    if (!checkDataStatus(objectId)) {
        log.warn("数据状态不满足条件")
        return false
    }
    
    // 2. 执行业务逻辑
    def success = processBusinessLogic(objectId)
    
    // 3. 返回执行结果
    return success
}

Boolean checkDataStatus(String objectId) {
    // 检查逻辑
    return true
}

Boolean processBusinessLogic(String objectId) {
    // 处理逻辑
    return true
}
```

#### 计划任务模板

```groovy
// 计划任务 - 批量处理
void execute() {
    log.info("开始执行计划任务")
    
    // 1. 查询待处理数据
    def (Boolean error, QueryResult result, String msg) = Fx.object.find(
        "TaskObj",
        FQLAttribute.builder()
            .columns(["_id", "name", "status"])
            .queryTemplate(QueryTemplate.AND(["status": QueryOperator.EQ("pending")]))
            .limit(100)
            .build(),
        SelectAttribute.builder().build()
    )
    
    if (error) {
        log.error("查询失败: " + msg)
        return
    }
    
    log.info("查询到 ${result.dataList.size()} 条待处理数据")
    
    // 2. 批量处理
    List<Map> updateList = []
    result.dataList.each { item ->
        def map = item as Map
        // 处理逻辑
        updateList << [
            "_id": map._id,
            "status": "completed"
        ]
    }
    
    // 3. 批量更新
    if (updateList.size() > 0) {
        def (Boolean updateError, Object updateResult, String updateMsg) = 
            Fx.object.batchUpdate("TaskObj", updateList, ["status"], BatchUpdateAttribute.builder().build())
        
        if (updateError) {
            log.error("批量更新失败: " + updateMsg)
        } else {
            log.info("批量更新成功: ${updateList.size()} 条")
        }
    }
    
    log.info("计划任务执行完成")
}
```

### 2.3 错误处理模式

#### 标准错误处理

```groovy
def (Boolean error, Object data, String errorMessage) = Fx.object.create(...)

if (error) {
    log.error("操作失败: " + errorMessage)
    
    // 选择一种处理方式:
    
    // 方式1: 抛出异常终止执行(适用于必须成功的场景)
    Fx.message.throwException("操作失败: " + errorMessage)
    
    // 方式2: 返回终止执行(适用于可选操作)
    return
    
    // 方式3: 继续执行(适用于非关键操作)
    // 记录错误但不中断
}
```

#### HTTP错误处理

```groovy
def (Boolean error, HttpResult result, String msg) = Fx.http.execute(...)

if (error) {
    log.error("HTTP请求失败: " + msg)
    Fx.message.throwException("外部系统调用失败,请稍后重试")
}

// 检查HTTP状态码
if (result.statusCode != 200) {
    log.error("HTTP状态码异常: ${result.statusCode}")
    Fx.message.throwException("外部系统返回异常: ${result.statusCode}")
}

// 检查业务返回码
def response = Fx.json.fromJson(result.content, Map) as Map
if (response.code != "0") {
    log.error("业务错误: ${response.message}")
    Fx.message.throwException("业务处理失败: ${response.message}")
}
```

## Phase 3: 测试验证

### 3.1 单元测试要点

- [ ] 测试正常流程
- [ ] 测试异常流程
- [ ] 测试边界条件
- [ ] 测试数据权限

### 3.2 调试技巧

```groovy
// 1. 记录关键变量
log.info("关键变量: ${variable}")

// 2. 记录执行路径
log.info("进入分支A")

// 3. 记录耗时
def startTime = System.currentTimeMillis()
// ... 处理逻辑
log.lap("处理耗时: ${System.currentTimeMillis() - startTime}ms")

// 4. 记录数据快照
log.info("数据快照: ${Fx.json.toJson(data)}")
```

## Phase 4: 代码Review

### 4.1 Review检查清单

#### 功能正确性
- [ ] 业务逻辑是否正确?
- [ ] 是否处理了所有边界条件?
- [ ] 返回值是否符合预期?

#### 代码质量
- [ ] 代码是否清晰易读?
- [ ] 是否有重复代码?
- [ ] 是否有魔法数字?

#### 性能
- [ ] 是否使用了批量操作?
- [ ] 是否避免了重复查询?
- [ ] 是否控制了查询字段数量?

#### 安全
- [ ] 是否验证了输入参数?
- [ ] 是否检查了数据权限?
- [ ] 是否避免了敏感信息泄露?

### 4.2 常见问题检查

- [ ] 是否使用了闭包限制字(owner, this, delegate)?
- [ ] 是否正确处理了空值?
- [ ] 是否超出了平台限制?
- [ ] 是否有无限循环风险?

## Phase 5: 经验回写

### 5.1 回写时机

- 发现新的最佳实践
- 遇到新的常见问题
- 总结新的代码模式
- 发现新的性能优化点

### 5.2 回写内容

- 最佳实践示例
- 常见问题解决方案
- 代码模板优化
- 规范检查补充
