# APL数据类型索引

> 原始文档位置: `<aplDataTypeDocs>`

## 基础数据类型

### Integer - 整型
**文档**: [Integer.md](<aplDataTypeDocs>Integer.md)

**常用方法**:
- `toString()` - 转字符串
- `toBigDecimal()` - 转BigDecimal
- `toDouble()` - 转Double

---

### String - 字符串
**文档**: [String.md](<aplDataTypeDocs>String.md)

**常用方法**:
- `contains()`, `startsWith()`, `endsWith()` - 包含判断
- `concat()`, `replace()`, `substring()` - 字符串操作
- `split()`, `trim()` - 分割和去空
- `toUpperCase()`, `toLowerCase()` - 大小写转换
- `indexOf()`, `length()`, `isEmpty()` - 查询和判断

---

### BigDecimal - 数字类型
**文档**: [BigDecimal.md](<aplDataTypeDocs>BigDecimal.md)

**常用方法**:
- `add()`, `subtract()`, `multiply()`, `divide()` - 四则运算
- `compareTo()` - 比较
- `setScale()` - 设置精度

---

### Boolean - 布尔类型
**文档**: [Boolean.md](<aplDataTypeDocs>Boolean.md)

**常用方法**:
- `and()`, `or()`, `not()` - 逻辑运算

---

## 日期时间类型

### Date - 日期类型
**文档**: [Date.md](<aplDataTypeDocs>Date.md)

**常用方法**:
- `Date.now()` - 当前日期
- `Date.of()` - 时间戳转换
- `withYear()`, `withMonth()`, `withDay()` - 设置年月日
- `toTimestamp()` - 转时间戳
- `daysBetween()`, `monthsBetween()` - 日期间隔
- `toStartOfMonth()`, `toStartOfWeek()` - 月初/周初

---

### Time - 时间类型
**文档**: [Time.md](<aplDataTypeDocs>Time.md)

**常用方法**:
- `Time.now()` - 当前时间
- `withHour()`, `withMinute()`, `withSecond()` - 设置时分秒
- `toTimestamp()` - 转时间戳

---

### DateTime - 日期时间类型
**文档**: [DateTime.md](<aplDataTypeDocs>DateTime.md)

**常用方法**:
- `DateTime.now()` - 当前日期时间
- `DateTime.of()` - 时间戳/字符串转换
- `toDate()` - 转Date
- `withYear()`, `withMonth()`, `withDay()` - 设置日期
- `withHour()`, `withMinute()`, `withSecond()` - 设置时间

---

### Duration - 时间间隔
**文档**: [Duration.md](<aplDataTypeDocs>Duration.md)

**常用方法**:
- `getSeconds()`, `getMinutes()`, `getHours()`, `getDays()` - 获取时间单位

---

## 集合类型

### List - 列表集合
**文档**: [List.md](<aplDataTypeDocs>List.md)

**定义**: `List list = []`

**常用方法**:
- `add()`, `addAll()` - 添加元素
- `get()`, `remove()` - 获取/移除元素
- `contains()`, `containsAll()` - 包含判断
- `size()`, `isEmpty()` - 大小判断
- `clear()` - 清空
- `sort()` - 排序
- `subList()` - 子列表
- `intersect()` - 交集
- `each()`, `eachWithIndex()` - 遍历
- `collect()`, `find()`, `any()` - 转换和查找

---

### Map - 键值对集合
**文档**: [Map.md](<aplDataTypeDocs>Map.md)

**定义**: `Map map = [:]`

**常用方法**:
- `put()`, `putIfAbsent()` - 添加键值对
- `get()` - 获取值
- `remove()` - 移除键值对
- `containsKey()`, `containsValue()` - 包含判断
- `keys()`, `values()` - 获取所有键/值
- `size()`, `isEmpty()` - 大小判断
- `clear()` - 清空
- `each()` - 遍历

---

### Range - 范围类型
**文档**: [Range.md](<aplDataTypeDocs>Range.md)

**注意**: 循环最多500次

---

## 工具类型

### Math - 数学运算
**文档**: [Math.md](<aplDataTypeDocs>Math.md)

**常用方法**:
- `abs()`, `max()`, `min()` - 绝对值、最大最小值
- `pow()`, `sqrt()` - 幂运算、开方
- `round()`, `floor()`, `ceil()` - 取整

---

### CollectionUtils - 集合工具
**文档**: [CollectionUtils.md](<aplDataTypeDocs>CollectionUtils.md)

**常用方法**:
- `union()`, `intersection()` - 并集、交集
- `disjunction()`, `subtract()` - 差集
- `isEqualCollection()`, `isSubCollection()` - 集合比较

---

## 结果类型

### QueryResult - 查询结果
**文档**: [QueryResult.md](<aplDataTypeDocs>QueryResult.md)

**属性**:
- `dataList` - 数据列表
- `total` - 总数
- `size` - 本次返回数量

---

### HttpResult - HTTP结果
**文档**: [HttpResult.md](<aplDataTypeDocs>HttpResult.md)

**属性**:
- `statusCode` - 状态码
- `content` - 响应内容
- `header` - 响应头

---

## 辅助文档

### 数据类型总览
**文档**: [DataType.md](<aplDataTypeDocs>DataType.md)
