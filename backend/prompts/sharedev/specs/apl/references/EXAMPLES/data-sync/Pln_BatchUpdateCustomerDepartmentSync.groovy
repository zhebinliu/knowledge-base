/**
 * @author Claw
 * @codeName 批量更新客户归属部门 - 同步到客户对象
 * @description 将"批量更新客户归属部门"对象中的数据同步到客户对象的大区和归属部门字段
 * 1. 获取到批量更新客户归属部门 custom_object_examplezz__c 对象中客户编码 name、大区 region__c、归属的部门 department_of_attachment__c 值
 * 2. 使用客户编码 name 去查询客户对象 AccountObj 的客户编码 account_no__c 字段值，获取到客户 id
 * 3. 使用客户 id 去更新客户对象中的大区、归属部门字段，将 department_of_attachment__c、region__c 写入到客户对象中的 data_own_department、sales_area__c 字段值，需要触发客户对象的工作流
 * @createTime 2026-03-12
 */

log.info("========== 批量更新客户归属部门 - 同步到客户对象 开始 ==========")

// ============================================
// Step 1: 定义常量
// ============================================

def SOURCE_OBJECT = "custom_object_examplezz__c" // 批量更新客户归属部门（⚠️ TODO: 请确认此 API Name 是否正确）
def TARGET_OBJECT = "AccountObj"                  // 客户对象
def pageSize = 500                                // 单次查询数量

// ============================================
// Step 2: 查询源对象数据
// ============================================

String sql = "SELECT _id, name, region__c, department_of_attachment__c FROM " + SOURCE_OBJECT

def selectAttr = SelectAttribute.builder()
    .pageSize(pageSize as Integer)
    .build()

log.info("正在查询源对象数据...")

def result = Fx.object.select(sql, selectAttr, { res ->
    List sourceList = res.result as List
    
    if (!sourceList || sourceList.isEmpty()) {
        log.info("未找到需要处理的数据")
        return
    }
    
    log.info("找到 " + sourceList.size() + " 条待同步数据")

    // ============================================
    // Step 3: 遍历数据，构建客户更新映射表
    // ============================================
    
    Map batchUpdateMap = [:]
    int successCount = 0
    int failCount = 0
    
    sourceList.eachWithIndex { item, index ->
        String sourceRecordId = item["_id"] as String
        String customerCode = (item["name"] as String ?: "").trim()
        String region = (item["region__c"] as String ?: "").trim()
        String department = (item["department_of_attachment__c"] as String ?: "").trim()
        
        // 跳过空客户编码
        if (!customerCode) {
            log.info("记录 #" + (index + 1) + ": 客户编码为空，跳过")
            failCount++
            return
        }
        
        try {
            // ============================================
            // Step 4: 通过客户编码查询客户 ID
            // ============================================
            
            String querySql = "SELECT _id FROM " + TARGET_OBJECT + " WHERE account_no__c = '" + customerCode + "'"
            
            def filterAttr = SelectAttribute.builder()
                .pageSize(1 as Integer)
                .build()
                
            def findResult = Fx.object.select(querySql, filterAttr, { findRes ->
                List accountIdList = findRes.result as List
                
                if (!accountIdList || accountIdList.isEmpty()) {
                    log.error("记录 #" + (index + 1) + " 客户编码 [" + customerCode + "]: 未找到对应的客户")
                    failCount++
                    return
                }
                
                String accountId = accountIdList.get(0)["_id"]
                
                // ============================================
                // Step 5: 构建更新数据
                // ============================================
                
                Map updateData = [:]
                
                // 只添加非空字段
                if (region) {
                    updateData.put("sales_area__c", region) // 大区 [department]
                }
                
                if (department) {
                    // ⚠️ 注意：data_own_department 是 List 类型
                    updateData.put("data_own_department", [department]) // 归属部门 [department]
                }
                
                if (updateData.isEmpty()) {
                    log.info("记录 #" + (index + 1) + " 客户编码 [" + customerCode + "]: 无有效更新字段，跳过")
                    failCount++
                    return
                }
                
                // 添加到批量更新映射表
                batchUpdateMap.put(accountId, updateData)
                successCount++
                
                log.info("✓ 准备更新客户 [" + customerCode + "] -> 大区:" + region + ", 归属部门:" + department)
                
            }).result()
            
        } catch (Exception e) {
            log.error("处理记录 #" + (index + 1) + " 时出错：" + e.getMessage())
            failCount++
        }
    }
    
    // ============================================
    // Step 6: 执行批量更新（会触发工作流）
    // ============================================
    
    if (!batchUpdateMap.isEmpty()) {
        log.info("\n⏳ 即将批量更新 " + batchUpdateMap.size() + " 个客户...")
        
        // ✅ 使用 update 方法会触发工作流事件
        def (Boolean error, List updateData, String errorMsg) = Fx.object.batchUpdate(
            TARGET_OBJECT, 
            batchUpdateMap, 
            ["sales_area__c", "data_own_department"]
        )
        
        if (error) {
            log.error("❌ 批量更新失败：" + errorMsg)
        } else {
            log.info("✅ 成功更新 " + batchUpdateMap.size() + " 个客户")
        }
    } else {
        log.info("没有需要更新的客户")
    }
    
    // ============================================
    // Step 7: 输出结果日志
    // ============================================
    
    log.info("\n=============================================")
    log.info("📊 同步结果统计:")
    log.info("   总记录数：" + sourceList.size())
    log.info("   处理成功：" + successCount)
    log.info("   处理失败：" + failCount)
    log.info("=============================================")

}).result()

log.info("========== 批量更新客户归属部门 - 同步到客户对象 完成 ==========")
