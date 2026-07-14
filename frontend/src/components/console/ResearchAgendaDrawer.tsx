import { useEffect, useState } from 'react'
import { X, Loader2, ClipboardList, CheckCircle2, Circle, ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { getResearchAgenda, type ResearchAgenda, type AgendaDomain } from '../../api/scenes'

/**
 * ResearchAgendaDrawer — 项目调研议程(Part2)。
 * 应覆盖场景(按域/阶段)+ 每场景关键调研问题 + 覆盖状态(已识别/待调研)。
 * 跑过场景命中 → 聚焦活跃域并标出待调研缺口;未跑 → 列全部标准场景。
 */
export default function ResearchAgendaDrawer({
  projectId, variant = 'light', onClose,
}: { projectId: string; variant?: 'light' | 'dark'; onClose: () => void }) {
  const dark = variant === 'dark'
  const [data, setData] = useState<ResearchAgenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({})
  const [openScene, setOpenScene] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setLoading(true)
    getResearchAgenda(projectId)
      .then(d => {
        setData(d)
        // 活跃域默认展开
        const init: Record<string, boolean> = {}
        d.domains.forEach(dm => { if (dm.active) init[dm.domain] = true })
        // 一个都没有活跃 → 展开第一个,避免全折叠空白
        if (!Object.keys(init).length && d.domains[0]) init[d.domains[0].domain] = true
        setOpenDomains(init)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const c = dark
    ? { panel: '#1B2430', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)', ink: '#E7EDF3',
        sub: 'rgba(200,214,226,0.7)', chip: 'rgba(255,255,255,0.06)', head: '#141C26' }
    : { panel: '#FFFFFF', bg: '#FBFCFD', bd: '#E7E1D8', ink: '#1F2937', sub: '#6B7280', chip: '#F6F8FA', head: '#FFFFFF' }

  const covPct = data && data.total_scenes ? Math.round((data.covered_scenes / data.total_scenes) * 100) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} role="dialog" aria-modal="true">
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 640, height: '100%', background: c.panel,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', overflowY: 'auto', color: c.ink, fontFamily: 'inherit' }}>
        {/* 头 */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: c.head, borderBottom: `1px solid ${c.bd}`,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardList size={17} color={dark ? '#79C7B3' : '#1E6E5D'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>调研议程</div>
            <div style={{ fontSize: 11.5, color: c.sub }}>应覆盖场景 · 每个场景该向客户问清的关键问题</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.sub, padding: 4 }}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: c.sub }}>
            <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} /> 加载中…
          </div>
        ) : !data || data.domains.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: c.sub, fontSize: 13 }}>暂无可展示的场景。</div>
        ) : (
          <div style={{ padding: 16 }}>
            {/* 覆盖概览 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 14px',
              borderRadius: 10, background: c.bg, border: `1px solid ${c.bd}`, marginBottom: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                <b style={{ fontSize: 18, color: dark ? '#79C7B3' : '#1E6E5D' }}>{data.covered_scenes}</b>
                <span style={{ fontSize: 11.5, color: c.sub }}>已识别</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                <b style={{ fontSize: 16, color: dark ? '#F0C878' : '#8A5A10' }}>{data.total_scenes - data.covered_scenes}</b>
                <span style={{ fontSize: 11.5, color: c.sub }}>待调研</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: c.sub }}>共 {data.total_scenes} 场景 · 覆盖率</span>
                <b style={{ fontSize: 13 }}>{covPct}%</b>
              </span>
              <span style={{ width: 100, height: 6, borderRadius: 100, background: dark ? 'rgba(255,255,255,0.1)' : '#EEF1F4', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${covPct}%`, borderRadius: 100, background: 'linear-gradient(90deg,#1E6E5D,#54BCA1)' }} />
              </span>
            </div>

            {!data.has_match && (
              <div style={{ fontSize: 11.5, color: c.sub, background: dark ? 'rgba(214,165,72,0.1)' : '#FBF3E2',
                border: `1px solid ${dark ? 'rgba(214,165,72,0.3)' : '#F0DFBB'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                尚未运行场景命中,下面是全部标准场景。跑一次「场景命中」可聚焦到本项目活跃域,并把已识别 / 待调研缺口标出来。
              </div>
            )}

            {data.domains.map(dm => (
              <DomainBlock key={dm.domain} dm={dm} c={c} dark={dark}
                open={!!openDomains[dm.domain]} onToggle={() => setOpenDomains(s => ({ ...s, [dm.domain]: !s[dm.domain] }))}
                openScene={openScene} toggleScene={(id) => setOpenScene(s => ({ ...s, [id]: !s[id] }))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DomainBlock({ dm, c, dark, open, onToggle, openScene, toggleScene }: {
  dm: AgendaDomain
  c: Record<string, string>
  dark: boolean
  open: boolean
  onToggle: () => void
  openScene: Record<number, boolean>
  toggleScene: (id: number) => void
}) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${c.bd}`, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: c.bg, border: 'none', cursor: 'pointer', color: c.ink, fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{dm.domain}</span>
        <span style={{ fontSize: 11.5, color: c.sub }}>{dm.label}</span>
        {dm.active && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, color: dark ? '#7FD9B6' : '#1E7A5E',
            background: dark ? 'rgba(84,188,161,0.16)' : '#E6F4EE', border: `1px solid ${dark ? 'rgba(84,188,161,0.3)' : '#BFE2D3'}` }}>活跃域</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: c.sub }}>已识别 {dm.covered_count}/{dm.scene_count}</span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: c.sub }} />
      </button>
      {open && (
        <div style={{ padding: '4px 12px 12px' }}>
          {dm.stages.map((st, si) => (
            <div key={si} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginBottom: 6, paddingLeft: 2 }}>{st.stage_label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {st.scenes.map(sc => {
                  const opened = !!openScene[sc.id]
                  return (
                    <div key={sc.id} style={{ borderRadius: 8, background: c.chip, border: `1px solid ${c.bd}` }}>
                      <button onClick={() => sc.question_count && toggleScene(sc.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                          background: 'transparent', border: 'none', cursor: sc.question_count ? 'pointer' : 'default',
                          color: c.ink, fontFamily: 'inherit', textAlign: 'left' }}>
                        {sc.covered
                          ? <CheckCircle2 size={13} color={dark ? '#54BCA1' : '#1E7A5E'} style={{ flexShrink: 0 }} />
                          : <Circle size={13} color={dark ? '#F0C878' : '#C9962F'} style={{ flexShrink: 0 }} />}
                        <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 10.5, color: c.sub }}>{sc.code}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 550, minWidth: 0, flex: 1 }}>{sc.name}</span>
                        {sc.question_count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: c.sub, flexShrink: 0 }}>
                            <MessageCircleQuestion size={11} />{sc.question_count}
                            <ChevronDown size={12} style={{ transform: opened ? 'rotate(180deg)' : 'none' }} />
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: c.sub, flexShrink: 0 }}>无问题</span>
                        )}
                      </button>
                      {opened && sc.question_count > 0 && (
                        <ol style={{ margin: 0, padding: '0 12px 10px 34px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sc.questions.map((q, qi) => (
                            <li key={qi} style={{ fontSize: 12, color: c.ink, lineHeight: 1.55 }}>{q}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
