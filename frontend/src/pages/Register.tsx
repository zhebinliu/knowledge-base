import { useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import CaptchaInput, { type CaptchaInputRef } from '../components/auth/CaptchaInput'
import PasswordStrength, { isPasswordValid } from '../components/auth/PasswordStrength'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState(() => (searchParams.get('invite_code') || '').toUpperCase())
  const [captcha, setCaptcha] = useState({ captcha_id: '', captcha_answer: '' })
  const captchaRef = useRef<CaptchaInputRef>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('两次密码不一致')
      return
    }
    if (!isPasswordValid(password, username)) {
      setError('密码不符合复杂度要求(见下方提示)')
      return
    }
    if (!inviteCode.trim()) {
      setError('请填写邀请码')
      return
    }
    if (!captcha.captcha_answer) {
      setError('请填写验证码')
      return
    }
    setSubmitting(true)
    try {
      await register({
        username: username.trim(),
        password,
        full_name: fullName.trim() || undefined,
        email: email.trim() || undefined,
        invite_code: inviteCode.trim().toUpperCase(),
        captcha_id: captcha.captcha_id,
        captcha_answer: captcha.captcha_answer,
      })
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? '注册失败')
      // 失败后刷新验证码 — 后端已消费这次
      captchaRef.current?.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8">
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
        <p className="text-sm text-gray-500 mb-5">需要管理员发的邀请码才能创建账号</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="邀请码 *" value={inviteCode} onChange={(v) => setInviteCode(v.toUpperCase())} placeholder="向管理员索要(16 位字符)" />
          <Field label="用户名 *" value={username} onChange={setUsername} placeholder="字母/数字/下划线，至少 3 位" />
          <Field label="姓名" value={fullName} onChange={setFullName} placeholder="可选" />
          <Field label="邮箱" value={email} onChange={setEmail} placeholder="可选" />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">密码 *</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="至少 10 位 + 大小写 + 数字 + 特殊字符"
            />
            <PasswordStrength password={password} username={username} />
          </div>
          <Field label="确认密码 *" type="password" value={confirm} onChange={setConfirm} />
          <CaptchaInput ref={captchaRef} onChange={setCaptcha} />
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !username || !password || !inviteCode.trim() || !captcha.captcha_answer}
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
