# 任务:会议纪要模块 UI 改进记录

## 最近一批(本次)

### 导出按钮移到「解释图」tab 右侧
- [x] `UnifiedExportButton` 弹出层改为 **Portal 到 body + position:fixed**:不再被 `overflow:hidden` 祖先裁剪,随滚动/缩放跟随,宽高按视口自适应
- [x] redesign 页:导出按钮从顶部工具条移到左栏 tab 栏右侧(「解释图」之后,分隔线+间隔,视觉上是按钮非 tab);工具条恢复为仅音频播放器
- [x] legacy 页:导出按钮从头部移到左栏 tab 栏右侧(同样分隔线+间隔)
- [x] `npx tsc --noEmit` 通过

## 历史批次

- [x] 导出面板适配屏幕分辨率 + 纪要导出并入(commit 87edfc4)
- [x] 5 项 UI/UX 改进 + PNG 迁移(commit 7787c73)
- [x] 导出 PNG/HTML 修复 + UI 一致性(commit 47dbc2c / 20214e4)

## 待办

- [ ] 目检:两页 tab 栏右侧导出按钮位置/间距;导出面板在 tab 栏下方打开不裁剪
