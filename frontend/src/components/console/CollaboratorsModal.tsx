/**
 * 项目协作者管理 — 弹窗形式。
 *
 * 入口:项目详情页右上「成员」按钮(owner / read_write 协作者 / admin 都能开)
 * 功能:
 *  - 看 Owner + 协作者列表(角色徽标)
 *  - 搜用户(按用户名 / 邮箱 / 全名)→ 选 + 选角色 + 加
 *  - 改协作者角色 read / read_write
 *  - 移除协作者
 * 权限提示:read 角色看到的 modal 是只读的(没有「+ 添加」、不能改/删)
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Plus, Search, Loader2, Crown, Shield, Eye,
  Check, AlertTriangle, UserMinus, ChevronDown, ArrowRightLeft,
} from 'lucide-react'
import {
  listCollaborators, addCollaborator, updateCollaboratorRole, removeCollaborator,
  searchUsersForCollab, transferProjectOwner, setCollaboratorProjectRole,
  type CollaboratorRole, type ProjectCollaborator, type ProjectMemberRole, type UserSearchResult,
} from '../../api/client'

// 项目角色分类(pm/consultant/customer)下拉选项 —— 与访问权限正交
const PROJECT_ROLE_OPTIONS: { value: ProjectMemberRole | ''; label: string }[] = [
  { value: '', label: '未指定' },
  { value: 'pm', label: '项目经理' },
  { value: 'consultant', label: '顾问' },
  { value: 'customer', label: '客户' },
]

interface Props {
  open: boolean
  projectId: string
  /** 当前用户对该项目的角色:owner / read_write / read / admin */
  myRole: 'owner' | 'read_write' | 'read' | 'admin'
  onClose: () => void
}

const ROLE_BADGE: Record<CollaboratorRole, { label: string; cls: string }> = {
  read:       { label: '只读',       cls: 'bg-slate-50 text-ink-secondary ring-line' },
  read_write: { label: '读写',       cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}

export default function CollaboratorsModal({ open, projectId, myRole, onClose }: Props) {
  const qc = useQueryClient()
  // myRole 是写权限或者 owner 或 admin 才能改
  const canManage = myRole === 'owner' || myRole === 'read_write' || myRole === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['project-collaborators', projectId],
    queryFn: () => listCollaborators(projectId),
    enabled: open,
  })

  // 转让所有者:owner / admin 才能开;打开后展示一个二选弹窗(选谁接手)
  const [transferOpen, setTransferOpen] = useState(false)
  const canTransferOwner = myRole === 'owner' || myRole === 'admin'

  // 搜索 + 添加
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [addingRole, setAddingRole] = useState<CollaboratorRole>('read')
  const [pendingAdd, setPendingAdd] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setError(null) }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debRef.current) window.clearTimeout(debRef.current)
    debRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchUsersForCollab(query.trim())
        setResults(res)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 240)
    return () => { if (debRef.current) window.clearTimeout(debRef.current) }
  }, [query])

  const addMut = useMutation({
    mutationFn: (vars: { user_id: string; role: CollaboratorRole }) =>
      addCollaborator(projectId, vars.user_id, vars.role),
    onSuccess: () => {
      setQuery(''); setResults([]); setError(null); setPendingAdd(null)
      qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] })
    },
    onError: (e: any) => {
      setError(e?.response?.data?.detail || e?.message || '添加失败')
      setPendingAdd(null)
    },
  })

  const updateMut = useMutation({
    mutationFn: (vars: { user_id: string; role: CollaboratorRole }) =>
      updateCollaboratorRole(projectId, vars.user_id, vars.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] }),
  })

  const projectRoleMut = useMutation({
    mutationFn: (vars: { user_id: string; project_role: ProjectMemberRole | null }) =>
      setCollaboratorProjectRole(projectId, vars.user_id, vars.project_role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] }),
  })

  const removeMut = useMutation({
    mutationFn: (user_id: string) => removeCollaborator(projectId, user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] }),
  })

  const transferMut = useMutation({
    mutationFn: (new_owner_user_id: string) => transferProjectOwner(projectId, new_owner_user_id),
    onSuccess: () => {
      setTransferOpen(false)
      // 同时让外面项目详情 / 列表刷一下(my_role 变了)
      qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '转让失败'),
  })

  if (!open) return null

  const owner = data?.owner
  const collabs = data?.collaborators || []
  const collabUserIds = new Set(collabs.map(c => c.user_id))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[640px] max-h-[85vh] bg-white rounded-xl shadow-2xl border border-line flex flex-col"
      >
        {/* 顶栏 */}
        <div className="px-5 py-3 border-b border-line flex items-center gap-2">
          <Shield size={14} className="text-orange-600" />
          <h2 className="text-sm font-semibold text-ink flex-1">项目成员</h2>
          {!canManage && (
            <span className="text-[10.5px] inline-flex items-center gap-1 text-ink-muted bg-slate-50 px-2 py-0.5 rounded">
              <Eye size={10} /> 只读模式
            </span>
          )}
          <button onClick={onClose} className="p-1 rounded text-ink-muted hover:text-ink hover:bg-slate-50" title="关闭">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-4">
          {isLoading && (
            <div className="text-center py-8 text-ink-muted text-xs">加载中…</div>
          )}

          {/* Owner */}
          {owner && (
            <div>
              <div className="text-[11px] text-ink-muted mb-1.5">所有者</div>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/50">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700">
                  <Crown size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">{owner.full_name || owner.username || owner.user_id || '—'}</div>
                  <div className="text-[10.5px] text-ink-muted truncate">
                    {owner.email || (owner.username && owner.full_name ? owner.username : '')}
                  </div>
                </div>
                {owner.is_pm && (
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 bg-blue-50 text-blue-700 ring-blue-200" title="默认项目经理">
                    项目经理
                  </span>
                )}
                <span className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 bg-amber-50 text-amber-700 ring-amber-200">
                  Owner
                </span>
                {canTransferOwner && (
                  <button
                    onClick={() => setTransferOpen(true)}
                    className="text-[10.5px] inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
                    title="转让所有权 — 旧 owner 自动降为读写协作者"
                  >
                    <ArrowRightLeft size={10} />
                    转让
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 协作者列表 */}
          <div>
            <div className="text-[11px] text-ink-muted mb-1.5">协作者({collabs.length})</div>
            {collabs.length === 0 ? (
              <div className="text-xs text-ink-muted py-3 text-center border border-dashed border-line rounded-lg">
                还没有协作者{canManage ? ',下面搜用户加进来' : ''}
              </div>
            ) : (
              <div className="space-y-1">
                {collabs.map(c => (
                  <CollaboratorRow
                    key={c.id}
                    coll={c}
                    canManage={canManage}
                    onChangeRole={(role) => updateMut.mutate({ user_id: c.user_id, role })}
                    onChangeProjectMemberRole={(pr) => projectRoleMut.mutate({ user_id: c.user_id, project_role: pr })}
                    onRemove={() => {
                      if (window.confirm(`确认移除 ${c.username || c.user_id}?`)) {
                        removeMut.mutate(c.user_id)
                      }
                    }}
                    busy={updateMut.isPending || removeMut.isPending || projectRoleMut.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 搜索 + 添加(只在 canManage 时) */}
          {canManage && (
            <div className="pt-3 border-t border-line">
              <div className="text-[11px] text-ink-muted mb-1.5">添加协作者</div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="搜用户名 / 邮箱 / 姓名"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1.5 border border-line rounded-md focus:outline-none focus:border-orange-300"
                  />
                </div>
                <RoleSelect value={addingRole} onChange={setAddingRole} />
              </div>

              {searching && (
                <div className="mt-1.5 text-[10.5px] text-ink-muted inline-flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> 搜索中…
                </div>
              )}

              {results.length > 0 && (
                <div className="mt-2 border border-line rounded-md divide-y divide-line/60 max-h-[180px] overflow-y-auto">
                  {results.map(u => {
                    const already = collabUserIds.has(u.id)
                    const isOwner = owner?.user_id === u.id
                    return (
                      <button
                        key={u.id}
                        disabled={already || isOwner || pendingAdd === u.id}
                        onClick={() => {
                          setPendingAdd(u.id)
                          addMut.mutate({ user_id: u.id, role: addingRole })
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink truncate">
                            {u.full_name || u.username}
                          </div>
                          <div className="text-[10.5px] text-ink-muted truncate">
                            {u.username}{u.email ? ` · ${u.email}` : ''}
                          </div>
                        </div>
                        {isOwner ? (
                          <span className="text-[10px] text-amber-700">Owner</span>
                        ) : already ? (
                          <span className="text-[10px] text-ink-muted">已添加</span>
                        ) : pendingAdd === u.id ? (
                          <Loader2 size={11} className="animate-spin text-orange-600" />
                        ) : (
                          <Plus size={11} className="text-orange-600" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {error && (
                <div className="mt-2 text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1">
                  <AlertTriangle size={11} /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-line bg-slate-50/40 text-[10.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Shield size={10} />
            <strong>读写</strong> 协作者可改项目内容 + 加 / 移除其他协作者,但不能删项目;
            <strong className="ml-1">只读</strong> 仅可查看。
          </span>
        </div>
      </div>

      {/* 转让所有者子弹窗 */}
      {transferOpen && (
        <TransferOwnerSubModal
          owner={owner}
          collaborators={collabs}
          onClose={() => setTransferOpen(false)}
          onConfirm={(uid) => transferMut.mutate(uid)}
          busy={transferMut.isPending}
          error={transferMut.isError ? (transferMut.error as any)?.response?.data?.detail || '转让失败' : null}
        />
      )}
    </>
  )
}


function TransferOwnerSubModal({
  owner, collaborators, onClose, onConfirm, busy, error,
}: {
  owner?: { user_id: string | null; username: string | null; full_name: string | null } | null
  collaborators: ProjectCollaborator[]
  onClose: () => void
  onConfirm: (new_owner_user_id: string) => void
  busy: boolean
  error: string | null
}) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debRef = useRef<number | null>(null)

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    if (debRef.current) window.clearTimeout(debRef.current)
    debRef.current = window.setTimeout(async () => {
      setSearching(true)
      try { setSearchResults(await searchUsersForCollab(searchQuery.trim())) }
      catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 240)
    return () => { if (debRef.current) window.clearTimeout(debRef.current) }
  }, [searchQuery])

  const picked = pickedId
    ? collaborators.find(c => c.user_id === pickedId)
        || searchResults.find(u => u.id === pickedId)
    : null
  const pickedLabel = picked
    ? ('full_name' in picked ? (picked.full_name || picked.username) : '')
    : ''

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        className="fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[80vh] bg-white rounded-xl shadow-2xl border border-line flex flex-col"
      >
        <div className="px-5 py-3 border-b border-line flex items-center gap-2">
          <ArrowRightLeft size={14} className="text-amber-600" />
          <h2 className="text-sm font-semibold text-ink flex-1">转让项目所有权</h2>
          <button onClick={onClose} disabled={busy}
                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-slate-50 disabled:opacity-50">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
          {/* 警告 */}
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800 leading-relaxed">
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium mb-0.5">转让后会发生什么</div>
                <ul className="list-disc list-inside space-y-0.5 text-[11.5px]">
                  <li>新所有者获得项目全部权限(包括删除)</li>
                  <li>当前所有者自动降为「读写」协作者(不丢权限,但失去删项目能力)</li>
                  <li>新所有者若已是协作者,自动从协作者列表移除(避免身份重叠)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 当前 owner → 新 owner 候选区 */}
          {collaborators.length > 0 && (
            <div>
              <div className="text-[11px] text-ink-muted mb-1.5">从当前协作者中选一位接手</div>
              <div className="space-y-1">
                {collaborators.map(c => {
                  const sel = pickedId === c.user_id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPickedId(c.user_id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                        sel ? 'border-amber-400 bg-amber-50' : 'border-line hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-ink-secondary text-[11px]">
                        {(c.full_name || c.username || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate">{c.full_name || c.username}</div>
                        <div className="text-[10.5px] text-ink-muted truncate">
                          {c.username}{c.email ? ` · ${c.email}` : ''} · 当前角色 {c.role === 'read_write' ? '读写' : '只读'}
                        </div>
                      </div>
                      {sel && <Check size={14} className="text-amber-600" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 也支持搜任意活跃用户(即便不是协作者) */}
          <div>
            <div className="text-[11px] text-ink-muted mb-1.5">或搜其他用户(必须已是系统用户)</div>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                placeholder="搜用户名 / 邮箱 / 姓名"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-7 pr-2 py-1.5 border border-line rounded-md focus:outline-none focus:border-amber-300"
              />
            </div>
            {searching && (
              <div className="mt-1.5 text-[10.5px] text-ink-muted inline-flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> 搜索中…
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-1.5 border border-line rounded-md divide-y divide-line/60 max-h-[140px] overflow-y-auto">
                {searchResults.map(u => {
                  const isOwner = owner?.user_id === u.id
                  const sel = pickedId === u.id
                  return (
                    <button
                      key={u.id}
                      disabled={isOwner}
                      onClick={() => setPickedId(u.id)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${
                        sel ? 'bg-amber-50' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate">{u.full_name || u.username}</div>
                        <div className="text-[10.5px] text-ink-muted truncate">
                          {u.username}{u.email ? ` · ${u.email}` : ''}
                        </div>
                      </div>
                      {isOwner ? (
                        <span className="text-[10px] text-amber-700">当前 Owner</span>
                      ) : sel ? (
                        <Check size={12} className="text-amber-600" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-muted">
            {pickedId ? (
              <>将转让给:<strong className="text-ink">{pickedLabel}</strong></>
            ) : '请选择接手人'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded border border-line text-ink-secondary hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (!pickedId) return
                if (window.confirm('确认转让所有权?这一步不可撤销(需要新 owner 再转回来)。')) {
                  onConfirm(pickedId)
                }
              }}
              disabled={!pickedId || busy}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded font-medium text-white border border-amber-700 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <ArrowRightLeft size={11} />}
              {busy ? '转让中…' : '确认转让'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}


function CollaboratorRow({
  coll, canManage, onChangeRole, onChangeProjectMemberRole, onRemove, busy,
}: {
  coll: ProjectCollaborator
  canManage: boolean
  onChangeRole: (role: CollaboratorRole) => void
  onChangeProjectMemberRole: (pr: ProjectMemberRole | null) => void
  onRemove: () => void
  busy: boolean
}) {
  const meta = ROLE_BADGE[coll.role]
  const prLabel = PROJECT_ROLE_OPTIONS.find(o => o.value === (coll.project_role || ''))?.label
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line hover:bg-slate-50/60">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-ink-secondary text-[11px]">
        {(coll.full_name || coll.username || '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink truncate">{coll.full_name || coll.username || coll.user_id}</div>
        <div className="text-[10.5px] text-ink-muted truncate">
          {coll.username}{coll.email ? ` · ${coll.email}` : ''}
        </div>
      </div>
      {/* 项目角色分类(pm/顾问/客户)—— 与访问权限正交 */}
      {canManage ? (
        <select
          value={coll.project_role || ''}
          onChange={e => onChangeProjectMemberRole((e.target.value || null) as ProjectMemberRole | null)}
          disabled={busy}
          title="项目角色分类"
          className="text-[10.5px] px-1.5 py-0.5 rounded border border-line bg-white text-ink-secondary focus:outline-none focus:border-[#D96400]"
        >
          {PROJECT_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : coll.project_role ? (
        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200">{prLabel}</span>
      ) : null}
      {canManage ? (
        <RoleSelect value={coll.role} onChange={onChangeRole} compact />
      ) : (
        <span className={`text-[10.5px] px-1.5 py-0.5 rounded ring-1 ${meta.cls}`}>{meta.label}</span>
      )}
      {canManage && (
        <button
          onClick={onRemove}
          disabled={busy}
          className="p-1 rounded text-ink-muted hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
          title="移除协作者"
        >
          <UserMinus size={11} />
        </button>
      )}
    </div>
  )
}


function RoleSelect({
  value, onChange, compact,
}: {
  value: CollaboratorRole
  onChange: (v: CollaboratorRole) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const meta = ROLE_BADGE[value]
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 ${
          compact ? 'text-[10.5px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
        } rounded ring-1 ${meta.cls}`}
      >
        {meta.label}
        <ChevronDown size={9} className="opacity-70" />
      </button>
      {open && (
        // dropup:向上展开 — 避免被 modal overflow-y-auto 裁切(modal 底部时下拉看不见)
        <div className="absolute z-50 right-0 bottom-full mb-1 bg-white border border-line rounded shadow-lg py-1 min-w-[100px]">
          {(['read', 'read_write'] as const).map(r => (
            <button
              key={r}
              onClick={() => { onChange(r); setOpen(false) }}
              className={`w-full text-left px-2 py-1 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1 ${
                r === value ? 'font-semibold text-orange-700' : 'text-ink'
              }`}
            >
              {r === value && <Check size={9} />}
              {ROLE_BADGE[r].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
