# APL API 坑点总结 (2026-03-06 更新)

**重要！避免踩坑的必备指南** 📝

---

## ✅ 核心原则：严格按照真实项目写法

### 1. `Fx.object.find()` 返回值类型

**🔴 重要发现**: `Fx.object.find()` 返回的是 **QueryResult 对象**,不是 Map！

**参考真实项目** (`Account_AddSync_53GBh.groovy`):
```groovy
// ❌ 错误（之前一直这么写）:
def (Boolean error, Map data, String msg) = Fx.object.find(...)
List dataList = data['list'] as List

// ✅ 正确写法（用 Map 方式取值）：
def (Boolean error, QueryResult queryResult, String msg) = Fx.object.find(...)
List dataList = queryResult["dataList"] as List  // ⭐ 用 [] 取值
```

**⚠️ 记住**: QueryResult 虽然是对象，但要用 `queryResult["dataList"]` 而不是 `queryResult.dataList`！

### 2. 类型转换直接用 `as`

**❌ 不要用复杂的辅助方法**：
```groovy
Integer count = toNumber(rowData['code_value'])  // ❌ 过度设计
```

**✅ 直接用 `as Integer`**：
```groovy
Integer count = rowData['code_value'] as Integer  // ✅ 简单直接
```

---

## ⚠️ HTTP 请求参数差异（严重！）

### 2. GET vs POST 方法签名

**🔴 错误原因：Fx.http.get() 少了第 5 个参数导致 ClassCastException**

**✅ GET 方法完整签名（6 个参数！不是 4 个！）**：
```groovy
// 错误示范（只有 4 个参数）：
def (Boolean error, HttpResult result, String msg) = Fx.http.get(url, headers, 120000, false)
// ❌ 报错：Cannot find matching method HttpAPI#get(String, LinkedHashMap, int, boolean)

// ✅ 正确写法（6 个参数，参照 CstmCtrl_7SxF8.groovy）：
def (Boolean error, HttpResult result, String msg) = Fx.http.get(
    url,              // String - URL
    headers,          // Map - 第二个参数！
    120000,           // Integer - timeout (毫秒)
    false,            // Boolean - ignoreSSL
    2,                // Integer - retryCount ⭐ 第 5 个参数，不能少！
    false             // Boolean - followRedirect
)
```

**✅ POST 方法（7 个参数）**：
```groovy
// (url, headers, body, timeout, ignoreSSL, retryCount, followRedirect)
def (Boolean error, HttpResult result, String msg) = Fx.http.post(
    url,           // String - URL
    headers,       // Map - headers
    [:],           // Map - body (必须传，即使是空 Map)
    120000,        // Integer - timeout
    false,         // Boolean - ignoreSSL
    2,             // Integer - retryCount
    false          // Boolean - followRedirect
)
```

**⚠️ 记住：**
- GET: `Fx.http.get(url, headers, timeout, ignoreSSL, retryCount, followRedirect)` - 6 个参数
- POST: `Fx.http.post(url, headers, body, timeout, ignoreSSL, retryCount, followRedirect)` - 7 个参数

### 3. URL 拼接方式（蒙牛广告数据平台专用）

**❌ 不要用 `${}` 字符串插值**（虽然语法上没问题，但某些服务器会拒绝）：
```groovy
String url = "${domainName}/api?appCode=${appCode}"  // ⚠️ 可能导致 "the request portal is error"
```

**✅ 用 `+` 连接符**（参考正常工作的接口）：
```groovy
String url = domainName + "/api?appCode=" + appCode + "&returnTotalNum=true&pageNum=" + pageNum + "&pageSize=1000
```

**⚠️ 不要加空参数**（关键！）：
```groovy
// ❌ 错误的 URL（多了空参数导致 403）
String url = ... + "&create_date=&shop_no=&distributor_id=&salesman_id="

// ✅ 正确的 URL（只包含必要参数）
String url = ... + "&pageNum=" + pageNum + "&pageSize=1000
```

---

## 🟡 数据类型声明规范

### 3. 子方法返回值必须明确

**✅ 正确写法**：
```groovy
Map fetchSourceData(Integer page) {  // 明确返回 Map
    return [totalNum: 100, rows: list]
}
```

---

## 📋 快速检查清单

在写完代码后，对照以下问题自查：

- [ ] Fx.object.find() 直接用 `Map data`？
- [ ] 直接用 `data['list'] as List` 取数据？
- [ ] 简单类型转换直接用 `as Integer/String`？
- [ ] HTTP GET/POST 的参数数量是否正确？
- [ ] URL 中有没有多余的空查询参数？

---

## 🔄 常见错误对照表

| 错误 | 症状 | 修复 |
|------|------|------|
| ClassCastException | 调用 Fx.object.find() 后处理出错 | QueryResult 本身就是 Map，直接当 Map 用 |
| 403 Forbidden | 浏览器能打开，代码不行 | 删掉空参数，用 `+` 拼接 URL |
| Missing parameter | POST 请求参数不对 | 确认 7 个参数顺序，body 不能漏 |

---

**核心原则**: **简单直接！别过度设计！**

**最后更新**: 2026-03-06  
**版本**: v2.0 (简化版)

---

## ⚠️ batchUpdate 参数数量错误（2026-03-06 更新）

**问题**: `batchUpdate` 只有 **3 个参数**，不要加 `BatchUpdateAttribute`！

**参考真实项目** (`CstmCtrl_58xPY.groovy`):
```groovy
def (Boolean accountError, List accountData, String accountMsg) = Fx.object.batchUpdate(
    "AccountObj", 
    updateMapAll, 
    ["field_white_milk_order__c", ...]
)
// ⚠️ 注意：只有 3 个参数，没有第 4 个 BatchUpdateAttribute!
```

**关键点**:
- ✅ 返回值类型：`List`,不是 `Map`!
- ✅ 参数数量：3 个 - `(objectName, updateMap, fields)`
- ❌ 不要加：`BatchUpdateAttribute.builder().build()`
