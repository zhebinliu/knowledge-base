/**
 * @author 纷享 - 杨亚兴
 * @codeName objectReferenceTemplate
 * @description 处理 Object Reference (对象关联) 字段的完整示例和最佳实践
 * @createTime 2026-03-04
 */

/*
================================================================================
Object Reference 字段基础概念

1. 定义:
   - 类型：object_reference
   - 用途：建立两个对象之间的关联关系
   - 存储值：被关联对象的 _id (唯一标识符)
   
2. 数据字典中识别方法:
   - 字段类型列：显示"object_reference"或"关联对象"
   - 字段关联关系：显示"object reference [目标对象 API 名]"
   
3. 常见场景:
   - 订单 → 客户 (SalesOrderObj.account_id → AccountObj)
   - 合同 → 线索 (ContractObj.leads_id → LeadsObj)
   - 活动 → 门店 (ActivityObj.store_id → StoreObj)
================================================================================
*/

// ==================== 场景 1: 从主对象读取关联对象 ID 并查询详情 ====================

/*
 * 场景：销售订单新建时，需要验证客户的业务类型
 */

Map data = context.data as Map

// Step 1: 获取关联字段的值 (就是对方的 _id)
String relatedObjectId = data["关联字段_api_name"] as String

if(relatedObjectId != null && relatedObjectId != ""){
    
    // Step 2: 查询关联对象的完整数据
    def (boolean error, Map relatedData, String errorMsg) = Fx.object.findById(
        "目标对象_API_Name",  // 如 AccountObj, LeadsObj 等
        relatedObjectId       // 从关联字段获取的 ID
    )
    
    if(error){
        log.error("查询关联对象失败：" + errorMsg)
        // 错误处理...
    } else if(!relatedData){
        log.warn("关联对象不存在：${relatedObjectId}")
        // 可能数据已被删除...
    } else {
        // Step 3: 使用关联对象的数据
        String relatedName = relatedData["name"] as String ?: ""
        String relatedField = relatedData["某个字段"] as String
        
        log.info("关联对象名称：" + relatedName)
        log.info("关联字段值：" + relatedField)
        
        // 业务逻辑...
    }
}

// ==================== 场景 2: 批量查询多个关联对象 ====================

/*
 * 场景：列表页按钮操作，需要批量查询所有订单的关联客户信息
 */

List orderIds = context.objectIds as List

// Step 1: 批量查询订单数据，同时带出关联的客户 ID
def(boolean error, List orderList, String errorMsg) = Fx.object.findByIds(
    "SalesOrderObj", 
    orderIds,
    FQLAttribute.builder()
        .columns(["_id", "name", "account_id"])  // 包含关联字段
        .build()
)

if(error){
    log.error("查询订单失败：" + errorMsg)
    return
}

// Step 2: 提取所有客户 ID 去重
Set accountIds = []
orderList.each { order ->
    String accountId = order["account_id"] as String
    if(accountId){
        accountIds.add(accountId)
    }
}

// Step 3: 批量查询所有客户数据
def(accError, accList, accMsg) = Fx.object.findByIds(
    "AccountObj",
    accountIds as List,
    FQLAttribute.builder()
        .columns(["_id", "name", "record_type"])
        .build()
)

// Step 4: 构建 ID → 数据的映射表 (快速查找)
Map accountMap = [:]
accList.each { account ->
    accountMap.put(account["_id"], account)
}

// Step 5: 遍历订单，快速获取对应客户信息
orderList.each { order ->
    String orderId = order["_id"] as String
    String accountId = order["account_id"] as String
    
    if(accountId && accountMap.containsKey(accountId)){
        Map account = accountMap.get(accountId)
        String customerName = account["name"] as String
        String recordType = account["record_type"] as String
        
        log.info("订单 ${orderId} 的客户：${customerName}, 业务类型：${recordType}")
    }
}

// ==================== 场景 3: 通过关联字段查询数据 (QueryTemplate) ====================

/*
 * 场景：查找所有属于某个客户的订单
 */

String targetAccountId = "xxx_account_id_xxx"

// 使用 QueryTemplate 查询关联字段等于某个值的记录
def (boolean error, QueryResult result, String msg) = Fx.object.find(
    "SalesOrderObj",
    FQLAttribute.builder()
        .columns(["_id", "name", "order_amount"])
        .queryTemplate(QueryTemplate.AND([
            ["account_id": QueryOperator.EQ(targetAccountId)]  // 关联字段匹配
        ]))
        .build(),
    SelectAttribute.builder().build()
)

if(!error && result && result.dataList){
    log.info("找到 ${result.dataList.size()} 个订单")
    
    result.dataList.each { order ->
        String orderId = order["_id"] as String
        BigDecimal amount = order["order_amount"] as BigDecimal
        log.info("  订单：${orderId}, 金额：${amount}")
    }
}

// ==================== 场景 4: 更新关联字段 ====================

/*
 * 场景：修改订单的客户归属
 */

String orderId = "xxx_order_id_xxx"
String newAccountId = "yyy_new_account_id_yyy"

// 先验证新客户是否存在
def (checkErr, checkData, checkMsg) = Fx.object.findById("AccountObj", newAccountId)

if(checkErr || !checkData){
    log.error("新客户不存在，无法更新")
    return
}

// 更新订单的关联字段
def (updateErr, updateData, updateMsg) = Fx.object.update(
    "SalesOrderObj",
    orderId,
    ["account_id": newAccountId]  // 直接赋值新的 ID
)

if(updateErr){
    log.error("更新失败：" + updateMsg)
} else {
    log.info("成功将订单 ${orderId} 的客户改为：${checkData.name}")
}

// ==================== 场景 5: 级联删除/作废关联数据 ====================

/*
 * 场景：删除客户前，检查是否有未完成的订单
 */

String accountIdToDelete = "xxx_account_id_xxx"

// 查询未完成订单
def (err, result, msg) = Fx.object.find(
    "SalesOrderObj",
    FQLAttribute.builder()
        .columns(["_id", "name"])
        .queryTemplate(QueryTemplate.AND([
            ["account_id": QueryOperator.EQ(accountIdToDelete)],
            ["order_status": QueryOperator.NE("completed")]  // 未完成
        ]))
        .build(),
    SelectAttribute.builder().build()
)

if(!err && result && result.dataList && result.dataList.size() > 0){
    log.warn("该客户有 ${result.dataList.size()} 个未完成订单，不能删除")
    return ValidateResult.builder()
        .success(false)
        .errorMessage("请先完成或删除相关订单后再操作")
        .build()
}

// 如果没有未完成订单，可以安全删除
log.info("可以安全删除该客户")

// ==================== 场景 6: 对象关联的前验证 ====================

/*
 * 场景：订单创建时验证客户是否可用 (本案例)
 */

Map data = context.data as Map
String accountId = data["account_id"] as String

if(accountId == null || accountId == ""){
    return ValidateResult.builder()
        .success(false)
        .errorMessage("请选择客户！")
        .build()
}

// 查询客户详情
def (err, accountData, msg) = Fx.object.findById("AccountObj", accountId)

if(err || !accountData){
    return ValidateResult.builder()
        .success(false)
        .errorMessage("客户不存在，请重新选择！")
        .build()
}

// 校验客户属性
String recordType = accountData["record_type"] as String ?: ""
if(recordType != "dealer"){
    return ValidateResult.builder()
        .success(false)
        .errorMessage("该客户不是经销商，不能创建订单！")
        .build()
}

// 校验通过
return ValidateResult.builder()
    .success(true)
    .errorMessage("校验通过")
    .build()

// ==================== 场景 7: 在 UIEvent 中回填关联对象数据 ====================

/*
 * 场景：选择客户后，自动填充客户的常用地址、联系人等信息到订单
 */

String accountId = context.data["account_id"] as String

if(accountId != null && accountId != ""){
    // 查询客户数据
    def (err, accountData, msg) = Fx.object.findById("AccountObj", accountId)
    
    if(!err && accountData){
        // 提取客户信息
        String defaultAddress = accountData["default_address__c"] as String ?: ""
        String contactPerson = accountData["contact_person__c"] as String ?: ""
        String contactPhone = accountData["contact_phone__c"] as String ?: ""
        
        // 回写到订单表单
        UIEvent event = UIEvent.build(context) {
            editMaster(
                "delivery_address__c": defaultAddress,
                "contact_person__c": contactPerson,
                "contact_phone__c": contactPhone
            )
        }
        return event
    }
}

UIEvent event = UIEvent.build(context) {}
return event

// ==================== 性能优化技巧 ====================

/*
1. 避免 N+1 查询问题:
   ❌ 错误示范：
   dataList.each { item ->
       def (e,d,m) = Fx.object.findById("AccountObj", item.account_id)  // 每行都查一次
   }
   
   ✅ 正确做法：
   Set allAccountIds = dataList*.account_id
   def (e, list, m) = Fx.object.findByIds("AccountObj", allAccountIds as List)
   Map accountMap = list.collectEntries { [(it._id): it] }  // 建索引
   dataList.each { item ->
       Map account = accountMap.get(item.account_id)  // O(1) 查找
   }

2. columns 只查询需要的字段:
   ✅ FQLAttribute.builder().columns(["_id", "name", "record_type"]).build()
   ❌ 不指定 columns 会查询所有字段，影响性能

3. 使用 dbSource(true) 直连数据库 (计划任务等后台操作):
   SelectAttribute.builder().needCount(false).dbSource(true).build()

4. 限制返回数量:
   Fx.object.find("Obj", query, limit: 100, offset: 0)
*/

// ==================== 调试技巧 ====================

/*
1. 打印所有关联字段:
   log.info("当前表单数据：" + Fx.json.toJson(data))
   // 找类型为 String 且长度 24 左右的值，通常是关联对象的 ID

2. 测试单个对象关联:
   def (err, data, msg) = Fx.object.findById("SalesOrderObj", "某个订单 ID")
   if(!err){
       log.info(Fx.json.toJson(data))  // 查看所有字段及其值
   }

3. 从数据字典确认字段:
   - 打开 Excel 数据字典
   - 搜索对象名 (如 SalesOrderObj)
   - 找字段类型为"object_reference"的行
   - 复制"字段 apiName"列的值
*/

// ==================== 注意事项 ====================

/*
⚠️ 关键点:

1. 关联字段存的是 ID，不是 name 或其他字段
2. 查询前务必检查 ID 是否为空
3. 所有 Fx.object.* 调用都要检查 error 返回值
4. 大批量操作优先使用 findByIds 批量查询
5. 对象可能被删除，要处理"对象不存在"的情况
6. Option 类型字段要用 as String 转换
7. 日志中不要输出完整的关联对象数据 (隐私保护)

📝 命名规范建议:
- 关联字段名：通常以"_id"结尾或使用简洁命名
  如：account_id, leads_id, store_id
- 变量名：加上业务语义
  如：customerId, orderData, customerInfo
*/
