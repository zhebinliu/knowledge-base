import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { changePassword } from '../api/client'

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const forced = !!user?.must_change_password

  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [ok, setOk] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setOk(false)
    if (newPwd !== confirm) { setError('两次密码不一致'); return }
    if (newPwd.length < 6) { setError('新密码至少 6 位'); return }
    setSubmitting(true)
    try {
      await changePassword({ old_password: forced ? undefined : oldPwd, new_password: newPwd })
      await refresh()
      setOk(true)
      setTimeout(() => navigate('/', { replace: true }), 800)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? '修改失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm p-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          {forced ? '首次登录：请设置新密码' : '修改密码'}
        </h1>
        <p className="text-sm text-gray-500 mb-5">
          {forced ? '系统要求首次登录后必须修改初始密码' : `当前账号：${user?.username}`}
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          {!forced && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">当前密码</label>
              <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">新密码</label>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">确认新密码</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="text-sm text-green-600">已修改，正在跳转...</p>}
          <button type="submit" disabled={submitting || !newPwd}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition">
            {submitting ? '提交中...' : '提交'}
          </button>
          {!forced && (
            <button type="button" onClick={() => navigate(-1)} className="w-full text-xs text-gray-500 hover:text-gray-700">
              取消
            </button>
          )}
          {forced && (
            <button type="button" onClick={logout} className="w-full text-xs text-gray-500 hover:text-gray-700">
              退出登录
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
