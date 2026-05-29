# 对象命名规范

## 标准对象
- 格式：`PascalCase` + `Obj` 后缀
- 示例：`AccountObj`、`ContactObj`、`OpportunityObj`、`SalesOrderObj`
- 标准对象由平台定义，**不可新建、不可修改 API Name**

## 自定义对象
- 格式：`<name>__c`，其中 `<name>` 为字母数字组合
- 示例：`Vehicle__c`、`object_wF21g__c`、`SO__c`
- `__c` 后缀为必须，表示自定义（custom）
- 名称部分避免使用中文或特殊字符

## Display Name（显示名称）

- 使用中文，简洁明了
- 示例：`客户`、`联系人`、`销售订单`、`车辆信息`
- 显示名称可随时修改，不影响 API Name

## 通用规则

1. API Name 一旦创建后**不可更改**
2. `__c` 后缀仅用于自定义配置，标准配置无此后缀
3. ID 部分区分大小写
4. 同一作用域内 API Name 必须唯一（对象全局唯一）
