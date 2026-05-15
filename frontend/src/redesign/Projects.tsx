/**
 * NewBackendProjects(后台) — 项目库,grid/table 双视图
 * 功能 100% 等价 — listProjects / getProjectMeta / deleteProject(cascade)
 * / updateProject / DataTable / ProjectFormModal / ConfirmModal
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Folder, Calendar, Building2, FileText, Trash2, LayoutGrid, Table as TableIcon, Pencil } from 'lucide-react'
import {
  Project, deleteProject, getProjectMeta, listProjects, updateProject,
} from '../api/client'
import ProjectFormModal from '../components/ProjectFormModal'
import DataTable, { type ColumnDef } from '../components/DataTable'
import { ConfirmModal } from '../components/Modal'
import GlowCard from './components/GlowCard'

type View = 'grid' | 'table'

export default function NewBackendProjects() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Project | null | undefined>(undefined)
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
        if (confirm(`${e.response?.data?.detail}\n\n仍要继续吗?`)) {
          await del.mutateAsync({ id: p.id, cascade: true })
        }
      } else {
        alert(e?.response?.data?.detail ?? '删除失败')
      }
    }
  }

  const filtered = useMemo(() => {
    let arr = [...projects]
    if (filterValues.industry) arr = arr.filter(p => p.industry === filterValues.industry)
    if (filterValues.search) {
      const kw = filterValues.search.toLowerCase()
      arr = arr.filter(p =>
        p.name.toLowerCase().includes(kw) || (p.customer ?? '').toLowerCase().includes(kw),
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
      key: 'name', header: '项目', sortable: true,
      render: p => (
        <Link to={`/projects/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--rd-text)', textDecoration: 'none', fontWeight: 500 }}>
          <Folder size={12} color="var(--rd-accent)" /> {p.name}
        </Link>
      ),
      editor: (p, commit, cancel) => <InlineText initial={p.name} onCommit={async v => {
        if (v && v !== p.name) { await updateProject(p.id, { name: v }); qc.invalidateQueries({ queryKey: ['projects'] }) }
        commit(v)
      }} onCancel={cancel} />,
    },
    { key: 'customer', header: '客户', sortable: true, render: p => p.customer ?? '—' },
    {
      key: 'industry', header: '行业', sortable: true,
      render: p => meta?.industries.find(i => i.value === p.industry)?.label ?? p.industry ?? '—',
    },
    { key: 'kickoff_date', header: '立项', sortable: true, defaultVisible: false, render: p => p.kickoff_date ?? '—' },
    {
      key: 'modules', header: '模块',
      render: p => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(p.modules ?? []).slice(0, 3).map(m => <span key={m} className="rd-badge is-orange" style={{ fontSize: 10 }}>{m}</span>)}
          {p.modules && p.modules.length > 3 && <span style={{ fontSize: 10.5, color: 'var(--rd-text-3)' }}>+{p.modules.length - 3}</span>}
        </div>
      ),
    },
    { key: 'document_count', header: '文档数', sortable: true, render: p => p.document_count ?? 0 },
    { key: 'updated_at', header: '更新时间', sortable: true, defaultVisible: false, render: p => (p.updated_at ?? '').slice(0, 10) },
    {
      key: '_actions', header: '', hideable: false,
      render: p => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setEditing(p)} title="编辑" style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--rd-text-3)' }}><Pencil size={12} /></button>
          <button onClick={() => setConfirmDel(p)} title="删除" style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--rd-text-3)' }}><Trash2 size={12} /></button>
        </div>
      ),
    },
  ]

  return (
    <div className="rd-page" style={{ maxWidth: 1400 }}>
      <div className="rd-page-head">
        <div>
          <h1>项目库</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--rd-line)', borderRadius: 10, padding: 2, background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            {(['grid', 'table'] as const).map(v => {
              const Icon = v === 'grid' ? LayoutGrid : TableIcon
              const isActive = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 8,
                    background: isActive ? 'rgba(255, 141, 26, .14)' : 'transparent',
                    color: isActive ? 'var(--rd-accent-2)' : 'var(--rd-text-3)',
                    border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit',
                  }}
                >
                  <Icon size={12} /> {v === 'grid' ? '卡片' : '表格'}
                </button>
              )
            })}
          </div>
          <button onClick={() => setEditing(null)} className="rd-btn rd-btn-primary">
            <Plus size={13} /> 新建项目
          </button>
        </div>
      </div>

      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--rd-text-3)' }}>加载中…</p>
      ) : view === 'grid' ? (
        projects.length === 0 ? (
          <GlowCard style={{
            padding: '48px 24px', textAlign: 'center',
            border: '1px dashed var(--rd-line-strong)', background: 'transparent',
          }}>
            <Folder size={32} color="var(--rd-text-3)" style={{ opacity: 0.4, marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: 'var(--rd-text-2)', margin: 0 }}>暂无项目,点击右上角"新建项目"开始</p>
          </GlowCard>
        ) : (
          <div className="rd-grid-3 rd-stagger" style={{ gap: 14 }}>
            {projects.map((p, i) => (
              <GlowCard key={p.id} interactive style={{ padding: 18, animationDelay: `${i * 40}ms` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <Link to={`/projects/${p.id}`} style={{
                    display: 'inline-flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1,
                    textDecoration: 'none',
                  }}>
                    <Folder size={16} color="var(--rd-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <h3 style={{
                      fontSize: 15, fontWeight: 600, color: 'var(--rd-text)', margin: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{p.name}</h3>
                  </Link>
                  <button onClick={() => setConfirmDel(p)} title="删除项目" style={{
                    background: 'transparent', border: 'none', padding: 4,
                    color: 'var(--rd-text-3)', cursor: 'pointer',
                  }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, color: 'var(--rd-text-2)' }}>
                  {p.customer && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Building2 size={11} color="var(--rd-text-3)" /> {p.customer}</span>}
                  {p.kickoff_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Calendar size={11} color="var(--rd-text-3)" /> 立项 {p.kickoff_date}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileText size={11} color="var(--rd-text-3)" /> {p.document_count} 份文档</span>
                </div>
                {p.modules && p.modules.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
                    {p.modules.slice(0, 4).map(m => <span key={m} className="rd-badge is-orange" style={{ fontSize: 10 }}>{m}</span>)}
                    {p.modules.length > 4 && <span style={{ fontSize: 10, color: 'var(--rd-text-3)' }}>+{p.modules.length - 4}</span>}
                  </div>
                )}
              </GlowCard>
            ))}
          </div>
        )
      ) : (
        <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={p => p.id}
            filters={[
              { key: 'industry', label: '行业', options: (meta?.industries ?? []).map(i => ({ value: i.value, label: i.label })) },
              { key: 'search', label: '搜索名称/客户' },
            ]}
            filterValues={filterValues}
            onFilterChange={setFilterValues}
            sort={sort}
            onSortChange={setSort}
            bulkActions={[{
              label: '批量删除', danger: true,
              onRun: async ps => {
                if (!confirm(`确认删除 ${ps.length} 个项目?`)) return
                for (const p of ps) await doDelete(p)
              },
            }]}
            pagination={{ page: 0, pageSize: 50, total: filtered.length, onPageChange: () => {}, onPageSizeChange: () => {} }}
          />
        </GlowCard>
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
        message={confirmDel ? `确认删除项目 "${confirmDel.name}"?项目下文档不会被删除,仅解除关联。` : ''}
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
      autoFocus value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(v); if (e.key === 'Escape') onCancel() }}
      style={{
        border: '1px solid var(--rd-accent)', borderRadius: 4,
        padding: '2px 6px', fontSize: 13, width: '100%',
        background: '#fff', outline: 'none',
      }}
    />
  )
}
