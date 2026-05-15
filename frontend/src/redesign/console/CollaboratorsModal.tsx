/**
 * NewCollaboratorsModal — 项目成员管理(Liquid Glass)
 * 功能 100% 等价 — list / search / add / updateRole / remove / transferOwner
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Plus, Search, Loader2, Crown, Shield, Eye,
  Check, AlertTriangle, UserMinus, ChevronDown, ArrowRightLeft,
} from 'lucide-react'
import {
  listCollaborators, addCollaborator, updateCollaboratorRole, removeCollaborator,
  searchUsersForCollab, transferProjectOwner,
  type CollaboratorRole, type ProjectCollaborator, type UserSearchResult,
} from '../../api/client'

interface Props {
  open: boolean
  projectId: string
  myRole: 'owner' | 'read_write' | 'read' | 'admin'
  onClose: () => void
}

const ROLE_BADGE: Record<CollaboratorRole, { label: string; cls: string }> = {
  read:       { label: '只读', cls: 'is-gray' },
  read_write: { label: '读写', cls: 'is-green' },
}

export default function NewCollaboratorsModal({ open, projectId, myRole, onClose }: Props) {
  const qc = useQueryClient()
  const canManage = myRole === 'owner' || myRole === 'read_write' || myRole === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['project-collaborators', projectId],
    queryFn: () => listCollaborators(projectId),
    enabled: open,
  })

  const [transferOpen, setTransferOpen] = useState(false)
  const canTransferOwner = myRole === 'owner' || myRole === 'admin'

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
      try { const res = await searchUsersForCollab(query.trim()); setResults(res) }
      catch { setResults([]) }
      finally { setSearching(false) }
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
  const removeMut = useMutation({
    mutationFn: (user_id: string) => removeCollaborator(projectId, user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-collaborators', projectId] }),
  })
  const transferMut = useMutation({
    mutationFn: (new_owner_user_id: string) => transferProjectOwner(projectId, new_owner_user_id),
    onSuccess: () => {
      setTransferOpen(false)
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
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(15, 18, 36, 0.20)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />
      <div
        role="dialog"
        style={{
          position: 'fixed', left: '50%', top: '50%', zIndex: 50,
          transform: 'translate(-50%, -50%)',
          width: 640, maxHeight: '85vh',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25), inset 0 1px 0 rgba(255,255,255,0.10)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} color="var(--rd-accent-2)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd-text)', margin: 0, flex: 1 }}>项目成员</h2>
          {!canManage && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: 'var(--rd-text-3)',
              background: 'rgba(0,0,0,0.25)', padding: '1px 8px', borderRadius: 4,
            }}>
              <Eye size={10} /> 只读模式
            </span>
          )}
          <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }} title="关闭"><X size={13} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLoading && <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--rd-text-3)' }}>加载中…</div>}

          {/* Owner */}
          {owner && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 6 }}>所有者</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10,
                background: 'rgba(245, 158, 11, .08)',
                border: '1px solid rgba(245, 158, 11, .25)',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(245, 158, 11, .18)', color: '#FBBF24',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Crown size={12} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--rd-text)' }}>{owner.full_name || owner.username || owner.user_id || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {owner.email || (owner.username && owner.full_name ? owner.username : '')}
                  </div>
                </div>
                <span className="rd-badge is-orange">Owner</span>
                {canTransferOwner && (
                  <button
                    onClick={() => setTransferOpen(true)}
                    className="rd-btn"
                    style={{ fontSize: 12, padding: '4px 10px', color: '#FBBF24', borderColor: 'rgba(245, 158, 11, .35)' }}
                    title="转让所有权 — 旧 owner 自动降为读写协作者"
                  >
                    <ArrowRightLeft size={10} /> 转让
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 协作者 */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 6 }}>协作者({collabs.length})</div>
            {collabs.length === 0 ? (
              <div style={{
                fontSize: 12, color: 'var(--rd-text-3)', padding: '12px 0', textAlign: 'center',
                border: '1px dashed var(--rd-line)', borderRadius: 10,
              }}>
                还没有协作者{canManage ? ',下面搜用户加进来' : ''}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {collabs.map(c => (
                  <CollaboratorRow
                    key={c.id}
                    coll={c}
                    canManage={canManage}
                    onChangeRole={(role) => updateMut.mutate({ user_id: c.user_id, role })}
                    onRemove={() => {
                      if (window.confirm(`确认移除 ${c.username || c.user_id}?`)) removeMut.mutate(c.user_id)
                    }}
                    busy={updateMut.isPending || removeMut.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 搜索 + 添加 */}
          {canManage && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--rd-line)' }}>
              <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 6 }}>添加协作者</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--rd-text-3)' }} />
                  <input
                    type="text"
                    placeholder="搜用户名 / 邮箱 / 姓名"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="rd-input"
                    style={{ fontSize: 12, padding: '6px 10px 6px 28px' }}
                  />
                </div>
                <RoleSelect value={addingRole} onChange={setAddingRole} />
              </div>

              {searching && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--rd-text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Loader2 size={10} className="animate-spin" /> 搜索中…
                </div>
              )}

              {results.length > 0 && (
                <div style={{
                  marginTop: 8, borderRadius: 8,
                  border: '1px solid var(--rd-line)',
                  maxHeight: 180, overflowY: 'auto',
                  background: 'rgba(255,255,255,0.10)',
                }}>
                  {results.map((u, idx) => {
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
                        style={{
                          width: '100%', textAlign: 'left',
                          padding: '8px 12px',
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: 'transparent', border: 'none',
                          borderTop: idx > 0 ? '1px solid var(--rd-line)' : 'none',
                          cursor: (already || isOwner || pendingAdd === u.id) ? 'not-allowed' : 'pointer',
                          opacity: (already || isOwner) ? 0.5 : 1,
                          fontFamily: 'inherit',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => { if (!already && !isOwner) e.currentTarget.style.background = 'rgba(0,0,0,0.25)' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.full_name || u.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.username}{u.email ? ` · ${u.email}` : ''}
                          </div>
                        </div>
                        {isOwner ? <span style={{ fontSize: 12, color: '#FBBF24' }}>Owner</span>
                          : already ? <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>已添加</span>
                          : pendingAdd === u.id ? <Loader2 size={11} className="animate-spin" color="var(--rd-accent-2)" />
                          : <Plus size={11} color="var(--rd-accent-2)" />}
                      </button>
                    )
                  })}
                </div>
              )}

              {error && (
                <div style={{
                  marginTop: 8, padding: '4px 8px', borderRadius: 4,
                  fontSize: 12, color: '#FB7185',
                  background: 'rgba(220, 38, 38, .08)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <AlertTriangle size={11} /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--rd-line)',
          background: 'rgba(0,0,0,0.25)',
          fontSize: 12, color: 'var(--rd-text-3)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Shield size={10} />
            <strong>读写</strong> 协作者可改项目内容 + 加 / 移除其他协作者,但不能删项目;
            <strong style={{ marginLeft: 4 }}>只读</strong> 仅可查看。
          </span>
        </div>
      </div>

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

function CollaboratorRow({ coll, canManage, onChangeRole, onRemove, busy }: {
  coll: ProjectCollaborator; canManage: boolean
  onChangeRole: (role: CollaboratorRole) => void
  onRemove: () => void; busy: boolean
}) {
  const meta = ROLE_BADGE[coll.role]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 10,
      border: '1px solid var(--rd-line)',
      background: 'rgba(255,255,255,0.05)',
      transition: 'background .15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
    >
      <span style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(0,0,0,0.25)',
        color: 'var(--rd-text-2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600, flexShrink: 0,
      }}>{(coll.full_name || coll.username || '?').slice(0, 1).toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {coll.full_name || coll.username || coll.user_id}
        </div>
        <div style={{ fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {coll.username}{coll.email ? ` · ${coll.email}` : ''}
        </div>
      </div>
      {canManage ? <RoleSelect value={coll.role} onChange={onChangeRole} compact />
        : <span className={`rd-badge ${meta.cls}`}>{meta.label}</span>}
      {canManage && (
        <button
          onClick={onRemove} disabled={busy}
          className="rd-icon-btn"
          style={{ width: 26, height: 26, color: '#F87171' }}
          title="移除协作者"
        >
          <UserMinus size={11} />
        </button>
      )}
    </div>
  )
}

function RoleSelect({ value, onChange, compact }: {
  value: CollaboratorRole
  onChange: (v: CollaboratorRole) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const meta = ROLE_BADGE[value]
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`rd-badge ${meta.cls}`}
        style={{
          padding: compact ? '1px 8px' : '3px 10px',
          fontSize: compact ? 10.5 : 11,
          gap: 4, cursor: 'pointer', border: '1px solid',
        }}
      >
        {meta.label}
        <ChevronDown size={9} style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 50,
          minWidth: 110,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid var(--rd-line)', borderRadius: 6,
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.40)',
          padding: '4px 0',
        }}>
          {(['read', 'read_write'] as const).map(r => (
            <button
              key={r}
              onClick={() => { onChange(r); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '4px 10px',
                fontSize: 12, fontWeight: r === value ? 600 : 400,
                color: r === value ? 'var(--rd-accent-2)' : 'var(--rd-text)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {r === value && <Check size={9} />} {ROLE_BADGE[r].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TransferOwnerSubModal({ owner, collaborators, onClose, onConfirm, busy, error }: {
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
    ? collaborators.find(c => c.user_id === pickedId) || searchResults.find(u => u.id === pickedId)
    : null
  const pickedLabel = picked ? ('full_name' in picked ? (picked.full_name || picked.username) : '') : ''

  return (
    <>
      <div
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        style={{
          position: 'fixed', left: '50%', top: '50%', zIndex: 61,
          transform: 'translate(-50%, -50%)',
          width: 520, maxHeight: '80vh', borderRadius: 16,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowRightLeft size={14} color="#D97706" />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd-text)', margin: 0, flex: 1 }}>转让项目所有权</h2>
          <button onClick={onClose} disabled={busy} className="rd-icon-btn" style={{ width: 28, height: 28 }}><X size={13} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(245, 158, 11, .08)',
            border: '1px solid rgba(245, 158, 11, .25)',
            fontSize: 12, color: '#FBBF24', lineHeight: 1.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>转让后会发生什么</div>
                <ul style={{ listStyle: 'disc', listStylePosition: 'inside', padding: 0, margin: 0, fontSize: 12 }}>
                  <li>新所有者获得项目全部权限(包括删除)</li>
                  <li>当前所有者自动降为「读写」协作者(不丢权限,但失去删项目能力)</li>
                  <li>新所有者若已是协作者,自动从协作者列表移除(避免身份重叠)</li>
                </ul>
              </div>
            </div>
          </div>

          {collaborators.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 6 }}>从当前协作者中选一位接手</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {collaborators.map(c => {
                  const sel = pickedId === c.user_id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPickedId(c.user_id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 10,
                        border: `1px solid ${sel ? 'rgba(245, 158, 11, .4)' : 'var(--rd-line)'}`,
                        background: sel ? 'rgba(245, 158, 11, .08)' : 'transparent',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(0,0,0,0.25)' }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.25)', color: 'var(--rd-text-2)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600,
                      }}>{(c.full_name || c.username || '?').slice(0, 1).toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.full_name || c.username}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.username}{c.email ? ` · ${c.email}` : ''} · 当前角色 {c.role === 'read_write' ? '读写' : '只读'}
                        </div>
                      </div>
                      {sel && <Check size={14} color="#D97706" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginBottom: 6 }}>或搜其他用户(必须已是系统用户)</div>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--rd-text-3)' }} />
              <input
                type="text"
                placeholder="搜用户名 / 邮箱 / 姓名"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="rd-input"
                style={{ fontSize: 12, padding: '6px 10px 6px 28px' }}
              />
            </div>
            {searching && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--rd-text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={10} className="animate-spin" /> 搜索中…
              </div>
            )}
            {searchResults.length > 0 && (
              <div style={{
                marginTop: 6, borderRadius: 8,
                border: '1px solid var(--rd-line)',
                maxHeight: 140, overflowY: 'auto',
              }}>
                {searchResults.map((u, idx) => {
                  const isOwner = owner?.user_id === u.id
                  const sel = pickedId === u.id
                  return (
                    <button
                      key={u.id}
                      disabled={isOwner}
                      onClick={() => setPickedId(u.id)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '6px 12px',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: sel ? 'rgba(245, 158, 11, .08)' : 'transparent',
                        border: 'none',
                        borderTop: idx > 0 ? '1px solid var(--rd-line)' : 'none',
                        cursor: isOwner ? 'not-allowed' : 'pointer', opacity: isOwner ? 0.4 : 1,
                        fontFamily: 'inherit', transition: 'background .15s',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.full_name || u.username}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.username}{u.email ? ` · ${u.email}` : ''}
                        </div>
                      </div>
                      {isOwner ? <span style={{ fontSize: 12, color: '#FBBF24' }}>当前 Owner</span>
                        : sel ? <Check size={12} color="#D97706" /> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: '4px 8px', borderRadius: 4,
              fontSize: 12, color: '#FB7185',
              background: 'rgba(220, 38, 38, .08)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>
            {pickedId ? <>将转让给:<strong style={{ color: 'var(--rd-text)' }}>{pickedLabel}</strong></> : '请选择接手人'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} disabled={busy} className="rd-btn" style={{ fontSize: 12, padding: '6px 14px' }}>取消</button>
            <button
              onClick={() => {
                if (!pickedId) return
                if (window.confirm('确认转让所有权?这一步不可撤销(需要新 owner 再转回来)。')) onConfirm(pickedId)
              }}
              disabled={!pickedId || busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, padding: '6px 14px', borderRadius: 8, fontWeight: 600,
                color: '#fff', background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                border: '1px solid #FCD34D',
                cursor: (!pickedId || busy) ? 'not-allowed' : 'pointer',
                opacity: (!pickedId || busy) ? 0.5 : 1,
                fontFamily: 'inherit',
                boxShadow: '0 4px 12px -2px rgba(217, 119, 6, .45)',
              }}
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
