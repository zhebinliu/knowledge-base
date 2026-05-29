# 字段配置规格

## XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectField xmlns="http://sharecrm.com/metadata">
    <content>{JSON 字符串}</content>
    <status>new|modified|unchanged</status>
</ObjectField>
```

> 注：闭合标签必须是 `</ObjectField>`。

## 说明

本文档以真实 `addDescribeCustomField` 请求体中的 `field_describe` / `group_fields` 为基准说明字段配置结构。

请注意：

- 平台真实字段描述使用 `snake_case`，例如 `api_name`、`is_required`、`default_value`
- 普通字段通常通过 `field_describe` 表达
- 组合字段通常通过 `group_fields` 表达子字段，再由主字段通过 `field_describe` 声明 `type=group` 和 `group_type`
- 如果文档中的业务 `type key` 与底层落库 `mt_field.type/group_type` 不完全一致，以 [field-types.md](/Users/fengjin/IdeaProjects/share-skill-kit/skills/sharedev-field/references/field-types.md) 的说明为准

## addDescribeCustomField 请求体结构

常见请求体包含以下几部分：

```json
{
    "describeAPIName": "fj_full_field__c",
    "group_fields": "[]",
    "field_describe": "{\"type\":\"text\",\"define_type\":\"custom\",\"api_name\":\"field_xxxxx__c\",\"label\":\"单行文本\"}",
    "layout_list": "[]",
    "describe_extra": {
        "fields": {
            "field_xxxxx__c": {
                "api_name": "field_xxxxx__c",
                "type": "text",
                "security_level": "",
                "compliance_setting": {},
                "help_text_type": "hover"
            }
        }
    },
    "fieldsExtra": [
        {
            "field_api_name": "field_xxxxx__c",
            "remark": ""
        }
    ],
    "i18nInfoList": []
}
```

## field_describe 通用结构

下面是普通字段最常见的真实结构骨架：

```json
{
    "type": "text",
    "define_type": "custom",
    "api_name": "field_xxxxx__c",
    "label": "字段显示名称",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3
}
```

## 通用字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 字段类型 key，优先使用业务类型 key |
| define_type | string | 是 | 通常为 `custom` |
| api_name | string | 是 | 字段 API Name，自定义字段必须为 `field_<id>__c` |
| label | string | 是 | 中文显示名称 |
| help_text | string | 否 | 帮助提示文案 |
| is_required | boolean | 否 | 是否必填 |
| is_unique | boolean | 否 | 是否唯一 |
| is_active | boolean | 是 | 是否激活 |
| is_index | boolean | 否 | 是否建索引 |
| status | string | 是 | `new` / `modified` / `unchanged` |
| inherit_type | number | 否 | 常见值为 `3`，表示自定义继承类型 |

## 常见可选字段

以下字段按类型按需出现，不是所有字段都必填：

| 字段 | 类型 | 说明 |
|------|------|------|
| default_value | any | 默认值 |
| default_is_expression | boolean | 默认值是否为表达式；若 `true`，`default_value` 存放公式字符串而非字面量 |
| expression | string | `formula` 字段使用的公式表达式 |
| default_to_zero | boolean | 数值类默认补零 |
| pattern | string | 文本或手机号校验正则 |
| max_length | number | 最大长度 |
| min_length | number | 最小长度 |
| length | number | 数值长度 |
| decimal_places | number | 小数位数 |
| options | array | 选项型字段的选项列表 |
| target_api_name | string | 关联目标对象 API Name |
| target_related_list_name | string | 关联列表 API Name |
| where_type | string | 关联字段过滤方式 |
| wheres | array | 关联字段过滤条件 |
| action_on_target_delete | string | 目标对象删除后的处理方式 |
| quote_field | string | 引用字段来源 |
| quote_field_type | string | 被引用字段类型 |
| count_type | string | 统计字段聚合方式 |
| sub_object_describe_apiname | string | 统计字段子对象 API Name |
| field_api_name | string | 统计字段关联字段 |
| count_scope_search_info | object/null | 统计范围 |
| return_type | string | 统计结果类型 |
| file_size_limit | number | 附件大小限制，单位字节 |
| file_amount_limit | number | 附件数量限制 |
| support_file_types | array | 支持的文件类型 |
| support_file_suffix | object | 支持的文件后缀 |
| file_source | array | 文件来源，如 `local` / `net` |
| support_area_code | string | 手机号是否支持区号 |
| remove_mask_roles | object | 脱敏例外角色 |
| is_show_mask | boolean | 是否显示脱敏 |
| cascade_parent_api_name | string | 级联关系：本字段的父字段 API Name；仅 `select_one`/`select_many` 子字段使用 |

## 选项型字段的级联关系

`select_one` / `select_many` 字段支持级联关系配置。级联通过两处配置共同完成：

1. **子字段**：在 `field_describe` 中添加 `cascade_parent_api_name`，指向父字段 API Name
2. **父字段**：在每个 option 对象中添加 `child_options`，声明该选项被选中时子字段可以显示哪些值

`child_options` 是数组，每个元素为 `{ "<子字段 api_name>": ["<可见值1>", ...] }`。

详细规格和完整示例见 [cascade-spec.md](./cascade-spec.md)。

## 默认值与公式表达式的落点

在字段元数据中，普通默认值、表达式默认值和公式字段的存放位置不同：

| 场景 | 关键字段 |
|------|----------|
| 普通默认值 | `default_value=<literal>` + `default_is_expression=false` |
| 表达式默认值 | `default_value=<formula string>` + `default_is_expression=true` |
| `formula` 字段 | `expression=<formula string>` |

表达式内容的生成规则参见 [formula-generation.md](/Users/fengjin/IdeaProjects/share-skill-kit/skills/sharedev-field/references/formula-generation.md)。

## 普通字段示例

示例 — text 类型：

```json
{
    "type": "text",
    "define_type": "custom",
    "api_name": "field_aB9kf__c",
    "label": "备注编号",
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
    "max_length": 50,
    "min_length": 0,
    "pattern": "^[A-Z]{2}-\\d{6}$"
}
```

示例 — date_time 类型（表达式默认值）：

```json
{
    "type": "date_time",
    "define_type": "custom",
    "api_name": "field_P4n8a__c",
    "label": "自动开始时间",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "default_value": "NOW()",
    "default_is_expression": true,
    "default_to_zero": false,
    "not_use_multitime_zone": false,
    "time_zone": "GMT+8",
    "date_format": "yyyy-MM-dd HH:mm:ss"
}
```

示例 — formula 类型：

```json
{
    "type": "formula",
    "define_type": "custom",
    "api_name": "field_w8Lm2__c",
    "label": "折后金额",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "expression": "$field_amount__c$ * (1 - $field_discount_rate__c$)",
    "return_type": "currency",
    "is_readonly": true
}
```

示例 — object_reference 类型：

```json
{
    "type": "object_reference",
    "define_type": "custom",
    "api_name": "field_rK2mN__c",
    "label": "关联客户",
    "help_text": "",
    "is_required": true,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "where_type": "field",
    "wheres": [],
    "target_api_name": "AccountObj",
    "target_related_list_name": "target_related_list_account__c",
    "action_on_target_delete": "set_null"
}
```

示例 — object_reference_many 类型：

```json
{
    "type": "object_reference_many",
    "define_type": "custom",
    "api_name": "field_m9TqR__c",
    "label": "关联项目",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "where_type": "field",
    "wheres": [],
    "target_api_name": "ProjectObj",
    "target_related_list_name": "target_related_list_project__c",
    "action_on_target_delete": "set_null"
}
```

示例 — true_or_false 类型：

```json
{
    "type": "true_or_false",
    "define_type": "custom",
    "api_name": "field_b7KqP__c",
    "label": "是否启用",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "default_value": true,
    "option_id": "41b83a936f15f54cae7651bee294ff79",
    "select_option": []
}
```

示例 — phone_number 类型：

```json
{
    "type": "phone_number",
    "define_type": "custom",
    "api_name": "field_h0z0r__c",
    "label": "手机",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "default_value": "",
    "pattern": "^[0-9+-;,]{0,100}$",
    "support_area_code": "n",
    "verification": false,
    "is_show_mask": false,
    "remove_mask_roles": {}
}
```

示例 — file_attachment 类型：

```json
{
    "type": "file_attachment",
    "define_type": "custom",
    "api_name": "field_R1Zii__c",
    "label": "附件",
    "help_text": "单个文件不得超过100MB",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "file_amount_limit": 1,
    "file_size_limit": 104857600,
    "support_file_types": [],
    "support_file_suffix": {},
    "file_source": ["local", "net"],
    "is_ocr_recognition": false
}
```

示例 — quote 类型：

```json
{
    "type": "quote",
    "define_type": "custom",
    "api_name": "field_sxkLx__c",
    "label": "引用字段",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": false,
    "status": "new",
    "inherit_type": 3,
    "quote_field": "field_C55X2__c__r.field_jz7G8__c",
    "quote_field_type": "employee_many",
    "is_readonly": true,
    "is_show_mask": false,
    "remove_mask_roles": {}
}
```

示例 — signature 类型：

```json
{
    "type": "signature",
    "define_type": "custom",
    "api_name": "field_udt6C__c",
    "label": "签名字段",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3
}
```

示例 — count 类型：

```json
{
    "type": "count",
    "define_type": "custom",
    "api_name": "field_gb2nR__c",
    "label": "统计字段",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "count_type": "count",
    "sub_object_describe_apiname": "object_3sbgg__c",
    "field_api_name": "field_whaht1__c",
    "count_field_api_name": "",
    "count_field_type": "",
    "count_scope_search_info": null,
    "return_type": "number",
    "wheres": [],
    "count_to_zero": true,
    "decimal_places": 0,
    "round_mode": 4,
    "default_result": "d_null",
    "is_readonly": true
}
```

## 组合字段示例

组合字段通常不是单独一段 `field_describe` 就能表达完整能力，而是：

1. 主字段通过 `field_describe` 声明 `type=group`
2. 子字段通过 `group_fields` 逐个定义
3. 布局通过 `layout_list` 指定渲染方式

### date_time_range

主字段 `field_describe` 示例：

```json
{
    "type": "group",
    "group_type": "date_time_range",
    "define_type": "custom",
    "api_name": "field_gjhJM__c",
    "label": "日期范围",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": true,
    "status": "new",
    "inherit_type": 3,
    "show_time": false,
    "start_time_field": "field_esS8W__c",
    "end_time_field": "field_e119O__c"
}
```

子字段 `group_fields` 示例：

```json
[
    {
        "type": "date_time",
        "define_type": "custom",
        "api_name": "field_esS8W__c",
        "label": "开始时间",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "not_use_multitime_zone": false,
        "time_zone": "GMT+8",
        "date_format": "yyyy-MM-dd"
    },
    {
        "type": "date_time",
        "define_type": "custom",
        "api_name": "field_e119O__c",
        "label": "结束时间",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "not_use_multitime_zone": false,
        "time_zone": "GMT+8",
        "date_format": "yyyy-MM-dd"
    }
]
```

### area

主字段 `field_describe` 示例：

```json
{
    "type": "group",
    "group_type": "area",
    "define_type": "custom",
    "api_name": "field_nWyh5__c",
    "label": "地区定位",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": false,
    "status": "new",
    "inherit_type": 3,
    "is_support_town": false,
    "is_support_village": false,
    "is_support_zip_code": false,
    "area_country": "field_31ySa__c",
    "area_province": "field_xiw0f__c",
    "area_city": "field_v40q9__c",
    "area_district": "field_x0cgO__c",
    "area_detail_address": "field_la671__c",
    "area_location": "field_55jFh__c"
}
```

子字段 `group_fields` 示例：

```json
[
    {
        "type": "country",
        "define_type": "custom",
        "api_name": "field_31ySa__c",
        "label": "国家",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "select_option": [],
        "used_in": "component"
    },
    {
        "type": "province",
        "define_type": "custom",
        "api_name": "field_xiw0f__c",
        "label": "省",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "cascade_parent_api_name": "field_31ySa__c",
        "select_option": [],
        "used_in": "component"
    },
    {
        "type": "city",
        "define_type": "custom",
        "api_name": "field_v40q9__c",
        "label": "市",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "cascade_parent_api_name": "field_xiw0f__c",
        "select_option": [],
        "used_in": "component"
    },
    {
        "type": "district",
        "define_type": "custom",
        "api_name": "field_x0cgO__c",
        "label": "区",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "cascade_parent_api_name": "field_v40q9__c",
        "select_option": [],
        "used_in": "component"
    },
    {
        "type": "text",
        "define_type": "custom",
        "api_name": "field_la671__c",
        "label": "详细地址",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "max_length": 300,
        "min_length": 0,
        "pattern": "",
        "is_show_mask": false,
        "remove_mask_roles": {},
        "used_in": "component"
    },
    {
        "type": "location",
        "define_type": "custom",
        "api_name": "field_55jFh__c",
        "label": "定位1",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "is_geo_index": false,
        "auto_location": false,
        "range_limit": false,
        "radius_range": 100,
        "used_in": "component"
    }
]
```

### sign_in

主字段 `field_describe` 示例：

```json
{
    "type": "group",
    "group_type": "sign_in",
    "define_type": "custom",
    "api_name": "field_S9EMD__c",
    "label": "签到组件",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": false,
    "status": "new",
    "inherit_type": 3,
    "sign_in_time_field": "field_2j2c7__c",
    "sign_in_location_field": "field_9Zm9t__c",
    "sign_in_status_field": "field_0Ax2K__c",
    "sign_out_time_field": "field_Y2nWY__c",
    "sign_out_location_field": "field_FqOxY__c",
    "sign_out_status_field": "field_lj4Oa__c",
    "visit_status_field": "field_dEQ1v__c",
    "interval_field": "field_11YAx__c",
    "sign_in_info_list_field": "sign_in_info__c",
    "is_enable_sign_out": true,
    "is_enable_modify_position": true
}
```

子字段 `group_fields` 示例：

```json
[
    {
        "type": "date_time",
        "define_type": "custom",
        "api_name": "field_2j2c7__c",
        "label": "签到时间",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "not_use_multitime_zone": false,
        "time_zone": "GMT+8",
        "date_format": "yyyy-MM-dd HH:mm",
        "used_in": "component"
    },
    {
        "type": "location",
        "define_type": "custom",
        "api_name": "field_9Zm9t__c",
        "label": "签到地址",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "is_geo_index": false,
        "auto_location": false,
        "range_limit": false,
        "radius_range": 100,
        "used_in": "component"
    },
    {
        "type": "select_one",
        "define_type": "custom",
        "api_name": "field_0Ax2K__c",
        "label": "签到状态",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "incomplete",
        "default_is_expression": false,
        "default_to_zero": false,
        "options": [
            {"label": "已完成", "value": "complete"},
            {"label": "未完成", "value": "incomplete"}
        ],
        "disable_after_filter": true,
        "used_in": "component"
    },
    {
        "type": "date_time",
        "define_type": "custom",
        "api_name": "field_Y2nWY__c",
        "label": "签退时间",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "not_use_multitime_zone": false,
        "time_zone": "GMT+8",
        "date_format": "yyyy-MM-dd HH:mm",
        "used_in": "component"
    },
    {
        "type": "location",
        "define_type": "custom",
        "api_name": "field_FqOxY__c",
        "label": "签退地址",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "is_geo_index": false,
        "auto_location": false,
        "range_limit": false,
        "radius_range": 100,
        "used_in": "component"
    },
    {
        "type": "select_one",
        "define_type": "custom",
        "api_name": "field_lj4Oa__c",
        "label": "签退状态",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "incomplete",
        "default_is_expression": false,
        "default_to_zero": false,
        "options": [
            {"label": "已完成", "value": "complete"},
            {"label": "未完成", "value": "incomplete"}
        ],
        "disable_after_filter": true,
        "used_in": "component"
    },
    {
        "type": "select_one",
        "define_type": "custom",
        "api_name": "field_dEQ1v__c",
        "label": "拜访状态",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "incomplete",
        "default_is_expression": false,
        "default_to_zero": false,
        "options": [
            {"label": "已完成", "value": "complete"},
            {"label": "未完成", "value": "incomplete"}
        ],
        "disable_after_filter": true,
        "used_in": "component"
    },
    {
        "type": "number",
        "define_type": "custom",
        "api_name": "field_11YAx__c",
        "label": "间隔时长",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "max_length": 16,
        "length": 15,
        "decimal_places": 1,
        "round_mode": 4,
        "default_to_zero": true,
        "display_style": "input",
        "step_value": 1,
        "is_show_mask": false,
        "remove_mask_roles": {},
        "hide_decimal_zero": "n",
        "display_decimal_places": null,
        "display_round_mode": 4,
        "used_in": "component"
    }
]
```

### payment

主字段 `field_describe` 示例：

```json
{
    "type": "group",
    "group_type": "payment",
    "define_type": "custom",
    "api_name": "field_dx3ko__c",
    "label": "支付组件",
    "help_text": "",
    "is_required": false,
    "is_unique": false,
    "is_active": true,
    "is_index": false,
    "status": "new",
    "inherit_type": 3,
    "pay_amount_field": "field_56RQe__c",
    "pay_type_field": "field_60cPG__c",
    "pay_status_field": "field_W3pqZ__c",
    "pay_time_field": "field_Jy2p2__c",
    "amount_input_type": "manual_input",
    "amount_is_readonly": false
}
```

子字段 `group_fields` 示例：

```json
[
    {
        "type": "currency",
        "define_type": "custom",
        "api_name": "field_56RQe__c",
        "label": "收款金额",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "max_length": 14,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": true,
        "length": 12,
        "decimal_places": 2,
        "is_show_mask": false,
        "remove_mask_roles": {},
        "currency_unit": "￥",
        "hide_decimal_zero": "n",
        "display_decimal_places": null,
        "display_round_mode": 4,
        "currency_type": "oc",
        "used_in": "component"
    },
    {
        "type": "text",
        "define_type": "custom",
        "api_name": "field_60cPG__c",
        "label": "收款方式",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
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
        "remove_mask_roles": {},
        "used_in": "component"
    },
    {
        "type": "select_one",
        "define_type": "custom",
        "api_name": "field_W3pqZ__c",
        "label": "收款状态",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "options": [
            {"label": "未收款", "value": "incomplete"},
            {"label": "已收款", "value": "complete"}
        ],
        "disable_after_filter": true,
        "used_in": "component",
        "value": "incomplete"
    },
    {
        "type": "date_time",
        "define_type": "custom",
        "api_name": "field_Jy2p2__c",
        "label": "收款时间",
        "help_text": "",
        "is_required": false,
        "is_unique": false,
        "is_active": true,
        "is_index": true,
        "status": "new",
        "inherit_type": 3,
        "default_value": "",
        "default_is_expression": false,
        "default_to_zero": false,
        "not_use_multitime_zone": false,
        "time_zone": "GMT+8",
        "date_format": "yyyy-MM-dd HH:mm:ss",
        "used_in": "component"
    }
]
```

## layout_list 结构示例

字段创建时，常会同时附带布局渲染信息：

```json
[
    {
        "api_name": "layout_2lCb4__c",
        "label": "默认布局",
        "is_default": true,
        "layout_type": "detail",
        "render_type": "signature",
        "is_show": true,
        "is_required": false,
        "is_readonly": false
    }
]
```

`render_type` 常与字段业务类型对应，例如：

- `quote`
- `signature`
- `count`

## status 状态值

| 值 | 使用场景 |
|----|---------|
| new | 新创建的字段 |
| modified | 已有字段被修改 |
| unchanged | 从服务端同步但未修改 |

## 文件命名

每个字段一个文件：`<fieldApiName>.field-meta.xml`

示例：

- `name.field-meta.xml`（标准字段）
- `field_aB9kf__c.field-meta.xml`（自定义字段）
