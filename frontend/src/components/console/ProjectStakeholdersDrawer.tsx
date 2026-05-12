/**
 * 项目级干系人 Drawer(2026-05-12)。
 *
 * 入口:ConsoleProjectDetail 顶部「👥 项目干系人」按钮 → 抽屉弹出。
 * 数据来自 project_stakeholders 表(通过 meeting 沉淀过来的合并视图)。
 * 编辑姓名 → 后端自动同步该 project 所有 meeting 的纪要 / 需求引用。
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Pencil, Trash2, Check, Users, RefreshCw, Plus } from 'lucide-react'
import {
  listProjectStakeholders, patchProjectStakeholder, deleteProjectStakeholder,
  createProjectStakeholder,
  type ProjectStakeholder,
} from '../../api/client'
import { toast } from '../Toaster'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const SIDE_LABEL: Record<string, { label: string; cls: string }> = {
  internal: { label: '我方',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  customer: { label: '客户',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vendor:   { label: '合作方', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  unknown:  { label: '未知',   cls: 'bg-gray-50 text-ink-muted border-line' },
}

export default function ProjectStakeholdersDrawer({
  projectId, open, onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)

  const { data: stakes, isLoading, refetch } = useQuery({
    queryKey: ['project-stakeholders', projectId],
    queryFn: () => listProjectStakeholders(projectId),
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editId) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, editId, onClose])

  const delMut = useMutation({
    mutationFn: (id: string) => deleteProjectStakeholder(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-stakeholders', projectId] })
      toast.success('已删除')
    },
  })
  const createMut = useMutation({
    mutationFn: () => createProjectStakeholder(projectId, { name: '新干系人' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-stakeholders', projectId] })
      setEditId(r.id)
    },
  })

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-in fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Users size={16} className="text-orange-600" />
            项目干系人
            {stakes && <span className="text-[12px] text-ink-muted font-normal">{stakes.length} 人</span>}
          </h2>
          <div className="flex gap-1">
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              className="px-2.5 py-1 text-[12px] rounded text-white inline-flex items-center gap-1 disabled:opacity-50"
              style={{ background: BRAND_GRAD }}>
              {createMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              新增
            </button>
            <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-canvas text-ink-muted" title="刷新">
              <RefreshCw size={13} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-canvas text-ink-muted" title="关闭">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="text-center py-8 text-ink-muted text-sm">
              <Loader2 size={18} className="animate-spin inline mr-2" /> 加载中
            </div>
          )}
          {!isLoading && (!stakes || stakes.length === 0) && (
            <div className="text-center py-8 text-ink-muted text-sm">
              <Users size={24} className="mx-auto mb-2 opacity-50" />
              <p>暂无干系人</p>
              <p className="text-[11px] mt-1">在会议详情页点「⇪ 沉淀到项目」把会议人物合并过来,或点上方「+ 新增」手动加</p>
            </div>
          )}
          {!isLoading && stakes && stakes.map(s =>
            editId === s.id
              ? <StakeholderEdit
                  key={s.id}
                  projectId={projectId}
                  stake={s}
                  onCancel={() => setEditId(null)}
                  onDeleted={() => { setEditId(null); delMut.mutate(s.id) }}
                />
              : <StakeholderView
                  key={s.id}
                  stake={s}
                  onEdit={() => setEditId(s.id)}
                  onDelete={() => {
                    if (window.confirm(`确认删除「${s.name}」?项目和该项目的所有会议引用都不会被自动改回。`)) delMut.mutate(s.id)
                  }}
                />
          )}
        </div>

        <div className="px-5 py-3 border-t border-line text-[11px] text-ink-muted">
          编辑姓名会自动同步到本项目所有会议的纪要和需求。
        </div>
      </div>
    </>
  )
}

function StakeholderView({
  stake: s, onEdit, onDelete,
}: { stake: ProjectStakeholder; onEdit: () => void; onDelete: () => void }) {
  const side = SIDE_LABEL[s.side || 'unknown'] || SIDE_LABEL.unknown
  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-sm hover:border-orange-200 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{s.name}</div>
          {s.role && <div className="text-[12px] text-ink-secondary truncate">{s.role}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${side.cls}`}>{side.label}</span>
          {s.source_meeting_ids && s.source_meeting_ids.length > 0 && (
            <span className="text-[10px] text-ink-muted px-1.5 py-0.5 rounded border border-line"
                  title={`来自 ${s.source_meeting_ids.length} 个会议`}>
              {s.source_meeting_ids.length} 个会议
            </span>
          )}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            <button onClick={onEdit}
              className="p-1 rounded hover:bg-canvas text-ink-muted hover:text-orange-600" title="编辑">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete}
              className="p-1 rounded hover:bg-canvas text-ink-muted hover:text-rose-600" title="删除">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
      {s.organization && (
        <div className="text-[12px] text-ink-muted mb-1">{s.organization}</div>
      )}
      {s.aliases && s.aliases.length > 0 && (
        <div className="text-[11px] text-ink-muted mb-1 flex flex-wrap gap-1 items-center">
          <span>昵称:</span>
          {s.aliases.map((a, j) => (
            <span key={j} className="px-1.5 py-0.5 rounded bg-canvas border border-line">{a}</span>
          ))}
        </div>
      )}
      {s.responsibilities && s.responsibilities.length > 0 && (
        <div className="text-[12px] text-ink mt-1.5">
          <span className="text-ink-muted">职责:</span> {s.responsibilities.join('、')}
        </div>
      )}
      {s.key_points && s.key_points.length > 0 && (
        <ul className="text-[12px] text-ink mt-1.5 space-y-0.5">
          {s.key_points.map((kp, j) => (
            <li key={j} className="leading-relaxed">· {kp}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StakeholderEdit({
  projectId, stake, onCancel, onDeleted,
}: {
  projectId: string
  stake: ProjectStakeholder
  onCancel: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(stake.name)
  const [aliasesText, setAliasesText] = useState((stake.aliases || []).join('、'))
  const [role, setRole] = useState(stake.role)
  const [organization, setOrganization] = useState(stake.organization)
  const [side, setSide] = useState(stake.side)
  const [respText, setRespText] = useState((stake.responsibilities || []).join('、'))
  const [kpText, setKpText] = useState((stake.key_points || []).join('\n'))

  const saveMut = useMutation({
    mutationFn: () => {
      const splitList = (s: string) => s.split(/[、,;\s]+/).map(x => x.trim()).filter(Boolean)
      const splitLines = (s: string) => s.split(/\n+/).map(x => x.trim()).filter(Boolean)
      return patchProjectStakeholder(projectId, stake.id, {
        name: name.trim() || stake.name,
        aliases: splitList(aliasesText),
        role: role.trim(),
        organization: organization.trim(),
        side,
        responsibilities: splitList(respText),
        key_points: splitLines(kpText),
      })
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-stakeholders', projectId] })
      onCancel()
      if (r.sync.meetings_synced > 0) {
        toast.success(`已保存,同步 ${r.sync.meetings_synced} 个会议 / 纪要 ${r.sync.minutes_replaced} 处 / 需求 ${r.sync.requirements_replaced} 处`)
      } else {
        toast.success('已保存')
      }
    },
  })

  return (
    <div className="rounded-lg border-2 border-orange-300 bg-white p-3 shadow-sm space-y-2 text-[13px]">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-line/60">
        <span className="text-[11px] text-orange-700 font-medium">编辑项目干系人</span>
        <div className="flex gap-0.5">
          <button onClick={onDeleted} disabled={saveMut.isPending}
            className="p-1 rounded text-ink-muted hover:bg-canvas hover:text-rose-600" title="删除">
            <Trash2 size={13} />
          </button>
          <button onClick={onCancel} disabled={saveMut.isPending}
            className="p-1 rounded hover:bg-canvas text-ink-muted" title="取消">
            <X size={13} />
          </button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}
            className="p-1 rounded text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }} title="保存(姓名变了会同步所有会议)">
            {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-ink-muted mb-0.5">姓名</div>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
      </div>
      <div>
        <div className="text-[11px] text-ink-muted mb-0.5">昵称(别名)<span className="text-[10px]">· 多个用 、 或逗号分隔</span></div>
        <input value={aliasesText} onChange={e => setAliasesText(e.target.value)}
          placeholder="张总、张工、老张"
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] text-ink-muted mb-0.5">角色 / 职位</div>
          <input value={role} onChange={e => setRole(e.target.value)}
            className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
        </div>
        <div>
          <div className="text-[11px] text-ink-muted mb-0.5">立场</div>
          <select value={side} onChange={e => setSide(e.target.value as ProjectStakeholder['side'])}
            className="w-full px-2 py-1 rounded border border-line text-[13px] bg-white focus:outline-none focus:border-orange-300">
            <option value="internal">我方</option>
            <option value="customer">客户</option>
            <option value="vendor">合作方</option>
            <option value="unknown">未知</option>
          </select>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-ink-muted mb-0.5">组织</div>
        <input value={organization} onChange={e => setOrganization(e.target.value)}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
      </div>
      <div>
        <div className="text-[11px] text-ink-muted mb-0.5">职责<span className="text-[10px]">· 多个用 、 或逗号分隔</span></div>
        <input value={respText} onChange={e => setRespText(e.target.value)}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
      </div>
      <div>
        <div className="text-[11px] text-ink-muted mb-0.5">关键观点<span className="text-[10px]">· 每行一条</span></div>
        <textarea value={kpText} onChange={e => setKpText(e.target.value)} rows={3}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300" />
      </div>

      <p className="text-[10px] text-ink-muted pt-1 border-t border-line/60">
        改姓名会自动同步本项目所有会议的纪要和需求清单
      </p>
    </div>
  )
}
