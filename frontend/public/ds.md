# KB System Design System

> 这是 KB 系统（纷享销客知识库）的设计系统文档，供 AI 助手（Claude Code / ChatGPT）在生成前端代码时作为规范参考。
> 网页版：https://kb.liii.in/ds
> 最后更新：2026-04

## 技术栈

- **框架**：React 18.3 + TypeScript + Vite
- **路由**：react-router-dom v6
- **数据**：@tanstack/react-query v5
- **样式**：TailwindCSS v3.4，禁用 inline 样式和 !important
- **图标**：`lucide-react`（统一只用这一个图标库）
- **无 UI 库**：不用 antd / MUI / Radix / headless-ui，所有交互组件自己搭

## 设计 Token

### 颜色

| Token | Hex | 语义 |
|---|---|---|
| `--accent` / `bg-brand` | `#FF7A00` | 品牌橙主色 |
| `--accent-deep` | `#D96400` | 深橙（重要强调） |
| `--text-primary` / `text-ink` | `#1A1A1A` | 正文 |
| `--text-secondary` / `text-ink-secondary` | `#4A4A4A` | 次要文字 |
| `--text-muted` / `text-ink-muted` | `#8A8A8A` | 辅助/说明 |
| `--surface` / `bg-surface` | `#FFFFFF` | 卡片背景 |
| `--canvas` / `bg-canvas` | `#F7F7F8` | 页面底色 |
| `--line` / `border-line` | `#E5E7EB` | 分割线 |

状态色：`green`（完成）、`orange`（进行中/重试）、`red`（失败）、`blue`（信息）、`purple`（切片）。

### 字号

`text-xs` 11/12px (辅助) · `text-sm` 14px (正文默认) · `text-base` 16px · `text-lg` 18px · `text-xl` 20px · `text-2xl` 24px (页面标题)。

### 圆角 & 阴影

- 圆角：`rounded` 4 · `rounded-lg` 8 · `rounded-xl` 12
- 阴影：`shadow-sm`（卡片 hover）· `shadow-xl`（Modal）

## 按钮 · Button

```tsx
<button className="ds-btn">默认</button>
<button className="ds-btn ds-btn-primary">主要</button>
<button className="ds-btn text-xs py-1 px-2.5">小号</button>
```

- `.ds-btn` 灰边白底，hover bg-gray-50
- `.ds-btn-primary` 橙渐变 `linear-gradient(135deg, #FF8D1A, #FF7A00)` 白字
- 危险操作用 `bg-red-600 hover:bg-red-700 text-white`

## 徽章 · Badge

```tsx
<span className="badge green">完成</span>
<span className="badge orange">重试中</span>
<span className="badge red">失败</span>
```

- 形状：`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs`
- 颜色：`bg-{tone}-50 text-{tone}-700`

## 卡片 · Card

```tsx
<div className="card">  /* .card = bg-white border border-line rounded-xl p-4 */
  <div className="card-head">  /* 可选标题区 */
    <h3>标题</h3>
  </div>
  ...
</div>
```

## 表格 · Table

### 基础 `<table>`

```tsx
<div className="card overflow-hidden">
  <table className="ds-table">
    <thead><tr><th>列</th></tr></thead>
    <tbody><tr><td>...</td></tr></tbody>
  </table>
</div>
```

支持变体：`.ds-table.striped` 斑马纹。

### 高级数据表 · DataTable

路径：`@/components/DataTable`

支持：**多维度筛选、排序、服务端分页、列动态显隐（localStorage 持久化）、批量选择操作、行内在线编辑**。

```tsx
import DataTable, { type ColumnDef } from '@/components/DataTable'

type Row = { id: string; name: string; status: string; confidence: number }

const columns: ColumnDef<Row>[] = [
  { key: 'name', header: '名称', sortable: true,
    // 行内编辑：双击单元格进入；commit(value) 保存，cancel() 取消
    editor: (row, commit, cancel) => (
      <input autoFocus defaultValue={row.name}
        onBlur={async (e) => { await save(row.id, e.target.value); commit(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    ),
  },
  { key: 'status', header: '状态', sortable: true,
    render: (r) => <span className={`badge ${tone(r.status)}`}>{r.status}</span> },
  { key: 'notes', header: '备注', defaultVisible: false },   // 默认隐藏，用户可在"列"菜单里勾选显示
  { key: '_actions', header: '', hideable: false,            // 锁定列（不可隐藏）
    render: (r) => <button onClick={() => edit(r)}>编辑</button> },
]

<DataTable
  rows={paged}
  columns={columns}
  rowKey={(r) => r.id}
  loading={isLoading}
  // 筛选（受控）—— 存在 options 即为下拉，否则为文本输入
  filters={[
    { key: 'status', label: '状态', options: [{ value: 'ok', label: '正常' }] },
    { key: 'search', label: '搜索名称' },
  ]}
  filterValues={filters}
  onFilterChange={setFilters}
  // 排序（受控）—— 点击表头三态切换 asc → desc → null
  sort={sort}
  onSortChange={setSort}
  // 服务端分页 —— 每次变更会调 onPageChange / onPageSizeChange，你自己去 fetch 新页
  pagination={{
    page, pageSize, total,
    pageSizeOptions: [20, 50, 100],
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  }}
  // 批量操作 —— 传入即显示首列复选框和选中后的蓝色工具条
  bulkActions={[
    { label: '标记已审', onRun: (rows) => approveMany(rows) },
    { label: '删除', danger: true, onRun: (rows) => deleteMany(rows) },
  ]}
  onRowClick={(row) => openDetail(row)}
  toolbarRight={<button className="ds-btn text-xs">导出</button>}
/>
```

#### ColumnDef

```ts
interface ColumnDef<T> {
  key: string
  header: ReactNode
  accessor?: (row: T) => unknown        // 默认 row[key]
  render?: (row, ctx) => ReactNode       // 自定义渲染
  sortable?: boolean
  className?: string                     // th/td className
  defaultVisible?: boolean               // 默认是否显示（列菜单可切换）
  hideable?: boolean                     // 是否允许在列菜单中隐藏；默认 true
  editor?: (row, commit, cancel) => ReactNode  // 传了就启用双击行内编辑
}
```

## 模态框 · Modal / Drawer / Confirm

路径：`@/components/Modal`

### Modal · 中心对话框

```tsx
import Modal from '@/components/Modal'

<Modal
  open={open}
  title="编辑项目"
  onClose={() => setOpen(false)}
  width="lg"                    // sm / md / lg / xl / 2xl / 3xl
  closeOnBackdrop={true}
  footer={
    <>
      <button onClick={() => setOpen(false)}>取消</button>
      <button className="ds-btn-primary" onClick={save}>保存</button>
    </>
  }
>
  <form>...</form>
</Modal>
```

**行为**：自动监听 Esc 关闭；锁定 body 滚动；点击遮罩关闭（可禁用）；z-index=50；max-height 90vh 内容超出自动滚动。

### Drawer · 右侧抽屉

```tsx
import { Drawer } from '@/components/Modal'

<Drawer open={open} title="详情" onClose={close} width="2xl">
  <div>...详情内容...</div>
</Drawer>
```

适合展示详情、日志、活动流等长内容。默认宽度 720px。

### ConfirmModal · 快捷确认对话框

```tsx
import { ConfirmModal } from '@/components/Modal'

<ConfirmModal
  open={!!target}
  title="删除项目"
  message={`确认删除 "${target.name}"？此操作不可撤销。`}
  danger                          // 红色按钮
  confirmText="删除"
  cancelText="取消"
  onConfirm={() => doDelete(target)}
  onClose={() => setTarget(null)}
/>
```

## 表单 · Form

```tsx
<label className="block text-xs font-medium text-gray-700 mb-1">字段名 *</label>
<input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500" />
```

`<select>`、`<textarea>` 类同。错误文本 `text-sm text-red-600`。

## 布局 · Layout

- **Shell**：`.shell` 整体容器，包含 `.sidebar` + `.topbar` + 主内容
- **侧栏**：`.sidebar` + `.nav-link`（`.is-active` 激活）
- **页面内容**：`<div className="p-8 max-w-7xl mx-auto">`
- **页面标题区**：`.page-head` 含 `h1` + 副标题

## 加载状态 · Loading

```tsx
import { Loader } from 'lucide-react'

// 内联 spinner
<Loader size={16} className="animate-spin text-brand" />

// 骨架屏
<div className="skeleton h-4 w-32" />
```

## 空状态 · Empty

```tsx
<div className="ds-empty">
  <Ghost size={36} className="mx-auto text-gray-300 mb-3" />
  <p className="text-sm text-gray-500">暂无数据</p>
</div>
```

## 状态枚举

### 文档转换状态 `conversion_status`

| 值 | 显示 | 颜色 |
|---|---|---|
| `pending` | 等待处理 | yellow |
| `converting` | 转换中 | orange (旋转) |
| `slicing` | 切片中 | purple (旋转) |
| `retrying` | 重试中 | amber (旋转) |
| `completed` | 完成 | green |
| `failed` | 失败 | red |

### LTC 阶段 `ltc_stage`

`lead`(线索) · `opportunity`(商机) · `quotation`(报价) · `contract`(合同) · `collection`(回款) · `after_sales`(售后) · `general`(通用)

### 行业 `industry`

`technology`(技术) · `manufacturing`(制造) · `healthcare`(医疗) · `energy`(能源) · `finance`(金融) · `retail`(零售) · `education`(教育) · `other`(其他)

### 文档类型 `doc_type`

`requirement_research`(需求调研) · `meeting_notes`(会议纪要) · `solution_design`(方案设计) · `test_case`(测试用例) · `user_manual`(用户手册)

## AI 助手使用说明

本文档的 Markdown 原文：`https://kb.liii.in/ds.md`

生成代码时请遵守：

1. **不用其他 UI 库** — 只用 Tailwind + lucide-react
2. **颜色用 Token** — 优先用 CSS 变量 `var(--accent)` 或 Tailwind 语义类，避免硬编码十六进制
3. **表格用 DataTable** — 如需筛选/分页/排序/批量/列切换/行编辑，直接用 `@/components/DataTable`，不要自己写 table
4. **Modal 用统一组件** — 不要自己写 `fixed inset-0 bg-black/30`，直接用 `@/components/Modal`
5. **图标只用 lucide-react** — 不要混用 FontAwesome / MUI Icons
6. **异步数据用 react-query** — `useQuery` 读、`useMutation` 写，缓存键走 `queryKey: ['resource', id]`
7. **按钮文案用中文** — 项目默认中文 UI（保存/取消/删除/确认/新建等）
