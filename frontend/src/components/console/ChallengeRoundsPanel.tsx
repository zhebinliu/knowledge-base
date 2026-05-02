/**
 * ChallengeRoundsPanel — 报告视图顶部「挑战回合」折叠面板
 *
 * 显示某 bundle 的所有挑战轮次:
 *  - 默认折叠,标题栏显示「挑战回合 · 共 N 轮 · 最终: ✓ 通过」
 *  - 展开:每轮 critique 完整内容(verdict / summary / issues 按 module/severity 分组)
 *
 * 数据来源:GET /api/outputs/{bundle_id}/challenges
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, ShieldAlert, Loader2,
  CheckCircle2, AlertTriangle, AlertCircle, Lightbulb,
} from 'lucide-react'
import { getChallengeRounds, type ChallengeIssue } from '../../api/client'

interface Props {
  bundleId: string
  challengeSummary?: {
    rounds_total: number
    final_verdict: string
    issues_remaining: number
  } | null
}

// verdict = 整体判定(动作导向),与单 issue 的 SEVERITY 区分:
//   - SEVERITY 是"单个问题有多严重"(阻断 / 重大 / 小问题)
//   - VERDICT 是"这轮整体能不能放行"(规则:任何 blocker 或 ≥3 major → 需返工;0-2 major → 可放行)
//   所以一轮里出现 1-2 个"重大"问题但 verdict 仍是"可放行"是符合规则的,不是矛盾。
const VERDICT_META: Record<string, { label: string; color: string; bg: string }> = {
  pass:           { label: '✓ 通过',     color: '#059669', bg: 'bg-emerald-50 border-emerald-200' },
  minor_issues:   { label: '☑ 可放行',   color: '#D97706', bg: 'bg-amber-50 border-amber-200' },
  major_issues:   { label: '🚫 需返工',  color: '#DC2626', bg: 'bg-red-50 border-red-200' },
  parse_failed:   { label: '⚠ 解析失败 · 未确认质量', color: '#B45309', bg: 'bg-amber-100 border-amber-300' },
  skipped:        { label: '— 跳过',     color: '#64748B', bg: 'bg-slate-50 border-slate-200' },
  skipped_invalid:{ label: '— 信息不足跳过', color: '#64748B', bg: 'bg-slate-50 border-slate-200' },
}

// 与 banner 文案统一:重大 / 小问题(顶部"仍有 N 项重大问题未解决"找下面对应的"重大"标签)
const SEVERITY_META: Record<string, { color: string; bg: string; label: string }> = {
  blocker: { color: '#DC2626', bg: 'bg-red-100',    label: '🚫 阻断' },
  major:   { color: '#D97706', bg: 'bg-amber-100',  label: '⚠ 重大' },
  minor:   { color: '#0891B2', bg: 'bg-cyan-100',   label: '💡 小问题' },
}

const DIMENSION_LABEL: Record<string, string> = {
  specificity:  '具体性',
  evidence:     '证据',
  timeliness:   '时效性',
  next_step:    '下一步',
  completeness: '完整性',
  consistency:  '一致性',
  jargon:       '黑话',
}

export default function ChallengeRoundsPanel({ bundleId, challengeSummary }: Props) {
  // 一律默认折叠 — 顶部 bar 已显示轮数 + 最终 verdict,详情按需展开
  // (原 v3.4 行为:not pass 时默认展开,实测太占位置)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-rounds', bundleId],
    queryFn: () => getChallengeRounds(bundleId),
    enabled: open,                            // 折叠时不请求,展开才拉
  })

  // 没有挑战(老数据 / invalid 报告 / kickoff 等)→ 不渲染
  if (!challengeSummary || challengeSummary.rounds_total === 0) {
    if (challengeSummary?.final_verdict === 'skipped_invalid') {
      return null
    }
    return null
  }

  const finalMeta = VERDICT_META[challengeSummary.final_verdict] ?? VERDICT_META['skipped']

  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden mb-3 shadow-sm">
      {/* 标题栏 — 点击展开/折叠 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-orange-50/30 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-ink-muted" /> : <ChevronRight size={14} className="text-ink-muted" />}
        <ShieldAlert size={14} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">挑战回合</span>
        <span className="text-[11px] text-ink-muted">· 共 {challengeSummary.rounds_total} 轮</span>
        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium border ${finalMeta.bg}`}
              style={{ color: finalMeta.color }}>
          最终: {finalMeta.label}
        </span>
        {challengeSummary.issues_remaining > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
            ⚠ 仍有 {challengeSummary.issues_remaining} 个重大问题未解决
          </span>
        )}
        <span className="ml-auto text-[10px] text-ink-muted">点击展开看每轮评语</span>
      </button>

      {/* 展开:每轮详情 */}
      {open && (
        <div className="border-t border-line">
          {isLoading && (
            <div className="p-4 text-center text-xs text-ink-muted">
              <Loader2 size={14} className="inline animate-spin mr-1.5" />加载挑战回合详情…
            </div>
          )}
          {!isLoading && (data?.rounds ?? []).length === 0 && (
            <div className="p-4 text-center text-xs text-ink-muted">尚无挑战回合记录</div>
          )}
          {(data?.rounds ?? []).map(r => (
            <RoundCard key={r.id} round={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function RoundCard({ round }: { round: import('../../api/client').ChallengeRound }) {
  const c = round.critique
  const verdict = c?.verdict ?? 'skipped'
  const meta = VERDICT_META[verdict] ?? VERDICT_META['skipped']

  // 按 module 分组 issues
  const grouped = new Map<string, ChallengeIssue[]>()
  for (const it of c?.issues ?? []) {
    if (!grouped.has(it.module_key)) grouped.set(it.module_key, [])
    grouped.get(it.module_key)!.push(it)
  }

  return (
    <div className="px-4 py-3 border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-ink">第 {round.round_idx + 1} 轮</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.bg}`}
              style={{ color: meta.color }}>
          {meta.label}
        </span>
        {round.modules_regenerated.length > 0 && (
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
            已重生成 {round.modules_regenerated.length} 个章节
          </span>
        )}
        {round.duration_ms != null && (
          <span className="ml-auto text-[10px] text-ink-muted">耗时 {(round.duration_ms / 1000).toFixed(1)}s</span>
        )}
      </div>

      {c?.summary && (
        <p className="text-[12px] text-ink-secondary leading-snug mb-2 italic">「{c.summary}」</p>
      )}

      {/* parse_failed 时展示原始 LLM 输出供 debug */}
      {round.critique_raw && (
        <details className="mb-2 text-[11px]">
          <summary className="cursor-pointer text-amber-700 hover:text-amber-900 select-none">
            🔍 查看挑战器原始输出 (debug)
          </summary>
          <pre className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[10.5px] text-amber-900 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
{round.critique_raw}
          </pre>
        </details>
      )}

      {grouped.size === 0 && c && c.verdict === 'pass' && (
        <div className="text-[11px] text-emerald-700 flex items-center gap-1">
          <CheckCircle2 size={11} /> 本轮挑战者认为没有显著问题。
        </div>
      )}

      {Array.from(grouped.entries()).map(([mk, issues]) => (
        <div key={mk} className="mb-2 last:mb-0">
          <div className="text-[11px] font-semibold text-ink mb-1 font-mono">
            {mk === '_global' ? '🌐 全局' : mk}
          </div>
          <div className="space-y-1.5 pl-3">
            {issues.map((it, i) => {
              const sev = SEVERITY_META[it.severity] ?? SEVERITY_META['minor']
              const SevIcon = it.severity === 'blocker' ? AlertCircle :
                              it.severity === 'major'   ? AlertTriangle : Lightbulb
              const wasFixed = round.modules_regenerated.includes(mk) && it.severity !== 'minor'
              return (
                <div key={i} className="text-[11px] leading-snug">
                  <div className="flex items-start gap-1.5">
                    <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${sev.bg} shrink-0 mt-0.5`}
                          style={{ color: sev.color }}>
                      <SevIcon size={9} className="inline mr-0.5" />{sev.label}
                    </span>
                    <span className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] shrink-0 mt-0.5">
                      {DIMENSION_LABEL[it.dimension] || it.dimension}
                    </span>
                    {wasFixed && (
                      <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] shrink-0 mt-0.5">
                        ✓ 已重生成
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-ink-secondary">{it.text}</div>
                  {it.suggestion && (
                    <div className="mt-0.5 pl-2 border-l-2 border-orange-200 text-ink-muted">
                      改写建议: {it.suggestion}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
