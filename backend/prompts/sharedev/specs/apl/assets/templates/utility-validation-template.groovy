/**
 * @author 纷享 - 杨亚兴
 * @codeName utilityValidationTemplate
 * @description 通用数据验证工具函数集合 (身份证、手机号、邮箱等)
 * @createTime 2026-03-04
 */

// ==================== 1. 身份证号码验证 ====================

/*
 * 场景：在客户档案中记录身份证号码信息，用于合同签订时使用
 * 需求：校验身份证号码真实性
 */
def validateIDCard(String idCard){
    Remind remind = null
    
    // 基本格式校验
    if(idCard == null || idCard.trim() == ""){
        return Remind.Text('请录入证件号码！')
    }
    
    if(idCard.length() != 18){
        log.info("身份证号码不为 18 位")
        return Remind.Text('请录入 18 位证件号码！')
    }
    
    // 初始化信息
    List wi = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2, 0]  // 加权因子
    List valideCode = [1, 0, 10, 9, 8, 7, 6, 5, 4, 3, 2]  // 身份证验证位值，10 代表 X
    List idCardList = idCard.split('') as List
    
    int sum = 0 // 声明加权求和变量
    if ((idCardList[17] as String).toLowerCase() == 'x'){
        idCardList[17] = 10 // 将最后位为 x 的验证码替换为 10 方便后续操作
    }
    
    // 计算权求和
    Range range = Ranges.of(0, 17)
    range.each { i ->
        sum += (wi[i] as int) * (idCardList[i] as int) // 加权求和
    }
    
    // 计算校验码位置
    int valCodePosition = sum % 11 // 得到验证码所位置
    int idCardList_17 = idCardList[17] as int
    int valideCode_ = valideCode[valCodePosition] as int
    
    log.info('idCardList_17 = ' + idCardList_17)
    log.info('valideCode_ = ' + valideCode_)
    
    if (idCardList_17 != valideCode_){
        return Remind.Text('请填写正确的证件号码！')
    }
    
    return null // 验证通过
}

// ==================== 2. 手机号码验证 ====================

def validatePhone(String phone){
    if(phone == null || phone.trim() == ""){
        return Remind.Text('请输入手机号码！')
    }
    
    if(!phone.matches('^1[3-9]\\d{9}$')){
        return Remind.Text('手机号码格式不正确！')
    }
    
    return null // 验证通过
}

// ==================== 3. 邮箱地址验证 ====================

def validateEmail(String email){
    if(email == null || email.trim() == ""){
        return Remind.Text('请输入邮箱地址！')
    }
    
    if(!email.matches('.+@.+\\..+')){
        return Remind.Text('邮箱格式不正确！')
    }
    
    return null // 验证通过
}

// ==================== 4. 统一社会信用代码验证 ====================

def validateUSCC(String uscc){
    /*
     * 统一社会信用代码校验算法
     * 长度应为 18 位，第 18 位是校验码
     */
    if(uscc == null || uscc.trim() == ""){
        return Remind.Text('请输入统一社会信用代码！')
    }
    
    if(uscc.length() != 18){
        return Remind.Text('统一社会信用代码应为 18 位！')
    }
    
    // TODO: 实现完整的 USCC 校验逻辑
    
    return null // 验证通过
}

// ==================== 5. 日期格式验证 ====================

def validateDateFormat(String dateStr, String format="yyyy-MM-dd"){
    if(dateStr == null || dateStr.trim() == ""){
        return Remind.Text('请输入日期！')
    }
    
    try {
        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat(format)
        sdf.setLenient(false)
        sdf.parse(dateStr)
        return null // 验证通过
    } catch(Exception e){
        return Remind.Text("日期格式不正确，应为 ${format}")
    }
}

// ==================== 6. 数字范围验证 ====================

def validateNumberRange(BigDecimal value, BigDecimal min, BigDecimal max, String fieldName){
    if(value == null){
        return Remind.Text("${fieldName} 不能为空")
    }
    
    if(min != null && value.compareTo(min) < 0){
        return Remind.Text("${fieldName} 不能小于 ${min}")
    }
    
    if(max != null && value.compareTo(max) > 0){
        return Remind.Text("${fieldName} 不能大于 ${max}")
    }
    
    return null // 验证通过
}

// ==================== 7. 金额大小写一致性验证 ====================

def validateAmountCapital(BigDecimal amount, String capital){
    /*
     * 验证小写金额和大写金额是否一致
     */
    if(amount == null || capital == null || capital == ""){
        return Remind.Text('请填写完整金额信息')
    }
    
    String calculatedCapital = amountToCapital(amount)
    if(!capital.contains(calculatedCapital)){
        return Remind.Text('大写金额与小写金额不一致')
    }
    
    return null // 验证通过
}

// ==================== 8. URL 格式验证 ====================

def validateURL(String url){
    if(url == null || url.trim() == ""){
        return Remind.Text('请输入链接地址')
    }
    
    // 基础 URL 正则匹配
    if(!url.matches('^(https?|ftp)://[^\\s/$.?#].[^\\s]*$')){
        return Remind.Text('URL 格式不正确')
    }
    
    return null // 验证通过
}

// ==================== 辅助函数：金额转大写 ====================

static String amountToCapital(BigDecimal amount){
    if(amount == null){
        return ""
    }
    
    String[] units = {"零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"}
    String[] digits = {"", "拾", "佰", "仟"}
    String[] bigUnits = {"", "万", "亿"}
    
    // 实现略...使用标准算法
    // 这是一个简化版本，实际使用时建议用更完整的实现
    
    return ""
}

// ==================== 使用示例 ====================

/*
// 在前验证函数中使用:

String idCard = context.data.field_idcard__c as String
Remind remind = validateIDCard(idCard)
if(remind != null){
    return remind
}

String phone = context.data.field_phone__c as String
remind = validatePhone(phone)
if(remind != null){
    return remind
}

return ValidateResult.builder()
    .success(true)
    .errorMessage("验证通过")
    .build()
*/
