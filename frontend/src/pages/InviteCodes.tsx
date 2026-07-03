/**
 * 后台:邀请码管理 — 仅 is_admin 可访问。
 *
 * 功能:
 * - 列表所有邀请码,展示状态(active / expired / exhausted / revoked)
 * - 创建邀请码:max_uses / expires_in_days / target_role / note
 * - 创建后弹一次性提示展示完整 code(关闭后只能从列表看 code 字段,但建议立刻复制保存)
 * - 吊销:可立即让 code 失效(已注册的用户不受影响)
 */
import { useState, useEffect, useMemo } from 'react'
import { Plus, Copy, X, Loader2, Shield, RefreshCw, Ban, CheckCircle2, AlertCircle, Link as LinkIcon } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listInviteCodes, createInviteCode, revokeInviteCode,
  type InviteCode,
} from '../api/client'

// 邀请链接固定用主域名,方便不管管理员在哪个环境创建都能发一个稳定链接
const INVITE_LINK_BASE = 'https://kb.tokenwave.cloud/register'
const buildInviteLink = (code: string) => `${INVITE_LINK_BASE}?invite_code=${encodeURIComponent(code)}`

const STATUS_META: Record<InviteCode['status'], { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:    { label: '有效',     color: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  expired:   { label: '已过期',   color: 'bg-slate-50 text-slate-600 ring-slate-200',     icon: AlertCircle },
  exhausted: { label: '已用尽',   color: 'bg-amber-50 text-amber-700 ring-amber-200',     icon: AlertCircle },
  revoked:   { label: '已吊销',   color: 'bg-red-50 text-red-700 ring-red-200',           icon: Ban },
}


export default function InviteCodesPage() {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invite-codes'],
    queryFn: () => listInviteCodes(200),
  })
  const [showCreate, setShowCreate] = useState(false)
  const [newCodeShow, setNewCodeShow] = useState<InviteCode | null>(null)

  const items = data?.items ?? []
  const stats = useMemo(() => {
    const s = { active: 0, expired: 0, exhausted: 0, revoked: 0 }
    for (const it of items) s[it.status] += 1
    return s
  }, [items])

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeInviteCode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invite-codes'] }),
  })

  const handleRevoke = (ic: InviteCode) => {
    if (window.confirm(`吊销邀请码「${ic.code}」?\n吊销后无法再用于注册新账号(已注册用户不受影响)。`)) {
      revokeMut.mutate(ic.id)
    }
  }

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Shield size={18} className="text-orange-600" />
            邀请码管理
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            注册新账号必须凭管理员发放的邀请码。可设置有效期 / 使用次数 / 目标角色。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-line text-ink-secondary hover:bg-slate-50"
          >
            <RefreshCw size={11} /> 刷新
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-orange-600 text-white hover:bg-orange-700"
          >
            <Plus size={12} /> 创建邀请码
          </button>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {(['active', 'expired', 'exhausted', 'revoked'] as const).map(k => {
          const meta = STATUS_META[k]
          return (
            <div key={k} className={`rounded-lg ring-1 px-3 py-2 ${meta.color}`}>
              <div className="text-[10px] opacity-80">{meta.label}</div>
              <div className="text-lg font-semibold">{stats[k]}</div>
            </div>
          )
        })}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg border border-line overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-ink-secondary">
            <tr>
              <th className="px-3 py-2 text-left font-medium">邀请码</th>
              <th className="px-3 py-2 text-left font-medium">状态</th>
              <th className="px-3 py-2 text-left font-medium">目标角色</th>
              <th className="px-3 py-2 text-left font-medium">使用</th>
              <th className="px-3 py-2 text-left font-medium">过期时间</th>
              <th className="px-3 py-2 text-left font-medium">备注</th>
              <th className="px-3 py-2 text-left font-medium">创建时间</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-ink-muted">
                <Loader2 size={14} className="animate-spin inline mr-1" /> 加载中…
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-ink-muted">
                还没有邀请码,点右上角「创建邀请码」生成一个
              </td></tr>
            ) : items.map(ic => (
              <Row key={ic.id} ic={ic} onRevoke={() => handleRevoke(ic)} disabled={revokeMut.isPending} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 创建弹窗 */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(ic) => {
            setShowCreate(false)
            setNewCodeShow(ic)
            qc.invalidateQueries({ queryKey: ['invite-codes'] })
          }}
        />
      )}

      {/* 创建成功后显示完整 code 弹窗 */}
      {newCodeShow && (
        <NewCodeModal ic={newCodeShow} onClose={() => setNewCodeShow(null)} />
      )}
    </div>
  )
}


function Row({ ic, onRevoke, disabled }: { ic: InviteCode; onRevoke: () => void; disabled: boolean }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const meta = STATUS_META[ic.status]
  const Icon = meta.icon
  const usage = ic.max_uses === 0 ? `${ic.used_count} / ∞` : `${ic.used_count} / ${ic.max_uses}`
  const expires = ic.expires_at
    ? new Date(ic.expires_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
    : '永久'
  const created = new Date(ic.created_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })

  const copy = (kind: 'code' | 'link') => {
    const text = kind === 'code' ? ic.code : buildInviteLink(ic.code)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <tr className="hover:bg-slate-50/40">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <code className="font-mono text-[12px] tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">{ic.code}</code>
          <button onClick={() => copy('code')} className="p-1 text-ink-muted hover:text-orange-600" title="复制邀请码">
            <Copy size={11} />
          </button>
          <button onClick={() => copy('link')} className="p-1 text-ink-muted hover:text-orange-600" title="复制邀请链接">
            <LinkIcon size={11} />
          </button>
          {copied === 'code' && <span className="text-[10px] text-emerald-600">码已复制</span>}
          {copied === 'link' && <span className="text-[10px] text-emerald-600">链接已复制</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ring-1 text-[10px] ${meta.color}`}>
          <Icon size={10} /> {meta.label}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`text-[11px] ${ic.target_role === 'admin' ? 'text-red-700 font-semibold' : 'text-ink-secondary'}`}>
          {ic.target_role === 'admin' ? '管理员' : '普通用户'}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums">{usage}</td>
      <td className="px-3 py-2">{expires}</td>
      <td className="px-3 py-2 text-ink-muted truncate max-w-[160px]" title={ic.note || ''}>{ic.note || '—'}</td>
      <td className="px-3 py-2 text-ink-muted">{created}</td>
      <td className="px-3 py-2 text-right">
        {ic.status === 'active' && (
          <button
            onClick={onRevoke}
            disabled={disabled}
            className="text-[11px] text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            吊销
          </button>
        )}
      </td>
    </tr>
  )
}


function CreateModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (ic: InviteCode) => void
}) {
  const [maxUses, setMaxUses] = useState(1)
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [targetRole, setTargetRole] = useState<'console_user' | 'admin'>('console_user')
  const [note, setNote] = useState('')

  const createMut = useMutation({
    mutationFn: () => createInviteCode({
      max_uses: maxUses, expires_in_days: expiresInDays, target_role: targetRole,
      note: note.trim() || null,
    }),
    onSuccess: (ic) => onCreated(ic),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">创建邀请码</h2>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-ink-secondary mb-1">使用次数</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={1000} value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 0)}
                className="w-24 border border-line rounded px-2 py-1.5 text-sm"
              />
              <span className="text-[11px] text-ink-muted">次(0 = 无限,谨慎设)</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">有效期</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={3650} value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 0)}
                className="w-24 border border-line rounded px-2 py-1.5 text-sm"
              />
              <span className="text-[11px] text-ink-muted">天(0 = 永久,谨慎设)</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">目标角色</label>
            <div className="flex gap-2">
              <RoleBtn active={targetRole === 'console_user'} onClick={() => setTargetRole('console_user')}>
                普通用户(console_user)
              </RoleBtn>
              <RoleBtn active={targetRole === 'admin'} onClick={() => setTargetRole('admin')} danger>
                管理员(admin)
              </RoleBtn>
            </div>
            {targetRole === 'admin' && (
              <p className="mt-1 text-[10px] text-red-600">
                管理员账号有完整后台权限,务必只发给可信同事
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">备注(只给自己看)</label>
            <input
              type="text" value={note} maxLength={255}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例:发给小李,实施顾问入职"
              className="w-full border border-line rounded px-2 py-1.5 text-sm"
            />
          </div>
          {createMut.isError && (
            <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">
              {(createMut.error as any)?.response?.data?.detail || '创建失败'}
            </p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-line text-ink-secondary hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {createMut.isPending ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}


function NewCodeModal({ ic, onClose }: { ic: InviteCode; onClose: () => void }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const inviteLink = buildInviteLink(ic.code)
  const copy = (kind: 'code' | 'link') => {
    const text = kind === 'code' ? ic.code : inviteLink
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> 邀请码创建成功
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">邀请码(手输方式):</p>
            <div className="bg-slate-50 rounded border border-line p-3 flex items-center justify-between">
              <code className="font-mono text-base tracking-widest text-ink">{ic.code}</code>
              <button
                onClick={() => copy('code')}
                className="ml-2 px-2.5 py-1 text-xs rounded bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-1"
              >
                <Copy size={11} /> {copied === 'code' ? '已复制' : '复制码'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-secondary mb-1.5">邀请链接(点开自动填码):</p>
            <div className="bg-slate-50 rounded border border-line p-3 flex items-center justify-between gap-2">
              <code className="font-mono text-[11px] text-ink-secondary truncate flex-1" title={inviteLink}>{inviteLink}</code>
              <button
                onClick={() => copy('link')}
                className="shrink-0 px-2.5 py-1 text-xs rounded bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-1"
              >
                <LinkIcon size={11} /> {copied === 'link' ? '已复制' : '复制链接'}
              </button>
            </div>
          </div>
          <div className="text-[11px] text-ink-muted space-y-0.5">
            <div>使用次数:{ic.max_uses === 0 ? '无限' : `${ic.max_uses} 次`}</div>
            <div>有效期:{ic.expires_at ? new Date(ic.expires_at).toLocaleString('zh-CN') : '永久'}</div>
            <div>目标角色:{ic.target_role === 'admin' ? '管理员' : '普通用户'}</div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-line flex items-center justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-100 hover:bg-slate-200">
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}


function RoleBtn({
  active, onClick, children, danger,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  const cls = active
    ? danger ? 'border-red-300 bg-red-50 text-red-700' : 'border-orange-300 bg-orange-50 text-orange-700'
    : 'border-line text-ink-secondary hover:bg-slate-50'
  return (
    <button onClick={onClick} type="button"
      className={`flex-1 px-2.5 py-1.5 text-xs rounded border transition ${cls}`}>
      {children}
    </button>
  )
}
