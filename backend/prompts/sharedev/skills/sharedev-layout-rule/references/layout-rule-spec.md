# 布局规则配置规格

## XML 结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ObjectLayoutRule xmlns="http://sharecrm.com/metadata">
    <content>{JSON 字符串}</content>
    <status>new|modified|unchanged</status>
</CustomObject>
```

> 注：闭合标签 `</CustomObject>` 为平台约定，需保持一致。

## content JSON 公共字段

所有布局规则共享以下顶层字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api_name` | string | 是 | 规则 API Name，格式 `layout_rule_<id>__c` |
| `label` | string | 是 | 中文显示名称 |
| `layout_api_name` | string | 是 | 所属布局 API Name，必须已存在 |
| `object_describe_api_name` | string | 是 | 所属对象 API Name |
| `type` | string | 是 | 规则类型：`"field"`（字段控制）或 `"page"`（页面控制） |
| `status` | number | 是 | 状态：`1`=启用，`0`=禁用 |
| `define_type` | string | 是 | 固定为 `"custom"` |
| `description` | string | 否 | 规则描述 |

根据 `type` 不同，其余字段分为两种结构。

---

## 字段控制类型（type: "field"）

当主字段满足指定条件时，控制叶子字段的显示、必填或只读状态。

### 完整结构

```json
{
    "api_name": "layout_rule_<id>__c",
    "label": "规则显示名称",
    "layout_api_name": "布局APIName",
    "object_describe_api_name": "对象APIName",
    "description": "",
    "type": "field",
    "status": 1,
    "define_type": "custom",
    "main_field": "主字段APIName",
    "main_field_branches": [
        {
            "main_field_filter": {
                "value_type": 0,
                "operator": "操作符",
                "field_name": "主字段APIName",
                "field_values": ["条件值"]
            },
            "branches": [
                {
                    "conditions": [],
                    "result": {
                        "show_field": [{"field_api_name": "字段A"}],
                        "required_field": [{"field_api_name": "字段B"}],
                        "readonly_field": [{"field_api_name": "字段C"}]
                    }
                }
            ]
        }
    ],
    "page_branches": null,
    "page_trigger_mode": null
}
```

### 字段控制专属字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `main_field` | string | 是 | 主字段 API Name |
| `main_field_branches` | array | 是 | 分支数组，每个元素对应一个主字段条件分支 |
| `page_branches` | null | 是 | 字段控制类型固定为 `null` |
| `page_trigger_mode` | null | 是 | 字段控制类型固定为 `null` |

### main_field_branches 元素结构

每个元素代表「当主字段满足某条件时，执行对应的叶子效果」。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `main_field_filter` | object | 是 | 主字段过滤条件 |
| `branches` | array | 是 | 子分支数组（包含附加条件和叶子结果） |

### main_field_filter 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value_type` | number | 是 | 固定为 `0`（字面值） |
| `operator` | string | 是 | 比较操作符，见操作符列表 |
| `field_name` | string | 是 | 字段 API Name（与 `main_field` 相同） |
| `field_values` | array | 是 | 条件值数组，`ISN`/`ISNN` 时为空数组 |

### branches 元素结构（子分支）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `conditions` | array | 是 | 附加条件数组（空数组表示无附加条件） |
| `result` | object | 是 | 叶子节点效果 |

### result 结构（叶子效果）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `show_field` | array | 是 | 满足条件时**显示**的字段列表 |
| `required_field` | array | 是 | 满足条件时**必填**的字段列表 |
| `readonly_field` | array | 是 | 满足条件时**只读**的字段列表 |

每个元素格式：`{"field_api_name": "字段APIName"}`

### 叶子节点效果说明

| 效果 | 不满足条件时 | 满足条件时 |
|------|------------|-----------|
| `show_field` | 隐藏 | 显示 |
| `required_field` | 非必填 | 必填 |
| `readonly_field` | 正常 | 只读 |

未在叶子节点中配置的字段，根据其在布局中设置的属性展示，不受布局规则影响。

---

## 页面控制类型（type: "page"）

按新建或编辑页面控制字段的隐藏或只读状态。

### 完整结构

```json
{
    "api_name": "layout_rule_<id>__c",
    "label": "规则显示名称",
    "layout_api_name": "布局APIName",
    "object_describe_api_name": "对象APIName",
    "description": "",
    "type": "page",
    "status": 1,
    "define_type": "custom",
    "main_field": null,
    "main_field_branches": null,
    "page_trigger_mode": "add",
    "page_branches": {
        "hide_field": ["字段A_APIName", "字段B_APIName"],
        "readonly_field": ["字段C_APIName"]
    }
}
```

### 页面控制专属字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page_trigger_mode` | string | 是 | `"add"`=新建页面，`"edit"`=编辑页面 |
| `page_branches` | object | 是 | 包含隐藏和只读字段配置 |
| `main_field` | null | 是 | 页面控制类型固定为 `null` |
| `main_field_branches` | null | 是 | 页面控制类型固定为 `null` |

### page_branches 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hide_field` | array | 否 | 满足条件时**隐藏**的字段 API Name 列表 |
| `readonly_field` | array | 否 | 满足条件时**只读**的字段 API Name 列表 |

> `hide_field` 和 `readonly_field` 中的字段**互斥**——同一字段不能同时出现在两个列表中。

### 叶子节点效果说明

| 效果 | 默认状态 | 满足条件时 |
|------|---------|-----------|
| `hide_field` | 展示 | 隐藏 |
| `readonly_field` | 非只读 | 只读 |

---

## 操作符（operator）

用于 `main_field_filter.operator`，定义主字段的匹配方式。

| 操作符 | 含义 | `field_values` 格式 | 示例 |
|--------|------|---------------------|------|
| `EQ` | 等于 | 单值数组 `["值"]` | `{"operator": "EQ", "field_values": ["选项A"]}` |
| `N` | 不等于 | 单值数组 `["值"]` | `{"operator": "N", "field_values": ["选项B"]}` |
| `IN` | 属于（多选） | 多值数组 | `{"operator": "IN", "field_values": ["值1", "值2"]}` |
| `NIN` | 不属于（多选） | 多值数组 | `{"operator": "NIN", "field_values": ["值1"]}` |
| `LIKE` | 包含 | 单值数组 | `{"operator": "LIKE", "field_values": ["关键字"]}` |
| `ISN` | 为空 | 空数组 `[]` | `{"operator": "ISN", "field_values": []}` |
| `ISNN` | 不为空 | 空数组 `[]` | `{"operator": "ISNN", "field_values": []}` |

---

## 字段类型支持矩阵（字段控制类型）

### 主字段（main_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 单选、多选、金额、数值、布尔值、日期类型、文本类型 | 引用人员、部门、图片、业务类型、查找关联、国家省市区 |

**统一不支持的系统字段：** 创建时间、最后修改人、最后修改时间、负责人所在部门、生命状态、锁定状态、业务类型

**特殊支持：** 创建人、负责人、归属部门、人员部门类型可作为主字段

**约束：** 同一个布局的布局规则不可使用同一个字段作为主字段

### 分支节点（conditions）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 国家/省/市/区（分开配置） | 富文本、协同富文本、图片、附件、大附件、查找关联、查找关联（多选）、外部部门、外部人员、定位、签名 |

### 叶子节点 — 显示（show_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 布局中**非必填**的自定义字段：单选、多选、金额、数值、布尔值、日期类型、文本类型、人员、部门、查找关联 | 主从关系、支付组件、签到组件、地区定位、自增编码、计算字段、统计字段 |

**特殊支持：** 统计字段、计算字段、引用字段、附件、大附件、图片、创建人、负责人、归属部门

**国家/省/市/区合并配置**

**约束：**
- 不能选择同规则的主字段
- 不能选择布局中必填的字段

### 叶子节点 — 必填（required_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 布局中**非必填**的自定义字段：单选、多选、金额、数值、布尔值、日期类型、文本类型、查找关联、人员、部门 | 创建人、负责人、归属部门、统计字段、计算字段、引用字段 |

**国家/省/市/区合并配置**

**地区定位组件支持：** 国家（代表国家省市区）、详细地址、定位

**约束：**
- 不能选择同规则的主字段
- 不能选择布局中必填的字段
- 不能选择布局中的只读字段

### 叶子节点 — 只读（readonly_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 支持类型的字段 | 统计字段、计算字段、引用字段 |

---

## 字段类型支持矩阵（页面控制类型）

### 隐藏字段（hide_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 布局中**非必填**且支持类型的字段 | 系统字段（创建人、创建时间、最后修改人、最后修改时间）、负责人、负责人所在部门、生命状态、锁定状态、业务类型、主从关系、支付组件、签到组件、地区定位、自增编码、计算字段、统计字段 |

### 只读字段（readonly_field）

| 支持的字段类型 | 不支持的字段类型 |
|--------------|----------------|
| 布局中**非只读**且支持类型的字段 | 同上 |

**互斥约束：** 同一字段不能同时配置在 `hide_field` 和 `readonly_field` 中。

---

## 约束规则汇总

### 数量限制

| 约束 | 限制值 |
|------|-------|
| 每个布局的布局规则总数（字段控制+页面控制） | **最多 10 条** |
| 每个布局的新建页面控制规则 | **最多 1 条** |
| 每个布局的编辑页面控制规则 | **最多 1 条** |

### 成环检测（字段控制类型）

一条控制分支中的**条件节点字段**和**叶子节点字段**不能相同。以下均视为成环：
- `【A=1 & B=2】 ==> 显示/必填A` — 条件字段 A 出现在叶子中
- `【A=1 & B=2】 ==> 显示/必填B` — 条件字段 B 出现在叶子中

### 主字段唯一性

同一个布局内，不同的字段控制规则**不可使用同一个字段**作为主字段。

### 页面控制互斥

`hide_field` 和 `readonly_field` 中的字段不能重叠。

### 从对象限制

- **主从同时新建**的从对象：不允许配置页面控制类型规则
- 从对象的布局规则**不支持**创建人、归属部门、负责人字段

---

## 两种类型同时作用时的优先级

**页面控制优先级高于字段控制。** server 端根据页面控制规则修改下发给前端的字段属性，前端根据最新属性判断字段控制规则的展示逻辑。

| 页面控制效果 | 字段为主字段 | 字段为分支节点 | 字段为叶子-显示 | 字段为叶子-必填 |
|------------|------------|-------------|---------------|---------------|
| **隐藏** | 主字段不生效（规则禁用） | 分支不生效（删除该分支条件） | 一直隐藏，满足条件也不展示 | 一直隐藏，满足条件也不展示必填 |
| **只读** | 主字段不生效（规则禁用） | 分支不生效（删除该分支条件） | 满足条件时展示并只读 | 一直只读，不会显示必填 |

---

## 字段属性/权限对布局规则的影响

| 情况 | 新建/编辑页面 | 详情页面 | 备注 |
|------|-------------|---------|------|
| 主字段布局隐藏/权限不可见/禁用 | 主字段不生效，规则禁用 | 主字段不生效，规则禁用 | 创建人、负责人、归属部门隐藏时仍参与布局规则 |
| 分支字段布局隐藏/权限不可见/禁用 | 分支不生效，相当于删除该分支条件 | 分支不生效，相当于删除该分支条件 | |
| 主字段/分支字段有掩码 | 等同于字段隐藏/不可见 | 参与布局规则，值为 NULL | 创建人、负责人、归属部门隐藏时仍参与布局规则 |

---

## 掩码字段的处理

当字段支持掩码（手机、邮箱类型）时：

**编辑页面：**
- 显示原值：按照原值进行规则条件判断
- 显示掩码：按照「不可见」作为条件进行判断

**详情页面：**
- 显示原值：按照原值进行规则条件判断
- 显示掩码：按照「空值」作为条件进行判断

---

## 多分支生效逻辑（字段控制类型）

- 多个分支节点可**同时生效**
- 主字段不受布局规则控制，始终显示（主字段所在布局规则是启用状态）
- 一个字段可以被多个上级条件分支控制，**只要一个控制条件满足就会触发**叶子结点
- 多个布局规则之间是**独立的或（OR）关系**

---

## status 状态值（XML 层）

| 值 | 使用场景 |
|----|---------|
| `new` | 新创建的规则 |
| `modified` | 已有规则被修改 |
| `unchanged` | 从服务端同步但未修改 |

> 注意：XML `<status>` 与 JSON 内部的 `status`（0/1）是不同的概念。XML status 表示配置同步状态，JSON status 表示规则启用/禁用状态。

---

## 目录结构

```
tenant-config/objects/<ObjectApiName>/
├── ...
└── layout-rules/                              ← 新增目录
    └── <ruleApiName>.layout-rule-meta.xml
```

首次为对象添加布局规则时需创建 `layout-rules/` 目录。

---

## 完整示例

### 字段控制类型示例

场景：当「客户名称」字段包含"VIP"时，显示「VIP等级」字段并将「折扣率」字段设为必填。

```json
{
    "api_name": "layout_rule_xK3mN__c",
    "label": "VIP客户字段控制",
    "layout_api_name": "detail_layout_B752d__c",
    "object_describe_api_name": "AccountObj",
    "description": "VIP客户显示专属字段",
    "type": "field",
    "status": 1,
    "define_type": "custom",
    "main_field": "name",
    "main_field_branches": [
        {
            "main_field_filter": {
                "value_type": 0,
                "operator": "LIKE",
                "field_name": "name",
                "field_values": ["VIP"]
            },
            "branches": [
                {
                    "conditions": [],
                    "result": {
                        "show_field": [
                            {"field_api_name": "field_vipLevel__c"}
                        ],
                        "required_field": [
                            {"field_api_name": "field_discount__c"}
                        ],
                        "readonly_field": []
                    }
                }
            ]
        }
    ],
    "page_branches": null,
    "page_trigger_mode": null
}
```

### 页面控制类型示例

场景：新建页面时隐藏「负责人」字段。

```json
{
    "api_name": "layout_rule_7nb2j__c",
    "label": "新建页面隐藏负责人",
    "layout_api_name": "edit_layout_lqNbi__c",
    "object_describe_api_name": "object_P2aai__c",
    "description": "新建时不需要选择负责人，系统自动分配",
    "type": "page",
    "status": 1,
    "define_type": "custom",
    "main_field": null,
    "main_field_branches": null,
    "page_trigger_mode": "add",
    "page_branches": {
        "hide_field": ["owner"],
        "readonly_field": []
    }
}
```
