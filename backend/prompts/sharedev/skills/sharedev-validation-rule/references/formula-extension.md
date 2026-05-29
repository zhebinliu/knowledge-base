# 验证规则公式生成扩展

本文档**不替代** `sharedev-field/references/formula-generation.md`，而是在其基础上叠加验证规则专属约束。生成验证规则的 `condition` 时，必须：

1. 先按 `sharedev-field/references/formula-generation.md` 走完整流程
2. 再叠加本文档的扩展约束
3. 最终把生成结果的「公式」段写入 validation-rule 的 `condition`

**注意**计算字段中公式的属性时`expression`，验证规则中是`condition` 

## 上下文参数差异

进入公式协议时，按以下方式赋值：

| 参数 | 验证规则下的取值 |
|------|------------------|
| `mode` | `validation_rule` |
| `expectedReturnType` | `布尔`（固定，不可更改） |
| `currentObjectApiName` | 当前对象 API Name |
| `availableFields` | 本对象字段 + 可达 Lookup 对象字段 |
| `globalVariables` | 平台允许使用的全局变量 |
| `userLastInput` | 用户的业务校验需求自然语言 |
| `default_to_zero` | `zero` 或 `null`（来源于用户在 validation-rule 配置中的选择） |

`default_to_zero` 是验证规则专属上下文，会影响公式中空值处理写法。

## 扩展约束 1：返回值固定为布尔

- 整个 `condition` 必须解析为布尔值
- 不允许返回数值、文本、日期等其他类型
- 当业务需求是「金额超过 1000 时提示」，正确写法是 `$field_amount__c$ > 1000`，而不是 `$field_amount__c$`
- `CASE` 函数若用于条件分支，所有分支结果必须为布尔
- `IF` 的两个返回值都必须是布尔

**典型错误示例：**

```fx
# ❌ 错误：返回数值
$field_amount__c$ - 1000

# ✅ 正确：返回布尔
$field_amount__c$ > 1000
```

## 扩展约束 2：空值处理与 `default_to_zero` 一致

### 当 `default_to_zero = true`

- 数值/金额/百分比字段为空时按 0 参与计算，公式中可直接使用四则运算
- 文本/日期/布尔字段为空时仍要显式 `ISNULL`，否则比较行为不可控
- 不要在数值字段上写 `NULLVALUE($field$, 0)`，多余

### 当 `default_to_zero = false`

- 任何字段为空都按 null 参与
- 公式中涉及空值的字段必须用 `ISNULL` / `NULLVALUE` 包裹
- 禁止写 `$field$ == null`，必须用 `ISNULL($field$)`
- 比较运算符两端如可能存在 null，要把空值场景显式建模

**典型示例：**

```fx
# default_to_zero = true，可直接比较
$field_discount__c$ < 0.2

# default_to_zero = false，必须先做空值处理
NOT(ISNULL($field_discount__c$)) && $field_discount__c$ < 0.2
```

## 扩展约束 3：Lookup 统计字段实时性提示

如果 `condition` 中（直接或间接）引用了 Lookup 的统计字段，并且被统计字段命中以下三种场景之一，必须在「特殊说明」段告知用户：

a. 被统计字段是当前对象字段
b. 被统计字段是当前对象主对象字段
c. 被统计字段是主对象的其他从对象

提示模板：

> ⚠️ 本规则引用了 `<lookup>.${statField}$` 统计字段。该统计字段在校验时取数据库已保存值，本次提交的影响要在保存后才进入统计；因此首次保存可能放过，二次编辑才拦截。

## 扩展约束 4：业务类型字段

若公式使用业务类型 `$record_type$`：

- 必须使用业务类型的 API Name 值进行比较，不能写中文标签
- 在「特殊说明」中提醒用户替换为正确的业务类型 API

```fx
$record_type._value$ == "regular_customer"
```

## 扩展约束 5：触发时机与函数选择

- 验证规则在保存（新建/编辑）时执行，没有「计算时」概念
- 不要在公式中使用任何需要事件上下文的函数（formula-generation.md 已限定函数集，不在其内的一律禁用）
- `NOW()` / `TODAY()` 取保存当下的时间，可用于时效校验

## 输出处理

公式协议会输出四段式：「公式」、「返回值类型」、「公式分析」、「特殊说明」。

回填到验证规则配置时：

| 公式协议输出段 | 回填到 |
|---------------|--------|
| 公式 | `condition`（写入原文，不要包额外引号） |
| 返回值类型 | 验证为「布尔」后丢弃 |
| 公式分析 | 写入 `description` 末尾（可选），或仅口头告知用户 |
| 特殊说明 | 必须口头告知用户，特别是 Lookup 统计字段实时性 |

## 与 `sharedev-field` 的关系

| 维度 | sharedev-field（计算字段/默认值表达式） | sharedev-validation-rule |
|------|----------------------------------------|-------------------------|
| 公式协议 | `formula-generation.md` | 同协议 + 本扩展 |
| 允许的函数集 | 同 | 同 |
| 返回值类型 | 由字段类型决定（数值/文本/日期/布尔） | 固定为布尔 |
| 空值语义 | 字段类型决定 | 由规则级 `empty_value_handling` 决定 |
| 输出落点 | `expression` 或 `default_value` | `condition` |
| 上下文参数 `mode` | `formula` / `default_expression` | `validation_rule` |
