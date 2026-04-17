import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, ShieldOff, KeyRound, Trash2, Loader, Power, PowerOff, Copy, X } from 'lucide-react'
import {
  listUsers, updateUser, resetUserPassword, deleteUser,
  type AuthUser,
} from '../../api/client'
import { useAuth } from '../../auth/AuthContext'

function formatTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function UsersTab() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      if (data.new_password) {
        setResetResult({ username: vars.username, password: data.new_password })
      }
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
          <p className="text-xs text-gray-500 mt-0.5">仅管理员可见。新用户可通过 /register 自助注册。</p>
        </div>
        {users && (
          <span className="text-sm text-gray-500">共 {users.length} 个用户</span>
        )}
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
              <th className="px-3 py-2 text-left">用户名</th>
              <th className="px-3 py-2 text-left">姓名</th>
              <th className="px-3 py-2 text-left">邮箱</th>
              <th className="px-3 py-2 text-left">角色</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">最近登录</th>
              <th className="px-3 py-2 text-right">操作</th>
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
                  <td className="px-3 py-2.5 font-mono text-gray-800">
                    {u.username}
                    {isMe && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">我</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{u.full_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{u.email || '—'}</td>
                  <td className="px-3 py-2.5">
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        <Shield size={11} /> 管理员
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">普通用户</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.is_active ? (
                      <span className="text-xs text-green-700">启用</span>
                    ) : (
                      <span className="text-xs text-gray-400">已禁用</span>
                    )}
                    {u.must_change_password && (
                      <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">需改密</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{formatTime(u.last_login_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {isPending && <Loader size={13} className="animate-spin text-blue-500 mr-1" />}
                      <ActionButton
                        title={u.is_admin ? '取消管理员' : '设为管理员'}
                        disabled={isMe && u.is_admin || isPending}
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
                        title="重置密码（生成随机密码）"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm(`确认重置 ${u.username} 的密码？将生成一个随机密码并强制其下次登录改密。`)) {
                            resetMut.mutate({ id: u.id, username: u.username })
                          }
                        }}
                      >
                        <KeyRound size={13} />
                      </ActionButton>
                      <ActionButton
                        title="删除用户"
                        danger
                        disabled={isMe || isPending}
                        onClick={() => {
                          if (confirm(`确认删除 ${u.username}？此操作不可撤销。`)) {
                            deleteMut.mutate({ id: u.id, username: u.username })
                          }
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
        <h3 className="text-lg font-semibold text-gray-900 mb-1">密码已重置</h3>
        <p className="text-sm text-gray-500 mb-4">
          请将新密码安全地告知 <strong className="text-gray-800">{username}</strong>。该用户首次登录后必须修改密码。
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
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
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
