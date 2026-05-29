# 验证规则命名规范

## 验证规则 API Name

- 格式：`validation_rule_<id>__c`
- `<id>` 为 5 位字母数字混合标识符
- 示例：`validation_rule_xK3mN__c`、`validation_rule_7nb2j__c`
- ID 生成：随机 5 位 [a-zA-Z0-9]，区分大小写，确认不与已有规则冲突

## 文件命名

- XML 文件名 = `<api_name>.validation-rule-meta.xml`
- 例：`validation_rule_xK3mN__c.validation-rule-meta.xml`
- 一规则一文件

## 中文显示名（label）

- 用业务语言，不写技术术语
- 建议格式：`<被校验维度><校验动作>`，例如「折扣校验」「活动时间区间校验」「预存款不足预警」
- 同一对象内 label 不强制唯一，但避免完全重复造成困惑

## 字段引用

- 本对象字段：`$<field_api_name>$`
- 关联对象字段：`$<lookup_field_api_name>__r.<target_field_api_name>$`
- 选项字段：`$<field_api_name>._value$` 或 `$<field_api_name>._label$`（推荐 `._value`）

## 通用规则

1. API Name 创建后**不可更改**
2. `__c` 后缀仅用于自定义配置
3. ID 部分区分大小写
4. 同一对象作用域内验证规则 API Name 必须唯一
