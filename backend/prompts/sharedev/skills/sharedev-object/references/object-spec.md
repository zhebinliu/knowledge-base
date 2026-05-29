# 对象配置规格

## XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Object xmlns="http://sharecrm.com/metadata">
    <content>{JSON 字符串}</content>
    <features>
        <multiFieldSort>true|false</multiFieldSort>
        <modifyRecord>true|false</modifyRecord>
        <relatedTeam>true|false</relatedTeam>
        <globalSearch>true|false</globalSearch>
    </features>
    <status>new|modified|unchanged</status>
</Object>
```


## content JSON 结构

```json
{
    "package": "CRM",
    "api_name": "对象 API Name（必填）",
    "display_name": "中文显示名称（必填）",
    "description": "对象描述（选填）",
    "define_type": "package | custom",
    "is_udef": true,
    "is_active": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| api_name | string | 是 | 对象 API Name，遵循命名规范 |
| display_name | string | 是 | 中文显示名称 |
| description | string | 否 | 对象用途描述 |
| define_type | string | 是 | `package`（预置）或 `custom`（自定义） |
| is_udef | boolean | 是 | 是否用户自定义，自定义对象为 `true` |
| is_active | boolean | 是 | 是否启用，默认 `true` |

## features 功能开关

| 开关 | 说明 | 默认值 |
|------|------|--------|
| multiFieldSort | 多字段排序 | false |
| modifyRecord | 允许修改记录 | true |
| relatedTeam | 相关团队功能 | false |
| globalSearch | 全局搜索 | false |

## status 状态值

| 值 | 使用场景 |
|----|---------|
| new | 新创建的对象，尚未提交到服务端 |
| modified | 已有对象被修改，等待提交 |
| unchanged | 从服务端同步但未修改（仅同步后出现） |

## 默认字段

新建自定义对象时由 `sharedev-object` 自动产出，不走 `sharedev-field` 需求确认流程。修改已有对象或标准对象（`define_type = package`）时不触发。

字段 XML 外壳复用 `skills/sharedev-field/assets/field-template.xml`，外层 `<status>` 填 `new`。

**`fields/name.field-meta.xml`**（主属性，`define_type = system`）：

```json
{
    "type": "text",
    "define_type": "system",
    "api_name": "name",
    "label": "主属性",
    "help_text": "",
    "is_required": true,
    "is_unique": true,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "default_value": "",
    "default_is_expression": false,
    "default_to_zero": false,
    "max_length": 255,
    "min_length": 0,
    "input_mode": "",
    "is_show_mask": false,
    "remove_mask_roles": {}
}
```

**`fields/owner.field-meta.xml`**（负责人，`define_type = package`）：

```json
{
    "type": "employee",
    "define_type": "package",
    "api_name": "owner",
    "label": "负责人",
    "help_text": "",
    "is_required": true,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "is_single": true,
    "department_list": [],
    "wheres": [],
    "where_type": "field",
    "default_value": "",
    "default_is_expression": false,
    "employee_list": [],
    "is_need_convert": false
}
```

## 标准对象 vs 自定义对象

| 维度 | 标准对象 | 自定义对象 |
|------|---------|-----------|
| defineType | `package` | `custom` |
| API Name 格式 | `PascalCaseObj` | `<name>__c` |
| 可否新建 | 否（平台预定义） | 是 |
| 可否修改 API Name | 否 | 否（创建后不可变） |
| 可修改内容 | features、displayName | 全部字段 |

## 目录结构

创建对象时需同步创建完整目录：

```
tenant-config/objects/<ObjectApiName>/
├── <ObjectApiName>.object-meta.xml
├── fields/
│   ├── name.field-meta.xml        # 主属性（新建自定义对象时必须产出）
│   └── owner.field-meta.xml       # 负责人（新建自定义对象时必须产出）
└── layouts/
    ├── layout_<id>__c.layout-meta.xml          # detail 详情布局（新建自定义对象时必须产出）
    └── list_layout_<id>__c.layout-meta.xml      # list 移动端摘要布局（新建自定义对象时必须产出）
```
