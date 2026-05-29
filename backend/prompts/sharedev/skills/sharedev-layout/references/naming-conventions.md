# 布局命名规范

## 按布局类型

### detail（详情页布局）
- 默认布局：`layout_<id>__c`
- 示例：`layout_87g6T__c`

### edit（新建编辑页布局）
- 默认布局：`edit_layout_<id>__c`
- 示例：`edit_layout_w6jw0__c`

### list_layout（Web 端列表页布局）
- 默认布局：`default_list_layout`
- 自定义布局：`list_layout_<id>__c`

### list（移动端列表摘要布局）
- 默认布局：`list_layout_<id>__c`
- 示例：`list_layout_V1Gnq__c`

## 通用格式

- 自定义布局：`layout_<id>__c` 或 `<descriptive_name>__c`
- `<id>` 为 5 位字母数字混合标识符，区分大小写
- 示例：`default_layout__c`

## 组件命名规范

### 固定 api_name 的组件
- 标题和按钮：`head_info`
- 摘要信息：`top_info`
- 详细信息/表单：`form_component`
- 修改记录：`operation_log`
- 跟进动态：`sale_log`
- 列表组件：`list_component`
- 表格组件：`table_component`
- 导航组件：`navigation`
- 审批流：`approval_component`
- 阶段推进器：`stage_component`
- 业务流：`bpm_component`

### 动态命名的组件
- 页签容器：`container_<layoutApiName>`（如 `container_default_layout_87g6T__c`）
- 相关列表：`<refObjectApiName>_field_<fieldApiName>_related_list`
- 从对象组件：`<refObjectApiName>_md_group_component`

### 字段分组命名
- 基本信息分组（必须）：`base_field_section__c`
- 系统信息分组：`system_group__c`
- 自定义分组：`group_<id>__c`

### 页签命名
- 格式：`tab_<组件api_name>`
- 示例：`tab_form_component`、`tab_operation_log`

## 通用规则

1. API Name 一旦创建后**不可更改**
2. `__c` 后缀仅用于自定义配置，标准配置无此后缀
3. ID 部分区分大小写
4. 同一对象内布局 API Name 必须唯一
5. 同一布局内组件 api_name 必须唯一
