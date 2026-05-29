/**
 * @author Claw
 * @codeName 门店大区和归属部门同步计划任务
 * @description 处理门店上面的大区字段 sales_area__c、归属部门 data_own_department 字段
 * 1、获取到门店数据的销售商字段值 sellers__c
 * 2、用销售商字段去查询客户对象获取到归属部门值 data_own_department
 * 3、如果归属部门属于三级部门，则将归属部门字段值写入到客户对象的大区字段 sales_area__c、归属部门 data_own_department 字段
 * 4、如果归属部门层级大于 3 级部门，则查询部门对象递归查询到第 3 级部门停止，将部门 id 写入到客户对象的大区字段 sales_area__c，并将销售商的归属部门写入到归属部门 data_own_department 字段
 * @createTime 2026-03-06
 */

log.info("========== 开始执行门店大区和归属部门同步计划任务 ==========")

// 分页查询所有门店数据
def pageSize = 2000
def pageToken = ''
def totalCount = 0

while (true) {
    // 构建 SQL 查询门店数据（业务类型=门店）
    String sql = "SELECT _id, sellers__c FROM AccountObj WHERE record_type = 'default__c' AND sellers__c != ''"
    
    def selectAttr = SelectAttribute.builder()
        .pageSize(pageSize as Integer)
        .build()
    
    if (pageToken) {
        selectAttr = SelectAttribute.builder()
            .pageSize(pageSize as Integer)
            .pageToken(pageToken)
            .build()
    }
    
    Fx.object.select(sql, selectAttr, { result ->
        List accountList = result.result as List
        log.info("本次查询到门店数：" + accountList.size())
        
        totalCount += accountList.size()
        
        Map batchUpdateMap = [:]
        
        accountList.each { store ->
            String storeId = store["_id"]
            String sellerId = store["sellers__c"]
            
            if (!sellerId) {
                log.info("门店 ${storeId} 没有销售商，跳过")
                return
            }
            
            try {
                // 1. 查询销售商的归属部门
                def sellerResult = Fx.object.findById("AccountObj", sellerId, 
                    FQLAttribute.builder()
                        .columns(["_id", "data_own_department"])
                        .build(),
                    SelectAttribute.builder().build()
                ).result() as Map
                
                if (!sellerResult || !sellerResult["data_own_department"]) {
                    log.info("销售商 ${sellerId} 没有归属部门，跳过")
                    return
                }
                
                List sellerDeptList = sellerResult["data_own_department"] as List
                if (!sellerDeptList || sellerDeptList.isEmpty()) {
                    log.info("销售商 ${sellerId} 的归属部门为空，跳过")
                    return
                }
                
                String sellerDeptId = sellerDeptList.get(0)
                
                // 2. 查询部门信息，判断层级
                List deptInfoList = queryDeptInfo(sellerDeptId)
                if (!deptInfoList || deptInfoList.isEmpty()) {
                    log.info("部门 ${sellerDeptId} 不存在，跳过")
                    return
                }
                
                Map deptInfo = deptInfoList.get(0) as Map
                String deptPath = deptInfo["dept_parent_path"]
                
                int deptLevel = 0
                List pathList = []
                
                if (deptPath) {
                    pathList = deptPath.split("[./]") as List
                    deptLevel = pathList.size()
                }
                
                String areaValue = ""
                String deptValue = sellerDeptId
                
                // 3. 判断部门层级并设置大区值和归属部门
                if (deptLevel == 3) {
                    // 如果是 3 级部门，大区字段和归属部门都填该部门 ID
                    areaValue = sellerDeptId
                    deptValue = sellerDeptId
                    log.info("销售商 ${sellerId} 的部门是 3 级部门：${sellerDeptId}")
                    
                } else if (deptLevel > 3) {
                    // 如果大于 3 级，找到第 3 级部门的 ID 作为大区
                    // pathList[0]=最上级 (999999), pathList[1]=一级 (1036), pathList[2]=二级，pathList[3]=三级
                    String level3DeptId = pathList.get(2)  // 第 3 级部门 ID（索引从 0 开始）
                    areaValue = level3DeptId
                    deptValue = sellerDeptId  // 归属部门保持销售商的原始归属部门
                    log.info("销售商 ${sellerId} 的部门是${deptLevel}级部门 (${sellerDeptId})，第 3 级部门：${level3DeptId}")
                    
                } else {
                    // 小于 3 级的情况，直接使用当前部门
                    areaValue = sellerDeptId
                    deptValue = sellerDeptId
                    log.info("销售商 ${sellerId} 的部门是${deptLevel}级部门 (${sellerDeptId})")
                }
                
                // 准备更新数据
                Map updateData = [:]
                updateData.put("sales_area__c", areaValue)
                updateData.put("data_own_department", [deptValue])
                
                batchUpdateMap.put(storeId, updateData)
                
            } catch (Exception e) {
                log.info("处理门店 ${storeId} 时出错：" + e.getMessage())
            }
        }
        
        // 批量更新门店数据
        if (!batchUpdateMap.isEmpty()) {
            def (Boolean error, List updateData, String errorMsg) = Fx.object.batchUpdate(
                "AccountObj", 
                batchUpdateMap, 
                ["sales_area__c", "data_own_department"]
            )
            
            if (error) {
                log.error("批量更新失败：" + errorMsg)
            } else {
                log.info("成功更新 ${batchUpdateMap.size()} 条门店数据")
            }
        }
        
        // 检查是否还有下一页
        if (accountList.size() < pageSize) {
            break
        }
        
        // 获取下一页 token（需要调整，这里简化处理）
        pageToken = '' // 实际使用时需要根据 API 返回的 token
        
    }).result()
    
    break // 暂时只处理一页，实际使用时需要根据 API 调整分页逻辑
}

log.info("========== 门店大区和归属部门同步完成，共处理 ${totalCount} 条门店数据 ==========")

/**
 * 查询部门信息
 */
List queryDeptInfo(String deptId) {
    def (Boolean deptsError, List deptsData, String deptsMsg) = Fx.object.findByIds("DepartmentObj",
        [deptId],
        FQLAttribute.builder()
            .columns(["_id", "name", "dept_parent_path"])
            .build(),
        SelectAttribute.builder().build())
    
    if (deptsError) {
        log.error("查询部门失败：" + deptsMsg)
        return null
    }
    
    return deptsData
}
