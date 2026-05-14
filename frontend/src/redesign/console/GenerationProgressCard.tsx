/**
 * GenerationProgressCard — Liquid Glass 版
 * 逻辑与生产版 frontend/src/components/console/GenerationProgressCard.tsx 一致,仅换 UI
 */
import { useQuery } from '@tanstack/react-query'
import { Loader2, Sparkles, ShieldAlert, Lightbulb, RotateCw, CheckCircle2, AlertTriangle, ListChecks } from 'lucide-react'
import { type CuratedBundle, getChallengeRounds } from '../../api/client'

const STAGE_ORDER = ['planning', 'executing', 'critiquing', 'challenging', 'regenerating', 'finalizing'] as const
const STAGE_LABEL: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  planning:     { label: '规划',   icon: Lightbulb,    color: '#3B82F6' },
  executing:    { label: '生成',   icon: Sparkles,     color: '#8B5CF6' },
  critiquing:   { label: '打分',   icon: ListChecks,   color: '#0EA5E9' },
  challenging:  { label: '挑战',   icon: ShieldAlert,  color: '#D96400' },
  regenerating: { label: '重生成', icon: RotateCw,     color: '#F59E0B' },
  finalizing:   { label: '入库',   icon: CheckCircle2, color: '#10B981' },
}

const KIND_LABEL: Record<string, string> = {
  insight: '项目洞察',
  survey_outline: '调研大纲',
  survey: '调研问卷',
  kickoff_pptx: '启动会 PPT',
  kickoff_html: '启动会 HTML',
}

interface Props { bundle: CuratedBundle }

export default function GenerationProgressCard({ bundle }: Props) {
  const progress = bundle.progress
  const stage = progress?.stage ?? 'planning'
  const message = progress?.message || '准备中…'
  const roundIdx = progress?.round_idx
  const inFlight = progress?.modules_in_flight ?? []
  const stageMeta = STAGE_LABEL[stage] || STAGE_LABEL['planning']
  const StageIcon = stageMeta.icon
  const kindLabel = KIND_LABEL[bundle.kind] || '产物'

  const showChallengeStream = ['challenging', 'regenerating', 'finalizing'].includes(stage)
  const { data: roundsData } = useQuery({
    queryKey: ['challenge-rounds', bundle.id, 'inflight'],
    queryFn: () => getChallengeRounds(bundle.id),
    refetchInterval: showChallengeStream ? 2500 : false,
    enabled: showChallengeStream,
  })

  const stageStep = STAGE_ORDER.indexOf(stage as any)
  const totalSteps = STAGE_ORDER.length
  const pct = stageStep >= 0 ? Math.round(((stageStep + 1) / totalSteps) * 100) : 5

  return (
    <div className="rd-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* 顶部:当前阶段 + 一句话 message */}
      <div style={{
        padding: '18px 22px',
        borderBottom: '1px solid rgba(15,18,36,0.06)',
        background: 'linear-gradient(135deg, rgba(255,141,26,0.12) 0%, rgba(255,255,255,0.05) 60%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
            background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
            boxShadow: '0 6px 18px rgba(255,141,26,0.30), inset 0 1px 0 rgba(255,255,255,0.4)',
          }}>
            <StageIcon size={18} color="#fff" />
            <Loader2 size={42} style={{ position: 'absolute', inset: 0, margin: 'auto', color: 'rgba(255,255,255,0.40)' }} className="animate-spin" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--rd-text)', margin: 0 }}>正在生成{kindLabel}</h2>
              <span style={{
                padding: '2px 8px', fontSize: 12, borderRadius: 999, fontWeight: 600,
                background: stageMeta.color + '22', color: stageMeta.color,
              }}>{stageMeta.label}</span>
              {typeof roundIdx === 'number' && (
                <span style={{
                  padding: '2px 8px', fontSize: 12, borderRadius: 999, fontWeight: 600,
                  background: 'rgba(124,58,237,0.15)', color: '#6D28D9',
                }}>
                  第 {roundIdx + 1}/3 轮挑战
                </span>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--rd-text-2)', lineHeight: 1.6, margin: 0 }}>{message}</p>
            {inFlight.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {inFlight.map(mk => (
                  <span key={mk} style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(255,255,255,0.55)',
                    color: 'var(--rd-text-2)',
                    fontFamily: 'ui-monospace, monospace',
                  }}>{mk}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div style={{
        padding: '12px 22px',
        background: 'rgba(255,255,255,0.30)',
      }}>
        <div style={{
          height: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 8,
          background: 'rgba(15,18,36,0.06)',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 999,
            background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
            transition: 'width .4s var(--rd-ease)',
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--rd-text-3)', flexWrap: 'wrap', gap: 4 }}>
          {STAGE_ORDER.map((s, i) => {
            const meta = STAGE_LABEL[s]
            const passed = i < stageStep
            const current = i === stageStep
            return (
              <span key={s}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontWeight: current ? 700 : 400,
                      color: current ? meta.color : passed ? 'var(--rd-text-3)' : 'rgba(15,18,36,0.20)',
                    }}>
                {passed ? '✓' : current ? '●' : '○'} {meta.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* 挑战回合实时摘要 */}
      {showChallengeStream && (roundsData?.rounds?.length ?? 0) > 0 && (
        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid rgba(15,18,36,0.06)',
          background: 'linear-gradient(180deg, rgba(255,141,26,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <ShieldAlert size={12} color="var(--rd-accent-2)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rd-text)' }}>挑战回合实时进度</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(roundsData?.rounds ?? []).map(r => (
              <ChallengeRoundLive key={r.id} round={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChallengeRoundLive({ round }: { round: import('../../api/client').ChallengeRound }) {
  const c = round.critique
  const verdict = c?.verdict ?? '?'
  const verdictMeta = {
    pass:          { label: '✓ 通过',   bg: 'rgba(16,185,129,0.15)',  color: '#047857' },
    minor_issues:  { label: '☑ 可放行', bg: 'rgba(245,158,11,0.15)',  color: '#92400E' },
    major_issues:  { label: '🚫 需返工', bg: 'rgba(220,38,38,0.15)',   color: '#B91C1C' },
  }[verdict as 'pass' | 'minor_issues' | 'major_issues'] ?? { label: '处理中…', bg: 'rgba(15,18,36,0.06)', color: 'var(--rd-text-2)' }

  const issuesByModule: Record<string, number> = {}
  for (const it of c?.issues ?? []) {
    issuesByModule[it.module_key] = (issuesByModule[it.module_key] ?? 0) + 1
  }

  return (
    <div style={{
      fontSize: 12,
      background: 'rgba(255,255,255,0.55)',
      border: '1px solid rgba(255,255,255,0.55)',
      borderRadius: 8,
      padding: 10,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--rd-text)' }}>第 {round.round_idx + 1} 轮</span>
        <span style={{
          padding: '1px 6px', borderRadius: 4, fontSize: 12, fontWeight: 600,
          background: verdictMeta.bg, color: verdictMeta.color,
        }}>{verdictMeta.label}</span>
        {round.status === 'regenerating' && (
          <span style={{ fontSize: 12, color: '#D97706' }}>
            <Loader2 size={9} className="animate-spin" style={{ display: 'inline', marginRight: 2 }} />重生成中
          </span>
        )}
        {round.status === 'final' && (
          <span style={{ fontSize: 12, color: '#10B981' }}>已收束</span>
        )}
      </div>
      {c?.summary && (
        <p style={{ color: 'var(--rd-text-2)', lineHeight: 1.5, marginBottom: 4, marginTop: 0 }}>{c.summary}</p>
      )}
      {c && c.issues.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: 12 }}>
          <AlertTriangle size={9} color="#D97706" />
          <span style={{ color: 'var(--rd-text-3)' }}>{c.issues.length} 条意见 ·</span>
          {Object.entries(issuesByModule).slice(0, 4).map(([mk, cnt]) => (
            <span key={mk} style={{
              padding: '0 4px', borderRadius: 3, fontSize: 12,
              background: 'rgba(15,18,36,0.05)', color: 'var(--rd-text-2)',
              fontFamily: 'ui-monospace, monospace',
            }}>{mk}({cnt})</span>
          ))}
        </div>
      )}
      {round.modules_regenerated.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#047857' }}>
          已重生成: {round.modules_regenerated.join(', ')}
          {typeof round.regen_chars === 'number' && (
            <span style={{ color: 'var(--rd-text-3)', marginLeft: 4 }}>({round.regen_chars} 字)</span>
          )}
        </div>
      )}
    </div>
  )
}
