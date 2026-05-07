/**
 * 密码强度实时提示器 — 与后端 services/security/password_policy.py 规则一致。
 *
 * 5 项检查:长度 ≥ 10 / 大写 / 小写 / 数字 / 特殊字符 / 不等于用户名
 * 每条带 ✓ / · 状态;全部 ✓ 时整块变绿。
 */
import { Check, Minus } from 'lucide-react'

const SPECIALS_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~ ]/

export function evaluatePassword(pwd: string, username?: string) {
  return {
    length: pwd.length >= 10,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    special: SPECIALS_RE.test(pwd),
    notUsername: !username || pwd.toLowerCase() !== username.toLowerCase(),
  }
}

export function isPasswordValid(pwd: string, username?: string): boolean {
  const c = evaluatePassword(pwd, username)
  return c.length && c.upper && c.lower && c.digit && c.special && c.notUsername
}

interface Props {
  password: string
  username?: string
}

export default function PasswordStrength({ password, username }: Props) {
  if (!password) return null
  const c = evaluatePassword(password, username)
  const all =
    c.length && c.upper && c.lower && c.digit && c.special && c.notUsername

  const checks: { ok: boolean; label: string }[] = [
    { ok: c.length, label: '至少 10 位' },
    { ok: c.upper, label: '含大写字母' },
    { ok: c.lower, label: '含小写字母' },
    { ok: c.digit, label: '含数字' },
    { ok: c.special, label: '含特殊字符' },
    { ok: c.notUsername, label: '与用户名不同' },
  ]

  return (
    <div className={`mt-1.5 text-[11px] rounded px-2 py-1.5 border ${
      all ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
    }`}>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            {it.ok
              ? <Check size={11} className="text-emerald-600" />
              : <Minus size={11} className="text-slate-400" />}
            <span className={it.ok ? '' : 'text-slate-500'}>{it.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
