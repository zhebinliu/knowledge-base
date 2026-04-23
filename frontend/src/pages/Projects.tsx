import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Folder, Calendar, Building2, FileText, Trash2, LayoutGrid, Table as TableIcon, Pencil } from 'lucide-react'
import {
  Project,
  deleteProject,
  getProjectMeta,
  listProjects,
  updateProject,
} from '../api/client'
import ProjectFormModal from '../components/ProjectFormModal'
import DataTable, { type ColumnDef } from '../components/DataTable'
import { ConfirmModal } from '../components/Modal'

type View = 'grid' | 'table'

export default function Projects() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Project | null | undefined>(undefined) // undefined=closed, null=create, Project=edit
  const [view, setView] = useState<View>('grid')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ industry: '', search: '' })
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'updated_at', dir: 'desc' })
  const [confirmDel, setConfirmDel] = useState<Project | null>(null)

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })

  const del = useMutation({
    mutationFn: ({ id, cascade }: { id: string; cascade: boolean }) => deleteProject(id, cascade),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const doDelete = async (p: Project) => {
    try {
      await del.mutateAsync({ id: p.id, cascade: false })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e.response?.status === 409) {
        if (confirm(`${e.response?.data?.detail}\n\n仍要继续吗？`)) {
          await del.mutateAsync({ id: p.id, cascade: true })
        }
      } else {
        alert(e?.response?.data?.detail ?? '删除失败')
      }
    }
  }

  // 客户端筛选 + 排序
  const filtered = useMemo(() => {
    let arr = [...projects]
    if (filterValues.industry) arr = arr.filter((p) => p.industry === filterValues.industry)
    if (filterValues.search) {
      const kw = filterValues.search.toLowerCase()
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          (p.customer ?? '').toLowerCase().includes(kw),
      )
    }
    if (sort) {
      arr.sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sort.key] as string | number | undefined
        const vb = (b as unknown as Record<string, unknown>)[sort.key] as string | number | undefined
        if (va === vb) return 0
        const cmp = String(va ?? '').localeCompare(String(vb ?? ''))
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return arr
  }, [projects, filterValues, sort])

  const columns: ColumnDef<Project>[] = [
    {
      key: 'name',
      header: '项目',
      sortable: true,
      render: (p) => (
        <Link to={`/projects/${p.id}`} className="flex items-center gap-1.5 text-gray-900 hover:text-orange-600 font-medium">
          <Folder size={13} className="text-orange-500" /> {p.name}
        </Link>
      ),
      editor: (p, commit, cancel) => <InlineText initial={p.name} onCommit={async (v) => {
        if (v && v !== p.name) {
          await updateProject(p.id, { name: v })
          qc.invalidateQueries({ queryKey: ['projects'] })
        }
        commit(v)
      }} onCancel={cancel} />,
    },
    { key: 'customer', header: '客户', sortable: true, render: (p) => p.customer ?? '—' },
    {
      key: 'industry',
      header: '行业',
      sortable: true,
      render: (p) => meta?.industries.find((i) => i.value === p.industry)?.label ?? p.industry ?? '—',
    },
    { key: 'kickoff_date', header: '立项', sortable: true, defaultVisible: false, render: (p) => p.kickoff_date ?? '—' },
    {
      key: 'modules',
      header: '模块',
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          {(p.modules ?? []).slice(0, 3).map((m) => (
            <span key={m} className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">{m}</span>
          ))}
          {p.modules && p.modules.length > 3 && <span className="text-[11px] text-gray-400">+{p.modules.length - 3}</span>}
        </div>
      ),
    },
    { key: 'document_count', header: '文档数', sortable: true, render: (p) => p.document_count ?? 0 },
    { key: 'updated_at', header: '更新时间', sortable: true, defaultVisible: false, render: (p) => (p.updated_at ?? '').slice(0, 10) },
    {
      key: '_actions',
      header: '',
      hideable: false,
      render: (p) => (
        <div className="flex items-center gap-1">
          <button onClick={() => setEditing(p)} className="p-1 text-gray-400 hover:text-blue-500" title="编辑"><Pencil size={13} /></button>
          <button onClick={() => setConfirmDel(p)} className="p-1 text-gray-400 hover:text-red-500" title="删除"><Trash2 size={13} /></button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">项目库</h1>
          <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>按项目组织实施过程中产出的所有文档</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button onClick={() => setView('grid')} className={`px-2 py-1.5 inline-flex items-center gap-1 ${view === 'grid' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><LayoutGrid size={12} /> 卡片</button>
            <button onClick={() => setView('table')} className={`px-2 py-1.5 inline-flex items-center gap-1 ${view === 'table' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><TableIcon size={12} /> 表格</button>
          </div>
          <button onClick={() => setEditing(null)}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}>
            <Plus size={16} /> 新建项目
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400">加载中...</p>}

      {!isLoading && view === 'grid' && (
        <>
          {projects.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
              <Folder size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">暂无项目，点击右上角"新建项目"开始</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link to={`/projects/${p.id}`} className="flex items-start gap-2 min-w-0 flex-1">
                    <Folder size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 truncate transition-colors">{p.name}</h3>
                  </Link>
                  <button onClick={() => setConfirmDel(p)} title="删除项目"
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="space-y-1.5 text-xs text-gray-600">
                  {p.customer && <div className="flex items-center gap-1.5"><Building2 size={12} className="text-gray-400" /> {p.customer}</div>}
                  {p.kickoff_date && <div className="flex items-center gap-1.5"><Calendar size={12} className="text-gray-400" /> 立项 {p.kickoff_date}</div>}
                  <div className="flex items-center gap-1.5"><FileText size={12} className="text-gray-400" /> {p.document_count} 份文档</div>
                </div>
                {p.modules && p.modules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {p.modules.slice(0, 4).map((m) => <span key={m} className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">{m}</span>)}
                    {p.modules.length > 4 && <span className="text-[11px] text-gray-400">+{p.modules.length - 4}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!isLoading && view === 'table' && (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(p) => p.id}
          filters={[
            {
              key: 'industry',
              label: '行业',
              options: (meta?.industries ?? []).map((i) => ({ value: i.value, label: i.label })),
            },
            { key: 'search', label: '搜索名称/客户' },
          ]}
          filterValues={filterValues}
          onFilterChange={setFilterValues}
          sort={sort}
          onSortChange={setSort}
          bulkActions={[
            {
              label: '批量删除',
              danger: true,
              onRun: async (ps) => {
                if (!confirm(`确认删除 ${ps.length} 个项目？`)) return
                for (const p of ps) await doDelete(p)
              },
            },
          ]}
          pagination={{
            page: 0,
            pageSize: 50,
            total: filtered.length,
            onPageChange: () => {},
            onPageSizeChange: () => {},
          }}
        />
      )}

      {editing !== undefined && (
        <ProjectFormModal
          open={editing !== undefined}
          meta={meta}
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['projects'] })}
        />
      )}

      <ConfirmModal
        open={!!confirmDel}
        title="删除项目"
        danger
        message={confirmDel ? `确认删除项目 "${confirmDel.name}"？项目下文档不会被删除，仅解除关联。` : ''}
        onConfirm={() => confirmDel && doDelete(confirmDel)}
        onClose={() => setConfirmDel(null)}
      />
    </div>
  )
}

function InlineText({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(v)
        if (e.key === 'Escape') onCancel()
      }}
      className="border border-blue-400 rounded px-1 py-0.5 text-sm w-full"
    />
  )
}
