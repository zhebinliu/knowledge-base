import { AlertTriangle } from 'lucide-react'
import { toast } from '../Toaster'
import type { CuratedBundle } from '../../api/client'

/**
 * SoftWarnings — Harness P2 软闸警告(不阻塞,随产物持续显示)。
 *
 * 两套项目详情页(legacy / redesign)共用(到 `../../components/console/` 同路径)。
 * - SoftWarningChips:常驻在产物状态区的黄色警告条(读 bundle.soft_warnings)。
 * - toastSoftWarnings:生成触发后按软警告弹提示。
 * 只在内部工作台显示;对客公开分享页不引用本组件。
 */

type SoftWarning = { code: string; message: string }

/** 生成后按软警告逐条 toast(点生成即提示,允许继续)。 */
export function toastSoftWarnings(b?: Pick<CuratedBundle, 'soft_warnings'> | null) {
  (b?.soft_warnings || []).forEach(w => toast.info(`⚠ ${w.message}`))
}

export default function SoftWarningChips({
  bundle, variant = 'light',
}: { bundle?: Pick<CuratedBundle, 'soft_warnings'> | null; variant?: 'light' | 'dark' }) {
  const warns: SoftWarning[] = bundle?.soft_warnings || []
  if (!warns.length) return null
  const dark = variant === 'dark'
  const c = dark
    ? { bg: 'rgba(214,165,72,0.13)', bd: 'rgba(214,165,72,0.34)', fg: '#F0C878' }
    : { bg: '#FBF1DD', bd: '#EBD6A8', fg: '#8A5A10' }

  return (
    <div style={{ padding: dark ? '0 20px 8px' : '0 10px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {warns.map((w, i) => (
        <span key={w.code || i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 550,
          background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          {w.message}
        </span>
      ))}
    </div>
  )
}
