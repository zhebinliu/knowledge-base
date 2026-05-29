/**
 * @author [姓名]
 * @codeName PlnTask_[xxx]
 * @description [功能描述 - 如：定时刷大区总部预算科目]
 * @createTime YYYY-MM-DD
 */

// ==================== 1. 获取输入 ID 列表 ====================

// context.objectIds: 符合条件的主对象 ID 列表 (由计划任务配置过滤)
List ids = context.objectIds as List
log.info("[PlnTask] 开始执行，待处理对象数量：" + ids.size())

if(ids == null || ids.isEmpty()){
    log.info("[PlnTask] 无数据需要处理")
    return
}

// ==================== 2. 批量查询主对象数据 ====================

// TODO: 修改对象名和需要的字段
def(boolean error, List dataList, String errorMessage) = Fx.object.findByIds(
    "[主对象 ApiName]", 
    ids,
    FQLAttribute.builder()
        .columns([
            "_id",                    // 必须有_id
            "name",                   // 可选：名称字段
            "field_related_id__c"     // TODO: 添加你的关联字段
        ])
        .build()
)

if(error){
    log.error("[PlnTask] 批量查询失败：" + errorMessage)
    return
}

if(dataList == null || dataList.isEmpty()){
    log.info("[PlnTask] 未查询到有效数据")
    return
}

log.info("[PlnTask] 查询到 ${dataList.size()} 条记录")

// ==================== 3. 准备批量更新 Map ====================

Map batchUpdateMap = [:]  // key: _id, value: {field: value}

dataList.each { item ->
    Map map = item as Map
    
    String dataId = map["_id"] as String
    // TODO: 提取需要的字段值
    String relatedId = map["field_related_id__c"] as String
    
    try {
        // ==================== 4. 关联查询 ====================
        
        def(boolean err, Map relData, String errMsg) = Fx.object.findOne(
            "[关联对象 ApiName]",
            FQLAttribute.builder()
                .columns([
                    "_id",
                    "field_target_field__c"  // TODO: 你要取的目标字段
                ])
                .queryTemplate(QueryTemplate.AND([
                    ["_id": QueryOperator.EQ(relatedId)]
                ]))
                .build(),
            SelectAttribute.builder().build()
        )
        
        if(err){
            log.warn("[PlnTask] ID=${dataId} 关联查询失败：" + errMsg)
            return  // 跳过这条
        }
        
        if(!relData){
            log.warn("[PlnTask] ID=${dataId} 未找到关联数据")
            return  // 跳过这条
        }
        
        // ==================== 5. 数据处理 ====================
        
        // TODO: 从关联数据中提取并处理
        String targetValue = relData["field_target_field__c"] as String
        
        // 可能的数据处理逻辑示例:
        // String processedValue = targetValue.toUpperCase()
        // BigDecimal calculatedAmount = new BigDecimal(targetValue) * rate
        // Date convertedDate = new Date(targetValue)
        
        // ==================== 6. 添加到批量更新 ====================
        
        Map updateMap = [:]
        updateMap.put("field_to_update__c", targetValue)  // TODO: 修改为你要更新的字段
        
        // 可以更新多个字段
        // updateMap.put("field_a__c", valueA)
        // updateMap.put("field_b__c", valueB)
        
        batchUpdateMap.put(dataId, updateMap)
        
    } catch(Exception e) {
        log.error("[PlnTask] ID=${dataId} 处理异常：" + e.getMessage())
        // continue - 跳过异常记录
    }
}

// ==================== 7. 执行批量更新 ====================

if(batchUpdateMap.isEmpty()){
    log.info("[PlnTask] 没有数据需要更新")
    return
}

log.info("[PlnTask] 准备更新 ${batchUpdateMap.size()} 条记录")

try {
    // TODO: 修改对象名和字段列表
    List fields = Lists.newArrayList('field_to_update__c')
    // 如果有多个字段要更新，添加到这里
    // fields.add('field_a__c')
    // fields.add('field_b__c')
    
    def result = Fx.object.batchUpdate(
        "[主对象 ApiName]", 
        batchUpdateMap, 
        fields
    ).result()
    
    log.info("[PlnTask] 批量更新成功，结果：" + Fx.json.toJson(result))
    
} catch(Exception e) {
    log.error("[PlnTask] 批量更新失败：" + e.getMessage())
}

// ==================== 8. 结束统计 ====================

log.info("[PlnTask] 执行完成，共更新 ${batchUpdateMap.size()} 条记录")
