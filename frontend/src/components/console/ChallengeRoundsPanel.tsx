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

/** 模块 key → 中文标题(跟后端 insight_modules.py / outline_modules.py / survey_modules.py 对齐) */
const MODULE_TITLE: Record<string, string> = {
  // 项目洞察 M1–M10
  M1_exec_summary: '执行摘要',
  M2_project_snapshot: '项目快照',
  M3_health_radar: '健康度雷达',
  M4_stakeholder_map: '干系人画像',
  M5_industry_context: '行业上下文',
  M6_key_findings: '关键发现',
  M7_risk_raid: '风险与议题',
  M8_dependency_milestone: '依赖与里程碑',
  M9_industry_benchmark: '行业最佳实践对照',
  M10_next_actions: '下一步建议',
  // 调研大纲 M1–M7
  M1_outline_objective: '调研目标与范围',
  M2_outline_method: '调研方法与节奏',
  M3_outline_schedule: '调研日程表',
  M4_outline_customer_materials: '客户准备材料',
  M5_outline_team_raci: '我方团队分工',
  M6_outline_deliverables: '调研产出物清单',
  M7_outline_handoff: '衔接方案设计',
  // 调研问卷
  L1_exec_alignment: '高管战略对齐',
}

function parseModuleKey(key: string): { prefix: string; title: string } | null {
  const m = key.match(/^([ML])(\d+)_/)
  if (!m) return null
  const title = MODULE_TITLE[key]
  if (!title) return null
  return { prefix: `${m[1]}${m[2]}`, title }
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

      {/* 展开:每轮详情 — 自然高度,父页允许整体垂直滚 */}
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
          {(() => {
            // 跨轮比对:计算最后一轮的 issue 指纹(module + dimension + severity),
            // 前面轮次的 issue 若指纹不在最后一轮里 → 视为"已修复"
            const rounds = data?.rounds ?? []
            const lastRound = rounds[rounds.length - 1]
            const lastFingerprints = new Set<string>(
              (lastRound?.critique?.issues ?? []).map(it =>
                `${it.module_key}|${it.dimension}|${it.severity}`
              )
            )
            return rounds.map((r, idx) => (
              <RoundCard
                key={r.id}
                round={r}
                isLastRound={idx === rounds.length - 1}
                lastFingerprints={lastFingerprints}
              />
            ))
          })()}
        </div>
      )}
    </div>
  )
}

function RoundCard({
  round, isLastRound, lastFingerprints,
}: {
  round: import('../../api/client').ChallengeRound
  isLastRound: boolean
  lastFingerprints: Set<string>
}) {
  const c = round.critique
  const verdict = c?.verdict ?? 'skipped'
  const meta = VERDICT_META[verdict] ?? VERDICT_META['skipped']

  // 按 module 分组 issues
  const grouped = new Map<string, ChallengeIssue[]>()
  for (const it of c?.issues ?? []) {
    if (!grouped.has(it.module_key)) grouped.set(it.module_key, [])
    grouped.get(it.module_key)!.push(it)
  }

  // 当前轮次 issue 是否在最后一轮已被修复:
  // - 最后一轮自身的 issue 不算"已修复"(还存在)
  // - 之前轮次的 issue 若(模块+维度+严重度)指纹不在最后一轮里 → 视为已修复
  const isFixed = (it: ChallengeIssue): boolean => {
    if (isLastRound) return false
    return !lastFingerprints.has(`${it.module_key}|${it.dimension}|${it.severity}`)
  }

  return (
    <div className="px-4 py-3.5 border-b border-line last:border-b-0">
      {/* ── Round header:橙色圆形编号 + verdict 胶囊 ── */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span
          className="shrink-0 inline-flex items-center justify-center text-white text-xs font-bold"
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF8D1A, #B5500A)',
            boxShadow: '0 2px 6px rgba(255,141,26,0.30)',
          }}
        >{round.round_idx + 1}</span>
        <span className="text-[13px] font-bold text-ink">第 {round.round_idx + 1} 轮</span>
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${meta.bg}`}
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

      {/* ── Summary 引言:左侧橙色色带 + 浅橙底 ── */}
      {c?.summary && (
        <div
          className="px-3 py-2.5 mb-3 rounded-lg text-[13px] leading-relaxed text-ink-secondary"
          style={{
            background: 'rgba(255,141,26,0.05)',
            border: '1px solid rgba(255,141,26,0.15)',
            borderLeft: '3px solid #FF8D1A',
          }}
        >
          {c.summary}
        </div>
      )}

      {/* parse_failed 时展示原始 LLM 输出供 debug */}
      {round.critique_raw && (
        <details className="mb-2.5 text-[11px]">
          <summary className="cursor-pointer text-amber-700 hover:text-amber-900 select-none">
            🔍 查看挑战器原始输出 (debug)
          </summary>
          <pre className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[10.5px] text-amber-900 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
{round.critique_raw}
          </pre>
        </details>
      )}

      {grouped.size === 0 && c && c.verdict === 'pass' && (
        <div className="text-[12.5px] text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={14} /> 本轮挑战者认为没有显著问题。
        </div>
      )}

      {/* ── Module 分组 ── */}
      <div className="flex flex-col gap-3.5">
        {Array.from(grouped.entries()).map(([mk, issues]) => (
          <ModuleGroup key={mk} moduleKey={mk} issues={issues} isFixed={isFixed} />
        ))}
      </div>
    </div>
  )
}

/** 单 module 分组:模块名做小标题 + 下方 issue 列表 */
function ModuleGroup({ moduleKey, issues, isFixed }: {
  moduleKey: string
  issues: ChallengeIssue[]
  isFixed: (it: ChallengeIssue) => boolean
}) {
  const isGlobal = moduleKey === '_global'
  const parsed = parseModuleKey(moduleKey)
  return (
    <div>
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 mb-2 rounded text-[11px] font-semibold border ${
          isGlobal ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-ink bg-slate-50 border-slate-200'
        }`}
      >
        {isGlobal ? (
          <span>🌐 全局</span>
        ) : parsed ? (
          <>
            <span
              className="text-ink-muted font-medium"
              style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em' }}
            >{parsed.prefix}</span>
            <span className="text-ink font-semibold">{parsed.title}</span>
          </>
        ) : (
          <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em' }}>{moduleKey}</span>
        )}
        <span className="text-ink-muted font-normal">· {issues.length} 项</span>
      </div>
      <div className="flex flex-col gap-2.5 pl-0.5">
        {issues.map((it, i) => <IssueRow key={i} issue={it} fixed={isFixed(it)} />)}
      </div>
    </div>
  )
}

/** 单条 issue:左侧 severity 色带 → 问题主文 → 翠绿建议条 */
function IssueRow({ issue, fixed }: { issue: ChallengeIssue; fixed: boolean }) {
  const sev = SEVERITY_META[issue.severity] ?? SEVERITY_META['minor']
  const SevIcon = issue.severity === 'blocker' ? AlertCircle :
                  issue.severity === 'major'   ? AlertTriangle : Lightbulb
  const dimLabel = DIMENSION_LABEL[issue.dimension] || issue.dimension

  return (
    <div
      className={fixed ? 'opacity-65' : ''}
      style={{
        position: 'relative',
        paddingLeft: 12,
        borderLeft: `3px solid ${fixed ? 'rgba(5,150,105,.45)' : sev.color}`,
      }}
    >
      {/* 顶行:severity icon + 标签 · 维度 */}
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <SevIcon size={12} style={{ color: fixed ? '#047857' : sev.color }} className="shrink-0" />
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: fixed ? '#047857' : sev.color }}
        >{fixed ? '已修复' : sev.label}</span>
        <span className="text-ink-muted">·</span>
        <span className="text-[11.5px] text-ink-muted">{dimLabel}</span>
      </div>

      {/* 问题正文 */}
      <div className={`text-[12.5px] leading-relaxed ${fixed ? 'text-ink-muted line-through decoration-emerald-300' : 'text-ink'}`}>
        {issue.text}
      </div>

      {/* 改写建议:翠绿待办高亮条 */}
      {issue.suggestion && !fixed && (
        <div
          className="mt-1.5 px-2.5 py-2 rounded text-[12px] leading-relaxed flex gap-1.5"
          style={{
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.20)',
            color: '#065F46',
          }}
        >
          <Lightbulb size={12} style={{ flexShrink: 0, marginTop: 2, color: '#10B981' }} />
          <span><span className="font-semibold">改写建议</span> · {issue.suggestion}</span>
        </div>
      )}
    </div>
  )
}
