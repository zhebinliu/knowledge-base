/**
 * GenerationProgressCard — insight 生成中显示的进度卡片
 *
 * 替换 PreparationView 顶部 Hero 卡(在 inflight 时)。
 * 数据来源:bundle.extra.progress + bundle.extra.challenge_summary,
 * 通过父组件 polling 拉到(inflight 时 polling 间隔 2s,见 ConsoleProjectDetail)。
 *
 * 三段式:
 *  ① 当前阶段 + 一句话进度
 *  ② 阶段进度条(planning → executing → critiquing/challenging → finalizing)
 *  ③ 挑战回合实时摘要(每轮 verdict 标签 + 重生成的模块 chip)
 */
import { useQuery } from '@tanstack/react-query'
import { Loader2, Sparkles, ShieldAlert, Lightbulb, RotateCw, CheckCircle2, AlertTriangle, ListChecks } from 'lucide-react'
import { type CuratedBundle, getChallengeRounds } from '../../api/client'

const BRAND = '#D96400'
const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const STAGE_ORDER = ['planning', 'executing', 'critiquing', 'challenging', 'regenerating', 'finalizing'] as const
const STAGE_LABEL: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  planning:     { label: '规划',   icon: Lightbulb,    color: '#3B82F6' },
  executing:    { label: '生成',   icon: Sparkles,     color: '#8B5CF6' },
  critiquing:   { label: '打分',   icon: ListChecks,   color: '#0EA5E9' },
  challenging:  { label: '挑战',   icon: ShieldAlert,  color: '#D96400' },
  regenerating: { label: '重生成', icon: RotateCw,     color: '#F59E0B' },
  finalizing:   { label: '入库',   icon: CheckCircle2, color: '#10B981' },
}

interface Props {
  bundle: CuratedBundle
}

// 不同 kind 的产物名,用在"正在生成 XXX"标题
const KIND_LABEL: Record<string, string> = {
  insight: '项目洞察',
  survey_outline: '调研大纲',
  survey: '调研问卷',
  kickoff_pptx: '启动会 PPT',
  kickoff_html: '启动会 HTML',
}

export default function GenerationProgressCard({ bundle }: Props) {
  const progress = bundle.progress
  const stage = progress?.stage ?? 'planning'
  const message = progress?.message || '准备中…'
  const roundIdx = progress?.round_idx
  const inFlight = progress?.modules_in_flight ?? []
  const stageMeta = STAGE_LABEL[stage] || STAGE_LABEL['planning']
  const StageIcon = stageMeta.icon
  const kindLabel = KIND_LABEL[bundle.kind] || '产物'

  // 实时拉挑战回合(只在 challenging/regenerating 阶段才频繁拉,其他阶段意义不大)
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
    <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
      {/* 顶部:当前阶段 + 一句话 message */}
      <div className="px-6 py-5 border-b border-line"
           style={{ background: 'linear-gradient(to right, #FFF7ED 0%, #FFFFFF 60%)' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
               style={{ background: BRAND_GRAD }}>
            <StageIcon size={18} className="text-white" />
            <Loader2 size={42} className="absolute inset-0 m-auto text-white/40 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-bold text-ink">正在生成{kindLabel}</h2>
              <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{ background: stageMeta.color + '20', color: stageMeta.color }}>
                {stageMeta.label}
              </span>
              {typeof roundIdx === 'number' && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 font-medium">
                  第 {roundIdx + 1}/3 轮挑战
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-ink-secondary leading-relaxed">{message}</p>
            {inFlight.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {inFlight.map(mk => (
                  <span key={mk} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                    {mk}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="px-6 py-3 bg-slate-50/50">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all"
               style={{ width: `${pct}%`, background: BRAND_GRAD }} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-ink-muted">
          {STAGE_ORDER.map((s, i) => {
            const meta = STAGE_LABEL[s]
            const passed = i < stageStep
            const current = i === stageStep
            return (
              <span key={s}
                    className={`flex items-center gap-0.5 ${current ? 'font-bold' : ''}`}
                    style={{ color: current ? meta.color : passed ? '#94A3B8' : '#CBD5E1' }}>
                {passed ? '✓' : current ? '●' : '○'} {meta.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* 挑战回合实时摘要 */}
      {showChallengeStream && (roundsData?.rounds?.length ?? 0) > 0 && (
        <div className="px-6 py-3 border-t border-line bg-orange-50/30">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert size={12} className="text-[#D96400]" />
            <span className="text-xs font-semibold text-ink">挑战回合实时进度</span>
          </div>
          <div className="space-y-2">
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
  // 与 ChallengeRoundsPanel 的 VERDICT_META 保持一致 — 动作导向命名,跟单 issue 的 SEVERITY 区分
  const verdictMeta = {
    pass:          { label: '✓ 通过',   color: 'bg-emerald-100 text-emerald-700' },
    minor_issues:  { label: '☑ 可放行', color: 'bg-amber-100 text-amber-700' },
    major_issues:  { label: '🚫 需返工', color: 'bg-red-100 text-red-700' },
  }[verdict as 'pass' | 'minor_issues' | 'major_issues'] ?? { label: '处理中…', color: 'bg-slate-100 text-slate-600' }

  const issuesByModule: Record<string, number> = {}
  for (const it of c?.issues ?? []) {
    issuesByModule[it.module_key] = (issuesByModule[it.module_key] ?? 0) + 1
  }

  return (
    <div className="text-[11px] bg-white border border-line rounded p-2">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-ink">第 {round.round_idx + 1} 轮</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${verdictMeta.color}`}>{verdictMeta.label}</span>
        {round.status === 'regenerating' && (
          <span className="text-[10px] text-amber-600">
            <Loader2 size={9} className="inline animate-spin mr-0.5" />重生成中
          </span>
        )}
        {round.status === 'final' && (
          <span className="text-[10px] text-emerald-600">已收束</span>
        )}
      </div>
      {c?.summary && (
        <p className="text-ink-secondary leading-snug mb-1">{c.summary}</p>
      )}
      {c && c.issues.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 text-[10px]">
          <AlertTriangle size={9} className="text-amber-600" />
          <span className="text-ink-muted">{c.issues.length} 条意见 ·</span>
          {Object.entries(issuesByModule).slice(0, 4).map(([mk, cnt]) => (
            <span key={mk} className="px-1 rounded bg-slate-50 text-slate-600 font-mono">
              {mk}({cnt})
            </span>
          ))}
        </div>
      )}
      {round.modules_regenerated.length > 0 && (
        <div className="mt-1 text-[10px] text-emerald-700">
          已重生成: {round.modules_regenerated.join(', ')}
          {typeof round.regen_chars === 'number' && (
            <span className="text-ink-muted ml-1">({round.regen_chars} 字)</span>
          )}
        </div>
      )}
    </div>
  )
}
