/**
 * ConsoleMeeting — 会议纪要列表(meeting-ai 整合后,2026-05-11;2026-06-30 加分页 + 多条件筛选 + 创建人列)
 *
 * 走分页接口 /meeting/page:项目 / 状态 / 标题 / 上传人 / 时间段筛选 + 翻页。
 * 状态机:recording / processing / completed / failed;存在 processing/recording 时 8s 轮询。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Mic, Plus, Trash2, FolderKanban, CheckCircle2, Loader2, AlertCircle, Clock, Search,
  LayoutTemplate, ChevronLeft, ChevronRight, User as UserIcon, X, Pencil, SpellCheck,
} from 'lucide-react'
import {
  listMeetingsPage, deleteMeeting, patchMeeting, listProjects,
  type Meeting, type MeetingStatus, type Project,
} from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const PAGE_SIZE = 20

const STATUS_LABEL: Record<MeetingStatus, string> = {
  recording: '录制中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const cfg = {
    recording:  { cls: 'bg-amber-50 border-amber-200 text-amber-700',     Icon: Mic },
    processing: { cls: 'bg-blue-50 border-blue-200 text-blue-700',         Icon: Loader2 },
    completed:  { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', Icon: CheckCircle2 },
    failed:     { cls: 'bg-rose-50 border-rose-200 text-rose-700',          Icon: AlertCircle },
  }[status] ?? { cls: 'bg-gray-50 border-line text-ink-muted', Icon: Clock }
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const selCls = 'text-sm border border-line rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-orange-300 text-ink'

export default function ConsoleMeeting() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 标题搜索防抖 300ms,改动即回到第 1 页
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const { data, isLoading } = useQuery({
    queryKey: ['meetings-page', page, q, projectId, status, ownerId, dateFrom, dateTo],
    queryFn: () => listMeetingsPage({
      page, page_size: PAGE_SIZE,
      q, project_id: projectId, status, owner_id: ownerId, date_from: dateFrom, date_to: dateTo,
    }),
    placeholderData: (prev) => prev,  // 翻页/筛选时保留上一页内容,过渡更顺
    refetchInterval: (qq) => {
      const items = qq.state.data?.items ?? []
      return items.some(m => m.status === 'processing' || m.status === 'recording') ? 8000 : false
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const uploaders = data?.uploaders ?? []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!(q || projectId || status || ownerId || dateFrom || dateTo)

  const onFilter = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1) }
  const resetFilters = () => {
    setQInput(''); setQ(''); setProjectId(''); setStatus(''); setOwnerId(''); setDateFrom(''); setDateTo(''); setPage(1)
  }

  const delMutation = useMutation({
    mutationFn: (id: number) => deleteMeeting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings-page'] }),
  })
  const handleDelete = (m: Meeting) => {
    if (!window.confirm(`确认删除「${m.title}」?该操作不可撤销。`)) return
    delMutation.mutate(m.id)
  }

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => patchMeeting(id, { title }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['meetings-page'] })
      qc.invalidateQueries({ queryKey: ['meeting', id] })
    },
  })

  const startRename = (m: Meeting) => {
    setEditingId(m.id)
    setEditTitle(m.title || '')
  }

  const commitRename = (m: Meeting) => {
    const title = editTitle.trim()
    setEditingId(null)
    if (!title || title === (m.title || '')) return
    renameMutation.mutate({ id: m.id, title })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Hero */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink leading-tight">会议纪要</h1>
          <p className="text-sm text-ink-secondary mt-1">
            上传录音 / 粘贴文本,AI 自动提取纪要、待办、需求清单、业务流程图和干系人图谱。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => nav('/console/meeting/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm hover:opacity-90"
            style={{ background: BRAND_GRAD }}
          >
            <Plus size={16} /> 新建会议
          </button>
          <button
            onClick={() => nav('/console/meeting/templates')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-line bg-white hover:bg-slate-50 text-ink-secondary transition-colors"
          >
            <LayoutTemplate size={16} /> 模板管理
          </button>
          <button
            onClick={() => nav('/console/meeting/term-corrections')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-line bg-white hover:bg-slate-50 text-ink-secondary transition-colors"
          >
            <SpellCheck size={16} /> 名词校正
          </button>
        </div>
      </div>

      {/* 筛选条 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            placeholder="搜标题"
            className="w-full text-sm border border-line rounded-md pl-7 pr-3 py-1.5 bg-white focus:outline-none focus:border-orange-300"
          />
        </div>
        <select value={projectId} onChange={e => onFilter(setProjectId)(e.target.value)} className={selCls}>
          <option value="">全部项目</option>
          {(projects || []).map((p: Project) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={status} onChange={e => onFilter(setStatus)(e.target.value)} className={selCls}>
          <option value="">全部状态</option>
          {(['completed', 'processing', 'recording', 'failed'] as MeetingStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select value={ownerId} onChange={e => onFilter(setOwnerId)(e.target.value)} className={selCls}>
          <option value="">全部上传人</option>
          {uploaders.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-[12px] text-ink-muted">
          <input type="date" value={dateFrom} onChange={e => onFilter(setDateFrom)(e.target.value)} className={selCls} title="开始日期" />
          <span>—</span>
          <input type="date" value={dateTo} onChange={e => onFilter(setDateTo)(e.target.value)} className={selCls} title="结束日期" />
        </div>
        {hasFilter && (
          <button onClick={resetFilters} className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink px-2 py-1.5 rounded-md hover:bg-canvas">
            <X size={13} /> 清除筛选
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-ink-muted">
          <Loader2 size={20} className="animate-spin inline mr-2" /> 加载中…
        </div>
      ) : total === 0 && !hasFilter ? (
        <div className="rounded-2xl border border-line bg-canvas-elevated p-12 text-center">
          <Mic size={32} className="mx-auto text-ink-muted mb-3" />
          <p className="text-ink font-medium mb-1">还没有会议记录</p>
          <p className="text-sm text-ink-muted mb-4">点击右上角「新建会议」开始第一份纪要。</p>
          <button
            onClick={() => nav('/console/meeting/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: BRAND_GRAD }}
          >
            <Plus size={16} /> 新建会议
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-line bg-canvas-elevated overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas border-b border-line text-ink-muted">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">标题</th>
                  <th className="text-left px-4 py-2.5 font-medium">关联项目</th>
                  <th className="text-left px-4 py-2.5 font-medium">创建人</th>
                  <th className="text-left px-4 py-2.5 font-medium">状态</th>
                  <th className="text-left px-4 py-2.5 font-medium">创建时间</th>
                  <th className="text-right px-4 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-ink-muted">
                      没有匹配筛选条件的会议
                    </td>
                  </tr>
                )}
                {items.map(m => (
                  <tr key={m.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-3">
                      {editingId === m.id ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onBlur={() => commitRename(m)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(m)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full max-w-md text-sm border border-orange-300 rounded-md px-2 py-1 bg-white focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => nav(`/console/meeting/${m.id}`)}
                          className="text-ink hover:text-brand font-medium text-left"
                        >
                          {m.title || '(未命名)'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {m.project_name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <FolderKanban size={13} className="text-ink-muted" />
                          {m.project_name}
                        </span>
                      ) : (
                        <span className="text-ink-muted text-[12px]">未关联</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary text-[12px]">
                      <span className="inline-flex items-center gap-1.5">
                        <UserIcon size={12} className="text-ink-muted" />
                        {m.owner_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3 text-ink-muted text-[12px]">{formatTime(m.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startRename(m)}
                        className="text-ink-muted hover:text-ink p-1"
                        title="重命名"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(m)}
                        className="text-ink-muted hover:text-rose-600 p-1"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between mt-3 text-[12px] text-ink-muted">
            <span>共 {total} 条{hasFilter ? '(已筛选)' : ''}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-line bg-white disabled:opacity-40 hover:bg-canvas"
              >
                <ChevronLeft size={14} /> 上一页
              </button>
              <span className="tabular-nums">第 {page} / {totalPages} 页</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-line bg-white disabled:opacity-40 hover:bg-canvas"
              >
                下一页 <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
