# 对象索引说明

## 动态索引

对象索引由平台自动生成和维护，请直接访问：

`<objectsRoot>objects.md`

## 说明

`<objectsRoot>objects.md` 文件由系统自动生成，包含当前工程中所有对象的完整列表，每次对象变更时会自动更新。

### 对象文档位置

所有对象文档位于 `<objectsRoot>` 目录下：

- 预制对象：如 `AccountObj.md`、`ContactObj.md` 等
- 自定义对象：以 `__c.md` 结尾，如 `ESignConfig__c.md`

### 兼容说明

- 旧路径 `<enterpriseEA>/.sharedev/dev-metadata/objects/` 仅作为历史兼容说明，不应再作为主路径引用。
- 当旧文档或旧技能提到 `<enterpriseEA>/.sharedev/dev-metadata/objects/` 时，统一理解为 `<objectsRoot>`。

### 如何使用

1. 查看 `<objectsRoot>objects.md` 获取完整对象列表
2. 点击对象链接查看详细字段信息
3. 字段信息包括：字段名称、ApiName、类型、是否必填、枚举值、关联对象等

### 常用对象快速链接

| 对象名称 | ApiName | 文档 |
|---------|---------|------|
| 客户 | AccountObj | `<objectsRoot>AccountObj.md` |
| 联系人 | ContactObj | `<objectsRoot>ContactObj.md` |
| 商机 | NewOpportunityObj | `<objectsRoot>NewOpportunityObj.md` |
| 销售线索 | LeadsObj | `<objectsRoot>LeadsObj.md` |
| 产品 | ProductObj | `<objectsRoot>ProductObj.md` |
| 销售订单 | SalesOrderObj | `<objectsRoot>SalesOrderObj.md` |
| 回款 | PaymentObj | `<objectsRoot>PaymentObj.md` |
| 人员 | PersonnelObj | `<objectsRoot>PersonnelObj.md` |
| 部门 | DepartmentObj | `<objectsRoot>DepartmentObj.md` |
