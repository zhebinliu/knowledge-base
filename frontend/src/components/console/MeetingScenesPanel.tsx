import { useEffect, useState, useCallback } from 'react'
import { Target, Loader2, CheckCircle2, MinusCircle, Sparkles } from 'lucide-react'
import { toast } from '../Toaster'
import { getMeetingScenes, detectMeetingScenes, type MeetingScenes, type MeetingScene } from '../../api/meetingScenes'

const DOMAIN_LABEL: Record<string, string> = {
  LTC: '线索到回款', MTL: '市场到线索', MCR: '客户关系', MPR: '伙伴关系', ITR: '问题到解决',
}

/**
 * MeetingScenesPanel — 会议详情里的「本场涉及场景」(闭环③)。
 * 逐场判定的场景增量:纳入(in_scope)/ 移出(out_of_scope)。未识别时给按钮现跑。
 * 独立组件,嵌进两套会议详情页(legacy + redesign),variant 控深浅色。
 */
export default function MeetingScenesPanel({
  meetingId, variant = 'light',
}: { meetingId: number; variant?: 'light' | 'dark' }) {
  const dark = variant === 'dark'
  const [data, setData] = useState<MeetingScenes | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getMeetingScenes(meetingId).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [meetingId])
  useEffect(() => { load() }, [load])

  const detect = async () => {
    setBusy(true)
    try {
      const r = await detectMeetingScenes(meetingId)
      setData(r)
      const n = r.in_scope.length + r.out_of_scope.length
      toast.success(n ? `识别到 ${r.in_scope.length} 个纳入 / ${r.out_of_scope.length} 个移出场景` : '本场未识别到明确涉及的标准场景')
    } catch { /* 拦截器已 toast */ } finally { setBusy(false) }
  }

  const c = dark
    ? { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.12)', ink: '#E7EDF3', sub: 'rgba(200,214,226,0.7)' }
    : { bg: '#FFFFFF', bd: '#E7E1D8', ink: '#1F2937', sub: '#6B7280' }
  const box: React.CSSProperties = { background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, padding: '12px 14px' }

  const pill = (s: MeetingScene, kind: 'in' | 'out') => {
    const col = kind === 'in'
      ? { bg: dark ? 'rgba(84,188,161,0.14)' : '#E6F4EE', bd: dark ? 'rgba(84,188,161,0.3)' : '#BFE2D3', fg: dark ? '#7FD9B6' : '#1E7A5E' }
      : { bg: dark ? 'rgba(220,120,120,0.14)' : '#FBEAEA', bd: dark ? 'rgba(220,120,120,0.3)' : '#F0C9C9', fg: dark ? '#E8A0A0' : '#B04A4A' }
    return (
      <span key={`${kind}-${s.domain}-${s.code}`} title={`${DOMAIN_LABEL[s.domain] || s.domain}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 100,
          background: col.bg, border: `1px solid ${col.bd}`, color: col.fg }}>
        {kind === 'in' ? <CheckCircle2 size={11} /> : <MinusCircle size={11} />}
        <span style={{ fontFamily: 'var(--mono, monospace)', opacity: 0.8 }}>{s.code}</span>{s.name}
      </span>
    )
  }

  const btn = (label: string) => (
    <button type="button" onClick={detect} disabled={busy}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '5px 12px',
        borderRadius: 8, border: 'none', color: '#fff', cursor: busy ? 'default' : 'pointer',
        background: 'linear-gradient(135deg,#FF8D1A,#D96400)', fontFamily: 'inherit' }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{label}
    </button>
  )

  return (
    <div style={{ ...box, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Target size={15} color={dark ? '#79C7B3' : '#1E6E5D'} />
        <span style={{ fontSize: 13, fontWeight: 650, color: c.ink }}>本场涉及场景</span>
        <span style={{ fontSize: 11, color: c.sub }}>对照标准场景库,本场明确纳入 / 移出的场景</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {data?.detected && data.stale && (
            <span style={{ fontSize: 10.5, color: dark ? '#F0C878' : '#8A5A10' }}>纪要已更新,建议重识别</span>
          )}
          {data?.detected && btn('重新识别')}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: c.sub, marginTop: 10 }}><Loader2 size={12} className="animate-spin" style={{ display: 'inline' }} /> 加载中…</div>
      ) : !data?.detected ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: c.sub }}>尚未识别本场涉及的标准场景。</span>
          {btn('识别本场场景')}
        </div>
      ) : (data.in_scope.length + data.out_of_scope.length) === 0 ? (
        <div style={{ fontSize: 12, color: c.sub, marginTop: 10 }}>本场未识别到明确涉及的标准场景。</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.in_scope.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: c.sub, marginBottom: 6 }}>纳入 · {data.in_scope.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{data.in_scope.map(s => pill(s, 'in'))}</div>
            </div>
          )}
          {data.out_of_scope.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: c.sub, marginBottom: 6 }}>移出 / 取消 · {data.out_of_scope.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{data.out_of_scope.map(s => pill(s, 'out'))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
