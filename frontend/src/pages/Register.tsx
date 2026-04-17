import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('两次密码不一致')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setSubmitting(true)
    try {
      await register({
        username: username.trim(),
        password,
        full_name: fullName.trim() || undefined,
        email: email.trim() || undefined,
      })
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <BookOpen size={18} className="text-white" />
          </div>
          <div>
            <p className="text-gray-900 text-base font-bold leading-tight">实施知识</p>
            <p className="text-gray-500 text-xs leading-tight">综合管理平台</p>
          </div>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">注册账号</h1>
        <p className="text-sm text-gray-500 mb-5">创建一个新的实施团队账号</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="用户名 *" value={username} onChange={setUsername} placeholder="字母/数字/下划线，至少 3 位" />
          <Field label="姓名" value={fullName} onChange={setFullName} placeholder="可选，显示在头像旁" />
          <Field label="邮箱" value={email} onChange={setEmail} placeholder="可选" />
          <Field label="密码 *" type="password" value={password} onChange={setPassword} placeholder="至少 6 位" />
          <Field label="确认密码 *" type="password" value={confirm} onChange={setConfirm} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={submitting || !username || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition"
          >
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          已有账号？<Link to="/login" className="text-blue-600 hover:underline">去登录</Link>
        </p>
      </div>
    </div>
  )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{props.label}</label>
      <input
        type={props.type ?? 'text'} value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={props.placeholder}
      />
    </div>
  )
}
