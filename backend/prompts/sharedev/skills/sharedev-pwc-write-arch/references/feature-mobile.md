# PWC 移动端功能清单

本文档汇总移动端 PWC 开发可用的所有功能，包括组件、API 和插件钩子，并标注对应文档路径。

---

## 一、UI 组件

文档总览：`/.sharedev/docs/pwc/reference/custom-component/mobile/README.md`

| 组件名 | 功能说明 | 文档路径 |
|--------|----------|----------|
| fs-actionsheet | 提供操作列表弹出能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-actionsheet.md |
| fs-button | 提供按钮交互能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-button.md |
| fs-confirm | 提供确认弹窗能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-confirm.md |
| fs-divider | 提供分割线与区块分隔能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-divider.md |
| fs-frame | 提供容器或承载区域能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-frame.md |
| fs-image | 提供图片展示能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-image.md |
| fs-popup | 提供弹层展示能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-popup.md |
| fs-rich-text | 提供富文本展示能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/ui/fs-rich-text.md |

---

## 二、业务组件

文档总览：`/.sharedev/docs/pwc/reference/custom-component/mobile/README.md`

| 组件名 | 功能说明 | 文档路径 |
|--------|----------|----------|
| ObjForm | 提供对象表单相关业务展示与交互能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/biz/objform.md |
| ObjFormFieldSelectCell | 提供对象表单字段选择单元能力 | /.sharedev/docs/pwc/reference/custom-component/mobile/biz/objform-field-selectcell.md |

---

## 三、API

### 3.1 业务对象数据操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| fetch_data | 获取业务对象数据 | /.sharedev/docs/pwc/reference/api/mobile/objectapi/fetch_data.md |
| fetch_describe | 获取业务对象描述信息 | /.sharedev/docs/pwc/reference/api/mobile/objectapi/fetch_describe.md |
| format_field_value | 格式化字段值 | /.sharedev/docs/pwc/reference/api/mobile/objectapi/format_field_value.md |

### 3.2 业务对象界面操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| addObject | 打开新增对象界面 | /.sharedev/docs/pwc/reference/api/mobile/objectuiaction/addObject.md |
| editObject | 打开编辑对象界面 | /.sharedev/docs/pwc/reference/api/mobile/objectuiaction/editObject.md |
| selectObject | 选择单个业务对象 | /.sharedev/docs/pwc/reference/api/mobile/objectuiaction/selectObject.md |
| selectMultiCrmObject | 选择多个业务对象 | /.sharedev/docs/pwc/reference/api/mobile/objectuiaction/selectMultiCrmObject.md |
| viewObject | 查看对象详情 | /.sharedev/docs/pwc/reference/api/mobile/objectuiaction/viewObject.md |

### 3.3 租户自定义

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| call_controller | 调用租户自定义服务端逻辑 | /.sharedev/docs/pwc/reference/api/mobile/userdefine/call_controller.md |
| openCustomComponent | 打开自定义组件 | /.sharedev/docs/pwc/reference/api/mobile/userdefine/openCustomComponent.md |

### 3.4 应用操作

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| openWebview | 打开 WebView 页面 | /.sharedev/docs/pwc/reference/api/mobile/appapi/openWebview.md |
| storageGet | 读取本地存储 | /.sharedev/docs/pwc/reference/api/mobile/appapi/storageGet.md |
| storageSet | 写入本地存储 | /.sharedev/docs/pwc/reference/api/mobile/appapi/storageSet.md |

### 3.5 组织架构

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getUserInfo | 获取当前用户信息 | /.sharedev/docs/pwc/reference/api/mobile/organization/getUserInfo.md |

### 3.6 媒体

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getFileUrlFromNpath | 根据文件路径获取文件访问地址 | /.sharedev/docs/pwc/reference/api/mobile/media/getFileUrlFromNpath.md |
| getImageUrlFromNpath | 根据图片路径获取图片访问地址 | /.sharedev/docs/pwc/reference/api/mobile/media/getImageUrlFromNpath.md |
| previewFile | 预览文件 | /.sharedev/docs/pwc/reference/api/mobile/media/previewFile.md |
| previewImage | 预览图片 | /.sharedev/docs/pwc/reference/api/mobile/media/previewImage.md |

### 3.7 第三方 APP 集成

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| approvalOperationCompleted | 审批操作完成回调 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/approvalOperationCompleted.md |
| chooseImage | 选择图片 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/chooseImage.md |
| closeWebView | 关闭 WebView | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/closeWebView.md |
| getLocation | 获取地理位置 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/getLocation.md |
| getTitle | 获取页面标题 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/getTitle.md |
| imageCapture | 拍照 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/imageCapture.md |
| isShowTitleBar | 是否显示标题栏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/isShowTitleBar.md |
| makePhoneCall | 拨打电话 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/makePhoneCall.md |
| previewImage | 预览图片 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/previewImage.md |
| scanCode | 扫码 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/scanCode.md |
| setWebViewTitle | 设置 WebView 标题 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/intergrate-app/setWebViewTitle.md |

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

#### context.dataUpdater API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| add | 新增从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/add.md |
| insert | 插入从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/insert.md |
| del | 删除从对象数据行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/del.md |
| delDetail | 删除指定从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/delDetail.md |
| delDetailRecordType | 删除指定记录类型的从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/delDetailRecordType.md |
| addRelatedDatas | 新增相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/addRelatedDatas.md |
| delRelatedDatas | 删除相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/delRelatedDatas.md |
| update | 更新主对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/update.md |
| updateDetail | 更新从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/updateDetail.md |
| updateDetailByApiName | 按 ApiName 更新从对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/updateDetailByApiName.md |
| updateMaster | 更新主对象指定字段 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/updateMaster.md |
| updateRelatedData | 更新相关对象数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/updateRelatedData.md |
| setHidden | 设置字段隐藏/显示 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setHidden.md |
| setReadOnly | 设置字段只读 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setReadOnly.md |
| setRequired | 设置字段必填 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setRequired.md |
| setFieldError | 设置字段错误提示 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setFieldError.md |
| setOptionHidden | 设置选项隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setOptionHidden.md |
| setBtnHidden | 设置按钮隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setBtnHidden.md |
| setMdHidden | 设置从对象隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setMdHidden.md |
| setMdBatchBtnHidden | 设置从对象批量按钮隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setMdBatchBtnHidden.md |
| setMdNormalBtnHidden | 设置从对象普通按钮隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setMdNormalBtnHidden.md |
| setMdSingleBtnHidden | 设置从对象单行按钮隐藏 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/dataUpdater/setMdSingleBtnHidden.md |

#### context.bizApi API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| triggerSubmit | 触发表单提交 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/triggerSubmit.md |
| triggerSaveDraft | 触发保存草稿 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/triggerSaveDraft.md |
| triggerAddDetail | 触发新增从对象行 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/triggerAddDetail.md |
| triggerCalAndUIEvent | 触发计算逻辑和 UI 事件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/triggerCalAndUIEvent.md |
| validateDataThenGet | 校验数据并获取 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/validateDataThenGet.md |
| createNewDataIndex | 创建新数据索引 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/createNewDataIndex.md |
| focusShowMasterFieldError | 聚焦显示主对象字段错误 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/focusShowMasterFieldError.md |
| npcRun | 执行 NPC 逻辑 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/npcRun.md |
| Event | 事件总线 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/formv2/bizApi/Event.md |

---

### 4.2 列表插件 v2（listv2）— 推荐使用

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/`

#### 事件

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| list.render.before | 列表页渲染之前，已取到布局描述数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_render_before.md |
| list.render.after | 列表页渲染完成后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_render_after.md |
| list.confirm.before | 选择列表页确认选择前触发，可修改或拦截确认结果数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_confirm_before.md |
| list.toggleData.after | 列表项选中状态切换后触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_toggleData_after.md |
| list.stageView.render.before | 阶段视图渲染前触发 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_stageView_render_before.md |
| list.stageView.fetchStage.after | 阶段视图数据获取完成后触发，可处理或修改阶段数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/events/list_stageView_fetchStage_after.md |

#### context.dataGetter API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getDatas | 获取列表数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/dataGetter/getDatas.md |
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/dataGetter/getDescribe.md |
| getPageType | 获取页面类型 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/dataGetter/getPageType.md |

#### context.bizApi API

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| pickData | 选取数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/listv2/bizApi/pickData.md |

---

### 4.3 详情页插件（detail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| detail.render.before | 详情页页面渲染之前，可预处理数据、定制按钮等 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/render-before.md |
| detail.render.after | 详情页页面渲染之后 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/render-after.md |
| detail.form.render.before | 详情页详细信息组件渲染之前，可自定义字段组件 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/form-render-before.md |
| detail.head_info.render.before | 详情页标题组件渲染之前，可追加图标按钮 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/head_info-render-before.md |
| detail.detailList.fetchList.after | 详情页从对象列表获取数据之后 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/detailList-fetchList-after.md |
| logs.parse.before | 详情页修改记录数据解析前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/hooks/logs-parse-before.md |

#### context API（detail）

| API | 功能说明 | 文档路径 |
|-----|----------|----------|
| getData | 获取详情数据 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/initParams/context/getData.md |
| getDescribe | 获取对象描述信息 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/initParams/context/getDescribe.md |
| getDetailRst | 获取详情结果 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/initParams/context/getDetailRst.md |
| getLayout | 获取布局信息 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/initParams/context/getLayout.md |
| event | 事件总线 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/detail/initParams/context/event.md |

---

### 4.4 业务流详情插件（bpmdetail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/bpmdetail/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| flow.bpm.detail.parse.bottom.btn.render.before | 业务流任务详情底部按钮渲染之前，可自定义按钮操作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/bpmdetail/hooks/flowBpmDetailParseBottomBtnRenderBefore.md |
| flow.bpm.detailcard.item.bottombtn.render.before | 对象详情页业务流任务卡片底部按钮渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/bpmdetail/hooks/flowBpmDetailcardItemBottombtnRenderBefore.md |
| flow.bpm.edit.form.render.before | 业务流任务渲染之前，可配置强制弹出编辑内容弹窗 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/bpmdetail/hooks/flowBpmEditFormRenderBefore.md |
| flow.remind.list.card.btn.render.before | 业务流待办卡片底部按钮渲染之前，可自定义按钮操作 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/bpmdetail/hooks/flowRemindListCardBtnRenderBefore.md |

---

### 4.5 阶段推进器插件（stage）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/stage/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| flow.edit.form.parse.taskdetail.before | 阶段任务详情解析渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/stage/hooks/flowEditFormParseTaskDetailBefore.md |
| flow.stage.moveto.next.click.before | 推进至下一阶段点击之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/stage/hooks/flowStageMoveToNextClickBefore.md |
| flow.stage.objectdetail.card.data.parse.before | 阶段对象详情卡片数据解析之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/stage/hooks/flowStageObjectDetailCardDataParseBefore.md |
| flow.stage.taskchange.handler.select.range.before | 阶段任务变更处理选择范围之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/stage/hooks/flowStageTaskChangeHandlerSelelectRangeBefore.md |

---

### 4.6 阶段视图插件（stageview）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/stageview/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| customTotalInfo | 自定义阶段视图汇总信息 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/stageview/hooks/customTotalInfo.md |

---

### 4.7 审批详情插件（workflowdetail）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| flow.approval.detail.approval.content.render.before | 审批详情内容渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalDetailApprovalContentRenderBefore.md |
| flow.approval.detail.approval.opinions.render.before | 审批详情意见渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalDetailApprovalOpinionsRenderBefore.md |
| flow.approval.edit.form.render.before | 审批编辑表单渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalEditFormRenderBefore.md |
| flow.approval.opinion.can.direct.complete.render.before | 审批意见可直接完成渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalOpinionCanDirectCompleteRenderBefore.md |
| flow.approval.opinion.page.render.before | 审批意见页面渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalOpinionPageRenderBefore.md |
| flow.approval.reject.mode.list.render.before | 审批驳回模式列表渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalRejectModeListRenderBefore.md |
| flow.approval.reject.processing.move.to.current.title.render.before | 审批驳回处理移至当前标题渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalRejectProcessingMoveToCurrentTitleRenderBefore.md |
| flow.approval.reject.task.list.render.before | 审批驳回时可驳回至的任务列表渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowApprovalRejectTaskListRenderBefore.md |
| flow.edit.form.parser.render.before | 审批编辑内容表单渲染之前，可定制后加签功能 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowdetail/hooks/flowEditFormParserRenderBefor.md |

---

### 4.8 审批待办插件（workflowtodo）

文档总览：`/.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowtodo/`

#### 钩子

| 钩子名 | 触发时机 | 文档路径 |
|--------|----------|----------|
| flow.remind.list.batch.btn.render.before | 审批待办批量按钮渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowtodo/hooks/flowRemindListBatchBtnRenderBefore.md |
| flow.remind.list.batch.option.render.before | 审批待办批量操作选项渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowtodo/hooks/flowRemindListBatchOptionRenderBefore.md |
| flow.remind.list.batch.option.click.before | 审批待办批量操作选项点击之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowtodo/hooks/flowRemindListBatchOptionClickBefore.md |
| flow.remind.list.right.top.btn.render.before | 审批待办列表右上角按钮渲染之前 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/workflowtodo/hooks/flowRemindListRightTopBtnRenderBefore.md |

---

## 五、其他参考

| 文档 | 说明 | 文档路径 |
|------|------|----------|
| 移动端 API 总览 | 所有移动端 API 汇总 | /.sharedev/docs/pwc/reference/api/mobile/README.md |
| 移动端组件总览 | 所有移动端组件汇总 | /.sharedev/docs/pwc/reference/custom-component/mobile/README.md |
| 移动端插件目录 | 所有移动端插件汇总 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/catalog.md |
| 移动端插件场景索引 | 按业务场景分类的插件索引 | /.sharedev/docs/pwc/reference/custom-plugin/mobile/scene-index.md |
