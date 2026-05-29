# 布局配置反模式

## "把所有字段都放上去"

布局不是字段仓库。根据使用场景和业务流程，合理分区分组，只展示关键字段。

## "详情页和新建页用同一个布局"

detail / edit / list_layout / list 四种布局服务不同场景，字段选择、按钮配置和组件组成应区别对待。

## "手动拼 layout_structure"

layout_structure 必须与 components 数组中的组件 api_name 严格对应。先确定组件列表，再构造 layout_structure。

## "忽略 base_field_section__c"

detail 和 edit 布局的 form_component 中，`base_field_section__c` 分组是必须的，有且只有一个。遗漏会导致系统异常。**对于 detail 布局，该分组的 `form_fields` 必须至少包含 `name` 和 `owner` 两个字段**；其他字段可按业务需要追加。

## "把 list 和 list_layout 当同一种布局"

`list_layout`（layout_type: `"list_layout"`）是 **Web 端列表页**布局，核心组件是 `list_component`，控制列表按钮、场景、视图、筛选等。`list`（layout_type: `"list"`）是**移动端列表摘要**布局，核心组件是 `table_component`，控制摘要字段展示。二者名称相近但结构完全不同，混淆会导致整个布局无法渲染。

## "默认生成 edit 布局"

detail 和 list（移动端摘要）是新建自定义对象时的默认两份布局；edit 布局（新建/编辑页）**必须由用户显式开启**，不得在未确认的情况下默认生成。

## "在 list_layout / list 布局中配置 UI 事件"

UI 事件只作用于新建/编辑页面。list_layout（Web 列表页）和 list（移动端摘要）布局无编辑交互，配置 UI 事件无任何效果，且属于错误配置。

## "同一字段绑定多个数据更新事件"

每个触发字段只能出现在一个数据更新事件的 `trigger_field_api_names` 中。若同一字段需要数据更新联动也需要校验，应分别配置为数据更新事件（type=1）和校验事件（type=3）——两种不同类型，互不冲突。

## "APL 函数未 push 就先 push 布局"

服务端在保存 UI 事件时会建立函数引用关系，若函数不存在会导致引用异常。正确顺序：APL 函数先 push 到服务端 → 再 push 含 UI 事件的布局。

## "更新 detail 布局时遗漏 ui_event_ids"

若对象同时存在独立 edit 布局，且提交的 detail 布局更新中 `ui_event_ids` 为空，服务端会静默删除 detail 布局上的所有 UI 事件（服务端将此视为"事件已迁移到 edit 布局"）。更新现有布局前必须先读取当前布局，获取已有事件的 `_id`，在更新时完整带入。
