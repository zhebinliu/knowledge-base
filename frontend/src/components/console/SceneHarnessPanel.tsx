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
const DOMAIN_LABEL: Record<string, string> = {
  LTC: '线索到回款', MTL: '市场到线索', MCR: '客户关系', MPR: '伙伴关系', ITR: '问题到解决',
}
const DOMAIN_ORDER = ['LTC', 'MTL', 'MCR', 'MPR', 'ITR']

// 按域分组场景
function groupByDomain(items: { domain: string; code: string; name: string }[]) {
  const m: Record<string, { code: string; name: string }[]> = {}
  for (const it of items) (m[it.domain] ||= []).push({ code: it.code, name: it.name })
  const keys = Object.keys(m).sort((a, b) => {
    const ia = DOMAIN_ORDER.indexOf(a), ib = DOMAIN_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return keys.map(d => ({ domain: d, scenes: m[d] }))
}

export default function SceneHarnessPanel({
  projectId, stageKey, variant = 'light', section = 'all', reflowSignal = 0,
}: { projectId?: string; stageKey?: string; variant?: 'light' | 'dark'; section?: 'match' | 'reflow' | 'all';
     reflowSignal?: number }) {
  const dark = variant === 'dark'
  const [hit, setHit] = useState<HitReport | null>(null)
  const [matching, setMatching] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [proposals, setProposals] = useState<SceneProposal[]>([])
  const [reflowing, setReflowing] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const isDesign = stageKey === 'design'

  const showMatch = section === 'match' || section === 'all'
  const showReflow = (section === 'reflow' || section === 'all') && isDesign

  const load = useCallback(async () => {
    if (!projectId) return
    if (showMatch) getSceneMatch(projectId).then(setHit).catch(() => {})
    if (showReflow) listProjectProposals(projectId).then(setProposals).catch(() => {})
  }, [projectId, showMatch, showReflow])
  useEffect(() => { load() }, [load])

  const doReflow = useCallback(async (auto = false) => {
    if (!projectId) return
    setReflowing(true)
    if (auto) toast.info('已放行实施,正在识别蓝图回流场景…')
    try {
      const rs = await runSceneReflow(projectId)
      setProposals(rs)
      if (rs.length) toast.success(`识别到 ${rs.length} 条场景回流提案,请 PM 确认`)
      else if (!auto) toast.success('未识别到需回流的场景变更')
    } catch { /* 拦截器已 toast */ } finally { setReflowing(false) }
  }, [projectId])

  useEffect(() => {
    if (reflowSignal > 0 && showReflow) doReflow(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflowSignal])

  if (!projectId || (!showMatch && !showReflow)) return null

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
      {showMatch && (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
              borderRadius: 8, background: dark ? 'rgba(84,188,161,0.16)' : '#E3F0EC' }}>
              <Target size={15} color={dark ? '#79C7B3' : '#1E6E5D'} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 650, color: c.ink }}>场景命中</span>
          </span>
          {hit ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 750, color: dark ? '#79C7B3' : '#1E6E5D', fontVariantNumeric: 'tabular-nums' }}>{hit.hit_count}</span>
                <span style={{ fontSize: 11, color: c.sub }}>命中</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 650, color: c.sub, fontVariantNumeric: 'tabular-nums' }}>{hit.miss_count}</span>
                <span style={{ fontSize: 11, color: c.sub }}>未命中</span>
              </span>
              {/* 覆盖条 */}
              <span style={{ width: 90, height: 6, borderRadius: 100, background: dark ? 'rgba(255,255,255,0.1)' : '#EEF1F4', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 100,
                  width: `${Math.round((hit.hit_count / Math.max(1, hit.hit_count + hit.miss_count)) * 100)}%`,
                  background: 'linear-gradient(90deg,#1E6E5D,#54BCA1)' }} />
              </span>
            </span>
          ) : <span style={{ fontSize: 12, color: c.sub }}>尚未运行 —— 对照标准场景库判定项目覆盖了哪些场景</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {hit && (
              <button type="button" onClick={() => setShowReport(s => !s)}
                style={{ fontSize: 12, color: c.sub, background: 'transparent', border: `1px solid ${c.bd}`,
                  borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                命中报告 <ChevronDown size={12} style={{ transform: showReport ? 'rotate(180deg)' : 'none' }} />
              </button>
            )}
            {btn(doMatch, matching, hit ? '重新运行' : '运行命中', Target)}
          </div>
        </div>
        {hit?.summary && <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8, lineHeight: 1.6 }}>{hit.summary}</div>}
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
        {showReport && hit && (
          <div style={{ marginTop: 10, maxHeight: 420, overflow: 'auto', borderRadius: 10,
            background: c.chipBg, border: `1px solid ${c.bd}`, padding: 12 }}>
            {/* 覆盖率概览 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: c.ink }}>覆盖情况</span>
              <span style={{ fontSize: 11.5, color: dark ? '#7FD9B6' : '#1E7A5E' }}>
                命中 <b>{hit.hit_count}</b>
              </span>
              <span style={{ fontSize: 11.5, color: c.sub }}>未命中 <b>{hit.miss_count}</b></span>
              <span style={{ fontSize: 11.5, color: c.sub }}>
                覆盖率 <b style={{ color: c.ink }}>{Math.round((hit.hit_count / Math.max(1, hit.hit_count + hit.miss_count)) * 100)}%</b>
              </span>
            </div>

            {/* 命中场景 —— 按域分组 */}
            {groupByDomain(hit.hits || []).map(g => (
              <div key={g.domain} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: dark ? '#54BCA1' : '#1E6E5D' }} />
                  <span style={{ fontSize: 12, fontWeight: 650, color: c.ink }}>{g.domain}</span>
                  <span style={{ fontSize: 11, color: c.sub }}>{DOMAIN_LABEL[g.domain] || ''} · 命中 {g.scenes.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.scenes.map(s => (
                    <span key={s.code} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 100,
                      background: dark ? 'rgba(84,188,161,0.14)' : '#E6F4EE',
                      border: `1px solid ${dark ? 'rgba(84,188,161,0.3)' : '#BFE2D3'}`,
                      color: dark ? '#7FD9B6' : '#1E7A5E',
                    }}>
                      <CheckCircle2 size={11} />
                      <span style={{ fontFamily: 'var(--mono, monospace)', opacity: 0.8 }}>{s.code}</span>
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {(hit.hits?.length || 0) === 0 && (
              <div style={{ fontSize: 11.5, color: c.sub, marginBottom: 12 }}>暂无命中场景。</div>
            )}

            {/* 未命中 —— 域分布(收敛,不逐条列 100+ 个) */}
            {(hit.misses?.length || 0) > 0 && (
              <div style={{ borderTop: `1px dashed ${c.bd}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 650, color: c.ink, marginBottom: 6 }}>
                  未命中 {hit.miss_count} 个 · 域分布
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {groupByDomain(hit.misses || []).map(g => (
                    <span key={g.domain} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100,
                      background: dark ? 'rgba(255,255,255,0.05)' : '#F1F3F5', color: c.sub, border: `1px solid ${c.bd}` }}>
                      {g.domain} {DOMAIN_LABEL[g.domain] || ''} · {g.scenes.length}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* 蓝图回流(P4,仅方案设计阶段)—— 定稿时自动识别;无提案时只留一个不起眼的手动兜底链接 */}
      {showReflow && proposals.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {reflowing ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.sub, fontFamily: 'inherit' }}>
              <Loader2 size={11} className="animate-spin" /> 正在识别蓝图回流场景…
            </span>
          ) : (
            <button type="button" onClick={() => doReflow()}
              title="通常在「确认方案定稿」时自动识别;这里可手动补跑一次"
              style={{ fontSize: 11, color: c.sub, background: 'transparent', border: 'none',
                textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              手动识别蓝图回流
            </button>
          )}
        </div>
      )}
      {showReflow && proposals.length > 0 && (
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitPullRequest size={14} color={dark ? '#A695CE' : '#5E4F87'} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: c.ink }}>蓝图回流提案 · {proposals.length}</span>
            <button type="button" onClick={() => doReflow()} disabled={reflowing}
              style={{ marginLeft: 'auto', fontSize: 11, color: c.sub, background: 'transparent', border: 'none',
                textDecoration: 'underline', cursor: reflowing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {reflowing ? '识别中…' : '重新识别'}
            </button>
          </div>
          {(
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
