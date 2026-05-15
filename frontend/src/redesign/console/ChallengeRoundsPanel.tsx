/**
 * NewChallengeRoundsPanel — 挑战回合折叠面板(Liquid Glass)
 * 功能 100% 等价 — getChallengeRounds / 跨轮已修复指纹比对 / 折叠展开
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

const VERDICT_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pass:           { label: '✓ 通过',     color: '#047857', bg: 'rgba(5, 150, 105, .10)',  border: 'rgba(5, 150, 105, .28)' },
  minor_issues:   { label: '☑ 可放行',   color: '#92400E', bg: 'rgba(245, 158, 11, .10)', border: 'rgba(245, 158, 11, .28)' },
  major_issues:   { label: '🚫 需返工',  color: '#B91C1C', bg: 'rgba(220, 38, 38, .10)',  border: 'rgba(220, 38, 38, .28)' },
  parse_failed:   { label: '⚠ 解析失败 · 未确认质量', color: '#92400E', bg: 'rgba(245, 158, 11, .15)', border: 'rgba(245, 158, 11, .35)' },
  skipped:        { label: '— 跳过',     color: '#475569', bg: 'rgba(0,0,0,0.25)',   border: 'rgba(0,0,0,0.40)' },
  skipped_invalid:{ label: '— 信息不足跳过', color: '#475569', bg: 'rgba(0,0,0,0.25)', border: 'rgba(0,0,0,0.40)' },
}

const SEVERITY_META: Record<string, { color: string; bg: string; label: string }> = {
  blocker: { color: '#B91C1C', bg: 'rgba(220, 38, 38, .15)', label: '🚫 阻断' },
  major:   { color: '#92400E', bg: 'rgba(245, 158, 11, .18)', label: '⚠ 重大' },
  minor:   { color: '#0E7490', bg: 'rgba(14, 116, 144, .15)', label: '💡 小问题' },
}

const DIMENSION_LABEL: Record<string, string> = {
  specificity: '具体性', evidence: '证据', timeliness: '时效性',
  next_step: '下一步', completeness: '完整性', consistency: '一致性', jargon: '黑话',
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

/** 拆模块 key → { prefix: "M5", title: "行业上下文" } 或者 null(认不出来的) */
function parseModuleKey(key: string): { prefix: string; title: string } | null {
  const m = key.match(/^([ML])(\d+)_/)
  if (!m) return null
  const title = MODULE_TITLE[key]
  if (!title) return null
  return { prefix: `${m[1]}${m[2]}`, title }
}

export default function NewChallengeRoundsPanel({ bundleId, challengeSummary }: Props) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-rounds', bundleId],
    queryFn: () => getChallengeRounds(bundleId),
    enabled: open,
  })

  if (!challengeSummary || challengeSummary.rounds_total === 0) return null

  const finalMeta = VERDICT_META[challengeSummary.final_verdict] ?? VERDICT_META['skipped']

  return (
    <div style={{
      borderRadius: 12, marginBottom: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px -6px rgba(0,0,0,0.25)',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          transition: 'background .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 141, 26, .04)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {open ? <ChevronDown size={13} color="var(--rd-text-3)" /> : <ChevronRight size={13} color="var(--rd-text-3)" />}
        <ShieldAlert size={13} color="var(--rd-accent-2)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>挑战回合</span>
        <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>· 共 {challengeSummary.rounds_total} 轮</span>
        <span style={{
          marginLeft: 8, padding: '1px 8px', borderRadius: 6,
          fontSize: 12, fontWeight: 600,
          color: finalMeta.color, background: finalMeta.bg,
          border: `1px solid ${finalMeta.border}`,
        }}>最终: {finalMeta.label}</span>
        {challengeSummary.issues_remaining > 0 && (
          <span style={{
            padding: '1px 8px', borderRadius: 6,
            fontSize: 12, color: '#92400E',
            background: 'rgba(245, 158, 11, .18)',
          }}>⚠ 仍有 {challengeSummary.issues_remaining} 个重大问题未解决</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rd-text-3)' }}>点击展开看每轮评语</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--rd-line)' }}>
          {isLoading && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)' }}>
              <Loader2 size={13} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> 加载挑战回合详情…
            </div>
          )}
          {!isLoading && (data?.rounds ?? []).length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)' }}>尚无挑战回合记录</div>
          )}
          {(() => {
            const rounds = data?.rounds ?? []
            const lastRound = rounds[rounds.length - 1]
            const lastFingerprints = new Set<string>(
              (lastRound?.critique?.issues ?? []).map(it => `${it.module_key}|${it.dimension}|${it.severity}`)
            )
            return rounds.map((r, idx) => (
              <RoundCard key={r.id} round={r} isLastRound={idx === rounds.length - 1} lastFingerprints={lastFingerprints} />
            ))
          })()}
        </div>
      )}
    </div>
  )
}

function RoundCard({ round, isLastRound, lastFingerprints }: {
  round: import('../../api/client').ChallengeRound
  isLastRound: boolean
  lastFingerprints: Set<string>
}) {
  const c = round.critique
  const verdict = c?.verdict ?? 'skipped'
  const meta = VERDICT_META[verdict] ?? VERDICT_META['skipped']

  const grouped = new Map<string, ChallengeIssue[]>()
  for (const it of c?.issues ?? []) {
    if (!grouped.has(it.module_key)) grouped.set(it.module_key, [])
    grouped.get(it.module_key)!.push(it)
  }

  const isFixed = (it: ChallengeIssue): boolean => {
    if (isLastRound) return false
    return !lastFingerprints.has(`${it.module_key}|${it.dimension}|${it.severity}`)
  }

  return (
    <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--rd-line)' }}>
      {/* ── Round header:更大的圆形编号 + verdict ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: c?.summary ? 6 : 12 }}>
        <span style={{
          flexShrink: 0,
          width: 22, height: 22, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          color: '#fff',
          background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
          boxShadow: '0 2px 6px rgba(255,141,26,0.30)',
        }}>{round.round_idx + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>第 {round.round_idx + 1} 轮</span>
        <span style={{
          padding: '2px 10px', borderRadius: 999,
          fontSize: 12, fontWeight: 600, color: meta.color,
          background: meta.bg, border: `1px solid ${meta.border}`,
        }}>{meta.label}</span>
        {round.modules_regenerated.length > 0 && (
          <span className="rd-badge is-green">已重生成 {round.modules_regenerated.length} 个章节</span>
        )}
        {round.duration_ms != null && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rd-text-3)' }}>耗时 {(round.duration_ms / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* ── Summary 引言 ── */}
      {c?.summary && (
        <div style={{
          padding: '10px 12px',
          marginBottom: 14,
          background: 'rgba(255,141,26,0.05)',
          border: '1px solid rgba(255,141,26,0.15)',
          borderLeft: '3px solid var(--rd-accent)',
          borderRadius: 8,
          fontSize: 13, color: 'var(--rd-text-2)', lineHeight: 1.55,
        }}>
          {c.summary}
        </div>
      )}

      {round.critique_raw && (
        <details style={{ marginBottom: 10, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: '#92400E', userSelect: 'none' }}>🔍 查看挑战器原始输出 (debug)</summary>
          <pre className="rd-mono" style={{
            marginTop: 6, padding: 8, borderRadius: 6,
            background: 'rgba(245, 158, 11, .08)', border: '1px solid rgba(245, 158, 11, .28)',
            fontSize: 12, color: '#78350F', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 400, overflow: 'auto',
          }}>{round.critique_raw}</pre>
        </details>
      )}

      {grouped.size === 0 && c && c.verdict === 'pass' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#047857' }}>
          <CheckCircle2 size={14} /> 本轮挑战者认为没有显著问题。
        </div>
      )}

      {/* ── Module 分组 + issues ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from(grouped.entries()).map(([mk, issues]) => (
          <ModuleGroup key={mk} moduleKey={mk} issues={issues} isFixed={isFixed} />
        ))}
      </div>
    </div>
  )
}

/** 单个 module 分组:模块名做小标题 + 下方 issue 列表 */
function ModuleGroup({ moduleKey, issues, isFixed }: {
  moduleKey: string
  issues: ChallengeIssue[]
  isFixed: (it: ChallengeIssue) => boolean
}) {
  const isGlobal = moduleKey === '_global'
  const parsed = parseModuleKey(moduleKey)
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px',
        marginBottom: 8,
        borderRadius: 6,
        fontSize: 12, fontWeight: 600,
        color: isGlobal ? '#7C3AED' : 'var(--rd-text)',
        background: isGlobal ? 'rgba(124,58,237,0.08)' : 'rgba(0,0,0,0.25)',
        border: `1px solid ${isGlobal ? 'rgba(124,58,237,0.20)' : 'rgba(0,0,0,0.40)'}`,
        fontFamily: 'inherit',
      }}>
        {isGlobal ? (
          <span>🌐 全局</span>
        ) : parsed ? (
          <>
            <span style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 500,
              letterSpacing: '-0.01em',
            }}>{parsed.prefix}</span>
            <span style={{ color: 'var(--rd-text)', fontWeight: 600 }}>{parsed.title}</span>
          </>
        ) : (
          // 认不出的 key:回退 monospace 原样显示
          <span style={{
            fontFamily: 'ui-monospace, monospace',
            letterSpacing: '-0.01em',
          }}>{moduleKey}</span>
        )}
        <span style={{ color: 'var(--rd-text-3)', fontWeight: 400 }}>· {issues.length} 项</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 2 }}>
        {issues.map((it, i) => <IssueRow key={i} issue={it} fixed={isFixed(it)} />)}
      </div>
    </div>
  )
}

/** 单条 issue:左侧 severity 色带 + 维度标签 → 问题文本 → 建议条 */
function IssueRow({ issue, fixed }: { issue: ChallengeIssue; fixed: boolean }) {
  const sev = SEVERITY_META[issue.severity] ?? SEVERITY_META['minor']
  const SevIcon = issue.severity === 'blocker' ? AlertCircle : issue.severity === 'major' ? AlertTriangle : Lightbulb
  const dimLabel = DIMENSION_LABEL[issue.dimension] || issue.dimension

  return (
    <div style={{
      position: 'relative',
      paddingLeft: 12,
      borderLeft: `3px solid ${fixed ? 'rgba(5,150,105,.45)' : sev.color}`,
      opacity: fixed ? 0.65 : 1,
    }}>
      {/* 顶部:维度标签 + severity icon + 已修复(如果) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <SevIcon size={12} color={fixed ? '#047857' : sev.color} style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: fixed ? '#047857' : sev.color,
        }}>{fixed ? '已修复' : sev.label}</span>
        <span style={{ color: 'var(--rd-text-3)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>{dimLabel}</span>
      </div>

      {/* 问题正文 */}
      <div style={{
        fontSize: 13, lineHeight: 1.6,
        color: fixed ? 'var(--rd-text-3)' : 'var(--rd-text)',
        textDecoration: fixed ? 'line-through' : 'none',
      }}>{issue.text}</div>

      {/* 建议:像"待办"一样的高亮条 */}
      {issue.suggestion && !fixed && (
        <div style={{
          marginTop: 6,
          padding: '8px 10px',
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.20)',
          borderRadius: 6,
          fontSize: 12.5,
          color: '#065F46',
          lineHeight: 1.55,
          display: 'flex',
          gap: 6,
        }}>
          <Lightbulb size={12} style={{ flexShrink: 0, marginTop: 2, color: '#10B981' }} />
          <span><span style={{ fontWeight: 600 }}>改写建议</span> · {issue.suggestion}</span>
        </div>
      )}
    </div>
  )
}
