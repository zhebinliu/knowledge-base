# 字段类型参考

## 使用说明

本文档中的 `type key` 指创建字段时对外暴露的业务类型 key，用于 `addDescribeCustomField` 一类接口和字段配置生成。

请注意两点：

- 文档中的 `type key` 不等于底层 `mt_field.type`。部分组合字段会在平台内部展开成 `group` 字段和多个子字段。
- 本文档优先使用当前平台能力 key，不再以 `percent`、`datetime`、`boolean`、`phone`、`reference`、`attachment`、`area_location` 这类旧命名作为主写法。

## 类型总览

| 类型 key | 显示名称 | 适用场景 | 备注 |
|---------|---------|---------|------|
| text | 单行文本 | 名称、标题、编号等短文本 | 基础文本字段 |
| long_text | 多行文本 | 备注、描述等较长纯文本 | 基础文本字段 |
| html_rich_text | 富文本 | 带 HTML 样式的正文内容 | 平台内还存在 `rich_text` 区分协同富文本 |
| rich_text | 协同富文本 | 协同编辑、富文本正文 | 与 `html_rich_text` 并存 |
| select_one | 单选 | 从固定选项中选一个 | 选项型字段 |
| select_many | 多选 | 从固定选项中选多个 | 选项型字段 |
| number | 数字 | 数量、计数等整数/小数 | 数值字段 |
| currency | 金额 | 价格、费用、收付款金额 | 数值字段 |
| percentile | 百分数 | 比率、折扣、百分比 | 当前主 key，不再使用 `percent` |
| date | 日期 | 仅日期，无时间 | 时间字段 |
| time | 时间 | 仅时分秒 | 时间字段 |
| date_time | 日期时间 | 日期和时间 | 当前主 key，不再使用 `datetime` |
| phone_number | 手机 | 电话、手机号 | 当前主 key，不再使用 `phone` |
| email | 邮箱 | 电子邮件地址 | 基础字段 |
| url | 网址 | URL 链接 | 基础字段 |
| true_or_false | 布尔值 | 是/否开关 | 当前主 key，不再使用 `boolean` |
| image | 图片 | 图片上传 | 文件字段 |
| file_attachment | 附件 | 常规文件上传 | 当前主 key，不再使用 `attachment` |
| auto_number | 自增编号 | 自动生成业务编号 | 系统生成字段 |
| formula | 计算字段 | 公式计算结果 | 只读/计算型字段 |
| object_reference | 查找关联 | 关联到另一个对象 | 当前主 key，不再使用 `reference` |
| object_reference_many | 查找关联(多选) | 关联多个对象 | 多值关联字段 |
| master_detail | 主从关系 | 父子关系、级联删除 | 关系字段 |
| department | 部门 | 单选部门 | 组织字段 |
| department_many | 部门(多选) | 多选部门 | 组织字段 |
| employee | 人员 | 单选人员 | 组织字段 |
| employee_many | 人员(多选) | 多选人员 | 组织字段 |
| out_employee | 外部人员 | 选择外部联系人/外部人员 | 组织字段 |
| location | 定位 | 经纬度或定位点 | 基础定位字段 |
| area | 地区定位 | 国家/省/市/区/详细地址 | 组合字段，内部会拆分 |
| group | 组合字段容器 | 平台内部组合字段容器 | 一般不作为直接创建 key 使用 |
| date_time_range | 日期范围 | 开始时间/结束时间区间 | 组合字段，内部会拆分 |
| count | 统计字段 | 聚合计数结果 | 只读/统计型字段 |
| signature | 签名字段 | 手写签名、电子签名 | 特殊业务字段 |
| quote | 引用字段 | 引用其他字段值 | 特殊业务字段 |
| payment | 支付组件 | 收款/付款类组件 | 组合字段，内部会拆分 |
| sign_in | 签到组件 | 签到签退、拜访状态等 | 组合字段，内部会拆分 |

## 兼容命名

以下写法在旧文档、旧实现或历史日志里可能出现，但新增文档与配置请统一使用右侧主 key：

| 旧命名 | 当前主 key |
|-------|-----------|
| percent | percentile |
| datetime | date_time |
| boolean | true_or_false |
| phone | phone_number |
| reference | object_reference |
| attachment | file_attachment |
| area_location | area |

## 实际落库映射

以下映射来自 `field_add-object_field`、`paas_oplog_dist` 和同批次 `mt_field` / `mt_field_extra` 落库记录，用于解释平台内部结构。

### 普通字段

这类字段通常一对一落到 `mt_field.type`：

- `text`
- `long_text`
- `html_rich_text`
- `rich_text`
- `select_one`
- `select_many`
- `number`
- `currency`
- `percentile`
- `date`
- `time`
- `date_time`
- `phone_number`
- `email`
- `url`
- `true_or_false`
- `image`
- `file_attachment`
- `auto_number`
- `formula`
- `object_reference`
- `object_reference_many`
- `master_detail`
- `department`
- `department_many`
- `employee`
- `employee_many`
- `out_employee`
- `location`
- `count`
- `signature`
- `quote`

### 组合字段

这类字段的业务 key 和底层落库结构不是同一层概念。对外仍按业务 key 理解，对内会拆成 `group` 字段和多个子字段。

#### date_time_range（日期范围）

- 对外 key：`date_time_range`
- 实际落库：`type=group`, `group_type=date_time_range`
- 自动创建子字段：
  - `start_time_field` 指向开始时间子字段
  - `end_time_field` 指向结束时间子字段
  - 两个子字段的 `type` 均为 `date_time`

#### area（地区定位）

- 对外 key：`area`
- 实际落库：`type=group`, `group_type=area`
- 常见子字段：
  - `country`
  - `province`
  - `city`
  - `district`
  - `text`（详细地址）
  - `location`（如配合地图定位）

#### sign_in（签到组件）

- 对外 key：`sign_in`
- 实际落库：`type=group`, `group_type=sign_in`
- 日志中看到的子字段类型包括：
  - `date_time`
  - `location`
  - `select_one`
  - `number`
  - `embedded_object_list`

#### payment（支付组件）

- 对外 key：`payment`
- 实际落库：`type=group`, `group_type=payment`
- 日志中看到的子字段类型包括：
  - `currency`
  - `text`
  - `select_one`
  - `date_time`

#### group（组合字段容器）

- `group` 更像平台内部容器类型，不建议作为业务配置文档里的直接选型答案
- 如果看到 `type=group`，通常应继续看 `group_type`
- 当前已确认的 `group_type` 至少包括：
  - `date_time_range`
  - `area`
  - `sign_in`
  - `payment`

## 各类型详细约束

### text（单行文本）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| maxLength | number | 否 | 最大长度，默认 255 |
| defaultValue | string | 否 | 默认值 |
| pattern | string | 否 | 正则表达式校验 |

### long_text / html_rich_text / rich_text

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| maxLength | number | 否 | 文本最大长度，`long_text` 通常默认 2000 |
| defaultValue | string | 否 | 默认值 |

### number / currency / percentile

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| precision | number | 否 | 总位数 |
| scale | number | 否 | 小数位数 |
| min | number | 否 | 最小值，仅数值类常见 |
| max | number | 否 | 最大值，仅数值类常见 |
| defaultValue | number | 否 | 默认值 |
| currencyCode | string | 否 | 币种代码，仅 `currency` 常见 |

### date / time / date_time

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| defaultValue | string | 否 | 默认值，如 `NOW` |
| showTime | boolean | 否 | 仅组合场景下会见到，普通 `date_time` 一般不单独配置 |

### true_or_false

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| defaultValue | boolean | 否 | 默认值，`true` 或 `false` |

### select_one / select_many

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| options | array | 是 | 选项列表 |
| options[].label | string | 是 | 选项显示文本 |
| options[].value | string | 是 | 选项值 |
| options[].isDefault | boolean | 否 | 是否为默认选中 |

### object_reference / object_reference_many / master_detail

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| targetObjectApiName | string | 是 | 目标对象 API Name |
| displayFieldApiName | string | 否 | 显示字段，默认 `name` |
| filterConditions | object | 否 | 过滤条件 |
| cascadeDelete | boolean | 否 | 仅 `master_detail` 常见，默认 true |

### auto_number

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| format | string | 是 | 编号格式，如 `ORD-{0000}` |
| startValue | number | 否 | 起始值，默认 1 |

### employee / employee_many / out_employee / department / department_many

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| multiSelect | boolean | 否 | 对单多选组织字段的统一理解参数 |

### image / file_attachment

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| maxCount | number | 否 | 最大数量 |
| maxSize | number | 否 | 单文件最大大小（MB） |

### formula / count / quote / signature

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| expression | string | 否 | 公式或表达式，`formula` 常见 |
| targetFieldApiName | string | 否 | 引用或统计目标字段 |
| targetObjectApiName | string | 否 | 统计或引用目标对象 |

## 默认值与表达式的映射规则

### 普通默认值

- 用户给的是固定值时，按字段类型写入 `defaultValue`
- 底层元数据对应 `default_value`
- 此时 `default_is_expression=false`

### 表达式默认值

- 用户要求“默认值按公式计算”时，不改变字段类型
- 仍写入该字段自己的 `defaultValue`
- 底层元数据写法为：
  - `default_value=<公式字符串>`
  - `default_is_expression=true`
- 公式生成过程必须读取 [formula-generation.md](/Users/fengjin/IdeaProjects/share-skill-kit/skills/sharedev-field/references/formula-generation.md)

### formula 字段

- `formula` 字段是专门的计算字段，不使用 `defaultValue`
- 公式内容写入 `expression`
- 表达式返回值类型必须与字段预期类型一致
- 公式生成过程同样必须读取 [formula-generation.md](/Users/fengjin/IdeaProjects/share-skill-kit/skills/sharedev-field/references/formula-generation.md)

### count / quote / signature

- `count`、`quote`、`signature` 虽与 `formula` 同属“特殊字段”分组，但不复用 `expression` 生成协议
- `count` 依赖聚合配置
- `quote` 依赖引用字段路径
- `signature` 无表达式配置

### date_time_range / area / sign_in / payment

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| children | array | 否 | 组合字段的子字段定义，若配置端支持则可见 |
| showTime | boolean | 否 | `date_time_range` 常见，控制子字段时间展示 |
| startTimeField | string | 否 | 平台展开后生成的开始时间字段 |
| endTimeField | string | 否 | 平台展开后生成的结束时间字段 |
| groupType | string | 否 | 平台内部展开语义，常见于日志或落库，不建议在对外配置中直接写成最终答案 |

## 类型选择指南

- 存储名称、标题、编号 → `text`
- 存储长描述或备注 → `long_text`
- 存储富文本内容 → `html_rich_text` / `rich_text`
- 存储金钱相关数值 → `currency`
- 存储比率 → `percentile`
- 仅日期 → `date`
- 仅时间 → `time`
- 日期和时间 → `date_time`
- 存储“由公式实时计算的结果” → `formula`
- 存储“字段本身有固定类型，但默认值由公式计算” → 保持原字段类型，并使用表达式默认值
- 日期区间 → `date_time_range`
- 有限选项列表 → `select_one` / `select_many`
- 是/否判断 → `true_or_false`
- 关联其他对象 → `object_reference`
- 关联多个对象 → `object_reference_many`
- 父子主从关系 → `master_detail`
- 组织人员/部门 → `employee` / `employee_many` / `department` / `department_many` / `out_employee`
- 常规附件上传 → `file_attachment`
- 图片上传 → `image`
- 地图坐标 → `location`
- 省市区地址 → `area`
- 签到签退场景 → `sign_in`
- 收付款场景 → `payment`
