import { useEffect, useState } from 'react'
import { Target, ChevronDown } from 'lucide-react'
import { getBundleCoverage, type BundleCoverage } from '../../api/scenes'

const DOMAIN_LABEL: Record<string, string> = {
  LTC: '线索到回款', MTL: '市场到线索', MCR: '客户关系', MPR: '伙伴关系', ITR: '问题到解决',
}

/**
 * SceneCoverageChip — 交付物的场景覆盖徽标(闭环②「让 scene-driven 有牙齿」)。
 * 挂在已生成的产物上:场景覆盖 M/N · 漏 K,点开看漏了哪些命中场景。
 * 无命中报告(applicable=false)不显示。variant 控深浅。
 */
export default function SceneCoverageChip({
  bundleId, variant = 'light',
}: { bundleId?: string; variant?: 'light' | 'dark' }) {
  const dark = variant === 'dark'
  const [cov, setCov] = useState<BundleCoverage | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setCov(null); setOpen(false)
    if (bundleId) getBundleCoverage(bundleId).then(setCov).catch(() => {})
  }, [bundleId])

  if (!cov || !cov.applicable || cov.total === 0) return null
  const missN = cov.missing.length
  const full = missN === 0
  const c = dark
    ? { sub: 'rgba(200,214,226,0.7)', bd: 'rgba(255,255,255,0.14)', chip: 'rgba(255,255,255,0.06)', ink: '#E7EDF3' }
    : { sub: '#6B7280', bd: '#E7E1D8', chip: '#F6F8FA', ink: '#1F2937' }
  const okCol = dark ? '#7FD9B6' : '#1E7A5E'
  const warnCol = dark ? '#F0C878' : '#8A5A10'

  const byDomain: Record<string, typeof cov.missing> = {}
  for (const m of cov.missing) (byDomain[m.domain] ||= []).push(m)

  return (
    <div style={{ padding: dark ? '0 20px' : '0 12px', marginTop: 4 }}>
      <button type="button" onClick={() => missN && setOpen(o => !o)}
        title="本交付物对项目应覆盖场景的覆盖情况"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '3px 10px', borderRadius: 100,
          background: c.chip, border: `1px solid ${c.bd}`, cursor: missN ? 'pointer' : 'default',
          color: full ? okCol : warnCol, fontFamily: 'inherit' }}>
        <Target size={12} />
        场景覆盖 {cov.covered}/{cov.total}
        {missN > 0 && <> · 漏 {missN}</>}
        {missN > 0 && <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />}
      </button>
      {open && missN > 0 && (
        <div style={{ marginTop: 6, borderRadius: 10, background: c.chip, border: `1px solid ${c.bd}`, padding: 10, maxWidth: 560 }}>
          <div style={{ fontSize: 11.5, color: c.sub, marginBottom: 8 }}>
            以下命中场景在本交付物里没体现,建议补上或确认不在本产物范围:
          </div>
          {Object.entries(byDomain).map(([dom, list]) => (
            <div key={dom} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginBottom: 4 }}>{dom} {DOMAIN_LABEL[dom] || ''} · 漏 {list.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {list.map(s => (
                  <span key={s.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 100,
                    background: dark ? 'rgba(214,165,72,0.14)' : '#FBF3E2', border: `1px solid ${dark ? 'rgba(214,165,72,0.3)' : '#F0DFBB'}`, color: warnCol }}>
                    <span style={{ fontFamily: 'var(--mono, monospace)', opacity: 0.8 }}>{s.code}</span>{s.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
