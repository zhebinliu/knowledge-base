# APL 常见编译问题

本文档记录了 APL 开发过程中常见的编译错误及其解决方法。

## 目录

1. [多重赋值返回类型问题](#1-多重赋值返回类型问题)
2. [Map 类型转换问题](#2-map-类型转换问题)
3. [API 参数数量问题](#3-api-参数数量问题)
4. [变量类型声明问题](#4-变量类型声明问题)

---

## 1. 多重赋值返回类型问题

### 错误信息
```
[Static type checking] - Cannot find matching method java.util.List#size()
```

### 原因分析
在 Groovy 静态类型检查时，多重赋值返回的类型推断为 `List` 而不是具体的元组类型。当尝试访问返回值的属性或方法时，编译器无法正确推断类型。

### 解决方案
使用显式类型声明，将返回值分别声明为具体的类型。

### 错误示例
```groovy
// ❌ 错误：多重赋值返回类型推断问题
def (createList, updateList, deleteIds) = classifyProducts(orderProducts, existingProducts, orderId)

// 后续使用时会报错
log.info("创建数量: ${createList.size()}")  // 编译错误
```

### 正确示例
```groovy
// ✅ 正确：使用显式类型声明
List<Map> createList = []
List<Map> updateList = []
List<String> deleteIds = []

classifyProducts(orderProducts, existingProducts, orderId, createList, updateList, deleteIds)

// 后续使用正常
log.info("创建数量: ${createList.size()}")  // 编译通过
```

---

## 2. Map 类型转换问题

### 错误信息
```
[Static type checking] - Cannot find matching method java.lang.Object#putAt(java.lang.String, java.lang.Object)
```
或
```
[Static type checking] - Cannot find matching method java.lang.Object#getAt(java.lang.String)
```

### 原因分析
Map 字面量语法 `[:]` 在闭包内或复杂表达式中，类型推断可能不正确，被推断为 `Object` 类型而不是 `Map` 类型。

### 解决方案
1. 使用显式 `Map` 类型声明
2. 使用 `new HashMap()` 创建 Map
3. 在闭包内使用 `as Map` 进行类型转换

### 错误示例
```groovy
// ❌ 错误：Map 字面量在闭包内类型推断不正确
Map batchData = [:]
productsToUpdate.each { product ->
    def id = product._id as String
    batchData[id] = [  // 编译错误：Object 不能使用 putAt
        "product_id": product.product_id,
        "quantity": product.quantity
    ]
}
```

### 正确示例
```groovy
// ✅ 正确方案1：使用 new HashMap()
Map batchData = new HashMap()
productsToUpdate.each { product ->
    Map productMap = product as Map
    def id = productMap._id as String
    Map updateData = new HashMap()
    updateData["product_id"] = productMap.product_id
    updateData["quantity"] = productMap.quantity
    batchData[id] = updateData
}

// ✅ 正确方案2：使用显式 Map 类型声明
Map batchData = [:]
productsToUpdate.each { product ->
    Map productMap = product as Map
    def id = productMap._id as String
    Map updateData = [
        "product_id": productMap.product_id,
        "quantity": productMap.quantity
    ]
    batchData[id] = updateData
}
```

---

## 3. API 参数数量问题

### 错误信息
```
[Static type checking] - Cannot find matching method com.fxiaoke.functions.api.ObjectDataAPI#batchCreate(...)
```

### 原因分析
未查看官方文档，凭经验猜测 API 签名，导致参数数量或类型不匹配。

### 解决方案
1. **优先查看官方文档**：`<aplApiDocs>`
2. 确认 API 的参数数量和类型
3. 使用正确的参数调用 API

### 错误示例
```groovy
// ❌ 错误：batchCreate 参数数量不正确
def (Boolean error, List<Map> result, String msg) = Fx.object.batchCreate(
    "SalesOrderProductObj",
    productsToCreate,
    BatchAttribute.builder().build()  // 错误：应该使用 CreateAttribute
)
```

### 正确示例
```groovy
// ✅ 正确：查看文档后使用正确的参数
// batchCreate 需要3个参数：apiName, objectDataList, createAttribute
def (Boolean error, List<Map> result, String msg) = Fx.object.batchCreate(
    "SalesOrderProductObj",
    productsToCreate,
    CreateAttribute.builder().build()
)

// batchUpdate 需要4个参数：apiName, batchData, updateFields, batchUpdateAttribute
Map batchData = [:]
List updateFields = ["product_id", "quantity", "product_price"]
def (Boolean updateError, List updateResult, String updateMsg) = Fx.object.batchUpdate(
    "SalesOrderProductObj",
    batchData,
    updateFields,
    BatchUpdateAttribute.builder().build()
)

// batchDelete 只需要2个参数：apiName, objectIds
def (Boolean deleteError, Map deleteResult, String deleteMsg) = Fx.object.batchDelete(
    "SalesOrderProductObj",
    productIdsToDelete
)
```

### 重要提示
| API | 参数数量 | 参数说明 |
|-----|---------|---------|
| Fx.object.create | 4 | apiName, objectData, details, createAttribute |
| Fx.object.batchCreate | 3 | apiName, objectDataList, createAttribute |
| Fx.object.batchUpdate | 4 | apiName, batchData, updateFields, batchUpdateAttribute |
| Fx.object.batchDelete | 2 | apiName, objectIds |

---

## 4. 变量类型声明问题

### 错误信息
```
[Static type checking] - Cannot find matching method java.lang.Object#product_id
```

### 原因分析
使用 `def` 声明的变量被推断为 `Object` 类型，无法访问 Map 的属性。在闭包内遍历 List 时，每个元素也被推断为 `Object` 类型。

### 解决方案
1. 使用显式类型声明 `Map variableName`
2. 在闭包内使用 `as Map` 进行类型转换

### 错误示例
```groovy
// ❌ 错误：def 声明的变量类型推断为 Object
def matchingNewProduct = null
if (orderProducts && orderProducts.size() > 0) {
    orderProducts.each { newProduct ->
        def newMap = newProduct as Map
        if (newMap.sale_contract_line_id == contractLineId) {
            matchingNewProduct = newMap
        }
    }
}

// 后续使用时会报错
if (matchingNewProduct != null) {
    def updateData = [
        "product_id": matchingNewProduct.product_id  // 编译错误
    ]
}
```

### 正确示例
```groovy
// ✅ 正确：使用显式 Map 类型声明
Map matchingNewProduct = null
if (orderProducts && orderProducts.size() > 0) {
    orderProducts.each { newProduct ->
        Map newMap = newProduct as Map
        if (newMap.sale_contract_line_id == contractLineId) {
            matchingNewProduct = newMap
        }
    }
}

// 后续使用正常
if (matchingNewProduct != null) {
    def updateData = [
        "product_id": matchingNewProduct.product_id  // 编译通过
    ]
}
```

---

## 最佳实践

### 1. 类型声明原则
- **优先使用显式类型声明**：对于 Map、List 等集合类型，使用 `Map variableName` 或 `List<Map> variableName`
- **避免过度使用 def**：def 只适用于类型明确或不需要访问属性的场景

### 2. API 调用原则
- **优先查看官方文档**：遇到 API 调用问题时，必须优先查看官方文档
- **不要凭经验猜测**：不同版本的 API 可能有差异

### 3. 编译错误排查流程
1. 查看错误信息，定位错误位置
2. 分析错误原因（类型推断、参数数量等）
3. 查看官方文档确认正确用法
4. 使用显式类型声明解决问题

---

## 相关文档

- API 文档：`<aplApiDocs>`
- 数据类型文档：`<aplDataTypeDocs>`
- 平台限制文档：`<enterpriseEA>/.sharedev/docs/apl/pages/func-apl/start/limit.md`
