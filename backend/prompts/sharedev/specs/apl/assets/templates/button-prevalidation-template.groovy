/**
 * @author [姓名]
 * @codeName [函数 ApiName]
 * @description [功能描述 - 如：创建/编辑前校验必填项和关联数据]
 * @createTime YYYY-MM-DD
 */

Map data = context.data as Map
log.info("[${ functionName}] 开始执行，数据：" + Fx.json.toJson(data))

boolean isPass = true
List<String> errorMessages = []

// ==================== 1. 必填项校验 ====================

// TODO: 根据需求添加必填字段
String requiredField1 = data["field_required__c"] as String
if(requiredField1 == null || requiredField1 == ""){
    isPass = false
    errorMessages.add("必填项：[字段名称] 不能为空")
}

String requiredField2 = data["field_another__c"] as String
if(requiredField2 == null || requiredField2 == ""){
    isPass = false
    errorMessages.add("必填项：[另一个字段] 不能为空")
}

// ==================== 2. 格式校验 ====================

// TODO: 添加格式校验逻辑
String emailField = data["field_email__c"] as String
if(emailField != null && emailField != "" && !emailField.matches('.+@.+\\..+')){
    isPass = false
    errorMessages.add("[邮箱地址] 格式不正确")
}

String phoneField = data["field_phone__c"] as String
if(phoneField != null && phoneField != "" && !phoneField.matches('^1[3-9]\\d{9}$')){
    isPass = false
    errorMessages.add("[手机号码] 格式不正确")
}

// ==================== 3. 唯一性校验 ====================

// TODO: 添加唯一性检查
String uniqueField = data["field_unique__c"] as String
if(uniqueField != null && uniqueField != ""){
    def (boolean err, Map exist, String msg) = Fx.object.findOne(
        "[对象 ApiName]",
        FQLAttribute.builder()
            .columns(["_id"])
            .queryTemplate(QueryTemplate.AND([
                ["field_unique__c": QueryOperator.EQ(uniqueField)],
                ["_id": QueryOperator.NE(data._id)]  // 排除自己 (编辑场景)
            ]))
            .build(),
        SelectAttribute.builder().build()
    )
    
    if(!err && exist){
        isPass = false
        errorMessages.add("[唯一字段] 已存在，请勿重复录入")
    }
}

// ==================== 4. 关联数据存在性校验 ====================

// TODO: 添加关联对象校验
String relatedObjectId = data["field_related_id__c"] as String
if(relatedObjectId != null && relatedObjectId != ""){
    def (boolean err, Map relData, String msg) = Fx.object.findById(
        "[关联对象 ApiName]", 
        relatedObjectId
    )
    
    if(err || !relData){
        isPass = false
        errorMessages.add("关联的 [关联对象名称] 不存在，请检查")
    }
}

// ==================== 5. 业务规则校验 ====================

// TODO: 添加业务逻辑校验
String startDateStr = data["field_start_date__c"] as String
String endDateStr = data["field_end_date__c"] as String

if(startDateStr != null && endDateStr != null){
    long startTs = new Date(startDateStr).getTime()
    long endTs = new Date(endDateStr).getTime()
    
    if(startTs > endTs){
        isPass = false
        errorMessages.add("[开始日期] 不能晚于 [结束日期]")
    }
}

// 金额校验示例
BigDecimal amount1 = data["field_amount1__c"] as BigDecimal
BigDecimal amount2 = data["field_amount2__c"] as BigDecimal

if(amount1 != null && amount2 != null){
    if(amount1.compareTo(amount2) > 0){
        isPass = false
        errorMessages.add("[金额 1] 不能大于 [金额 2]")
    }
}

// ==================== 6. 组合条件校验 ====================

// TODO: 添加依赖字段校验
String conditionField = data["field_condition__c"] as String
String dependentField = data["field_dependent__c"] as String

if(conditionField == "option1" && (dependentField == null || dependentField == "")){
    isPass = false
    errorMessages.add("当 [条件字段] 为'选项 1'时，[依赖字段] 为必填项")
}

// ==================== 7. 引用对象状态校验 ====================

// TODO: 添加引用对象状态检查
String statusFieldId = data["field_status_ref__c"] as String
if(statusFieldId != null && statusFieldId != ""){
    def (boolean err, Map statusData, String msg) = Fx.object.findById(
        "[状态对象 ApiName]", 
        statusFieldId
    )
    
    if(!err && statusData){
        String statusValue = statusData["field_status__c"] as String
        if(statusValue != "active"){
            isPass = false
            errorMessages.add("引用的 [状态对象] 状态不是'有效', 不能操作")
        }
    }
}

// ==================== 8. 数值范围校验 ====================

// TODO: 添加数值范围检查
Integer quantity = data["field_quantity__c"] as Integer
if(quantity != null){
    if(quantity < 1){
        isPass = false
        errorMessages.add("[数量] 必须大于 0")
    }
    if(quantity > 10000){
        isPass = false
        errorMessages.add("[数量] 不能超过 10000")
    }
}

// 百分比校验示例
BigDecimal percentage = data["field_percentage__c"] as BigDecimal
if(percentage != null){
    if(percentage.compareTo(new BigDecimal("0")) < 0 || 
       percentage.compareTo(new BigDecimal("100")) > 0){
        isPass = false
        errorMessages.add("[百分比] 必须在 0-100 之间")
    }
}

// ==================== 构建返回结果 ====================

String finalMessage
if(isPass){
    finalMessage = "校验通过"
    log.info("[${functionName}] 校验通过")
} else {
    finalMessage = errorMessages.join("；")
    log.info("[${functionName}] 校验失败：" + finalMessage)
}

return ValidateResult.builder()
    .success(isPass)
    .errorMessage(finalMessage)
    .build()
