/**
 * NewProjectStakeholdersDrawer — 项目级干系人抽屉(Liquid Glass)
 * 功能 100% 等价 — list/create/patch/delete + 编辑后同步会议提示
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Pencil, Trash2, Check, Users, RefreshCw, Plus } from 'lucide-react'
import {
  listProjectStakeholders, patchProjectStakeholder, deleteProjectStakeholder,
  createProjectStakeholder, type ProjectStakeholder,
} from '../../api/client'
import { toast } from '../../components/Toaster'

const SIDE_LABEL: Record<string, { label: string; cls: string }> = {
  internal: { label: '我方',   cls: 'is-blue' },
  customer: { label: '客户',   cls: 'is-green' },
  vendor:   { label: '合作方', cls: 'is-violet' },
  unknown:  { label: '未知',   cls: 'is-gray' },
}

export default function NewProjectStakeholdersDrawer({
  projectId, open, onClose,
}: { projectId: string; open: boolean; onClose: () => void }) {
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
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['project-stakeholders', projectId] })
      setEditId(r.id)
    },
  })

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(15, 18, 36, 0.20)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'rd-fade-up .2s var(--rd-ease) both',
        }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 50,
        width: 'min(720px, 100vw)',
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.55)',
        boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25), inset 1px 0 0 rgba(255,255,255,0.80)',
        animation: 'rd-fade-up .25s var(--rd-ease) both',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--rd-line)',
        }}>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--rd-text)', margin: 0 }}>
            <Users size={15} color="var(--rd-accent-2)" />
            项目干系人
            {stakes && <span style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 400 }}>{stakes.length} 人</span>}
          </h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="rd-btn rd-btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}>
              {createMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              新增
            </button>
            <button onClick={() => refetch()} className="rd-icon-btn" style={{ width: 28, height: 28 }} title="刷新">
              <RefreshCw size={12} />
            </button>
            <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }} title="关闭">
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--rd-text-3)' }}>
              <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} /> 加载中
            </div>
          )}
          {!isLoading && (!stakes || stakes.length === 0) && (
            <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--rd-text-3)' }}>
              <Users size={22} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>暂无干系人</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>在会议详情页点「⇪ 沉淀到项目」把会议人物合并过来,或点上方「+ 新增」</p>
            </div>
          )}
          {!isLoading && stakes && stakes.map(s =>
            editId === s.id ? (
              <StakeholderEdit
                key={s.id}
                projectId={projectId}
                stake={s}
                onCancel={() => setEditId(null)}
                onDeleted={() => { setEditId(null); delMut.mutate(s.id) }}
              />
            ) : (
              <StakeholderView
                key={s.id}
                stake={s}
                onEdit={() => setEditId(s.id)}
                onDelete={() => {
                  if (window.confirm(`确认删除「${s.name}」?项目和该项目的所有会议引用都不会被自动改回。`)) delMut.mutate(s.id)
                }}
              />
            )
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--rd-line)', fontSize: 12, color: 'var(--rd-text-3)' }}>
          编辑姓名会自动同步到本项目所有会议的纪要和需求。
        </div>
      </div>
    </>
  )
}

function StakeholderView({ stake: s, onEdit, onDelete }: {
  stake: ProjectStakeholder; onEdit: () => void; onDelete: () => void
}) {
  const side = SIDE_LABEL[s.side || 'unknown'] || SIDE_LABEL.unknown
  return (
    <div
      className="group"
      style={{
        borderRadius: 12, padding: 12,
        background: 'rgba(255,255,255,0.55)',
        border: '1px solid rgba(255,255,255,0.55)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .7), 0 1px 3px rgba(15, 18, 36, .04)',
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255, 141, 26, .25)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, .55)'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
          {s.role && <div style={{ fontSize: 12, color: 'var(--rd-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.role}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span className={`rd-badge ${side.cls}`}>{side.label}</span>
          {s.source_meeting_ids && s.source_meeting_ids.length > 0 && (
            <span className="rd-badge is-gray" title={`来自 ${s.source_meeting_ids.length} 个会议`}>
              {s.source_meeting_ids.length} 个会议
            </span>
          )}
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={onEdit} className="rd-icon-btn" style={{ width: 24, height: 24, opacity: 0.7 }} title="编辑"><Pencil size={11} /></button>
            <button onClick={onDelete} className="rd-icon-btn" style={{ width: 24, height: 24, color: '#DC2626', opacity: 0.7 }} title="删除"><Trash2 size={11} /></button>
          </div>
        </div>
      </div>
      {s.organization && <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 4 }}>{s.organization}</div>}
      {s.aliases && s.aliases.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 4 }}>
          <span>昵称:</span>
          {s.aliases.map((a, j) => (
            <span key={j} style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(15, 18, 36, .05)', border: '1px solid var(--rd-line)' }}>{a}</span>
          ))}
        </div>
      )}
      {s.responsibilities && s.responsibilities.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--rd-text)', marginTop: 6 }}>
          <span style={{ color: 'var(--rd-text-3)' }}>职责:</span> {s.responsibilities.join('、')}
        </div>
      )}
      {s.key_points && s.key_points.length > 0 && (
        <ul style={{ fontSize: 12, color: 'var(--rd-text)', marginTop: 6, listStyle: 'none', padding: 0 }}>
          {s.key_points.map((kp, j) => <li key={j} style={{ lineHeight: 1.6 }}>· {kp}</li>)}
        </ul>
      )}
    </div>
  )
}

function StakeholderEdit({ projectId, stake, onCancel, onDeleted }: {
  projectId: string; stake: ProjectStakeholder; onCancel: () => void; onDeleted: () => void
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
        aliases: splitList(aliasesText), role: role.trim(), organization: organization.trim(),
        side, responsibilities: splitList(respText), key_points: splitLines(kpText),
      })
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['project-stakeholders', projectId] })
      onCancel()
      if (r.sync.meetings_synced > 0) {
        toast.success(`已保存,同步 ${r.sync.meetings_synced} 个会议 / 纪要 ${r.sync.minutes_replaced} 处 / 需求 ${r.sync.requirements_replaced} 处`)
      } else toast.success('已保存')
    },
  })

  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '5px 9px' }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 2 }

  return (
    <div style={{
      borderRadius: 12, padding: 12,
      background: 'rgba(255,255,255,0.55)',
      border: '2px solid rgba(255, 141, 26, .35)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .8), 0 4px 14px -6px rgba(255, 141, 26, .25)',
      display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: '1px solid var(--rd-line)' }}>
        <span style={{ fontSize: 12, color: 'var(--rd-accent-2)', fontWeight: 600 }}>编辑项目干系人</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={onDeleted} disabled={saveMut.isPending} className="rd-icon-btn" style={{ width: 26, height: 26, color: '#DC2626' }} title="删除"><Trash2 size={12} /></button>
          <button onClick={onCancel} disabled={saveMut.isPending} className="rd-icon-btn" style={{ width: 26, height: 26 }} title="取消"><X size={12} /></button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()} className="rd-btn rd-btn-primary" style={{ padding: '4px 8px' }} title="保存(姓名变了会同步所有会议)">
            {saveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
        </div>
      </div>

      <div>
        <div style={labelStyle}>姓名</div>
        <input className="rd-input" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>昵称(别名)<span style={{ fontSize: 12 }}>· 多个用 、 或逗号分隔</span></div>
        <input className="rd-input" value={aliasesText} onChange={e => setAliasesText(e.target.value)} placeholder="张总、张工、老张" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={labelStyle}>角色 / 职位</div>
          <input className="rd-input" value={role} onChange={e => setRole(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>立场</div>
          <select className="rd-input" value={side} onChange={e => setSide(e.target.value as ProjectStakeholder['side'])} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="internal">我方</option>
            <option value="customer">客户</option>
            <option value="vendor">合作方</option>
            <option value="unknown">未知</option>
          </select>
        </div>
      </div>
      <div>
        <div style={labelStyle}>组织</div>
        <input className="rd-input" value={organization} onChange={e => setOrganization(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>职责<span style={{ fontSize: 12 }}>· 多个用 、 或逗号分隔</span></div>
        <input className="rd-input" value={respText} onChange={e => setRespText(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>关键观点<span style={{ fontSize: 12 }}>· 每行一条</span></div>
        <textarea className="rd-input" value={kpText} onChange={e => setKpText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <p style={{ fontSize: 12, color: 'var(--rd-text-3)', paddingTop: 4, borderTop: '1px solid var(--rd-line)', margin: 0 }}>
        改姓名会自动同步本项目所有会议的纪要和需求清单
      </p>
    </div>
  )
}
