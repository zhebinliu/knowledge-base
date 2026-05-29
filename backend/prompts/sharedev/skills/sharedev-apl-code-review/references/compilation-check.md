# 编译问题检查清单

本文档提供 APL 代码审查时的编译问题检查清单，帮助审查者快速识别常见的编译错误。

## 检查清单

### 1. Map 类型转换检查

| 检查项 | 检查方式 | 问题级别 |
|--------|----------|----------|
| Map 字面量在闭包内使用 | 检查 `each`、`collect` 等闭包内的 Map 操作 | 🔴 严重 |
| Map 属性访问 | 检查 `map.key` 或 `map['key']` 的类型 | 🔴 严重 |
| Map 赋值操作 | 检查 `map[key] = value` 的类型 | 🔴 严重 |

**检查要点**：
- [ ] 闭包内访问 Map 属性时,是否使用了 `as Map` 类型转换？
- [ ] Map 字面量 `[:]` 是否被正确声明为 `Map` 类型？
- [ ] Map 赋值操作是否使用了显式 Map 类型？

**错误示例**：
```groovy
// ❌ 错误：闭包内未进行类型转换
existingProducts.each { existingProduct ->
    def contractLineId = existingProduct.sale_contract_line_id  // 编译错误
}
```

**正确示例**：
```groovy
// ✅ 正确：使用 as Map 进行类型转换
existingProducts.each { existingProduct ->
    Map existingMap = existingProduct as Map
    def contractLineId = existingMap.sale_contract_line_id
}
```

---

### 2. API 参数数量检查

| 检查项 | 检查方式 | 问题级别 |
|--------|----------|----------|
| Fx.object.create 参数 | 检查是否传入4个参数 | 🔴 严重 |
| Fx.object.batchCreate 参数 | 检查是否传入3个参数 | 🔴 严重 |
| Fx.object.batchUpdate 参数 | 检查是否传入4个参数 | 🔴 严重 |
| Fx.object.batchDelete 参数 | 检查是否传入2个参数 | 🔴 严重 |

**检查要点**：
- [ ] 是否查看了官方文档确认 API 签名？
- [ ] 参数数量是否正确？
- [ ] 参数类型是否正确？

**API 参数对照表**：

| API | 参数数量 | 参数列表 |
|-----|---------|---------|
| Fx.object.create | 4 | apiName, objectData, details, createAttribute |
| Fx.object.update | 4 | apiName, objectId, objectData, updateAttribute |
| Fx.object.batchCreate | 3 | apiName, objectDataList, createAttribute |
| Fx.object.batchUpdate | 4 | apiName, batchData, updateFields, batchUpdateAttribute |
| Fx.object.batchDelete | 2 | apiName, objectIds |
| Fx.object.find | 3 | apiName, fqlAttribute, selectAttribute |

---

### 3. 变量类型声明检查

| 检查项 | 检查方式 | 问题级别 |
|--------|----------|----------|
| def 声明的 Map 变量 | 检查后续是否访问 Map 属性 | 🔴 严重 |
| 闭包参数类型 | 检查闭包参数是否需要类型转换 | 🔴 严重 |
| 多重赋值返回值 | 检查返回值是否需要显式类型 | 🟡 警告 |

**检查要点**：
- [ ] 使用 `def` 声明的变量，后续是否访问了属性？
- [ ] 闭包参数是否进行了类型转换？
- [ ] 多重赋值返回值是否使用了显式类型声明？

**错误示例**：
```groovy
// ❌ 错误：def 声明的变量后续访问属性
def matchingNewProduct = null
// ...
if (matchingNewProduct != null) {
    def productId = matchingNewProduct.product_id  // 编译错误
}
```

**正确示例**：
```groovy
// ✅ 正确：使用显式 Map 类型声明
Map matchingNewProduct = null
// ...
if (matchingNewProduct != null) {
    def productId = matchingNewProduct.product_id
}
```

---

### 4. 多重赋值返回类型检查

| 检查项 | 检查方式 | 问题级别 |
|--------|----------|----------|
| 多重赋值返回值使用 | 检查返回值是否调用方法 | 🟡 警告 |
| 返回值类型推断 | 检查返回值类型是否明确 | 🟡 警告 |

**检查要点**：
- [ ] 多重赋值的返回值是否使用了显式类型声明？
- [ ] 返回值是否调用了 `.size()`、`.get()` 等方法？

**错误示例**：
```groovy
// ❌ 错误：多重赋值返回值调用方法
def (createList, updateList, deleteIds) = classifyProducts(...)
log.info("创建数量: ${createList.size()}")  // 编译错误
```

**正确示例**：
```groovy
// ✅ 正确：使用显式类型声明
List<Map> createList = []
List<Map> updateList = []
List<String> deleteIds = []
classifyProducts(..., createList, updateList, deleteIds)
log.info("创建数量: ${createList.size()}")
```

---

## 审查流程

### Step 1: 编译检查
```bash
sharedev apl compile <apiName>
```
- 如果编译失败，记录错误详情
- 定位错误位置和原因

### Step 2: 静态分析
```bash
sharedev apl analyze <apiName>
```
- 如果静态分析失败，记录违规项
- 提示用户修复问题

### Step 3: 代码审查
按照上述检查清单逐项检查：
1. Map 类型转换检查
2. API 参数数量检查
3. 变量类型声明检查
4. 多重赋值返回类型检查

### Step 4: 问题记录
将发现的问题记录到 REVIEW.md 中，按严重程度分级：
- 🔴 严重：阻断编译的问题
- 🟡 警告：潜在的类型安全问题
- 🟢 建议：代码风格建议

---

## 常见问题修复建议

### 问题1: Map 类型转换错误
**修复方法**：在闭包内使用 `as Map` 进行类型转换
```groovy
// 修复前
list.each { item ->
    def value = item.key
}

// 修复后
list.each { item ->
    Map itemMap = item as Map
    def value = itemMap.key
}
```

### 问题2: API 参数数量错误
**修复方法**：查看官方文档，使用正确的参数数量
```groovy
// 修复前
Fx.object.batchCreate("Obj", dataList, BatchAttribute.builder().build())

// 修复后
Fx.object.batchCreate("Obj", dataList, CreateAttribute.builder().build())
```

### 问题3: 变量类型声明错误
**修复方法**：使用显式类型声明
```groovy
// 修复前
def product = null

// 修复后
Map product = null
```

---

## 相关文档

- [常见编译问题](../../sharedev-apl-implement/references/compilation-issues.md)
- API 文档：`<aplApiDocs>`
- [审查检查清单](./review-checklist.md)
