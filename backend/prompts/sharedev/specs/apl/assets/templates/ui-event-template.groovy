/**
 * @author [姓名]
 * @codeName UIEvt_[xxx]
 * @description [功能描述 - 如：加载门店相关信息]
 * @createTime YYYY-MM-DD
 */

// ==================== 1. 获取输入参数 ====================

// TODO: 根据需求修改字段名
String inputDataId = context.data["field_input_id__c"] as String

// 初始化返回值
List resultList = []
String yearValue = ""
String monthValue = ""

// ==================== 2. 条件判断和查询 ====================

if(inputDataId != null && inputDataId != ""){
    
    // TODO: 修改对象名和需要的字段
    def(error, data, errorMsg) = Fx.object.findById(
        "[关联对象 ApiName]", 
        inputDataId
    )
    
    if(!error && data){
        try {
            // ==================== 3. 提取数据 ====================
            
            // TODO: 根据你的需求提取字段
            
            // List 类型示例
            resultList = data["field_list__c"] as List ?: []
            
            // String 类型示例
            String yearMonthStr = data["field_year_month__c"] as String
            if(yearMonthStr != null && yearMonthStr.length() >= 7){
                yearValue = yearMonthStr.substring(0, 4)      // 年份
                monthValue = yearMonthStr.substring(5, 7)     // 月份
            }
            
            // 其他类型转换示例
            // Integer count = data["field_count__c"] as Integer ?: 0
            // BigDecimal amount = data["field_amount__c"] as BigDecimal ?: new BigDecimal("0")
            // String name = data["name"] as String ?: ""
            
            log.info("[UIEvt] 查询成功 - 年：" + yearValue + ", 月：" + monthValue)
            
        } catch(Exception e) {
            log.error("[UIEvt] 数据解析失败：" + e.getMessage())
        }
    } else {
        log.warn("[UIEvt] 查询失败或无数据：" + errorMsg)
    }
} else {
    log.info("[UIEvt] 无输入 ID，跳过查询")
}

// ==================== 4. 构建 UI 事件 ====================

UIEvent event = UIEvent.build(context) { 
    
    // ==================== 4.1 主对象字段回写 ====================
    
    editMaster(
        "field_result_list__c": resultList,    // TODO: 修改为你的字段
        "field_year__c": yearValue,
        "field_month__c": monthValue,
        
        // 可以继续添加更多字段
        // "field_a__c": valueA,
        // "field_b__c": valueB
    )
    
    // ==================== 4.2 从对象操作 (可选) ====================
    
    // 显示从对象
    // showChild("[从对象 ApiName]")
    
    // 刷新从对象
    // reloadChild("[从对象 ApiName]")
    
    // 隐藏从对象
    // hideChild("[从对象 ApiName]")
    
    // ==================== 4.3 字段显示/隐藏 (可选) ====================
    
    // 隐藏字段
    // hideField("field_hidden__c")
    
    // 显示字段
    // showField("field_visible__c")
    
    // ==================== 4.4 字段禁用/启用 (可选) ====================
    
    // 禁用字段
    // disableField("field_disabled__c")
    
    // 启用字段
    // enableField("field_enabled__c")
    
    // ==================== 4.5 跳转链接 (可选) ====================
    
    // 跳转到对象详情页
    // navigateTo("[对象 ApiName]", recordId)
    
    // ==================== 4.6 提示信息 (可选) ====================
    
    // 显示提示
    // toast("操作成功")
    
    // 显示错误提示
    // alert("操作失败：" + errorMessage)
}

return event
