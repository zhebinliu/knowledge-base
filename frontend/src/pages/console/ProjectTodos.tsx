/**
 * ProjectTodos — 项目待办看板
 *
 * 三列看板（待处理 / 进行中 / 已完成），支持：
 * - 筛选（负责人 / 优先级 / 搜索）
 * - 状态流转（点击标记完成）
 * - 从会议 action_items 同步导入
 * - 手动新增待办
 * - 详情弹窗（原文摘录 + 来源会议链接）
 */
import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, RefreshCw, Plus, Search, X,
  Copy, Download, Maximize2, CheckCircle2, Clock, AlertCircle,
  Trash2, Pencil, ChevronDown,
} from 'lucide-react'
import {
  getProjectTodos, syncProjectTodos, patchTodo, deleteTodo, createProjectTodo,
  getProject,
  type ProjectTodo,
} from '../../api/client'
import { toast } from '../../components/Toaster'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const PRI_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  P0: { label: 'P0 紧急', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  P1: { label: 'P1 重要', color: '#FF8D1A', bg: 'rgba(255,141,26,0.12)' },
  P2: { label: 'P2 一般', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
}
const STATUS_LABELS: Record<string, string> = {
  pending: '⬜ 待处理',
  doing: '🔵 进行中',
  done: '✅ 已完成',
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}

export default function ProjectTodos() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ProjectTodo | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newPriority, setNewPriority] = useState('P1')

  // 查询项目信息
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  // 查询待办列表
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['project-todos', projectId],
    queryFn: () => getProjectTodos(projectId!),
    enabled: !!projectId,
  })

  // 同步待办
  const syncMut = useMutation({
    mutationFn: () => syncProjectTodos(projectId!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project-todos', projectId] })
      toast.success(`同步完成，导入 ${res.imported} 条待办（扫描 ${res.meetings_scanned} 个会议）`)
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || '同步失败'),
  })

  // 更新待办状态
  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProjectTodo> }) => patchTodo(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-todos', projectId] })
      toast.success('已更新')
    },
    onError: () => toast.error('更新失败'),
  })

  // 删除待办
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTodo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-todos', projectId] })
      setModal(null)
      toast.success('已删除')
    },
    onError: () => toast.error('删除失败'),
  })

  // 新增待办
  const createMut = useMutation({
    mutationFn: () => createProjectTodo(projectId!, {
      content: newContent,
      assignee: newAssignee,
      priority: newPriority,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-todos', projectId] })
      setShowNewForm(false)
      setNewContent('')
      setNewAssignee('')
      setNewPriority('P1')
      toast.success('待办已创建')
    },
    onError: () => toast.error('创建失败'),
  })

  // 筛选
  const filtered = useMemo(() => {
    let list = todos
    if (filterStatus) list = list.filter(t => t.status === filterStatus)
    if (filterAssignee) list = list.filter(t => t.assignee === filterAssignee)
    if (filterPriority) list = list.filter(t => t.priority === filterPriority)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(t =>
        t.content.toLowerCase().includes(s) ||
        t.assignee.toLowerCase().includes(s) ||
        (t.meeting_title || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [todos, filterStatus, filterAssignee, filterPriority, search])

  // 分组
  const pending = filtered.filter(t => t.status === 'pending')
  const doing = filtered.filter(t => t.status === 'doing')
  const done = filtered.filter(t => t.status === 'done')

  // 统计
  const totalOverdue = todos.filter(t => t.status !== 'done' && daysUntil(t.due_date) !== null && daysUntil(t.due_date)! < 0).length
  const assignees = [...new Set(todos.map(t => t.assignee).filter(Boolean))]

  return (
    <div style={{ padding: '8px 40px 24px', maxWidth: 1800, margin: '0 auto' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>
            <ArrowLeft size={18} />
          </button>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{project?.name || '项目'}</span>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>待办看板</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {syncMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            同步待办
          </button>
          <button onClick={() => setShowNewForm(true)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, border: 'none', background: BRAND_GRAD, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> 新增待办
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer' }}>
          <option value="">状态: 全部</option>
          <option value="pending">待处理</option>
          <option value="doing">进行中</option>
          <option value="done">已完成</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer' }}>
          <option value="">优先级: 全部</option>
          <option value="P0">P0 紧急</option>
          <option value="P1">P1 重要</option>
          <option value="P2">P2 一般</option>
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer' }}>
          <option value="">负责人: 全部</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜索待办…"
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', outline: 'none', width: 200, marginLeft: 'auto' }} />
      </div>

      {/* 统计 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: '📋', label: '总待办', value: todos.length, color: 'white' },
          { icon: '⏳', label: '待处理', value: pending.length, color: '#60A5FA' },
          { icon: '⚠️', label: '逾期', value: totalOverdue, color: '#FB7185', pulse: totalOverdue > 0 },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px) saturate(140%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: s.color, animation: s.pulse ? 'pulse 2.4s ease-in-out infinite' : 'none' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 新增待办表单 */}
      {showNewForm && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="待办内容…" autoFocus
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', outline: 'none' }} />
            <input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} placeholder="负责人"
              style={{ width: 100, padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', outline: 'none' }} />
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer' }}>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowNewForm(false)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>取消</button>
            <button onClick={() => createMut.mutate()} disabled={!newContent.trim() || createMut.isPending}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12.5, border: 'none', background: BRAND_GRAD, color: 'white', cursor: 'pointer', opacity: !newContent.trim() ? 0.5 : 1 }}>
              {createMut.isPending ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* 看板 */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          <Loader2 size={32} className="animate-spin" />
        </div>
      ) : todos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>暂无待办事项</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>点击「同步待办」从会议纪要中导入，或手动新增</div>
          <button onClick={() => syncMut.mutate()} style={{ padding: '10px 24px', borderRadius: 10, background: BRAND_GRAD, color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            🎙 同步会议待办
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { key: 'pending', title: '⬜ 待处理', items: pending },
            { key: 'doing', title: '🔵 进行中', items: doing },
            { key: 'done', title: '✅ 已完成', items: done },
          ].map(col => (
            <div key={col.key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{col.title}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.38)', fontWeight: 600 }}>{col.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
                {col.items.map(todo => (
                  <TodoCard key={todo.id} todo={todo} onClick={() => setModal(todo)} onStatusChange={(status) => patchMut.mutate({ id: todo.id, body: { status } })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 详情 Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(null)}>
          <div style={{ width: 580, maxHeight: '85vh', overflowY: 'auto', background: '#161A2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>待办详情</span>
              <button onClick={() => setModal(null)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 14 }}>{modal.content}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: PRI_LABELS[modal.priority].bg, color: PRI_LABELS[modal.priority].color, border: `1px solid ${PRI_LABELS[modal.priority].color}33`, fontWeight: 600 }}>
                  {modal.priority === 'P0' ? '🔴' : modal.priority === 'P1' ? '🟠' : '🟢'} {PRI_LABELS[modal.priority].label}
                </span>
                {modal.status === 'done' && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)', fontWeight: 600 }}>✅ 已完成</span>}
                {modal.status !== 'done' && modal.due_date && daysUntil(modal.due_date)! < 0 && (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(251,113,133,0.1)', color: '#FB7185', border: '1px solid rgba(251,113,133,0.25)', fontWeight: 600 }}>
                    ⚠ 逾期 {Math.abs(daysUntil(modal.due_date)!)} 天
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>负责人</div><div style={{ fontSize: 13 }}>{modal.assignee || '-'}</div></div>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>状态</div><div style={{ fontSize: 13 }}>{STATUS_LABELS[modal.status]}</div></div>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>截止日期</div><div style={{ fontSize: 13, color: modal.due_date && daysUntil(modal.due_date)! < 0 && modal.status !== 'done' ? '#FB7185' : modal.status === 'done' ? '#34D399' : 'white' }}>{modal.due_date || '-'}</div></div>
                <div><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>创建时间</div><div style={{ fontSize: 13 }}>{modal.created_at?.slice(0, 16).replace('T', ' ') || '-'}</div></div>
              </div>
              {modal.source_quote && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>📝 原文摘录</div>
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.62)', fontStyle: 'italic', borderLeft: '3px solid rgba(255,141,26,0.18)', paddingLeft: 12 }}>
                    {modal.source_quote}
                    {modal.meeting_title && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 8, textAlign: 'right', fontStyle: 'normal' }}>—— 摘自「{modal.meeting_title}」会议纪要</div>}
                  </div>
                </div>
              )}
              {modal.meeting_id && modal.meeting_title && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>📎 来源会议</div>
                  <div onClick={() => navigate(`/console/meeting/${modal.meeting_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,141,26,0.04)', border: '1px solid rgba(255,141,26,0.12)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 20 }}>🎙</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{modal.meeting_title}</div>
                      {modal.meeting_date && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{modal.meeting_date}</div>}
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#FF8D1A' }}>查看详情 →</span>
                  </div>
                </div>
              )}
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {modal.status !== 'done' && (
                <button onClick={() => { patchMut.mutate({ id: modal.id, body: { status: 'done' } }); setModal(null) }}
                  style={{ flex: 1, padding: 10, borderRadius: 10, background: BRAND_GRAD, color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  ✅ 标记完成
                </button>
              )}
              <button onClick={() => deleteMut.mutate(modal.id)}
                style={{ flex: 1, padding: 10, borderRadius: 10, background: 'rgba(251,113,133,0.08)', color: '#FB7185', border: '1px solid rgba(251,113,133,0.2)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                🗑 删除
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  )
}


// ── 待办卡片组件 ────────────────────────────────────────────────────

function TodoCard({ todo, onClick, onStatusChange }: { todo: ProjectTodo; onClick: () => void; onStatusChange: (status: string) => void }) {
  const days = daysUntil(todo.due_date)
  const isOverdue = todo.status !== 'done' && days !== null && days < 0
  const isToday = todo.status !== 'done' && days === 0
  const pri = PRI_LABELS[todo.priority] || PRI_LABELS.P1

  return (
    <div onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '14px 16px',
        cursor: 'pointer', position: 'relative', transition: 'all 0.25s cubic-bezier(.16,1,.3,1)',
        opacity: todo.status === 'done' ? 0.55 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,141,26,0.35)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px -6px rgba(255,141,26,0.35)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {isOverdue && <div style={{ position: 'absolute', top: -7, right: 14, background: '#FB7185', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, animation: 'pulse 2.4s ease-in-out infinite', boxShadow: '0 0 12px rgba(251,113,133,0.4)' }}>逾期 {Math.abs(days!)} 天</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: pri.bg, color: pri.color, border: `1px solid ${pri.color}33` }}>{todo.priority}</span>
        {todo.meeting_title && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>📎 {todo.meeting_title}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.6, color: todo.status === 'done' ? 'rgba(255,255,255,0.5)' : 'white', textDecoration: todo.status === 'done' ? 'line-through' : 'none' }}>
        {todo.content}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
        <span>👤 {todo.assignee || '-'}</span>
        {todo.due_date && (
          <span style={{ color: isOverdue ? '#FB7185' : isToday ? '#FBBF24' : todo.status === 'done' ? '#34D399' : 'rgba(255,255,255,0.5)', fontWeight: (isOverdue || isToday) ? 600 : 400 }}>
            📅 {todo.due_date.slice(5)}
          </span>
        )}
      </div>
    </div>
  )
}
