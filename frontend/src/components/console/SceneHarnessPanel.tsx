import { useEffect, useState, useCallback } from 'react'
import { Target, GitPullRequest, Loader2, ChevronDown, CheckCircle2 } from 'lucide-react'
import { toast } from '../Toaster'
import {
  getSceneMatch, runSceneMatch, listProjectProposals, runSceneReflow, pmConfirmProposal,
  type HitReport, type SceneProposal,
} from '../../api/scenes'

/**
 * SceneHarnessPanel — Harness P3/P4 项目侧面板(两套项目详情页共用)。
 * - 场景命中(P3):对照标准场景库,显示命中/未命中数 + 命中报告。
 * - 蓝图回流(P4,仅 design 阶段):蓝图完成 → 识别优化/新增场景 → PM 确认 → 转后台审核。
 */
const STATUS_LABEL: Record<string, string> = {
  pm_pending: '待 PM 确认', admin_pending: '待后台审核', approved: '已通过', rejected: '已驳回',
}

export default function SceneHarnessPanel({
  projectId, stageKey, variant = 'light',
}: { projectId?: string; stageKey?: string; variant?: 'light' | 'dark' }) {
  const dark = variant === 'dark'
  const [hit, setHit] = useState<HitReport | null>(null)
  const [matching, setMatching] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [proposals, setProposals] = useState<SceneProposal[]>([])
  const [reflowing, setReflowing] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const isDesign = stageKey === 'design'

  const load = useCallback(async () => {
    if (!projectId) return
    getSceneMatch(projectId).then(setHit).catch(() => {})
    if (isDesign) listProjectProposals(projectId).then(setProposals).catch(() => {})
  }, [projectId, isDesign])
  useEffect(() => { load() }, [load])

  if (!projectId) return null

  const c = dark
    ? { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.12)', ink: '#E7EDF3', sub: 'rgba(200,214,226,0.7)',
        chipBg: 'rgba(255,255,255,0.06)' }
    : { bg: '#FFFFFF', bd: '#E7E1D8', ink: '#1F2937', sub: '#6B7280', chipBg: '#F6F8FA' }
  const box: React.CSSProperties = {
    background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, padding: '12px 14px',
  }

  const doMatch = async () => {
    setMatching(true)
    try {
      const r = await runSceneMatch(projectId)
      setHit(r)
      toast.success(`场景命中完成:命中 ${r.hit_count} · 未命中 ${r.miss_count}`)
    } catch { /* 拦截器已 toast */ } finally { setMatching(false) }
  }
  const doReflow = async () => {
    setReflowing(true)
    try {
      const rs = await runSceneReflow(projectId)
      setProposals(rs)
      toast.success(rs.length ? `识别到 ${rs.length} 条场景回流提案,请 PM 确认` : '未识别到需回流的场景变更')
    } catch { /* 拦截器已 toast */ } finally { setReflowing(false) }
  }
  const doPmConfirm = async (id: number) => {
    setBusyId(id)
    try {
      const p = await pmConfirmProposal(id)
      setProposals(prev => prev.map(x => x.id === id ? p : x))
      toast.success('已确认,转后台审核')
    } catch { /* 拦截器已 toast */ } finally { setBusyId(null) }
  }

  const btn = (onClick: () => void, busy: boolean, label: string, Icon: typeof Target): React.ReactNode => (
    <button type="button" onClick={onClick} disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        padding: '5px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: busy ? 'default' : 'pointer',
        background: 'linear-gradient(135deg,#FF8D1A,#D96400)', fontFamily: 'inherit',
      }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}{label}
    </button>
  )

  return (
    <div style={{ padding: dark ? '0 20px 8px' : '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 场景命中(P3) */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Target size={15} color={dark ? '#79C7B3' : '#1E6E5D'} />
          <span style={{ fontSize: 13, fontWeight: 650, color: c.ink }}>场景命中</span>
          {hit ? (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: dark ? '#79C7B3' : '#1E6E5D', fontWeight: 600 }}>命中 {hit.hit_count}</span>
              <span style={{ fontSize: 12, color: c.sub }}>未命中 {hit.miss_count}</span>
            </span>
          ) : <span style={{ fontSize: 12, color: c.sub }}>尚未运行</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {hit?.report_md && (
              <button type="button" onClick={() => setShowReport(s => !s)}
                style={{ fontSize: 12, color: c.sub, background: 'transparent', border: `1px solid ${c.bd}`,
                  borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                命中报告 <ChevronDown size={12} style={{ transform: showReport ? 'rotate(180deg)' : 'none' }} />
              </button>
            )}
            {btn(doMatch, matching, hit ? '重新运行' : '运行命中', Target)}
          </div>
        </div>
        {hit?.summary && <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>{hit.summary}</div>}
        {(hit?.sources?.length || 0) > 0 && (
          <div style={{ fontSize: 11, color: c.sub, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span>命中依据:</span>
            {hit!.sources!.map((sc, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 100,
                background: c.chipBg, border: `1px solid ${c.bd}`, color: c.ink,
              }} title={sc.name}>
                {sc.kind === 'scope' ? '📄' : '📦'} {sc.type}:{sc.name.length > 18 ? sc.name.slice(0, 18) + '…' : sc.name}
              </span>
            ))}
          </div>
        )}
        {showReport && hit?.report_md && (
          <pre style={{
            marginTop: 8, maxHeight: 300, overflow: 'auto', fontSize: 11.5, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', color: c.ink, background: c.chipBg, borderRadius: 8, padding: 10,
            fontFamily: 'inherit',
          }}>{hit.report_md}</pre>
        )}
      </div>

      {/* 蓝图回流(P4,仅方案设计阶段) */}
      {isDesign && (
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <GitPullRequest size={15} color={dark ? '#A695CE' : '#5E4F87'} />
            <span style={{ fontSize: 13, fontWeight: 650, color: c.ink }}>蓝图回流 · 场景库</span>
            <span style={{ fontSize: 11.5, color: c.sub }}>识别蓝图里的场景优化/新增,PM 确认后交后台审核回写</span>
            <div style={{ marginLeft: 'auto' }}>{btn(doReflow, reflowing, '蓝图完成·识别回流', GitPullRequest)}</div>
          </div>
          {proposals.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proposals.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                  background: c.chipBg, border: `1px solid ${c.bd}`,
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                    background: p.change_type === 'new' ? (dark ? 'rgba(84,188,161,.16)' : '#E3F0EC') : (dark ? 'rgba(214,165,72,.16)' : '#F7EDD8'),
                    color: p.change_type === 'new' ? (dark ? '#7FD9B6' : '#1E7A5E') : (dark ? '#F0C878' : '#8A5A10') }}>
                    {p.change_type === 'new' ? '新增' : '优化'}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: c.ink, fontWeight: 600 }}>
                      {p.scene_code ? `${p.scene_code} · ` : ''}{p.name}
                    </div>
                    {p.summary && <div style={{ fontSize: 11, color: c.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summary}</div>}
                  </div>
                  {p.status === 'pm_pending' ? (
                    <button type="button" onClick={() => doPmConfirm(p.id)} disabled={busyId === p.id}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: 'none',
                        color: '#fff', background: 'linear-gradient(135deg,#6B5C93,#5E4F87)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                      {busyId === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} PM 确认
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: c.sub }}>{STATUS_LABEL[p.status] || p.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
