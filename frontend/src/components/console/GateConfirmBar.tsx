import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react'
import { listGates, confirmGate, reopenGate, type ProjectGate } from '../../api/client'
import { toast } from '../Toaster'

/**
 * GateConfirmBar — 项目人工确认闸门条(Harness P1)。
 *
 * 两套项目详情页(legacy `pages/console/` 与 redesign `redesign/console/`)共用同一组件
 * (两者到 `../../components/console/` 是同一路径)。variant 控制深/浅色。
 *
 * 闸门落位(阶段 → 闸门):
 *   - survey(需求调研)→ asis(As-Is 事实确认),确认后方可生成方案设计
 *   - design(方案设计)→ tobe(To-Be 方案定稿),确认后方可生成项目实施
 * 其他阶段不显示。
 */
const STAGE_TO_GATE: Record<string, string> = { survey: 'asis', design: 'tobe' }

export default function GateConfirmBar({
  projectId, stageKey, variant = 'light', compact = false, onConfirmed,
}: { projectId?: string; stageKey?: string; variant?: 'light' | 'dark'; compact?: boolean;
     onConfirmed?: (gateKey: string) => void }) {
  const gateKey = stageKey ? STAGE_TO_GATE[stageKey] : undefined
  const [gate, setGate] = useState<ProjectGate | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!projectId || !gateKey) { setGate(null); return }
    try {
      const gates = await listGates(projectId)
      setGate(gates.find(g => g.key === gateKey) ?? null)
    } catch { /* 拦截器已 toast */ }
  }, [projectId, gateKey])

  useEffect(() => { load() }, [load])

  if (!projectId || !gateKey || !gate) return null

  const dark = variant === 'dark'
  const confirmed = gate.status === 'confirmed'

  const onConfirm = async () => {
    setBusy(true)
    try {
      const g = await confirmGate(projectId, gateKey)
      setGate(g)
      toast.success(`已确认「${g.label}」`)
      onConfirmed?.(gateKey)   // 方案定稿(tobe)确认后,让上层触发蓝图回流识别
    } catch { /* 拦截器已 toast */ } finally { setBusy(false) }
  }
  const onReopen = async () => {
    setBusy(true)
    try { const g = await reopenGate(projectId, gateKey); setGate(g) }
    catch { /* 拦截器已 toast */ } finally { setBusy(false) }
  }

  const okC = dark
    ? { bg: 'rgba(46,160,120,0.14)', bd: 'rgba(80,190,150,0.35)', fg: '#7FD9B6', sub: 'rgba(190,220,208,0.75)' }
    : { bg: '#EAF6F0', bd: '#BFE2D3', fg: '#1E7A5E', sub: '#4A7A68' }
  const warnC = dark
    ? { bg: 'rgba(214,165,72,0.14)', bd: 'rgba(214,165,72,0.35)', fg: '#F0C878', sub: 'rgba(226,220,200,0.75)' }
    : { bg: '#FBF1DD', bd: '#EBD6A8', fg: '#8A5A10', sub: '#7A6636' }
  const c = confirmed ? okC : warnC

  // 紧凑模式:极简,一个按钮。放在「本阶段产物」行内
  if (compact) {
    const short = (gate.label || '').split(' ')[0] || gate.label   // To-Be / As-Is
    return confirmed ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: c.fg, fontWeight: 600 }} title={gate.desc}>
        <CheckCircle2 size={13} /> {short} 已确认
        <button type="button" onClick={onReopen} disabled={busy}
          style={{ fontSize: 10.5, color: c.sub, background: 'transparent', border: 'none', textDecoration: 'underline', cursor: busy ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit' }}>
          撤销
        </button>
      </span>
    ) : (() => {
      const ready = !gate.evidence_kind || !!gate.evidence_ready
      const hint = ready ? gate.desc : `请先生成「${gate.evidence_label}」再确认${short}`
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {gate.evidence_label && (
            <span style={{ fontSize: 10.5, color: ready ? c.sub : warnC.fg }} title={hint}>
              依据:{gate.evidence_label}{ready ? '' : ' · 未生成'}
            </span>
          )}
          <button type="button" onClick={onConfirm} disabled={busy || !ready} title={hint}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: (busy || !ready) ? 'default' : 'pointer', background: 'linear-gradient(135deg,#E0A43A,#C07A16)', opacity: ready ? 1 : 0.5, fontFamily: 'inherit' }}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : <ShieldAlert size={11} />} 确认 {short}
          </button>
        </span>
      )
    })()
  }

  return (
    <div style={{ padding: dark ? '0 20px 8px' : '0 10px 8px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 14px', borderRadius: 10,
        background: c.bg, border: `1px solid ${c.bd}`,
      }}>
        {confirmed ? <CheckCircle2 size={16} color={c.fg} style={{ flexShrink: 0 }} />
                   : <ShieldAlert size={16} color={c.fg} style={{ flexShrink: 0 }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: c.fg }}>
            {confirmed
              ? `${gate.label} · 已确认`
              : `${gate.label} · 待确认`}
          </div>
          <div style={{ fontSize: 11.5, color: c.sub, marginTop: 1 }}>
            {confirmed
              ? `确认人 ${gate.confirmed_by || '—'}${gate.confirmed_at ? ' · ' + new Date(gate.confirmed_at).toLocaleString('zh-CN') : ''}`
              : gate.desc}
            {!confirmed && gate.evidence_label && (
              <span style={{ marginLeft: 6, color: (!gate.evidence_kind || gate.evidence_ready) ? c.sub : warnC.fg }}>
                · 依据:{gate.evidence_title || gate.evidence_label}{gate.evidence_ready ? '(已就绪)' : '(未生成)'}
              </span>
            )}
          </div>
        </div>
        {confirmed ? (
          <button type="button" onClick={onReopen} disabled={busy}
            style={{
              flexShrink: 0, fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              border: `1px solid ${c.bd}`, background: 'transparent', color: c.sub, fontFamily: 'inherit',
            }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : '撤销确认'}
          </button>
        ) : (() => {
          const ready = !gate.evidence_kind || !!gate.evidence_ready
          return (
          <button type="button" onClick={onConfirm} disabled={busy || !ready}
            title={ready ? gate.desc : `请先生成「${gate.evidence_label}」`}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, padding: '6px 16px', borderRadius: 8, cursor: (busy || !ready) ? 'default' : 'pointer',
              border: 'none', color: '#fff', fontFamily: 'inherit', opacity: ready ? 1 : 0.5,
              background: 'linear-gradient(135deg,#E0A43A,#C07A16)',
            }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            一键确认
          </button>
          )
        })()}
      </div>
    </div>
  )
}
