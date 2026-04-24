import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, ShieldOff, KeyRound, Trash2, Loader, Power, PowerOff, Copy, X, Plus, Pencil, Plug, PlugZap } from 'lucide-react'
import {
  listUsers, createUser, updateUser, resetUserPassword, deleteUser,
  type AuthUser,
} from '../../api/client'
import { useAuth } from '../../auth/AuthContext'

function formatTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }

// 所有可控模块
const ALL_MODULES = [
  { key: 'dashboard',  label: '总览' },
  { key: 'projects',   label: '项目库' },
  { key: 'documents',  label: '文档管理' },
  { key: 'chunks',     label: '知识库' },
  { key: 'qa',         label: '智能问答' },
  { key: 'review',     label: '审核队列' },
  { key: 'challenge',  label: '知识挑战' },
]

export default function UsersTab() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingModules, setEditingModules] = useState<AuthUser | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    refetchInterval: 30_000,
  })

  const handleErr = (e: unknown) => {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    setError(msg || (e as Error).message || '操作失败')
    setTimeout(() => setError(null), 4000)
  }

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateUser>[1] }) => updateUser(id, body),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: handleErr,
  })

  const resetMut = useMutation({
    mutationFn: ({ id }: { id: string; username: string }) => resetUserPassword(id),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      if (data.new_password) setResetResult({ username: vars.username, password: data.new_password })
    },
    onError: handleErr,
  })

  const deleteMut = useMutation({
    mutationFn: ({ id }: { id: string; username: string }) => deleteUser(id),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: handleErr,
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">用户管理</h2>
          <p className="text-xs text-gray-500 mt-0.5">仅管理员可见。可在此新建用户并控制模块访问权限。</p>
        </div>
        <div className="flex items-center gap-3">
          {users && <span className="text-sm text-gray-500">共 {users.length} 个用户</span>}
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg"
            style={gradientStyle}
          >
            <Plus size={14} /> 新增用户
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded border border-red-200 flex items-start justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700"><X size={14} /></button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">用户名</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">姓名</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">角色</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">状态</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">可访问模块</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">API权限</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">最近登录</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">加载中…</td></tr>
            )}
            {users?.map(u => {
              const isMe = u.id === me?.id
              const isPending = pendingId === u.id
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono text-gray-800 whitespace-nowrap">
                    {u.username}
                    {isMe && (
                      <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">我</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{u.full_name || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        <Shield size={11} /> 管理员
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">普通用户</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {u.is_active ? (
                      <span className="text-xs text-green-700">启用</span>
                    ) : (
                      <span className="text-xs text-gray-400">已禁用</span>
                    )}
                    {u.must_change_password && (
                      <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">需改密</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {u.allowed_modules == null ? (
                        <span className="text-xs text-gray-400">全部</span>
                      ) : u.allowed_modules.length === 0 ? (
                        <span className="text-xs text-red-400">无权限</span>
                      ) : (
                        u.allowed_modules.map(m => {
                          const mod = ALL_MODULES.find(x => x.key === m)
                          return (
                            <span key={m} className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">
                              {mod?.label ?? m}
                            </span>
                          )
                        })
                      )}
                      <button
                        title="编辑模块权限"
                        onClick={() => setEditingModules(u)}
                        className="ml-0.5 p-0.5 text-gray-400 hover:text-orange-500 transition-colors"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {u.api_enabled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        <PlugZap size={11} /> 已开启
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        <Plug size={11} /> 未授权
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatTime(u.last_login_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {isPending && <Loader size={13} className="animate-spin mr-1" style={{ color: 'var(--accent)' }} />}
                      <ActionButton
                        title={u.is_admin ? '取消管理员' : '设为管理员'}
                        disabled={(isMe && u.is_admin) || isPending}
                        onClick={() => patchMut.mutate({ id: u.id, body: { is_admin: !u.is_admin } })}
                      >
                        {u.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
                      </ActionButton>
                      <ActionButton
                        title={u.is_active ? '禁用账号' : '启用账号'}
                        disabled={isMe || isPending}
                        onClick={() => patchMut.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                      >
                        {u.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                      </ActionButton>
                      <ActionButton
                        title={u.api_enabled ? '撤销 API/MCP 权限' : '授予 API/MCP 权限'}
                        disabled={isPending}
                        onClick={() => patchMut.mutate({ id: u.id, body: { api_enabled: !u.api_enabled } })}
                      >
                        {u.api_enabled ? <PlugZap size={13} /> : <Plug size={13} />}
                      </ActionButton>
                      <ActionButton
                        title="重置密码（生成随机密码）"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm(`确认重置 ${u.username} 的密码？将生成一个随机密码并强制其下次登录改密。`))
                            resetMut.mutate({ id: u.id, username: u.username })
                        }}
                      >
                        <KeyRound size={13} />
                      </ActionButton>
                      <ActionButton
                        title="删除用户"
                        danger
                        disabled={isMe || isPending}
                        onClick={() => {
                          if (confirm(`确认删除 ${u.username}？此操作不可撤销。`))
                            deleteMut.mutate({ id: u.id, username: u.username })
                        }}
                      >
                        <Trash2 size={13} />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {resetResult && (
        <ResetResultModal
          username={resetResult.username}
          password={resetResult.password}
          onClose={() => setResetResult(null)}
        />
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(pwd) => {
            qc.invalidateQueries({ queryKey: ['users'] })
            if (pwd) setResetResult({ username: '新用户', password: pwd })
          }}
        />
      )}

      {editingModules && (
        <EditModulesModal
          user={editingModules}
          onClose={() => setEditingModules(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['users'] })
            setEditingModules(null)
          }}
        />
      )}
    </div>
  )
}

// ── 新增用户弹窗 ──────────────────────────────────────────────────────────────

function CreateUserModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (initialPassword: string | null) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [allModules, setAllModules] = useState(true)
  const [selectedModules, setSelectedModules] = useState<string[]>(ALL_MODULES.map(m => m.key))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleModule = (key: string) =>
    setSelectedModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const handleSubmit = async () => {
    if (!username.trim()) { setError('用户名不能为空'); return }
    setLoading(true); setError('')
    try {
      const result = await createUser({
        username: username.trim(),
        password: password || undefined,
        full_name: fullName || undefined,
        email: email || undefined,
        is_admin: isAdmin,
        allowed_modules: allModules ? null : selectedModules,
      })
      onCreated(result.initial_password ?? null)
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">新增用户</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <Field label="用户名 *">
            <input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="login_name"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400" />
          </Field>
          <Field label="初始密码（留空自动生成）">
            <input value={password} onChange={e => setPassword(e.target.value)}
              type="password" placeholder="留空则系统生成随机密码"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="姓名">
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="显示名称"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400" />
            </Field>
            <Field label="邮箱">
              <input value={email} onChange={e => setEmail(e.target.value)}
                placeholder="可选"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400" />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <input id="is-admin" type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)}
              className="rounded border-gray-300 accent-orange-500" />
            <label htmlFor="is-admin" className="text-sm text-gray-700">设为管理员（管理员自动拥有全部权限）</label>
          </div>

          {/* 模块权限 */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">可访问模块</p>
            <div className="flex items-center gap-2 mb-2">
              <input id="all-modules" type="checkbox" checked={allModules} onChange={e => setAllModules(e.target.checked)}
                className="rounded border-gray-300 accent-orange-500" />
              <label htmlFor="all-modules" className="text-sm text-gray-700">全部模块（不限制）</label>
            </div>
            {!allModules && (
              <div className="flex flex-wrap gap-2 pl-1">
                {ALL_MODULES.map(m => (
                  <button
                    key={m.key} type="button"
                    onClick={() => toggleModule(m.key)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${
                      selectedModules.includes(m.key)
                        ? 'text-white border-transparent'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                    style={selectedModules.includes(m.key) ? gradientStyle : {}}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            style={gradientStyle}>
            {loading && <Loader size={13} className="animate-spin" />}
            创建用户
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 编辑模块权限弹窗 ──────────────────────────────────────────────────────────

function EditModulesModal({
  user, onClose, onSaved,
}: {
  user: AuthUser; onClose: () => void; onSaved: () => void
}) {
  const [allModules, setAllModules] = useState(user.allowed_modules == null)
  const [selected, setSelected] = useState<string[]>(user.allowed_modules ?? ALL_MODULES.map(m => m.key))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggle = (key: string) =>
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const handleSave = async () => {
    setLoading(true); setError('')
    try {
      await updateUser(user.id, { allowed_modules: allModules ? null : selected })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">模块权限</h3>
            <p className="text-xs text-gray-500">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input id="edit-all" type="checkbox" checked={allModules} onChange={e => setAllModules(e.target.checked)}
            className="rounded border-gray-300 accent-orange-500" />
          <label htmlFor="edit-all" className="text-sm text-gray-700">全部模块（不限制）</label>
        </div>

        {!allModules && (
          <div className="flex flex-wrap gap-2">
            {ALL_MODULES.map(m => (
              <button
                key={m.key} type="button"
                onClick={() => toggle(m.key)}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  selected.includes(m.key)
                    ? 'text-white border-transparent'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
                style={selected.includes(m.key) ? gradientStyle : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">取消</button>
          <button onClick={handleSave} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            style={gradientStyle}>
            {loading && <Loader size={13} className="animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 通用小组件 ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

function ActionButton({
  title, onClick, disabled, danger, children,
}: {
  title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        disabled ? 'text-gray-300 cursor-not-allowed' :
        danger ? 'text-red-500 hover:bg-red-50' :
        'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

function ResetResultModal({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">密码已生成</h3>
        <p className="text-sm text-gray-500 mb-4">
          请将密码安全地告知 <strong className="text-gray-800">{username}</strong>。首次登录后必须修改密码。
        </p>
        <div className="flex items-center gap-2">
          <input
            value={password}
            readOnly
            className="flex-1 px-3 py-2 font-mono text-sm bg-gray-50 border border-gray-200 rounded"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(password)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="px-3 py-2 text-sm text-white rounded inline-flex items-center gap-1 transition-all"
            style={gradientStyle}
          >
            <Copy size={13} /> {copied ? '已复制' : '复制'}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded">关闭</button>
        </div>
      </div>
    </div>
  )
}
