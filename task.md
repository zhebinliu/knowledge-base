# 任务:会议纪要模块 5 项 UI/UX 改进

> 前置:PNG 导出迁移到 HTML 已完成(未提交)。本文档是新一批 5 项改进。
> 范围:全部为前端改动;不动 API 形状。

## Block A(#1)统一导出入口 — UnifiedExportButton

- [x] A1 新建 `frontend/src/components/console/UnifiedExportButton.tsx`(variant: redesign|legacy):
  - 一个「导出」按钮;面板两段:模块导出(建议/需求/流程/干系人 → 排版 → md/docx/html)+ 模板导出(模板 → 预览 → docx/md)
  - 主题感知:redesign 用 --rd-*,legacy 用浅色
- [x] A2 redesign 详情页:替换 TemplateSelector → UnifiedExportButton(并进工具条)
- [x] A3 legacy 详情页:移除 4 处 ModuleExportButton + 替换 TemplateSelector → UnifiedExportButton(legacy)
- [x] 删除孤儿组件 `ModuleExportButton.tsx`、`TemplateSelector.tsx`

## Block B(#2/#3/#5)redesign 详情页

- [x] B1 顶栏整合:Header 下方单行工具条 = [AudioPlayer flex-1][UnifiedExportButton];处理中改细进度条单行(不再整卡)
- [x] B2 「重新处理」加 window.confirm(提示会覆盖现有结果)
- [x] B3 窄屏默认收起右栏(matchMedia ≥1024px);面板高度 100dvh + minHeight 220 兜底
- [x] B4 处理完成主动通知(status 从 processing/recording → 完成/失败 时 toast);润色成功 toast + invalidate

## Block C(#4)redesign 详情页:转写结构化 + 就地 AI 润色

- [x] C1 SpeakerTranscript:按 `说话人N MM:SS - MM:SS` 分段(说话人 chip + 可点击时间戳跳音频 + 文本)
- [x] C2 TranscriptPanel 原文改用 SpeakerTranscript;AI 润色就地按钮(runMeetingAction 'polish' + toast + invalidate),空态不再引导跳「操作」页

## 验收

- [x] `npx tsc --noEmit` 通过(含删除孤儿组件后)
- [ ] 手工目检:新 UI 导出面板含模块+模板两类;工具条单行;窄屏默认收右栏;处理完成 toast;转写分段可点时间戳跳播放;旧 UI 导出入口统一
