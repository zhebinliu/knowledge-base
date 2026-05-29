# 字段级联关系配置规格

## 概念

级联关系让一个**父字段**的选中值决定另一个**子字段**的可用选项。例如：选择"产品线"（父）后，"产品型号"（子）只显示该产品线下的型号；选择"省份"（父）后，"城市"（子）只显示该省份下的城市。

## 支持的字段类型

| 角色 | 支持类型 |
|------|---------|
| 父字段 | `select_one`（单选）、`select_many`（多选）、`record_type`（业务类型） |
| 子字段 | `select_one`（单选）、`select_many`（多选） |

## 配置结构

级联关系通过两个地方的配置共同完成：

### 1. 子字段：`cascade_parent_api_name`

在子字段的 `field_describe` JSON 中添加父字段的 API Name：

```json
{
    "type": "select_one",
    "api_name": "field_child__c",
    "cascade_parent_api_name": "field_parent__c",
    ...其他字段属性
}
```

### 2. 父字段：每个 option 上的 `child_options`

在父字段的每个 option 中，声明该选项被选中时，子字段可显示哪些选项值：

```json
{
    "type": "select_one",
    "api_name": "field_parent__c",
    "options": [
        {
            "value": "parent_val_a",
            "label": "选项A",
            "child_options": [
                {
                    "field_child__c": [
                        "child_val_1",
                        "child_val_2"
                    ]
                }
            ]
        },
        {
            "value": "parent_val_b",
            "label": "选项B",
            "child_options": [
                {
                    "field_child__c": [
                        "child_val_3"
                    ]
                }
            ]
        }
    ],
    ...
}
```

`child_options` 结构说明：
- 是一个**数组**，每个元素是一个对象
- 对象的 **key** 是子字段的 `api_name`
- 对象的 **value** 是数组，包含当父字段选中该选项时，子字段可以显示的 option value 列表

## 完整示例

**场景：** 产品线（父，单选）→ 产品型号（子，单选）

父字段 XML (`field_product_line__c.field-meta.xml`)：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectField xmlns="http://sharecrm.com/metadata">
    <content>{
    "type": "select_one",
    "define_type": "custom",
    "api_name": "field_product_line__c",
    "label": "产品线",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "options": [
        {
            "value": "line_hardware",
            "label": "硬件",
            "child_options": [
                {
                    "field_product_model__c": [
                        "hw_server",
                        "hw_storage",
                        "hw_network"
                    ]
                }
            ]
        },
        {
            "value": "line_software",
            "label": "软件",
            "child_options": [
                {
                    "field_product_model__c": [
                        "sw_crm",
                        "sw_erp",
                        "sw_oa"
                    ]
                }
            ]
        }
    ]
}</content>
    <status>new</status>
</ObjectField>
```

子字段 XML (`field_product_model__c.field-meta.xml`)：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectField xmlns="http://sharecrm.com/metadata">
    <content>{
    "type": "select_one",
    "define_type": "custom",
    "api_name": "field_product_model__c",
    "label": "产品型号",
    "cascade_parent_api_name": "field_product_line__c",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "options": [
        {"value": "hw_server",  "label": "服务器"},
        {"value": "hw_storage", "label": "存储设备"},
        {"value": "hw_network", "label": "网络设备"},
        {"value": "sw_crm",     "label": "CRM系统"},
        {"value": "sw_erp",     "label": "ERP系统"},
        {"value": "sw_oa",      "label": "OA系统"}
    ]
}</content>
    <status>new</status>
</ObjectField>
```

## 以业务类型（record_type）作为父字段

`record_type` 是系统字段，配置时**只需修改子字段**，无需生成父字段 XML：

```json
{
    "type": "select_one",
    "api_name": "field_child__c",
    "cascade_parent_api_name": "record_type",
    ...
}
```

此时父字段的 `child_options` 由平台系统自动管理，不在 tenant-config 中配置。

## 多级联（一个父控制多个子）

一个父字段可以同时控制多个子字段。在每个 option 的 `child_options` 数组中放入多个对象即可：

```json
{
    "value": "parent_val_a",
    "label": "选项A",
    "child_options": [
        {
            "field_child1__c": ["c1_val1", "c1_val2"]
        },
        {
            "field_child2__c": ["c2_val3", "c2_val4"]
        }
    ]
}
```

## 修改已有字段添加级联

若父字段或子字段已存在，需要修改其 XML：
1. 读取已有父字段 XML，在 `options` 每项中添加 `child_options`，将 `status` 改为 `modified`
2. 读取已有子字段 XML，添加 `cascade_parent_api_name`，将 `status` 改为 `modified`

## 约束与规则

| 规则 | 说明 |
|------|------|
| 不支持成环 | 若 A 为 B 的父，则 B 不能再作为 A 的父 |
| 子字段唯一父 | 一个子字段只能有一个 `cascade_parent_api_name` |
| 选项值必须存在 | `child_options` 中引用的子字段 value，必须是子字段 `options` 中已有的值 |
| 父选项不含 child_options | 若某个父选项没有 `child_options`，则子字段显示全部选项 |
| not_usable 选项 | 父字段中 `not_usable: true` 的选项通常不配置 `child_options` |
