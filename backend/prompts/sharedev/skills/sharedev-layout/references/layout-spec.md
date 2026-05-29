# 布局配置规格

## XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectLayout xmlns="http://sharecrm.com/metadata">
    <content>{JSON 字符串}</content>
    <status>new|modified|unchanged</status>
</ObjectLayout>
```

## 布局类型总览

| layout_type | 用途 | 必须预置 | 说明 |
|-------------|------|---------|------|
| detail | 详情页 | 是 | 展示业务数据属性和关联信息，提供业务操作按钮 |
| edit | 新建/编辑页 | 否（按需开启，**默认不生成**） | 基于详情页复制出一套独立布局，区分查看和编辑场景 |
| list_layout | **Web 端**列表页 | 否（按需） | ⚠️ 控制 `list_component` 的按钮、场景、视图、筛选等；**不是移动端摘要** |
| list | **移动端**列表摘要 | 是（新建自定义对象时随对象产出） | ⚠️ 控制 `table_component` 的 include_fields（摘要字段）；**不是 Web 列表页** |

## content JSON 顶层结构

所有布局类型共享以下顶层结构：

```json
{
    "api_name": "layout_<id>__c",
    "display_name": "布局显示名称",
    "layout_type": "detail | edit | list_layout | list",
    "is_default": true,
    "ref_object_api_name": "所属对象 API Name",
    "layout_description": "",
    "package": "CRM",
    "default_component": "form_component",
    "components": [],
    "buttons": [],
    "layout_structure": {},
    "hidden_buttons": [],
    "hidden_components": [],
    "enable_mobile_layout": false,
    "mobile_layout": {},
    "ui_event_ids": [],
    "events": []
}
```

### 顶层字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| api_name | string | 是 | 布局 API Name，创建后不可更改 |
| display_name | string | 是 | 中文显示名称 |
| layout_type | string | 是 | `detail` / `edit` / `list_layout` / `list` |
| is_default | boolean | 是 | 是否默认布局，同类型同对象只能有一个 |
| ref_object_api_name | string | 是 | 所属对象 API Name |
| layout_description | string | 否 | 布局描述 |
| package | string | 否 | 所属包，业务预置一般为 `"CRM"` |
| default_component | string | 否 | 默认组件，detail 布局通常为 `"form_component"` |
| components | array | 是 | 布局中的所有组件 |
| buttons | array | 否 | 顶层按钮（detail/edit 的顶层按钮通常放在 head_info 组件内） |
| layout_structure | object | 是 | 定义组件在页面上的排布位置 |
| hidden_buttons | array | 否 | 隐藏的按钮 api_name 列表 |
| hidden_components | array | 否 | 隐藏的组件 api_name 列表 |
| enable_mobile_layout | boolean | 否 | 是否启用移动端独立布局。关闭时移动端按 web 端结构显示 |
| mobile_layout | object | 否 | 移动端独立布局配置，结构与 web 端一致 |
| ui_event_ids | array | 否 | 关联的 UI 事件 ID 列表 |
| events | array | 否 | 事件配置列表 |

---

## UI 事件配置

UI 事件仅适用于 **detail** 和 **edit** 布局，在新建/编辑页面执行。`list_layout` 和 `list` 布局**不支持**。

> **版本限制：** 仅旗舰版、集团版支持。

### 对象类型支持矩阵

| 对象类型 | 支持的事件 |
|---------|-----------|
| 普通对象 | 字段事件、校验事件 |
| 主对象（含从对象） | 字段事件、从对象事件、校验事件 |
| 从对象（主从同时新建） | **不支持** |
| 从对象（主从不同时新建） | 与普通对象相同 |

### 配置位置

- 若对象**只有 detail 布局**：UI 事件配置在 detail 布局（实际在新建/编辑时生效）
- 若对象**已开启独立 edit 布局**：UI 事件**必须配置在 edit 布局**（配置在 detail 布局会被服务端迁移并删除）
- 触发链：`AddUI → describelayout → uievent`

### 配额约束

| 事件类型 | 每布局上限 | 其他限制 |
|---------|-----------|---------|
| 数据更新事件（字段+从对象+onload） | **3** 个 | 每字段只能绑定一个数据更新事件 |
| 校验事件 | **5** 个 | — |

版本控制字段（布局 JSON 顶层）：
- `layout_ui_event` — 是否启用 UI 事件（`true`/`false`）
- `data_update_limit` — 数据更新事件上限（默认 3）
- `check_function_limit` — 校验事件上限（默认 5）

### 事件类型与 type/triggers 值

| 事件名称 | type | triggers | 说明 |
|---------|------|----------|------|
| 字段事件 | `1` | `[1]` | 字段值变更且失焦时触发 |
| 从对象事件 — 新增明细 | `2` | `[2]` | 新增从对象行时触发，触发字段为 `[]` |
| 从对象事件 — 编辑明细 | `2` | `[3]` | 编辑从对象行时触发，可指定触发字段 |
| 从对象事件 — 删除明细 | `2` | `[4]` | 删除从对象行时触发，触发字段为 `[]` |
| 加载事件（onload） | `4` | `[5]` | 进入新建/编辑页时触发一次，触发字段为 `[]` |
| 校验事件 | `3` | `[1]` | 字段值变更时触发，函数返回 Remind 对象 |

### 字段事件（type=1）可触发字段类型

| 触发分类 | 字段类型 |
|---------|---------|
| 文本框 | 单行文本、多行文本、数值、金额、手机、邮箱、网址、百分数、布尔值 |
| 选择 | 单选、多选、日期、日期时间、时间、部门、人员 |
| 查找关联 | 查找关联、主从字段 |
| 图片 | 图片（上传/删除后触发） |
| 国家省市区 | 四个地区字段作为整体，只能绑定在同一个事件里 |

### 事件对象 JSON 结构

**字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 否 | 服务端自动生成；新建事件时不填；更新已有事件时必须包含（用于服务端匹配） |
| `type` | number | 是 | 事件类型：`1`=字段事件，`2`=从对象事件，`3`=校验事件，`4`=加载事件 |
| `describe_api_name` | string | 是 | 主对象 API Name（同布局的 `ref_object_api_name`） |
| `trigger_describe_api_name` | string | 是 | 触发源对象：type=1/3/4 时为主对象，type=2 时为从对象 API Name |
| `trigger_field_api_names` | array | 是 | 触发字段列表；type=2（新增/删除明细）和 type=4 时为空数组 `[]` |
| `triggers` | array | 是 | 触发时机数组（见上表），始终为数组格式 |
| `func_api_name` | string | 是 | 绑定的 APL 函数 API Name，函数必须先 push 到服务端 |
| `func_name` | string | 是 | APL 函数显示名 |
| `func_describe` | string | 否 | APL 函数描述（可为空字符串） |

**各事件类型完整示例：**

```json
// 字段事件（type=1）
{
    "type": 1,
    "describe_api_name": "object_1re4T__c",
    "trigger_describe_api_name": "object_1re4T__c",
    "trigger_field_api_names": ["field_customer__c"],
    "triggers": [1],
    "func_api_name": "UIEvt_fillInfo__c",
    "func_name": "客户回填信息",
    "func_describe": ""
}

// 从对象事件 — 编辑明细（type=2, triggers=[3]，可指定触发字段）
{
    "type": 2,
    "describe_api_name": "object_1re4T__c",
    "trigger_describe_api_name": "object_01S9d__c",
    "trigger_field_api_names": ["field_product__c"],
    "triggers": [3],
    "func_api_name": "UIEvt_calcAmount__c",
    "func_name": "计算金额",
    "func_describe": ""
}

// 从对象事件 — 新增明细（type=2, triggers=[2]，触发字段为空）
{
    "type": 2,
    "describe_api_name": "object_1re4T__c",
    "trigger_describe_api_name": "object_01S9d__c",
    "trigger_field_api_names": [],
    "triggers": [2],
    "func_api_name": "UIEvt_addDetail__c",
    "func_name": "新增明细默认值",
    "func_describe": ""
}

// 加载事件（type=4, triggers=[5]，触发字段为空）
{
    "type": 4,
    "describe_api_name": "object_1re4T__c",
    "trigger_describe_api_name": "object_1re4T__c",
    "trigger_field_api_names": [],
    "triggers": [5],
    "func_api_name": "UIEvt_onload__c",
    "func_name": "页面加载初始化",
    "func_describe": ""
}

// 校验事件（type=3, triggers=[1]）
{
    "type": 3,
    "describe_api_name": "object_1re4T__c",
    "trigger_describe_api_name": "object_1re4T__c",
    "trigger_field_api_names": ["field_phone__c"],
    "triggers": [1],
    "func_api_name": "UIEvt_checkPhone__c",
    "func_name": "手机号格式校验",
    "func_describe": ""
}
```

### `ui_event_ids` 与 `events` 的关系

`ui_event_ids` 是服务端生成的已激活事件 ID 列表（有序），`events` 是完整事件配置数组。

- **新建布局**：`ui_event_ids` 填 `[]`，`events` 填事件对象（无 `_id`）；服务端创建事件后自动填充 `ui_event_ids`
- **更新布局**：在事件对象中包含 `_id`（从已有布局读取），服务端按 `_id` 匹配执行增/改/删

### 特殊行为

- **onload 事件**：`trigger_field_api_names` 为 `[]`，`triggers` 为 `[5]`
- **从对象事件不传导**：从对象事件中回填从、新增从、删除从不会再次触发字段事件
- **编辑明细可以指定触发字段**，新增/删除明细的触发字段为空数组

### ⚠️ 更新布局时的高危陷阱

服务端存在一个特殊逻辑：若 DB 中 detail 布局有事件，但提交的更新中 `ui_event_ids` 为空，**且对象已开启独立 edit 布局**，服务端会认为这是"事件迁移到 edit 布局"操作，并**删除 detail 布局上的所有事件**。

**常见触发场景：**
1. detail 布局已有 UI 事件 → 后来开启了独立 edit 布局 → 再次更新 detail 布局时忘记带 `ui_event_ids` → 事件全部被静默删除

**防止措施：** 更新现有布局前，必须先读取当前布局获取 `ui_event_ids` 和 `events`（含 `_id`），在更新时完整带入。

---

## layout_structure 说明

`layout_structure` 定义组件在页面上的排布方式。它是布局的骨架，决定哪些组件放在页面的哪个位置。

### 结构

```json
{
    "layout_structure_type": 1,
    "layout": [
        {
            "components": [["head_info"]],
            "columns": [{"width": "100%"}]
        },
        {
            "components": [["top_info", "container_xxx__c"]],
            "columns": [{"width": "100%"}]
        }
    ]
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| layout_structure_type | 布局结构类型：`1` = 上下结构，`2` = 上左右结构（上部通栏 + 下部左右分栏） |
| layout | 数组，每个元素代表页面的一个区域（行） |
| layout[].columns | 数组，定义该行的列宽。单列 `[{"width":"100%"}]`，两列 `[{"width":"60%"},{"width":"40%"}]` |
| layout[].components | 二维数组，与 columns 对应。`components[i]` 是第 `i` 列中的组件 api_name 列表（自上而下排列） |

### 常见布局结构

**上下结构（layout_structure_type: 1）** — 适用于大多数场景：
```json
{
    "layout": [
        {
            "components": [["head_info"]],
            "columns": [{"width": "100%"}]
        },
        {
            "components": [["top_info", "form_component"]],
            "columns": [{"width": "100%"}]
        }
    ]
}
```

**上左右结构（layout_structure_type: 2）** — 详情页常用，上部通栏放标题按钮，下部左右放内容和关联列表：
```json
{
    "layout_structure_type": 2,
    "layout": [
        {
            "components": [["head_info"]],
            "columns": [{"width": "100%"}]
        },
        {
            "components": [["top_info", "form_component"], ["relatedlist_xxx"]],
            "columns": [{"width": "60%"}, {"width": "40%"}]
        }
    ]
}
```

> **要点：** `layout_structure.layout[].components` 中引用的名称必须与 `components[]` 数组中某个组件的 `api_name` 匹配。

---

## 组件类型详解

布局由多个组件组成，每种组件有不同的 `type` 值和结构。

### 1. 标题和按钮组件 (type: "simple")

**api_name 固定为 `"head_info"`**，不可删除。配置详情页的标题区域和操作按钮。

```json
{
    "field_section": [],
    "buttons": [
        {
            "action_type": "default",
            "api_name": "Edit_button_default",
            "label": "编辑"
        },
        {
            "action_type": "custom",
            "api_name": "button_<id>__c",
            "label": "自定义按钮",
            "isActive": true
        }
    ],
    "api_name": "head_info",
    "header": "标题和按钮",
    "nameI18nKey": "paas.udobj.head_info",
    "exposedButton": 3,
    "type": "simple",
    "_id": "head_info"
}
```

| 字段 | 说明 |
|------|------|
| buttons | 按钮列表。`action_type`: `"default"` 为系统预置按钮，`"custom"` 为自定义按钮 |
| exposedButton | 外露按钮个数（超出的折叠到"更多"菜单） |

**常见预置按钮：**
- `Edit_button_default` — 编辑
- `SaleRecord_button_default` — 销售记录
- `Dial_button_default` — 打电话
- `ChangeOwner_button_default` — 更换负责人

**新建编辑布局的 head_info** 略有不同，使用 `button_info` 代替 `buttons`：
```json
{
    "api_name": "head_info",
    "type": "simple",
    "header": "标题和按钮",
    "nameI18nKey": "paas.udobj.head_info",
    "button_info": [
        {
            "hidden": [],
            "page_type": "create",
            "render_type": "normal",
            "order": ["Add_Save_button_default", "Add_Save_Continue_button_default", "Add_Save_Draft_button_default"]
        },
        {
            "hidden": [],
            "page_type": "edit",
            "render_type": "normal",
            "order": ["Edit_Save_button_default"]
        }
    ]
}
```

### 2. 摘要信息组件 (type: "top_info")

**api_name 固定为 `"top_info"`**。提取重要字段放在显眼位置显示。

```json
{
    "field_section": [
        {"render_type": "employee", "field_name": "owner"},
        {"render_type": "text", "field_name": "owner_department"},
        {"render_type": "date_time", "field_name": "last_modified_time"},
        {"render_type": "record_type", "field_name": "record_type"}
    ],
    "buttons": [],
    "api_name": "top_info",
    "header": "摘要信息",
    "type": "top_info",
    "nameI18nKey": "paas.udobj.summary_info",
    "_id": "top_info"
}
```

| 字段 | 说明 |
|------|------|
| field_section | 摘要字段列表，每项包含 `render_type`（渲染类型）和 `field_name`（字段 API Name） |

### 3. 详细信息/表单组件 (type: "form")

**api_name 固定为 `"form_component"`**。最主要的组件，显示对象字段信息。内部按字段分组（field_section）组织。


```json
{
    "field_section": [
        {
            "show_header": true,
            "form_fields": [
                {
                    "is_readonly": false,
                    "is_required": true,
                    "render_type": "text",
                    "field_name": "name"
                },
                {
                    "is_readonly": false,
                    "is_required": true,
                    "render_type": "employee",
                    "field_name": "owner"
                }
            ],
            "api_name": "base_field_section__c",
            "tab_index": "ltr",
            "column": 2,
            "header": "基本信息",
            "is_show": true
        },
        {
            "show_header": true,
            "form_fields": [
                {
                    "is_readonly": true,
                    "is_required": false,
                    "render_type": "employee",
                    "field_name": "created_by"
                },
                {
                    "is_readonly": true,
                    "is_required": false,
                    "render_type": "date_time",
                    "field_name": "create_time"
                },
                {
                    "is_readonly": true,
                    "is_required": false,
                    "render_type": "employee",
                    "field_name": "last_modified_by"
                },
                {
                    "is_readonly": true,
                    "is_required": false,
                    "render_type": "date_time",
                    "field_name": "last_modified_time"
                }
            ],
            "api_name": "system_group__c",
            "tab_index": "ltr",
            "column": 2,
            "header": "系统信息",
            "is_show": true
        }
    ],
    "buttons": [],
    "api_name": "form_component",
    "related_list_name": "",
    "column": 2,
    "is_hidden": false,
    "header": "详细信息",
    "nameI18nKey": "paas.udobj.detail_info",
    "type": "form",
    "order": 1,
    "_id": "form_component"
}
```

**field_section（字段分组）字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| api_name | string | 分组 API Name。**`"base_field_section__c"` 是"基本信息"分组，必须有且只有一个** |
| header | string | 分组标题（如"基本信息"、"系统信息"） |
| column | number | 列数（1 或 2） |
| tab_index | string | 字段排布顺序，`"ltr"` 为从左到右 |
| show_header | boolean | 是否显示分组标题 |
| is_show | boolean | 是否显示该分组 |
| form_fields | array | 该分组内的字段列表 |

**form_fields（字段项）字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| field_name | string | 字段 API Name，必须存在于对象中 |
| render_type | string | 渲染类型（见下方渲染类型表） |
| is_readonly | boolean | 是否只读 |
| is_required | boolean | 是否必填 |
| is_tiled | boolean | 是否平铺显示（仅对 select_one/select_many 类型有效） |

**常见 render_type 值：**

| render_type | 对应字段类型 |
|-------------|------------|
| text | 文本 |
| long_text | 长文本 |
| number | 数字 |
| currency | 货币 |
| date | 日期 |
| date_time | 日期时间 |
| time | 时间 |
| employee | 员工（人员） |
| employee_many | 多选员工 |
| department | 部门 |
| department_many | 多选部门 |
| select_one | 单选 |
| select_many | 多选 |
| object_reference | 对象引用（查找关联） |
| object_reference_many | 多选对象引用 |
| record_type | 业务类型 |
| url | URL |
| email | 邮箱 |
| phone | 电话 |
| formula | 公式（只读） |
| auto_number | 自动编号（只读） |
| image | 图片 |
| file | 附件 |


### 4. 页签容器组件 (type: "tabs")

将多个组件组织到页签中展示。

```json
{
    "components": [
        ["form_component"],
        ["operation_log"],
        ["<relatedlist_api_name>"]
    ],
    "buttons": [],
    "api_name": "container_<layoutApiName>",
    "tabs": [
        {
            "api_name": "tab_form_component",
            "header": "详细信息",
            "nameI18nKey": "paas.udobj.detail_info"
        },
        {
            "api_name": "tab_operation_log",
            "header": "修改记录",
            "nameI18nKey": "paas.udobj.modify_log"
        },
        {
            "api_name": "tab_<relatedlist_api_name>",
            "header": "关联对象名称",
            "nameI18nKey": "<i18n_key>"
        }
    ],
    "header": "页签容器",
    "type": "tabs",
    "_id": "container_<layoutApiName>"
}
```

| 字段 | 说明 |
|------|------|
| components | 二维数组，每个子数组包含该页签内的组件 api_name |
| tabs | 页签定义列表，与 components 一一对应 |
| tabs[].api_name | 页签 API Name，通常为 `"tab_" + 组件api_name` |
| tabs[].header | 页签显示标题 |

### 5. 关联记录组件 (type: "related_record")

显示修改记录、跟进动态等系统关联记录。

```json
{
    "field_section": [],
    "buttons": [],
    "api_name": "operation_log",
    "related_list_name": "",
    "is_hidden": false,
    "header": "修改记录",
    "nameI18nKey": "paas.udobj.modify_log",
    "type": "related_record",
    "order": 2,
    "_id": "operation_log"
}
```

**常见的 related_record 组件：**
- `operation_log` — 修改记录
- `sale_log` — 跟进动态（移动端常用）

### 6. 相关列表组件 (type: "relatedlist")

显示与当前对象有引用关系的从对象数据列表。

```json
{
    "type": "relatedlist",
    "buttons": [],
    "relationType": 2,
    "api_name": "<refObjectApiName>_field_<fieldApiName>_related_list",
    "header": "关联对象显示名",
    "ref_object_api_name": "<refObjectApiName>",
    "related_list_name": "target_related_list_<id>__c",
    "field_api_name": "<fieldApiName>",
    "nameI18nKey": "<refObjectApiName>.field.<fieldApiName>.reference_label",
    "limit": 1,
    "button_info": [
        {
            "hidden": [],
            "render_type": "list_normal",
            "order": ["BulkRelate_button_default", "BulkDisRelate_button_default", "IntelligentForm_button_default"]
        },
        {
            "hidden": [],
            "render_type": "list_batch",
            "order": ["ChangeOwner_button_default", "Abolish_button_default", "Export_button_default", "Print_button_default"]
        },
        {
            "hidden": [],
            "render_type": "list_single",
            "order": []
        }
    ],
    "scene_info": [
        {
            "hidden": [],
            "render_type": "drop_down",
            "order": ["All", "InCharge"]
        }
    ],
    "_id": "<refObjectApiName>_field_<fieldApiName>_related_list"
}
```

| 字段 | 说明 |
|------|------|
| ref_object_api_name | 关联的从对象 API Name |
| field_api_name | 从对象上的引用字段 API Name |
| related_list_name | 相关列表 API Name |
| relationType | 关联类型：`0` = 主从关系，`2` = 查找关联 |
| limit | 每页显示记录数 |
| button_info | 列表按钮配置 |
| scene_info | 场景筛选配置 |

### 7. 从对象/多表组件 (type: "multi_table")

主从关系的从对象数据，以表格嵌入展示。

```json
{
    "buttons": [],
    "child_components": [],
    "type": "multi_table",
    "api_name": "<refObjectApiName>_md_group_component",
    "header": "从对象显示名",
    "ref_object_api_name": "<refObjectApiName>",
    "related_list_name": "target_related_list_<id>__c",
    "field_api_name": "<fieldApiName>",
    "nameI18nKey": "<i18n_key>",
    "limit": 1,
    "relationType": 0,
    "display_rule": false,
    "_id": "<refObjectApiName>_md_group_component"
}
```

### 8. 审批流组件 (type: "approval_component")

```json
{
    "field_section": [],
    "buttons": [],
    "api_name": "approval_component",
    "header": "审批流组件",
    "nameI18nKey": "paas.udobj.approval_component",
    "type": "approval_component"
}
```

### 9. 阶段推进器组件 (type: "stage_component")

```json
{
    "field_section": [],
    "buttons": [],
    "api_name": "stage_component",
    "header": "阶段推进器组件",
    "nameI18nKey": "paas.udobj.stage_component",
    "type": "stage_component"
}
```

### 10. 业务流组件 (type: "bpm_component")

```json
{
    "field_section": [],
    "buttons": [],
    "api_name": "bpm_component",
    "header": "业务流组件",
    "nameI18nKey": "paas.udobj.bpm_component",
    "type": "bpm_component"
}
```

---

## 各布局类型详细规格

### detail（详情页布局）

详情页是最核心的布局，必须预置。

**必备组件：**
- `head_info` (type: simple) — 标题和按钮，不可删除
- `top_info` (type: top_info) — 摘要信息
- `form_component` (type: form) — 详细信息，不可删除
- `operation_log` (type: related_record) — 修改记录

**可选组件：**
- 页签容器 (type: tabs) — 将 form_component、operation_log、relatedlist 等组织到页签中
- 相关列表 (type: relatedlist) — 展示关联的从对象
- 从对象组件 (type: multi_table) — 主从关系嵌入展示
- 审批流 / 阶段推进器 / 业务流组件

**典型 layout_structure：**
```json
{
    "layout_structure_type": 1,
    "layout": [
        {
            "components": [["head_info"]],
            "columns": [{"width": "100%"}]
        },
        {
            "components": [["top_info", "container_<layout_id>__c"]],
            "columns": [{"width": "100%"}]
        }
    ]
}
```

**form_component 中的 `base_field_section__c` 分组是必须的，有且只有一个。该分组的 `form_fields` 必须同时包含 `name`（主属性文本字段）与 `owner`（负责人员工字段）。其他字段按业务需要追加。**

### edit（新建编辑页布局）

新建编辑页布局基于详情页复制而来，`layout_type` 为 `"edit"`。

**必备组件：**
- `head_info` (type: simple) — 使用 `button_info` 配置新建/编辑按钮
- `form_component` (type: form) — 表单字段

**head_info 的 button_info 中 page_type 值：**
- `"create"` — 新建页按钮，常见：`Add_Save_button_default`、`Add_Save_Continue_button_default`、`Add_Save_Draft_button_default`
- `"edit"` — 编辑页按钮，常见：`Edit_Save_button_default`

**可选组件：**
- 表格组件 (type: form_table) — 表格形式展示新建页字段
- shortcut 组件 (type: shortcut) — 移动端快捷操作
- related_list_form — 关联列表表单（常被放入 hidden_components）

### list_layout（Web 端列表页布局）

控制 Web 端列表页的按钮、场景、视图等。

**必备组件：**
- `list_component` (type: list) — 列表组件，不可删除

**列表组件核心属性：**

```json
{
    "type": "list",
    "api_name": "list_component",
    "header": "列表页",
    "nameI18nKey": "paas.udobj.list_page",
    "button_info": [],
    "scene_info": [],
    "view_info": [],
    "define_view_info": [],
    "filters_info": [],
    "summary_info": [],
    "all_page_summary_info": [],
    "enable_selected_layout": false
}
```

| 属性 | 说明 |
|------|------|
| button_info | 列表按钮配置，按 render_type 分组 |
| scene_info | 场景筛选配置 |
| view_info | 可用视图配置 |
| define_view_info | 已启用的视图类型列表 |
| filters_info | 快速筛选配置 |
| summary_info / all_page_summary_info | 列表页合计配置 |
| enable_selected_layout | 是否启用选数据列表 |

**button_info render_type 说明：**

| render_type | 说明 |
|-------------|------|
| list_normal | 通用按钮（新建、导入、导出等） |
| list_batch | 批量操作按钮（批量转移、作废等） |
| list_single | 单条记录按钮 |

**button_info page_type 说明：**

| page_type | 说明 |
|-----------|------|
| list | 列表页 |
| selected | 选数据列表 |

**view_info 可用视图：**

| name | 说明 |
|------|------|
| list_view | 列表视图（默认） |
| split_view | 分屏视图 |
| map_view | 地图视图（需配置 location_field） |
| calendar_view | 日历视图 |

**常见预置场景（scene_info order）：**
- `All` — 全部
- `InCharge` — 我负责的
- `Participate` — 我参与的
- `InChargeDept` — 我部门负责的
- `SubInCharge` — 下属负责的
- `SubParticipate` — 下属参与的
- `Shared` — 共享给我的
- `scene_<id>__c` — 自定义场景

**典型 layout_structure：**
```json
{
    "layout": [
        {
            "components": [[]],
            "columns": [{"width": "100%"}]
        },
        {
            "components": [["list_component"]],
            "columns": [{"width": "100%"}]
        }
    ]
}
```

> 列表页面结构固定为上下结构。列表组件固定在下半部分。上半部分可放置嵌入页面、栅格容器等组件。

### list（移动端列表摘要布局）

控制移动端列表中展示哪些摘要字段。`layout_type` 为 `"list"`，`agent_type` 为 `"agent_type_mobile"`。

**必备组件：**
- `table_component` (type: table) — 表格组件

```json
{
    "show_image": "",
    "buttons": [],
    "api_name": "table_component",
    "ref_object_api_name": "<ObjectApiName>",
    "include_fields": [
        {
            "api_name": "name",
            "label": "主属性",
            "render_type": "text",
            "field_name": "name",
            "is_show_label": true
        },
        {
            "api_name": "owner",
            "label": "负责人",
            "render_type": "employee",
            "field_name": "owner",
            "is_show_label": true
        }
    ],
    "type": "table",
    "is_show_tag": false
}
```

| 字段 | 说明 |
|------|------|
| include_fields | 显示的字段列表，最多 8 个 |
| include_fields[].is_show_label | 是否显示字段标签 |
| is_show_tag | 是否显示标签 |

---

## mobile_layout 移动端独立布局

当 `enable_mobile_layout` 为 `true` 时，移动端使用独立的布局配置。结构与 web 端一致，但页面只有一个部分（单列），组件自上而下排列。

移动端 detail 布局通常包含：
- `top_info` — 摘要信息
- `sale_log` (type: related_record) — 跟进动态
- `form_component` — 详细信息
- `operation_log` — 修改记录
- `approval_component` — 审批流
- `stage_component` — 阶段推进器
- `bpm_component` — 业务流
- `navigation` (type: navigation) — 导航组件，管理各组件的显示和顺序

**移动端 navigation 组件：**
```json
{
    "components": ["sale_log", "form_component", "operation_log"],
    "navigation": [],
    "buttons": [],
    "api_name": "navigation",
    "header": "navigation",
    "type": "navigation"
}
```

**移动端 layout_structure 典型结构：**
```json
{
    "layout": [
        {
            "components": [["top_info", "approval_component", "stage_component", "bpm_component", "navigation"]],
            "columns": [{"width": "100%"}]
        }
    ]
}
```

---

## status 状态值

| 值 | 使用场景 |
|----|---------|
| new | 新创建的布局 |
| modified | 已有布局被修改 |
| unchanged | 从服务端同步但未修改 |

## 命名规范

- 标准默认详情布局：`layout_<id>__c`
- 默认列表页布局：`default_list_layout`
- 新建编辑页布局：`edit_layout_<id>__c`
- 移动端列表摘要布局：`list_layout_<id>__c`
- 描述性命名：`<descriptive_name>__c`（如 `default_layout__c`）
- ID 部分为 5 位字母数字混合，区分大小写

## 设计建议

- **detail 布局**：展示全部重要字段，分 2-4 个字段分组，常用 2 列。建议使用页签容器组织表单、修改记录、关联列表。`base_field_section__c` 为固定的基本信息分组，`name` 与 `owner` 是分组内的最小字段集
- **edit 布局**：只包含可编辑字段，必填字段放在"基本信息"分组，系统信息分组设为只读
- **list_layout 布局**：配置合适的按钮、场景和视图。按业务需求隐藏不需要的场景和按钮
- **list 布局**：精选 3-8 个关键摘要字段，在移动端列表中快速展示核心信息
- **字段分组命名**：`base_field_section__c` 为固定的"基本信息"分组，自定义分组使用 `group_<id>__c` 格式

## 新建自定义对象的默认布局骨架

由 `sharedev-object` 在新建自定义对象时自动产出，不走 `sharedev-layout` 的需求确认流程。布局 XML 外壳复用 `assets/layout-template.xml`，外层 `<status>` 填 `new`。

**detail 布局**（`layout_<id>__c`，`layout_type: detail`，`is_default: true`）：

`form_component` 中的 `base_field_section__c` 分组 `form_fields` 必须至少包含 `name` 和 `owner`：

```json
{
  "api_name": "layout_<id>__c",
  "display_name": "<对象显示名>详情",
  "layout_type": "detail",
  "is_default": true,
  "ref_object_api_name": "<ObjectApiName>",
  "components": [
    {
      "api_name": "head_info",
      "type": "simple",
      "header": "标题和按钮",
      "nameI18nKey": "paas.udobj.head_info",
      "buttons": [{"action_type": "default", "api_name": "Edit_button_default", "label": "编辑"}],
      "exposedButton": 3
    },
    {
      "api_name": "top_info",
      "type": "top_info",
      "header": "摘要信息",
      "nameI18nKey": "paas.udobj.summary_info",
      "field_section": [
        {"render_type": "employee", "field_name": "owner"},
        {"render_type": "date_time", "field_name": "last_modified_time"}
      ],
      "buttons": []
    },
    {
      "api_name": "form_component",
      "type": "form",
      "header": "详细信息",
      "nameI18nKey": "paas.udobj.detail_info",
      "column": 2,
      "field_section": [
        {
          "api_name": "base_field_section__c",
          "header": "基本信息",
          "column": 2,
          "tab_index": "ltr",
          "show_header": true,
          "is_show": true,
          "form_fields": [
            {"field_name": "name", "render_type": "text", "is_readonly": false, "is_required": true},
            {"field_name": "owner", "render_type": "employee", "is_readonly": false, "is_required": true}
          ]
        }
      ],
      "buttons": [],
      "order": 1
    },
    {
      "api_name": "operation_log",
      "type": "related_record",
      "header": "修改记录",
      "nameI18nKey": "paas.udobj.modify_log",
      "field_section": [],
      "buttons": [],
      "order": 2
    }
  ],
  "layout_structure": {
    "layout_structure_type": 1,
    "layout": [
      {"components": [["head_info"]], "columns": [{"width": "100%"}]},
      {"components": [["top_info", "form_component", "operation_log"]], "columns": [{"width": "100%"}]}
    ]
  }
}
```

**list 布局**（`list_layout_<id>__c`，`layout_type: list`，移动端摘要，`is_default: true`）：

```json
{
  "api_name": "list_layout_<id>__c",
  "display_name": "<对象显示名>移动端列表",
  "layout_type": "list",
  "is_default": true,
  "ref_object_api_name": "<ObjectApiName>",
  "agent_type": "agent_type_mobile",
  "components": [
    {
      "api_name": "table_component",
      "type": "table",
      "ref_object_api_name": "<ObjectApiName>",
      "include_fields": [
        {"api_name": "name", "label": "主属性", "render_type": "text", "field_name": "name", "is_show_label": true},
        {"api_name": "owner", "label": "负责人", "render_type": "employee", "field_name": "owner", "is_show_label": true}
      ],
      "show_image": "",
      "buttons": [],
      "is_show_tag": false
    }
  ],
  "layout_structure": {
    "layout": [
      {"components": [["table_component"]], "columns": [{"width": "100%"}]}
    ]
  }
}
```

> ID 部分生成 5 位字母数字混合标识符（区分大小写），detail 和 list 布局可使用同一 ID 或不同 ID。
