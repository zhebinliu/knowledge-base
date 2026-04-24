import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // next 由 RequireAuth 带来。若没 next，按角色分流：console_user → /console，admin → /
  const next = params.get('next')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const u = await login(username.trim(), password)
      if (u.must_change_password) {
        navigate('/change-password', { replace: true })
      } else if (next) {
        navigate(next, { replace: true })
      } else {
        const defaultRoute = (u.role === 'admin' || u.is_admin) ? '/' : '/console'
        navigate(defaultRoute, { replace: true })
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 leading-tight">实施知识</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>综合管理平台</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-gray-900 mb-1">登录</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>使用账号密码登录系统</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">用户名</label>
            <input
              type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm transition-all"
              style={{ background: 'var(--bg)' }}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">密码</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm transition-all"
              style={{ background: 'var(--bg)' }}
              placeholder="请输入密码"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit" disabled={submitting || !username || !password}
            className="auth-action-primary mt-2"
          >
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-xs text-center mt-5" style={{ color: 'var(--text-muted)' }}>
          还没有账号？
          <Link to="/register" className="font-medium hover:underline" style={{ color: 'var(--accent-deep)' }}>
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}
