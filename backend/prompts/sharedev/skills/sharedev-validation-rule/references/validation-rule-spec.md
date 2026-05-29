# 验证规则配置规格

## XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectValidationRule xmlns="http://sharecrm.com/metadata">
    <content>{JSON 字符串}</content>
    <status>new|modified|unchanged</status>
</ObjectValidationRule>
```

XML `<status>` 表示**配置同步状态**，与 content JSON 内部的 `status`（启用/禁用）不同概念。

## content JSON 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api_name` | string | 是 | 规则 API Name，格式 `validation_rule_<id>__c` |
| `rule_name` | string | 是 | 中文显示名 |
| `describe_api_name` | string | 是 | 所属对象 API Name |
| `description` | string | 否 | 规则描述（业务上下文） |
| `define_type` | string | 是 | 固定为 `"custom"` |
| `is_active` | boolean | 是 | 启用状态：`true`=启用，`false`=禁用 |
| `condition` | string | 是 | 条件表达式（公式字符串），返回值必须为布尔 |
| `message` | string | 是 | 错误提示文案，触发后展示给用户 |
| `enable_blocking` | boolean | 是 | `true`=阻断对象数据保存，`false`=不对象数据报错阻断（仅预警） |
| `scene` | array | 是 | "create"=新建时校验, "update"= 编辑时校验|
| `default_to_zero` | string | 是 | `true`=空值按 0；`false`=空值按 null |

**约束：** `trigger_on_add` 与 `trigger_on_edit` 不能同时为 `false`，至少有一个为 `true`。

## 完整 JSON 示例

### 示例 1：阻断型——折扣必须大于 20%

```json
{
    "api_name": "validation_rule_xK3mN__c",
    "rule_name": "折扣校验",
    "describe_api_name": "SO__c",
    "description": "销售订单折扣不得低于 20%",
    "define_type": "custom",
    "is_active": true,
    "condition": "$field_discount__c$ < 0.2",
    "message": "折扣率不得低于 20%，请联系销售经理审批后再保存。",
    "enable_blocking": true,
    "scene": ["create","update"],
    "default_to_zero": true

}
```

### 示例 2：不阻断型——预存款不足提示

```json
{
    "api_name": "validation_rule_7nb2j__c",
    "rule_name": "预存款不足预警",
    "describe_api_name": "SO__c",
    "description": "预存款不足时仅提示，不阻断",
    "define_type": "custom",
    "is_active": true,
    "condition": "$account__r.field_deposit__c$ < $field_total_amount__c$",
    "essage": "客户预存款不足以覆盖本订单金额，确认仍要提交？",
    "enable_blocking": false,
    "scene": ["create"],
    "default_to_zero": true
}
```

### 示例 3：空值按 null 处理——开始时间必须小于结束时间

```json
{
    "api_name": "validation_rule_q9R2v__c",
    "rule_name": "活动时间区间校验",
    "describe_api_name": "Campaign__c",
    "description": "市场活动开始时间必须早于结束时间",
    "define_type": "custom",
    "is_active": true,
    "condition": "NOT(ISNULL($field_start_date__c$)) && NOT(ISNULL($field_end_date__c$)) && $field_start_date__c$ >= $field_end_date__c$",
    "message": "活动开始时间必须早于结束时间。",
    "enable_blocking": true,
    "scene": ["create","update"],
    "default_to_zero": false
}
```

## 字段约束详解

### `condition`

- 字符串内容是公式协议生成的「公式」段原文
- 引用字段使用 `$field_api_name$`，引用关联对象字段使用 `$lookup__r.field__c$`
- 引用选项字段使用 `._value` 或 `._label`
- 全局变量直接写变量名
- 公式返回值类型必须为「布尔」
- 仅允许 `formula-generation.md` 定义的函数集

### `message`

- 业务语言，不写技术错误
- 建议包含：哪条数据、哪个字段、为何不满足
- 触发后会拼接到前端弹窗

### `enable_blocking`

| 值 | 行为 |
|----|------|
| `true` | 保存被阻断，用户必须修改数据后才能继续 |
| `false` | 弹框预警，用户点击「继续保存」可正常落库 |

**主从同时新建的从对象：** `enable_blocking=false` 的规则**不生效**。配置时必须告知用户。

### `scene`

| 值 | 含义 |
|------|------|
| `"create"` | 新建校验（默认） |
| `"update"` | 编辑时校验 |

 **不允许为空**，至少选一个 

**注意：** 查找关联、按钮、导入等更新方式**不走**验证规则。

### `default_to_zero`

| 值 | 公式中数值字段为空时 | 配套公式写法 |
|----|---------------------|--------------|
| `true` | 按 0 参与计算 | 可直接四则运算，不需 ISNULL |
| `false` | 按 null 参与计算 | 涉及空值的字段必须用 `ISNULL` / `NULLVALUE` 包裹 |

文本/日期/布尔字段为空时，无论该参数如何配置，都必须显式空值判断。

## 多规则同时生效的逻辑

- 一个对象可配置多条验证规则
- 保存时遍历所有满足触发时机的规则
- 任一阻断规则触发 → 抛异常，弹框展示所有命中规则的提示
- 所有命中的都是非阻断 → 弹框展示提示，提供「继续保存」选项

## Lookup 统计字段的实时性

验证规则中使用 Lookup 关联对象的**统计字段**时，取的是**数据库已保存值**，不是本次提交后的实时值。以下三种场景需要在「特殊说明」中提醒用户：

a. 本对象/Lookup 对象的计算字段使用 Lookup 的统计字段，被统计字段为**当前对象字段**
b. 本对象/Lookup 对象的计算字段使用 Lookup 的统计字段，被统计字段为**当前对象主对象字段**
c. 本对象/Lookup 对象的计算字段使用 Lookup 的统计字段，被统计字段为**主对象的其他从对象**

典型表现：第一次保存放过（用库存值算），第二次编辑才拦截（统计字段已重算入库）。

## 主从同时新建的校验顺序

1. 校验主对象的规则
2. 主有「阻断」命中 → 不再校验从对象
3. 主只命中「不阻断」 → 继续校验从对象
4. 从对象的「不阻断」规则**不校验**
5. 多个从对象按顺序校验，第一个有「阻断」命中后续从对象不再校验
6. 同一个从对象的多条规则同时校验并一并提示

## XML status（同步状态）

| 值 | 使用场景 |
|----|---------|
| `new` | 新创建的规则 |
| `modified` | 已有规则被修改 |
| `unchanged` | 从服务端同步但未修改 |

## 目录结构

```
tenant-config/objects/<ObjectApiName>/
├── fields/
├── layouts/
├── layout-rules/
└── validation-rules/                                ← 新增目录
    └── <ruleApiName>.validation-rule-meta.xml
```

首次为对象添加验证规则时需创建 `validation-rules/` 目录。
