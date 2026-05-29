---
name: sharedev-layout
description: 创建或修改页面布局——读取对象字段和已有布局，基于组件化结构生成 layout-meta.xml 配置，支持 detail/edit/list_layout/list 四种布局类型；detail/edit 布局支持配置 UI 事件（字段事件、加载事件、从对象事件、校验事件）
---

# 配置页面布局

## 概述

为 CRM 对象创建或修改页面布局。布局定义了页面上的组件组成、组件排布方式（layout_structure）、字段分组与排列。支持四种布局类型：

| 类型 | 说明 | 必须预置 |
|------|------|---------|
| detail | 详情页布局 | 是 |
| edit | 新建/编辑页布局，**默认不开**，需用户显式启用 | 否（按需开启） |
| list_layout | **Web 端**列表页布局，控制 list_component 的按钮/视图/筛选；⚠️ 不是移动端摘要 | 否（按需） |
| list | **移动端**列表摘要布局，控制 table_component 的 include_fields；⚠️ 不是 Web 列表页 | 是（新建自定义对象时随对象一起产出） |

**开始时宣告：** "我正在使用 sharedev-layout skill 来配置页面布局。"

**开始时执行：** `sharedev trace -m skill --str1 sharedev-layout`

**输出路径：** `tenant-config/objects/<ObjectApiName>/layouts/<layoutApiName>.layout-meta.xml`

<HARD-GATE>
在生成布局配置之前，必须：
1. 确认目标对象存在
2. 读取对象的完整字段列表（`tenant-config/objects/<Object>/fields/`）
3. 确认布局中引用的每个字段确实存在
4. 读取已有布局目录（`tenant-config/objects/<Object>/layouts/`），了解已有布局情况
引用不存在的字段会导致页面渲染错误。

**detail 布局额外要求：** `form_component` 必须包含 `base_field_section__c` 分组，且该分组的 `form_fields` 必须同时包含 `name` 与 `owner` 字段。

**edit 布局前置确认：** 生成 `layout_type = edit` 布局前必须获得用户的显式确认（"是否需要独立的新建/编辑页布局"），默认不生成 edit 布局。

**list vs list_layout：** 生成布局前必须明确区分——`list` 是移动端摘要布局（组件：`table_component`），`list_layout` 是 Web 端列表页布局（组件：`list_component`）。若用户描述模糊（如"列表布局"、"移动端列表"），必须先澄清再生成。

**UI 事件前置确认：** UI 事件仅适用于 detail/edit 布局，且仅旗舰版、集团版支持。配置 UI 事件前，必须确认绑定的 APL 函数**已存在于服务端**（函数必须先 push，布局后 push）。更新已有布局时，必须先读取现有布局获取完整的 `ui_event_ids` 和 `events`（含 `_id`），防止触发服务端静默删除事件的逻辑。
</HARD-GATE>

## 反模式

详见 `./references/anti-patterns.md`——10 个常见错误场景及原因说明。

## 流程

### 第一步：加载对象上下文

读取 `tenant-config/objects/<ObjectApiName>/fields/` 获取所有字段，汇总 `apiName`、`displayName`、`fieldType`。

### 第二步：加载已有布局

扫描 `tenant-config/objects/<ObjectApiName>/layouts/` 目录，了解已有布局的类型及是否为默认布局。

### 第三步：确认布局需求

与用户确认：布局类型（含上文限制）、是否默认布局（每种类型每个对象只能有一个）。

**detail 布局：** 字段分组设计、字段选择与排列、top_info 摘要字段、head_info 按钮、是否需要页签容器、关联列表/从对象组件、页面结构（上下 or 上左右）、是否启用移动端独立布局。

**edit 布局（前置：已获用户明确确认）：** 字段分组与字段选择（只含可编辑字段）、新建页/编辑页按钮、是否启用移动端独立布局。

**UI 事件（仅 detail/edit 布局）：** 询问是否需要配置 UI 事件。若需要，逐项确认：
1. **版本确认** — 租户是否为旗舰版或集团版，否则无法使用 UI 事件
2. **对象类型确认** — 确认对象不是"主从同时新建"的从对象
3. **布局确认** — 若已有独立 edit 布局，UI 事件必须配置在 edit 布局；否则配置在 detail 布局
4. **事件清单** — 每类事件确认触发条件和绑定的 APL 函数：
   - 字段事件（type=1, triggers=[1]）：哪些字段触发，对应哪个函数
   - 加载事件（type=4, triggers=[5]）：页面加载时触发哪个函数，触发字段为空
   - 从对象事件（type=2）：哪个从对象；新增/编辑/删除明细各自的触发配置；编辑明细可指定触发字段，新增/删除触发字段为空
   - 校验事件（type=3, triggers=[1]）：哪些字段需要前端实时校验，对应哪个函数
5. **配额核实** — 数据更新事件（type=1+2+4 合计）≤ 3；校验事件（type=3）≤ 5；每个字段只能绑定一个数据更新事件
6. **APL 函数确认** — 每个事件的 `func_api_name` 是否已 push 到服务端：
   - 若函数已存在：确认 `func_api_name` 和 `func_name`
   - 若函数不存在：**暂停布局配置，先使用 `sharedev-apl` 技能创建并 push 函数**，成功后再继续布局配置
   - 提交时序：APL 函数先 push → 布局（含 UI 事件）后 push
7. **更新已有布局的额外步骤** — 若是修改现有布局：必须先读取当前布局文件，获取已有 `events` 中每个事件的 `_id`，在更新时完整带入，否则可能触发服务端静默删除逻辑

**list_layout 布局：** 列表按钮配置（通用/批量/单条）、场景筛选、可用视图（列表/分屏/地图/日历视图）、快速筛选字段、是否启用选数据列表。

**list 布局（移动端列表摘要）：** 摘要字段选择（最多 8 个）。

### 第四步：设计布局结构

1. **确定 components 列表** — 根据布局类型列出所有需要的组件
2. **构造每个组件的 JSON** — 参考 `./references/layout-spec.md` 中的组件类型规格
3. **构造 layout_structure** — 确保引用的组件 api_name 都在 components 中存在
4. **如需移动端独立布局** — 构造 mobile_layout 结构
5. **如需 UI 事件** — 仅 detail 或 edit 布局。根据第三步确认的事件清单，为每个事件构造对象：填写 `type`、`describe_api_name`（主对象）、`trigger_describe_api_name`（字段事件/校验/onload 时为主对象；从对象事件时为从对象 API Name）、`trigger_field_api_names`、`triggers`（数组格式）、`func_api_name`、`func_name`。新建事件不填 `_id`；更新已有事件需带入从现有布局读取的 `_id`。将所有事件对象填入 `events` 数组，顶层添加 `"layout_ui_event": true`。详见 `./references/layout-spec.md` 中"UI 事件配置"章节。

**字段到 render_type 映射：** text→text / long_text→long_text / number→number / currency→currency / date→date / date_time→date_time / employee→employee / select_one→select_one / select_many→select_many / object_reference→object_reference / record_type→record_type / auto_number→auto_number / formula→formula / check_box→check_box / image→image / file_attachment→file

### 第五步：生成配置

1. 读取 `./assets/layout-template.xml` 获取模板
2. 构造完整 content JSON（顶层字段 + components + layout_structure + hidden_buttons/components + mobile_layout）
3. 将 JSON 序列化为字符串填入 `<content>` 标签
4. 设置 `<status>`：新建用 `new`，修改用 `modified`

### 第六步：验证

- 布局中所有字段引用（form_fields、top_info、relatedlist 等）均存在于对象字段列表
- layout_structure 中每个组件 api_name 都在 components 中有定义
- **detail 布局**：`base_field_section__c` 有且只有一个，且 form_fields 含 `name` 与 `owner`
- **edit 布局**（若生成）：`base_field_section__c` 有且只有一个
- **list 布局**：layout_type=`"list"`，components 含 `table_component`，不含 `list_component`
- **list_layout 布局**：layout_type=`"list_layout"`，components 含 `list_component`，不含 `table_component`
- 布局 API Name 符合命名规范，默认布局在同类型中唯一
- **UI 事件**（若配置）：数据更新事件（type=1+2+4）≤ 3；校验事件（type=3）≤ 5；同一字段未重复出现在多个数据更新事件；加载事件 trigger_field_api_names 为 `[]`，triggers 为 `[5]`；校验事件 trigger_field_api_names 不为空；UI 事件只出现在 detail/edit 布局；更新布局时 `_id` 已完整带入

### 第七步：保存

1. 写入 `tenant-config/objects/<ObjectApiName>/layouts/<layoutApiName>.layout-meta.xml`
2. 告知用户保存路径
3. 提示后续可使用 `sharedev-layout-rule` 设置布局分配规则

## 红线（绝不触犯）

**绝不：**
- 引用不存在的字段
- 不读取字段列表就生成布局
- layout_structure 引用 components 中不存在的组件
- detail 布局遗漏 `base_field_section__c` 分组，或该分组未包含 `name` 与 `owner` 字段
- 遗漏 edit 布局的 `base_field_section__c` 分组（如果生成了 edit 布局）
- 未经用户明确开启生成 edit 布局
- 把 `list_layout` 写成 `list` 或反之（组件结构完全不同）
- 覆盖默认布局而不告知用户
- 在同一类型下设置多个默认布局
- 在 `list_layout` 或 `list` 布局中配置 `events` 或 `ui_event_ids`
- 数据更新事件（type=1+2+4）超过 3 个，或校验事件（type=3）超过 5 个
- 同一字段出现在多个数据更新事件的 `trigger_field_api_names` 中
- 在"主从同时新建"的从对象布局上配置任何 UI 事件
- `func_api_name` 引用的 APL 函数尚未 push 到服务端就 push 布局
- 更新现有布局时未读取已有 events 的 `_id`，导致服务端静默删除已有事件

## 集成

- **前置条件：** 目标对象及其字段必须存在（`sharedev-object` + `sharedev-field` 或已有配置）
- **后续 skill：** `sharedev-layout-rule`（为布局设置分配规则）
- **关联目录：** `tenant-config/objects/<Object>/layouts/`（读写）、`tenant-config/objects/<Object>/fields/`（只读）
- **命名规范：** `./references/naming-conventions.md`
- **结构规格：** `./references/layout-spec.md`
