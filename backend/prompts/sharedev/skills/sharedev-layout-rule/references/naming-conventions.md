# 布局规则命名规范

## 规则 API Name

- 格式：`layout_rule_<id>__c`
- `<id>` 为 5 位字母数字混合标识符
- 示例：`layout_rule_xK3mN__c`、`layout_rule_7nb2j__c`

## 规则类型标识

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `"field"` | 字段控制类型 |
| `type` | `"page"` | 页面控制类型 |

## 页面触发模式

| 字段 | 值 | 说明 |
|------|-----|------|
| `page_trigger_mode` | `"add"` | 新建页面 |
| `page_trigger_mode` | `"edit"` | 编辑页面 |

## 通用规则

1. API Name 一旦创建后**不可更改**
2. `__c` 后缀仅用于自定义配置，标准配置无此后缀
3. ID 部分区分大小写
4. 同一作用域内 API Name 必须唯一
