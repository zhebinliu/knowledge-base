import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3, Filter as FilterIcon, Search, X } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

export interface ColumnDef<T> {
  key: string
  header: ReactNode
  /** 取值：默认 row[key]，或自定义 */
  accessor?: (row: T) => unknown
  /** 自定义渲染 */
  render?: (row: T, ctx: { editing: boolean; setEditing: (v: boolean) => void }) => ReactNode
  /** 可排序（需要指定 sortKey 到 server 或用 accessor 做本地排序） */
  sortable?: boolean
  /** 列宽 className */
  className?: string
  /** 默认是否显示（动态字段调节用） */
  defaultVisible?: boolean
  /** 列是否允许隐藏（默认 true；id / 选择框等固定列设 false） */
  hideable?: boolean
  /** 在线编辑器。传了就启用双击编辑 */
  editor?: (row: T, commit: (value: unknown) => Promise<void> | void, cancel: () => void) => ReactNode
}

export interface FilterDef {
  key: string
  label: string
  /** 若传，渲染为下拉；否则为文本搜索 */
  options?: { value: string; label: string }[]
}

export interface BulkAction<T> {
  label: string
  onRun: (rows: T[]) => void | Promise<void>
  danger?: boolean
}

export interface DataTableProps<T> {
  rows: T[]
  columns: ColumnDef<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  empty?: ReactNode

  /** —— 筛选 —— */
  filters?: FilterDef[]
  filterValues?: Record<string, string>
  onFilterChange?: (values: Record<string, string>) => void
  searchPlaceholder?: string

  /** —— 排序 —— */
  sort?: { key: string; dir: SortDir } | null
  onSortChange?: (s: { key: string; dir: SortDir } | null) => void

  /** —— 分页（server-side） —— */
  pagination?: {
    page: number          // 0-based
    pageSize: number
    total?: number        // 可选：后端返回总数
    pageSizeOptions?: number[]
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
  }

  /** —— 批量操作 —— */
  bulkActions?: BulkAction<T>[]

  /** —— 工具栏右侧自定义按钮 —— */
  toolbarRight?: ReactNode

  /** —— 行点击 —— */
  onRowClick?: (row: T) => void
}

function getVal<T>(row: T, col: ColumnDef<T>): unknown {
  return col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key]
}

export default function DataTable<T>(props: DataTableProps<T>) {
  const {
    rows,
    columns,
    rowKey,
    loading,
    empty = '暂无数据',
    filters,
    filterValues,
    onFilterChange,
    searchPlaceholder = '搜索...',
    sort,
    onSortChange,
    pagination,
    bulkActions,
    toolbarRight,
    onRowClick,
  } = props

  // 动态列显示
  const storageKey = useMemo(() => 'dt_cols_' + columns.map((c) => c.key).join('_').slice(0, 64), [columns])
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    const init: Record<string, boolean> = {}
    columns.forEach((c) => {
      init[c.key] = c.defaultVisible === false ? false : true
    })
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, boolean>
        Object.keys(parsed).forEach((k) => {
          if (k in init) init[k] = parsed[k]
        })
      } catch { /* empty */ }
    }
    return init
  })
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(visible))
  }, [storageKey, visible])

  const visibleColumns = columns.filter((c) => visible[c.key] !== false)

  // 批量选中
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allRowIds = useMemo(() => rows.map(rowKey), [rows, rowKey])
  const allChecked = allRowIds.length > 0 && allRowIds.every((id) => selected.has(id))
  const someChecked = allRowIds.some((id) => selected.has(id))

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => {
        const next = new Set(prev)
        allRowIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        allRowIds.forEach((id) => next.add(id))
        return next
      })
    }
  }
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelected = () => setSelected(new Set())

  // 排序点击
  const clickSort = (col: ColumnDef<T>) => {
    if (!col.sortable || !onSortChange) return
    if (!sort || sort.key !== col.key) onSortChange({ key: col.key, dir: 'asc' })
    else if (sort.dir === 'asc') onSortChange({ key: col.key, dir: 'desc' })
    else onSortChange(null)
  }

  // 本地 search（当 filterValues 未提供时启用）
  const [localSearch, setLocalSearch] = useState('')
  const filteredRows = useMemo(() => {
    if (!localSearch.trim() || onFilterChange) return rows
    const kw = localSearch.trim().toLowerCase()
    return rows.filter((r) =>
      visibleColumns.some((c) => String(getVal(r, c) ?? '').toLowerCase().includes(kw)),
    )
  }, [rows, localSearch, visibleColumns, onFilterChange])

  // 列显示切换菜单
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selectedRows = rows.filter((r) => selected.has(rowKey(r)))

  return (
    <div className="border border-gray-200 rounded-lg bg-white flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200">
        {/* 筛选 */}
        {filters && filters.length > 0 && filterValues && onFilterChange ? (
          <>
            <FilterIcon size={14} className="text-gray-400" />
            {filters.map((f) => (
              <div key={f.key}>
                {f.options ? (
                  <select
                    value={filterValues[f.key] ?? ''}
                    onChange={(e) => onFilterChange({ ...filterValues, [f.key]: e.target.value })}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="">{f.label}: 全部</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={filterValues[f.key] ?? ''}
                    onChange={(e) => onFilterChange({ ...filterValues, [f.key]: e.target.value })}
                    placeholder={f.label}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white w-32"
                  />
                )}
              </div>
            ))}
            {Object.values(filterValues).some((v) => v) && (
              <button
                onClick={() => onFilterChange(Object.fromEntries(filters.map((f) => [f.key, ''])))}
                className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
              >
                <X size={12} /> 清除
              </button>
            )}
          </>
        ) : (
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="text-xs pl-7 pr-2 py-1 border border-gray-300 rounded bg-white w-48"
            />
          </div>
        )}

        <div className="flex-1" />

        {/* 列显示菜单 */}
        <div className="relative" ref={colMenuRef}>
          <button
            onClick={() => setColMenuOpen((v) => !v)}
            className="text-xs inline-flex items-center gap-1 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Columns3 size={12} /> 列
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
              {columns
                .filter((c) => c.hideable !== false)
                .map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible[c.key] !== false}
                      onChange={() => setVisible((v) => ({ ...v, [c.key]: !(v[c.key] !== false) }))}
                    />
                    <span className="truncate">{typeof c.header === 'string' ? c.header : c.key}</span>
                  </label>
                ))}
            </div>
          )}
        </div>

        {toolbarRight}
      </div>

      {/* 批量操作栏 */}
      {bulkActions && selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs">
          <span className="text-blue-700 font-medium">已选 {selected.size} 项</span>
          <div className="flex-1" />
          {bulkActions.map((a, i) => (
            <button
              key={i}
              onClick={() => a.onRun(selectedRows)}
              className={`px-2 py-1 rounded text-white ${
                a.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {a.label}
            </button>
          ))}
          <button onClick={clearSelected} className="text-gray-500 hover:text-gray-700 px-2 py-1">
            取消
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              {bulkActions && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 text-left font-medium ${c.className ?? ''} ${
                    c.sortable && onSortChange ? 'cursor-pointer select-none hover:bg-gray-100' : ''
                  }`}
                  onClick={() => clickSort(c)}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{c.header}</span>
                    {c.sortable && onSortChange && (
                      sort?.key === c.key ? (
                        sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                      ) : (
                        <ArrowUpDown size={11} className="text-gray-300" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={visibleColumns.length + (bulkActions ? 1 : 0)} className="px-3 py-12 text-center text-gray-400">
                  加载中...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + (bulkActions ? 1 : 0)} className="px-3 py-12 text-center text-gray-400">
                  {empty}
                </td>
              </tr>
            )}
            {!loading &&
              filteredRows.map((row) => {
                const id = rowKey(row)
                return (
                  <tr
                    key={id}
                    className={`border-t border-gray-100 hover:bg-gray-50 ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('input,button,select,textarea,a')) return
                      onRowClick?.(row)
                    }}
                  >
                    {bulkActions && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <Cell key={c.key} row={row} col={c} />
                    ))}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span>每页</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="border border-gray-300 rounded px-1 py-0.5 bg-white"
            >
              {(pagination.pageSizeOptions ?? [20, 50, 100]).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {pagination.total !== undefined && <span>共 {pagination.total} 条</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={pagination.page === 0}
              onClick={() => pagination.onPageChange(Math.max(0, pagination.page - 1))}
              className="px-2 py-1 rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              上一页
            </button>
            <span className="px-2">
              第 {pagination.page + 1} 页
              {pagination.total !== undefined && (
                <> / {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}</>
              )}
            </span>
            <button
              disabled={
                pagination.total !== undefined
                  ? (pagination.page + 1) * pagination.pageSize >= pagination.total
                  : rows.length < pagination.pageSize
              }
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="px-2 py-1 rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 单元格，支持双击进入编辑态 */
function Cell<T>({ row, col }: { row: T; col: ColumnDef<T> }) {
  const [editing, setEditing] = useState(false)
  const content = col.render
    ? col.render(row, { editing, setEditing })
    : <>{String(getVal(row, col) ?? '')}</>

  if (col.editor && editing) {
    return (
      <td className={`px-3 py-2 ${col.className ?? ''}`}>
        {col.editor(
          row,
          async () => setEditing(false),
          () => setEditing(false),
        )}
      </td>
    )
  }

  return (
    <td
      className={`px-3 py-2 ${col.className ?? ''}`}
      onDoubleClick={() => col.editor && setEditing(true)}
    >
      {content}
      {col.editor && !editing && (
        <Check size={10} className="inline ml-1 text-gray-300 opacity-0 group-hover:opacity-100" />
      )}
    </td>
  )
}
