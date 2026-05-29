/**
 * @author [姓名]
 * @codeName Import_[xxx] 或 [*Check*]
 * @description [功能描述 - 如：省区预算拆解预处理/联系人查重]
 * @createTime YYYY-MM-DD
 */

// ==================== 1. 获取任务信息 ====================

def taskId = context.task.taskId as String
log.info("[ImportValidate] 开始执行，任务 ID：" + taskId)

log.info("[ImportValidate] 是否为最后一批：" + context.task.lastBatch)

// ==================== 2. 获取批次数据 ====================

// context.dataList: 一批数据 (每批 20 条)
List<Map> dataList = context.dataList as List
log.info("[ImportValidate] 本批次数据数量：" + dataList.size())

if(dataList == null || dataList.isEmpty()){
    return ValidateResult.builder()
        .success(true)
        .errorMessage("无数据")
        .build()
}

// ==================== 3. 初始化缓存 (跨批次共享) ====================

Cache cache = Fx.cache.defaultCache

// TODO: 根据需要初始化全局变量
boolean globalIsPass = true
List<String> globalErrorMessages = []

// ==================== 4. 逐条处理 ====================

dataList.each { data ->
    try {
        // 生成唯一缓存 Key (_UnionMark 是系统自动生成的唯一标记)
        def key = data._UnionMark + taskId
        
        log.info("[ImportValidate] 处理记录：" + key)
        
        // ==================== 4.1 提取字段 ====================
        
        // TODO: 根据你的需求提取字段
        String fieldId = data["field_id__c"] as String
        BigDecimal amount = data["field_amount__c"] as BigDecimal ?: new BigDecimal("0")
        Integer quantity = data["field_quantity__c"] as Integer ?: 0
        String year = data["field_year__c"] as String
        String month = data["field_month__c"] as String
        
        log.info("  - 字段 ID: ${fieldId}, 金额：${amount}, 数量：${quantity}")
        
        // ==================== 4.2 必填项校验 ====================
        
        // TODO: 添加你的必填项校验
        if(fieldId == null || fieldId == ""){
            globalIsPass = false
            globalErrorMessages.add("记录[${key}] 缺少必填字段 [字段 ID]")
            return  // 跳过这条
        }
        
        // ==================== 4.3 关联查询 ====================
        
        // TODO: 根据你的需求添加查询逻辑
        def (Boolean queryError, Map queryData, String queryMsg) = Fx.object.findOne(
            "[关联对象 ApiName]",
            FQLAttribute.builder()
                .columns([
                    "_id",
                    "name",
                    "field_target_field__c",     // TODO: 修改为需要的字段
                    "field_another_field__c"
                ])
                .queryTemplate(QueryTemplate.AND([
                    ["_id": QueryOperator.EQ(fieldId)]
                ]))
                .build(),
            SelectAttribute.builder().build()
        )
        
        if(queryError){
            log.warn("[ImportValidate] ${key} 查询失败：" + queryMsg)
            globalIsPass = false
            globalErrorMessages.add("记录[${key}] 关联数据查询失败")
            return
        }
        
        if(!queryData){
            log.warn("[ImportValidate] ${key} 未找到关联数据")
            globalIsPass = false
            globalErrorMessages.add("记录[${key}] 关联的 [对象名称] 不存在")
            return
        }
        
        log.info("[ImportValidate] ${key} 查询成功")
        
        // ==================== 4.4 数据处理和转换 ====================
        
        // TODO: 从查询结果中提取和处理数据
        Map processedMap = [:]
        
        // 示例：直接复制字段
        String targetValue = queryData["field_target_field__c"] as String
        processedMap.put("field_copy_from_query__c", targetValue)
        
        // 示例：计算字段
        BigDecimal calculatedAmount = amount.multiply(new BigDecimal("1.1"))  // 加 10%
        processedMap.put("field_calculated_amount__c", calculatedAmount)
        
        // 示例：字符串拼接
        String combinedStr = year + "-" + month + "_" + quantity
        processedMap.put("field_combined__c", combinedStr)
        
        // 示例：条件赋值
        if(quantity > 100){
            processedMap.put("field_category__c", "大批量")
        } else {
            processedMap.put("field_category__c", "小批量")
        }
        
        // ==================== 4.5 唯一性校验 ====================
        
        // TODO: 如果需要唯一性校验
        /*
        String uniqueValue = data["field_unique__c"] as String
        if(uniqueValue != null && uniqueValue != ""){
            Boolean alreadyExists = cache.get(taskId + "_unique_" + uniqueValue)
            if(alreadyExists){
                globalIsPass = false
                globalErrorMessages.add("记录 [${key}] [唯一字段] 重复：${uniqueValue}")
                return
            }
            cache.put(taskId + "_unique_" + uniqueValue, true, 3600)
        }
        */
        
        // ==================== 4.6 缓存处理后的数据 ====================
        
        // 将处理后的数据缓存，供后续前验证函数使用
        // 过期时间：1200 秒 (20 分钟)
        cache.put(key, Fx.json.toJson(processedMap), 1200)
        
        log.info("[ImportValidate] ${key} 处理完成，已缓存")
        
    } catch(Exception e) {
        log.error("[ImportValidate] 处理异常：" + e.getMessage())
        globalIsPass = false
        globalErrorMessages.add("记录处理异常：" + e.getMessage())
    }
}

// ==================== 5. 构建返回结果 ====================

String finalMessage
if(globalIsPass){
    finalMessage = "预处理成功，共处理 ${dataList.size()} 条记录"
    log.info("[ImportValidate] " + finalMessage)
} else {
    finalMessage = globalErrorMessages.join("；\n")
    log.error("[ImportValidate] 预处理失败:\n" + finalMessage)
}

return ValidateResult.builder()
    .success(globalIsPass)
    .errorMessage(finalMessage)
    .build()

/*
================================================================================
使用说明:

1. 缓存数据在后续的【前验证函数】中可以这样获取:
   
   Cache cache = Fx.cache.defaultCache
   String cachedJson = cache.get(recordUnionMark + taskId)
   if(cachedJson){
       Map cachedData = Fx.json.toMap(cachedJson)
       // 使用 cachedData 中的预处理器据
   }

2. 导入流程说明:
   导入预处理 → 本函数 (每条记录)
   ↓
   导入前验证 → 另一个 ValidateResult 函数 (可以读取缓存)
   ↓
   导入执行 → 实际写入数据
   
3. 批量大小：每批 20 条，通过 context.task.lastBatch 判断是否是最后一批

4. 错误处理:
   - success=true: 继续导入
   - success=false: 终止整个导入任务
   - errorMessage: 显示给用户的信息
================================================================================
*/
