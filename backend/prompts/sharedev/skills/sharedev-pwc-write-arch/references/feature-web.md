# PWC Web 端功能清单

本文档汇总 Web 端 PWC 开发可用的所有功能，包括组件、API 和插件钩子，并标注对应文档路径。

---

## 一、UI 组件

文档总览：`/.sharedev/docs/pwc/reference/custom-component/web/README.md`

| 组件名 | 功能说明 | 文档路径 |
|--------|----------|----------|
| FxBadge | 提供徽标和状态标识能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/badge.md |
| FxButton | 提供按钮交互能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/button.md |
| FxCalendar | 提供日历选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/calendar.md |
| FxCard | 提供卡片式展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/card.md |
| FxCarousel | 提供轮播展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/carousel.md |
| FxCascader | 提供级联选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/cascader.md |
| FxCheckbox | 提供复选能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/checkbox.md |
| FxCollapse | 提供折叠面板能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/collapse.md |
| FxColorPicker | 提供颜色选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/colorpicker.md |
| FxDatePicker | 提供日期选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/datepicker.md |
| FxDateTimePicker | 提供日期时间选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/datetimepicker.md |
| FxDialog | 提供对话框能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/dialog.md |
| FxDropdown | 提供下拉菜单能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/dropdown.md |
| FxInput | 提供文本输入能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/input.md |
| FxInputNumber | 提供数字输入能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/inputnumber.md |
| FxLoading | 提供加载反馈能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/loading.md |
| FxNotification | 提供通知提示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/notification.md |
| FxPagination | 提供分页能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/pagination.md |
| FxPopover | 提供气泡弹出能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/popover.md |
| FxProgress | 提供进度展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/progress.md |
| FxRadio | 提供单选能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/radio.md |
| FxSelect | 提供选择器能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/select.md |
| FxSteps | 提供步骤条能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/steps.md |
| FxSwitch | 提供开关能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/switch.md |
| FxTable | 提供表格展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/table.md |
| FxTree | 提供树形展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/tree.md |
| FxUpload | 提供上传能力 | /.sharedev/docs/pwc/reference/custom-component/web/ui/upload.md |

---

## 二、业务组件

文档总览：`/.sharedev/docs/pwc/reference/custom-component/web/README.md`

| 组件名 | 功能说明 | 文档路径 |
|--------|----------|----------|
| FxChartDetail | 提供图表详情展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/chartdetail.md |
| FxLogin | 提供自定义登录能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/customlogin.md |
| FxDataRange | 提供数据范围选择能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/datarange.md |
| FxObjectDetail | 提供对象详情展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/detail.md |
| FxObjectDetailForm | 提供对象详情表单能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/detailform.md |
| FxDuplicateTool | 提供重复数据处理能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/duplicatetool.md |
| FxObjectForm | 提供对象表单能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/form.md |
| FxObjectList | 提供对象列表能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/list.md |
| FxLwtTable | 提供复杂表格展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/lwttable.md |
| FxObjectDetailMultiTable | 提供多表展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/multitable.md |
| FxObjectDetailRelatedlist | 提供关联列表展示能力 | /.sharedev/docs/pwc/reference/custom-component/web/biz/relatedlist.md |

---

## 三、API

### 3.1 应用操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| open | 打开页面或宿主能力入口 | /.sharedev/docs/pwc/reference/api/web/appapi/open.md |
| hideMenu | 隐藏菜单 | /.sharedev/docs/pwc/reference/api/web/appapi/hideMenu.md |
| getCrossAppUrl | 获取跨应用访问地址 | /.sharedev/docs/pwc/reference/api/web/appapi/getCrossAppUrl.md |
| crossNoticeChange | 监听跨应用通知变化 | /.sharedev/docs/pwc/reference/api/web/appapi/crossNoticeChange.md |
| crossTodoChange | 监听跨应用待办变化 | /.sharedev/docs/pwc/reference/api/web/appapi/crossTodoChange.md |

### 3.2 基础能力 / 辅助方法 / 库能力

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| fly_api | 调用基础请求能力 | /.sharedev/docs/pwc/reference/api/web/base/fly_api.md |
| handleCopy | 处理复制操作 | /.sharedev/docs/pwc/reference/api/web/helper/handleCopy.md |
| require | 按需引入依赖 | /.sharedev/docs/pwc/reference/api/web/libs/require.md |

### 3.3 对象数据操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| fetch_data | 获取业务对象数据 | /.sharedev/docs/pwc/reference/api/web/objectapi/fetch_data.md |
| fetch_describe | 获取业务对象描述信息 | /.sharedev/docs/pwc/reference/api/web/objectapi/fetch_describe.md |
| fetch_email_templates | 获取邮件模板 | /.sharedev/docs/pwc/reference/api/web/objectapi/fetch_email_templates.md |
| fill_email_template | 填充邮件模板 | /.sharedev/docs/pwc/reference/api/web/objectapi/fill_email_template.md |
| format_field_value | 格式化字段值 | /.sharedev/docs/pwc/reference/api/web/objectapi/format_field_value.md |

### 3.4 对象界面操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| addObject | 打开新增对象界面 | /.sharedev/docs/pwc/reference/api/web/objectuiaction/addObject.md |
| editObject | 打开编辑对象界面 | /.sharedev/docs/pwc/reference/api/web/objectuiaction/editObject.md |
| selectObject | 选择单个业务对象 | /.sharedev/docs/pwc/reference/api/web/objectuiaction/selectObject.md |
| viewObject | 查看对象详情 | /.sharedev/docs/pwc/reference/api/web/objectuiaction/viewObject.md |
| openDuplicateTool | 打开重复数据处理工具 | /.sharedev/docs/pwc/reference/api/web/objectuiaction/openDuplicateTool.md |

### 3.5 组织架构

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getCurrentEmployee | 获取当前员工信息 | /.sharedev/docs/pwc/reference/api/web/organization/getCurrentEmployee.md |
| getDepartmentById | 根据 ID 获取部门 | /.sharedev/docs/pwc/reference/api/web/organization/getDepartmentById.md |
| getDepartmentsByIds | 根据 ID 批量获取部门 | /.sharedev/docs/pwc/reference/api/web/organization/getDepartmentsByIds.md |
| getEmployeeById | 根据 ID 获取员工 | /.sharedev/docs/pwc/reference/api/web/organization/getEmployeeById.md |
| getEmployeesByIds | 根据 ID 批量获取员工 | /.sharedev/docs/pwc/reference/api/web/organization/getEmployeesByIds.md |

### 3.6 存储

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| get | 读取持久化存储 | /.sharedev/docs/pwc/reference/api/web/storage/get.md |
| set | 写入持久化存储 | /.sharedev/docs/pwc/reference/api/web/storage/set.md |
| getTemp | 读取临时存储 | /.sharedev/docs/pwc/reference/api/web/storage/getTemp.md |
| setTemp | 写入临时存储 | /.sharedev/docs/pwc/reference/api/web/storage/setTemp.md |

### 3.7 租户自定义

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| call_controller | 调用租户自定义服务端逻辑 | /.sharedev/docs/pwc/reference/api/web/userdefine/call_controller.md |
| callPollingController | 调用轮询型租户自定义逻辑 | /.sharedev/docs/pwc/reference/api/web/userdefine/callPollingController.md |
| getAsyncComponent | 获取异步组件 | /.sharedev/docs/pwc/reference/api/web/userdefine/getAsyncComponent.md |

### 3.8 媒体

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| compressionImage | 压缩图片 | /.sharedev/docs/pwc/reference/api/web/media/compressionImage.md |
| downloadFile | 下载文件 | /.sharedev/docs/pwc/reference/api/web/media/downloadFile.md |
| downloadImage | 下载图片 | /.sharedev/docs/pwc/reference/api/web/media/downloadImage.md |
| getFilePreviewUrl | 获取文件预览地址 | /.sharedev/docs/pwc/reference/api/web/media/getFilePreviewUrl.md |
| getImagePreviewUrl | 获取图片预览地址 | /.sharedev/docs/pwc/reference/api/web/media/getImagePreviewUrl.md |
| previewFile | 预览文件 | /.sharedev/docs/pwc/reference/api/web/media/previewFile.md |
| previewImage | 预览图片 | /.sharedev/docs/pwc/reference/api/web/media/previewImage.md |
| uploadBigFile | 上传大文件 | /.sharedev/docs/pwc/reference/api/web/media/uploadBigFile.md |
| uploadFile | 上传文件 | /.sharedev/docs/pwc/reference/api/web/media/uploadFile.md |

---

## 四、插件钩子

### 4.1 对象表单插件（objectform）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/objectform/`

#### 表单生命周期事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| form.render.before | 表单渲染之前，已取到布局描述数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_render_before.md |
| form.render.after | 表单渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_render_after.md |
| form.render.end | 表单加载彻底结束，用户可交互 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_render_end.md |
| form.dataChange.end | 主从数据变更后触发（异步） | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_dataChange_end.md |
| form.dataChange.end.sync | 主从数据变更后同步触发 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_dataChange_end_sync.md |
| form.submit.before | 点击提交、触发提交逻辑前执行 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_submit_before.md |
| form.submit.after | 提交数据成功之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_submit_after.md |
| form.submit.end | 提交流程结束后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/form_submit_end.md |

#### 字段操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| field.render.before | 渲染字段之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/field_render_before.md |
| field.edit.before | 编辑字段之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/field_edit_before.md |
| field.edit.after | 编辑字段之后、执行 UI 事件/计算逻辑之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/field_edit_after.md |
| field.edit.end | 编辑字段并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/field_edit_end.md |

#### 从对象（明细）操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| md.render.before | 从对象表格渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_render_before.md |
| md.render.after | 从对象表格渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_render_after.md |
| md.add.before | 新建从对象数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_add_before.md |
| md.add.after | 新建从对象数据之后、执行 UI 事件/计算逻辑之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_add_after.md |
| md.add.end | 新建从对象数据并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_add_end.md |
| md.del.before | 删除（含批量）从对象数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_del_before.md |
| md.del.after | 删除（含批量）从对象数据之后、执行 UI 事件/计算逻辑之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_del_after.md |
| md.del.end | 删除（含批量）从对象数据并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_del_end.md |
| md.edit.before | 编辑从对象数据（输入框聚焦）之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_edit_before.md |
| md.edit.after | 编辑从对象数据（输入框失焦）之后、执行 UI 事件/计算逻辑之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_edit_after.md |
| md.edit.end | 编辑从对象数据（输入框失焦）并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_edit_end.md |
| md.copy.before | 复制（含批量）从对象数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_copy_before.md |
| md.copy.after | 复制从对象数据之后、执行 UI 事件/计算逻辑之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_copy_after.md |
| md.copy.end | 复制从对象数据并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_copy_end.md |
| md.batchAdd.before | 批量新建从对象数据时选关联对象数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_batchAdd_before.md |
| md.batchAdd.end | 批量新建从对象数据并执行 UI 事件/计算逻辑之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_batchAdd_end.md |
| md.excelimport.before | Excel 导入本地数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_excelimport_before.md |
| md.tile.before | 从对象平铺页面展开之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/md_tile_before.md |

#### 相关对象操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| related.render.before | 相关对象渲染前，可拦截处理业务类型、数据等 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/related_render_before.md |
| related.edit.before | 相关对象字段编辑前（与 field.edit.before 功能一致） | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/related_edit_before.md |
| related.batchAdd.before | 相关对象批量添加前，可自定义查找弹窗过滤条件 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/events/related_batchAdd_before.md |

#### context.dataGetter API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getData | 获取主对象或指定从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getData.md |
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getDescribe.md |
| getDescribeLayout | 获取对象布局描述 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getDescribeLayout.md |
| getDetail | 获取指定从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getDetail.md |
| getDetails | 获取所有从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getDetails.md |
| getFieldAttr | 获取字段属性 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getFieldAttr.md |
| getLayoutFields | 获取布局字段列表 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getLayoutFields.md |
| getMDOriginData | 获取从对象原始数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getMDOriginData.md |
| getMasterData | 获取主对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getMasterData.md |
| getOptions | 获取选项数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getOptions.md |
| getRelateDatas | 获取相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getRelateDatas.md |
| getCheckedDatas | 获取已选中的数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getCheckedDatas.md |
| getDataIsNew | 判断当前数据是否为新建 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataGetter/getDataIsNew.md |

#### context.dataUpdater API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| add | 新增从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/add.md |
| insert | 插入从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/insert.md |
| del | 删除从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/del.md |
| delDetail | 删除指定从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/delDetail.md |
| delDetailRecordType | 删除指定记录类型的从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/delDetailRecordType.md |
| addRelateDatas | 新增相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/addRelateDatas.md |
| delRelateDatas | 删除相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/delRelateDatas.md |
| setHidden | 设置字段隐藏/显示 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/setHidden.md |
| setReadOnly | 设置字段只读 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/setReadOnly.md |
| setRequired | 设置字段必填 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/dataUpdater/setRequired.md |

#### context.bizApi API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| assertInLayouts | 判断字段是否在布局中 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/assertInLayouts.md |
| hasChange | 判断表单是否有变更 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/hasChange.md |
| hideColumns | 隐藏从对象列 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/hideColumns.md |
| showColumns | 显示从对象列 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/showColumns.md |
| hideDetailsComp | 隐藏从对象组件 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/hideDetailsComp.md |
| showDetailsComp | 显示从对象组件 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/showDetailsComp.md |
| setTrsCss | 设置从对象行样式 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/setTrsCss.md |
| toggleDetailButton | 切换从对象按钮状态 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/toggleDetailButton.md |
| toggleMDStatus | 切换从对象状态 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/toggleMDStatus.md |
| toggleMasterButton | 切换主对象按钮状态 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/toggleMasterButton.md |
| triggerCal | 触发计算逻辑 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/triggerCal.md |
| triggerCalAndUIEvent | 触发计算逻辑和 UI 事件 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/triggerCalAndUIEvent.md |
| triggerMasterButton | 触发主对象按钮 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/triggerMasterButton.md |
| triggerUIEvent | 触发 UI 事件 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectform/context/bizApi/triggerUIEvent.md |

### 4.2 对象详情插件（objectdetail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| detail.render.before | 详情页渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_render_before.md |
| detail.render.after | 详情页渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_render_after.md |
| detail.parse.before | 详情页处理数据之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_parse_before.md |
| detail.form.render.before | 详情页详细信息组件渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_form_render_before.md |
| detail.head_info.render.before | 详情页标题栏组件渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_head_info_render_before.md |
| detail.multitable.render.before | 渲染详情页从对象表格之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_multitable_render_before.md |
| detail.multitable.render.after | 渲染详情页从对象表格之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_multitable_render_after.md |
| detail.relatedlist.render.before | 渲染详情页相关对象表格之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_relatedlist_render_before.md |
| detail.relatedlist.render.after | 渲染详情页相关对象表格之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/events/detail_relatedlist_render_after.md |

#### context.dataGetter API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getData | 获取详情页对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/dataGetter/getData.md |
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/web/objectdetail/dataGetter/getDescribe.md |

---

### 4.3 对象列表插件（list）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/list/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| list.render.before | 渲染对象表格之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/list/events/list_render_before.md |
| list.render.after | 渲染对象表格之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/list/events/list_render_after.md |
| list.previewImage.before | 列表图片字段预览前（不支持列表通用参数） | /.sharedev/docs/pwc/reference/custom-plugin/web/list/events/list_previewImage_before.md |

#### context.dataGetter API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/web/list/dataGetter/getDescribe.md |

---

### 4.4 业务流详情插件（bpmdetail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| bpm.process.render.before | 业务流任务渲染之前，可配置强制弹出编辑内容弹窗等 | /.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/events/bpm_process_render_before.md |
| bpm.taskPage.render.before | 业务流任务落地页渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/events/bpm_taskPage_render_before.md |
| bpm.detailCard.render.before | 业务流数据详情页渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/events/bpm_detailCard_render_before.md |
| bpm.remindCard.render.before | 业务流待办卡片渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/events/bpm_remindCard_render_before.md |
| bpm.approve.render.after | 业务流审批节点填写表单/布局渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/bpmdetail/events/bpm_approve_render_after.md |

---

### 4.5 阶段视图插件（stageview）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/stageview/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| stage.stageView.render.before | 阶段视图渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/stageview/events/stage_stageView_render_before.md |
| stage.stageCard.render.before | 阶段卡片渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/stageview/events/stage_stageCard_render_before.md |

---

### 4.6 审批详情插件（workflowdetail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| approval.agree.render.before | 审批同意渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_agree_render_before.md |
| approval.agree.render.after | 审批同意渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_agree_render_after.md |
| approval.reject.render.before | 审批驳回渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_reject_render_before.md |
| approval.reject.render.after | 审批驳回渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_reject_render_after.md |
| approval.content.render.after | 审批内容渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_content_render_after.md |
| approval.opinions.render.before | 审批意见渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_opinions_render_before.md |
| approval.changeApprover.render.before | 审批更换处理人渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_changeApprover_render_before.md |
| approval.preAddSign.render.after | 审批前加签弹窗渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval_preAddSign_render_after.md |
| approval.reply.list.render.before | 审批回复列表渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowdetail/events/approval.reply.list.render.before.md |

---

### 4.7 审批待办插件（workflowtodo）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/web/workflowtodo/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| flowTodo.approval.card.render.after | 审批待办卡片渲染之后，可自定义批量更换处理人/批量审批按钮 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowtodo/events/flowTodo_approval_card_render_after.md |
| flowTodo.approval.list.render.after | 审批待办列表渲染之后，可自定义批量更换处理人/批量审批按钮 | /.sharedev/docs/pwc/reference/custom-plugin/web/workflowtodo/events/flowTodo_approval_list_render_after.md |

---

## 五、其他参考

| 文档 | 说明 | 文档路径 |
|------|------|----------|
| CSS 变量 | 全局 CSS 变量参考 | /.sharedev/docs/pwc/reference/css-vars.md |
| Web 端 API 总览 | 所有 Web 端 API 汇总 | /.sharedev/docs/pwc/reference/api/web/README.md |
| Web 端组件总览 | 所有 Web 端组件汇总 | /.sharedev/docs/pwc/reference/custom-component/web/README.md |
| Web 端插件参考 | 所有 Web 端插件汇总 | /.sharedev/docs/pwc/reference/custom-plugin/web/README.md |

---

## 四、插件钩子

### 4.1 表单插件 v2（formv2）— 推荐使用

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/`

#### 表单生命周期事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| form.render.before | 表单渲染之前，已取到布局描述数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_render_before.md |
| form.render.after | 整个主从表单页 UI 渲染结束时 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_render_after.md |
| form.render.end | 表单加载彻底结束，用户可交互 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_render_end.md |
| form.render.before.custom.field | 自定义主对象字段组件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_render_before_custom_field.md |
| form.render.before.fixed.com | 自定义弹窗组件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_render_before_fixed_com.md |
| form.fetchDescribeLayout.before | describeLayout 等接口请求之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_fetchDescribeLayout_before.md |
| form.fetchDescribeLayout.after | describeLayout 等接口请求成功之后 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_fetchDescribeLayout_after.md |
| form.dataChange.end | 主从数据变更后触发（异步） | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_dataChange_end.md |
| form.dataChange.end.sync | 主从数据变更后同步触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_dataChange_end_sync.md |
| form.saveState.before.sync | 系统内存不足时触发表单保存状态 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_saveState_before_sync.md |
| form.submit.before | 点击提交、触发提交逻辑前执行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_submit_before.md |
| form.submit.after | 提交成功后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_submit_after.md |
| form.submit.post.before | 提交请求触发前执行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_submit_post_before.md |
| form.submit.post.after | 提交请求触发后执行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_submit_post_after.md |
| form.submit.afterAction.before | 提交成功后、触发通用后动作之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/form_submit_afterAction_before.md |

#### 字段操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| field.render.before.sync | 字段渲染前同步触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/field_render_before_sync/introduction.md |
| field.edit.before | 编辑字段前置动作触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/field_edit_before/introduction.md |
| field.edit.after | 字段编辑动作之后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/field_edit_after/introduction.md |
| field.edit.end | 字段编辑动作结束后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/field_edit_end.md |

#### 从对象（明细）操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| md.render.before | 从对象渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_render_before.md |
| md.item.render.before.sync | 从对象数据条目组件渲染之前同步触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_item_render_before_sync.md |
| md.add.after | 添加一行后的后置动作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_add_after.md |
| md.add.end | 添加一行结束后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_add_end.md |
| md.del.after | 删除后的后置动作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_del_after.md |
| md.del.end | 删除动作结束后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_del_end.md |
| md.clone.after | 复制后的后置动作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_clone_after.md |
| md.clone.end | 复制动作结束后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_clone_end.md |
| md.batchAdd.before | 从查找关联批量添加前触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_batchAdd_before.md |
| md.batchAdd.after | 批量添加后的后置动作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_batchAdd_after.md |
| md.batchAdd.end | 批量添加结束后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/md_batchAdd_end.md |

#### 相关对象操作事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| related.render.before | 相关对象渲染前，可拦截处理业务类型、数据等 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/related_render_before.md |
| related.edit.before | 相关对象字段编辑前（与 field.edit.before 功能一致） | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/related_edit_before.md |
| related.batchAdd.before | 相关对象批量添加前，可自定义查找弹窗过滤条件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/related_batchAdd_before.md |
| pluginService.use.after | 插件自检事件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/events/pluginService_use_after.md |

#### context.dataGetter API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getData | 获取主对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getData.md |
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getDescribe.md |
| getDescribeLayout | 获取对象布局描述 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getDescribeLayout.md |
| getDetail | 获取指定从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getDetail.md |
| getDetails | 获取所有从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getDetails.md |
| getDetailDefaultData | 获取从对象默认数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getDetailDefaultData.md |
| getLayoutFields | 获取布局字段列表 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getLayoutFields.md |
| getMasterData | 获取主对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getMasterData.md |
| getMasterRecordType | 获取主对象记录类型 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getMasterRecordType.md |
| getPageId | 获取页面 ID | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getPageId.md |
| getPageOptions | 获取页面选项 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getPageOptions.md |
| getRelatedDatas | 获取相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getRelatedDatas.md |
| getRelatedDefaultData | 获取相关对象默认数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getRelatedDefaultData.md |
| getRelatedDescribeLayout | 获取相关对象布局描述 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getRelatedDescribeLayout.md |
| getRelatedLayoutFields | 获取相关对象布局字段 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getRelatedLayoutFields.md |
| getSourceAction | 获取来源动作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getSourceAction.md |
| getEntrySource | 获取入口来源 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataGetter/getEntrySource.md |
