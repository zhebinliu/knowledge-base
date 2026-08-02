# 任务:会议详情页 UI 一致性修复(P0/P1/P2)

> 历史任务「场景命中神经网络(2026-07-20)」已完成,内容见 git 历史。
> 范围:本次只做 UI 一致性修复,不引入新依赖,不改 API 形状。
> 原则:共享组件用 `var(--rd-*, 旧值fallback)` —— 旧 UI(无 `.rd-root`)保持原浅色外观,新 UI(有 `.rd-root`)自动切到橙色玻璃体系。
> 旧 UI 的 blue 主操作色是既有惯例(ChangePassword/FeishuTab/ProjectFormModal 等),不统一动;只在共享组件上做主题感知切换。

## P0 — 消除同页内橙/蓝冲突

- [x] P0-1 `redesign/console/ConsoleMeetingDetail.tsx`:右栏 Tab 激活态蓝色 `#2563eb` → `var(--rd-accent-2)`/`var(--rd-accent)`;右栏内容区残留浅底 `rgba(248,250,252,.35)` → `rgba(255,255,255,.02)`
- [x] P0-2 `pages/console/ConsoleMeetingDetail.tsx`:右栏 Tab 激活态 `border-blue-600 text-blue-600 bg-blue-50/50` → 品牌橙 `border-brand text-brand bg-brand/5`(与左栏一致);收起按钮 hover 蓝 → 品牌橙
- [x] P0-3 `components/TemplateSelector.tsx`:redesign 分支(`!isLegacy`)的 `#2563eb` 蓝 → 橙 accent(选中触发按钮、选项选中底、预置标签、操作栏、Word 导出按钮);isLegacy 分支不动

## P1 — 深色下刺眼的脱管点

- [x] P1-1 `components/ChatSidebar.tsx`:Header 奶油渐变 `#FFFBEB→#FEF3C7` → `var(--rd-surface[,-2], 原值)`;悬浮球琥珀 `#FBBF24→#F59E0B` → `var(--rd-accent[,-deep], 原值)`;用户气泡/发送按钮橙渐变 → token 化(var fallback 同值)
- [x] P1-2 `components/Modal.tsx` ConfirmModal:确认按钮 `bg-blue-600` → 主题感知橙渐变 `var(--rd-accent,#2563eb)`(redesign 橙 / legacy 蓝);danger 保留红
- [x] P1-3 `redesign/redesign.css`:补齐语义 `border-*-100` 深色映射(StatusBadge/ChatSidebar 用的浅色边框在深色下偏亮)

## P2 — 按钮形态统一与失效类

- [x] P2-1 `components/console/ModuleExportButton.tsx`:触发按钮 `rounded`→`rounded-md`、`hover:bg-slate-50`→`hover:bg-canvas`;格式按钮 `text-[10.5px]`→`text-xs`、`rounded`→`rounded-md`
- [x] P2-2 修复失效类 `bg-canvas-elevated`:tailwind.config.js 补 `canvas-elevated: 'var(--bg-elevated)'`;index.css `:root` 补 `--bg-elevated: #FFFFFF`
- [ ] 注:旧详情页 arbitrary 字号(10/10.5/11/12.5/15px)全量收敛属大范围重构,本次不做,避免 3455 行旧文件回归风险(可作后续单独任务)

## 验收

- [x] `npx tsc --noEmit -p tsconfig.json` 通过
- [x] 确认 Tailwind 生成 `bg-canvas-elevated`、Modal 的 arbitrary 渐变类(`npx tailwindcss` 编译检查)
- [x] 新 UI(`?ui=new`):详情页右栏与左栏同为橙色;ChatSidebar 深色玻璃;Modal 确认橙色
- [x] 旧 UI:各共享组件外观不变(ChatSidebar 奶油/琥珀、Modal 蓝、TemplateSelector 蓝)
