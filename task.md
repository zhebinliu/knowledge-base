# 任务:会议纪要模块 5 项 UI/UX 改进 + 导出面板修复

> 前置:PNG 导出迁移到 HTML 已完成(已 commit+push 于 7787c73)。本批为追加修改。

## 追加 1 — 导出面板超出页面(适配不同分辨率)

- [x] UnifiedExportButton 面板宽度改 `min(400px, calc(100vw - 48px))`,高度 `min(560px, calc(100dvh - 24px))`
- [x] 面板改 flex 纵向布局:模式切换/错误条 flexShrink,内容区 flex-1 + minHeight 0 + 内部滚动,小屏/矮屏不再溢出

## 追加 2 — 纪要 docx/html 导出并入统一导出面板

- [x] UnifiedExportButton 新增 `__minutes`(纪要)目标:导出整篇纪要 docx/html(复用 exportMeetingDocxUrl/exportMeetingHtmlUrl,默认选中)
- [x] legacy MinutesTab 移除独立「导出docx/导出html」按钮,清理 TOKEN_STORAGE_KEY/exportMeetingDocxUrl/exportMeetingHtmlUrl 导入

## 历史:5 项 UI/UX 改进(已 commit 7787c73)

- [x] #1 统一导出入口(UnifiedExportButton 取代 ModuleExportButton+TemplateSelector)
- [x] #2 顶栏工具条整合;#3 重新处理确认;#4 转写分段+就地润色;#5 窄屏+完成通知

## 验收

- [x] `npx tsc --noEmit` 通过
- [ ] 目检:导出面板在不同分辨率下不超出页面;纪要 docx/html 可从导出面板获取;纪要 tab 不再有重复导出按钮
