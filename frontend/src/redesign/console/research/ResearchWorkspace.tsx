/**
 * ResearchWorkspace —— survey stage 三栏工作区(Liquid Glass 版)
 * 与旧版逻辑 100% 对齐,仅改 UI 风格
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, Lightbulb, Sparkles, Loader2, Workflow,
  CheckCircle2, Pencil, Users, Briefcase, FileText,
  Crown, UserCircle2, Cpu, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  generateOutput,
  getLtcDictionary,
  getOutput,
  listResearchLtcModuleMap,
  type CuratedBundle,
  type ResearchLtcDictionaryEntry,
  type OutputKind,
  type ResearchAudienceRole,
  type ResearchQuestionPhase,
} from '../../../api/client'

const AUDIENCE_ROLE_ORDER: ResearchAudienceRole[] = ['executive', 'dept_head', 'frontline', 'it']
const AUDIENCE_ROLE_LABELS: Record<ResearchAudienceRole, string> = {
  executive: '高管',
  dept_head: '部门负责人',
  frontline: '一线',
  it: 'IT',
}
const AUDIENCE_ROLE_DESC: Record<ResearchAudienceRole, string> = {
  executive: '战略 / 决策诉求',
  dept_head: '业务流程 / 协同规则',
  frontline: '日常操作 / 痛点',
  it: '集成 / 数据 / 权限',
}

type GroupBy = 'role' | 'ltc'
import InsightReportDark from '../InsightReportDark'
import CitationsPanel from '../CitationsPanel'
import MarkdownEditor from '../../../components/console/MarkdownEditor'
import GenerationProgressCard from '../GenerationProgressCard'
import ResearchQuestionnaire from './ResearchQuestionnaireDark'
import ExportPreMeetingButton from '../../../components/console/research/ExportPreMeetingButton'

type ResearchView = 'preparation' | 'outline' | 'questionnaire' | 'report'

interface Props {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
  reportBundle: CuratedBundle | undefined
  reportInflight: CuratedBundle | undefined
  activeKind: OutputKind | null
  onRefetch: () => void
}

export default function ResearchWorkspace({
  projectId, outlineBundle, outlineInflight, surveyBundle, surveyInflight,
  reportBundle, reportInflight, activeKind, onRefetch,
}: Props) {
  const [selectedLtcKey, setSelectedLtcKey] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('role')
  const [selectedRole, setSelectedRole] = useState<ResearchAudienceRole | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<ResearchQuestionPhase | 'all'>('all')
  const [view, setView] = useState<ResearchView>('preparation')
  const [refsOpen, setRefsOpen] = useState(false)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  const [outlineEditing, setOutlineEditing] = useState(false)

  // research_report 不 fallback 到 preparation — 见 components/console/research/ResearchWorkspace.tsx 同段注释
  useEffect(() => {
    if (activeKind === 'survey_outline') {
      setView(outlineBundle ? 'outline' : 'preparation')
    } else if (activeKind === 'survey') {
      setView(surveyBundle ? 'questionnaire' : 'preparation')
    } else if (activeKind === 'research_report') {
      setView('report')
    }
  }, [activeKind, outlineBundle?.id, surveyBundle?.id, reportBundle?.id])

  const outlineInflightId = outlineInflight?.id
  const surveyInflightId = surveyInflight?.id
  const reportInflightId = reportInflight?.id
  useEffect(() => {
    if (outlineInflightId || surveyInflightId || reportInflightId) {
      setView('preparation')
      setOutlineEditing(false)
    }
  }, [outlineInflightId, surveyInflightId, reportInflightId])

  const { data: ltcDict } = useQuery({
    queryKey: ['research-ltc-dict'],
    queryFn: getLtcDictionary,
    staleTime: 60 * 60 * 1000,
  })

  const { data: ltcMap } = useQuery({
    queryKey: ['research-ltc-module-map', projectId],
    queryFn: () => listResearchLtcModuleMap(projectId),
    enabled: !!projectId,
  })

  const sowHitKeys = useMemo(() => {
    const s = new Set<string>()
    for (const it of (ltcMap?.items ?? [])) {
      if (it.mapped_ltc_key) s.add(it.mapped_ltc_key)
    }
    return s
  }, [ltcMap])

  const questionnaireItems = useMemo(() => surveyBundle?.questionnaire_items ?? [], [surveyBundle])

  const roleCounts = useMemo(() => {
    const out: Record<ResearchAudienceRole, { total: number; pre: number; meeting: number }> = {
      executive: { total: 0, pre: 0, meeting: 0 },
      dept_head: { total: 0, pre: 0, meeting: 0 },
      frontline: { total: 0, pre: 0, meeting: 0 },
      it:        { total: 0, pre: 0, meeting: 0 },
    }
    for (const q of questionnaireItems) {
      const phase = q.phase || 'in_meeting'
      for (const r of (q.audience_roles || [])) {
        const role = r as ResearchAudienceRole
        if (!(role in out)) continue
        out[role].total += 1
        if (phase === 'pre_meeting') out[role].pre += 1
        else out[role].meeting += 1
      }
    }
    return out
  }, [questionnaireItems])

  useEffect(() => {
    if (groupBy === 'role') {
      if (selectedRole) return
      const firstWithItems = AUDIENCE_ROLE_ORDER.find(r => roleCounts[r].total > 0)
      setSelectedRole(firstWithItems ?? AUDIENCE_ROLE_ORDER[0])
      return
    }
    if (selectedLtcKey || !ltcDict?.modules?.length) return
    const firstHit = ltcDict.modules.find(m => sowHitKeys.has(m.key))
    setSelectedLtcKey(firstHit?.key ?? ltcDict.modules[0].key)
  }, [groupBy, ltcDict, sowHitKeys, selectedLtcKey, selectedRole, roleCounts])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative" style={{ background: 'transparent', minHeight: 0 }}>
      {/* ── 顶部:分组 carousel(角色卡 / LTC chip 卡)── */}
      <ResearchGroupCarousel
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        selectedRole={selectedRole}
        setSelectedRole={(r) => { setSelectedRole(r); if (surveyBundle) setView('questionnaire') }}
        selectedLtcKey={selectedLtcKey}
        setSelectedLtcKey={(k) => { setSelectedLtcKey(k); if (surveyBundle) setView('questionnaire') }}
        roleCounts={roleCounts}
        ltcModules={ltcDict?.modules ?? []}
        sowHitKeys={sowHitKeys}
        ltcMapItems={ltcMap?.items ?? []}
        questionnaireItems={questionnaireItems}
      />

      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
      {/* ── 中:工作区 ── */}
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ background: 'transparent' }}
      >
        <div
          className="flex-shrink-0 px-3 py-2 flex items-center gap-1"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        >
          <ViewTab active={view === 'preparation'} onClick={() => setView('preparation')}
                   icon={<Sparkles size={11} />} label="准备" />
          <ViewTab active={view === 'outline'} onClick={() => setView('outline')}
                   icon={outlineInflight
                          ? <Loader2 size={11} className="animate-spin" />
                          : <ClipboardList size={11} />}
                   label={outlineInflight ? '调研大纲(生成中…)' : '调研大纲'}
                   muted={!outlineBundle || !!outlineInflight}
                   disabled={!!outlineInflight} />
          <ViewTab active={view === 'questionnaire'} onClick={() => setView('questionnaire')}
                   icon={surveyInflight
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Workflow size={11} />}
                   label={surveyInflight ? '调研问卷(生成中…)' : '调研问卷(录入)'}
                   muted={!surveyBundle || !!surveyInflight}
                   disabled={!!surveyInflight} />
          <ViewTab active={view === 'report'} onClick={() => setView('report')}
                   icon={reportInflight
                          ? <Loader2 size={11} className="animate-spin" />
                          : <FileText size={11} />}
                   label={reportInflight ? '调研报告(生成中…)' : '调研报告'}
                   muted={!reportBundle || !!reportInflight}
                   disabled={!!reportInflight} />
          <div className="flex-1" />
          {outlineBundle?.status === 'done' && !surveyInflight && (
            <button
              onClick={async () => {
                if (surveyBundle) {
                  const ok = window.confirm(
                    '将基于当前调研大纲生成新一版调研问卷。\n\n注意:旧问卷答案与新问卷不互通,如已录入答案请先导出。是否继续?'
                  )
                  if (!ok) return
                }
                try {
                  await generateOutput({ kind: 'survey', project_id: projectId })
                  onRefetch()
                } catch (e: any) {
                  alert(e?.response?.data?.detail || e?.message || '生成失败')
                }
              }}
              className="rd-btn rd-btn-primary text-xs inline-flex items-center gap-1 px-2.5 py-1"
              title={surveyBundle ? '基于当前大纲重新生成问卷(旧答案不会迁移)' : '基于调研大纲一键生成结构化问卷'}
            >
              <Sparkles size={11} />
              {surveyBundle ? '重新生成调研问卷' : '生成调研问卷'}
            </button>
          )}
          {view === 'questionnaire' && (
            <span className="text-xs" style={{ color: 'var(--rd-text-2)' }}>
              {groupBy === 'role'
                ? (selectedRole ? `当前角色:${AUDIENCE_ROLE_LABELS[selectedRole]}` : '请选择左侧角色')
                : (selectedLtcKey ? `当前模块:${ltcDict?.modules?.find(m => m.key === selectedLtcKey)?.label || selectedLtcKey}` : '请选择左侧模块')}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {view === 'preparation' && (
            <PreparationView
              projectId={projectId}
              outlineBundle={outlineBundle}
              outlineInflight={outlineInflight}
              surveyBundle={surveyBundle}
              surveyInflight={surveyInflight}
              reportBundle={reportBundle}
              reportInflight={reportInflight}
              ltcMapCount={ltcMap?.items?.length ?? 0}
              sowHitCount={sowHitKeys.size}
              extraCount={(ltcMap?.items ?? []).filter(it => it.is_extra).length}
              onRefetch={onRefetch}
            />
          )}
          {view === 'outline' && (
            outlineEditing && outlineBundle ? (
              <OutlineEditorView
                bundle={outlineBundle}
                onDone={() => setOutlineEditing(false)}
              />
            ) : (
              <div className="min-h-full px-5 py-5">
                <div className="max-w-[1600px] mx-auto">
                  {outlineBundle ? (
                    <div className="rd-card overflow-hidden" style={{ padding: 0 }}>
                      <div
                        className="flex items-center justify-end px-4 py-2"
                        style={{
                          borderBottom: '1px solid var(--rd-line)',
                          background: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <button
                          onClick={() => setOutlineEditing(true)}
                          className="rd-btn flex items-center gap-1 px-2.5 py-1 text-xs"
                          title="在线编辑 markdown 正文"
                        >
                          <Pencil size={11} /> 编辑
                        </button>
                      </div>
                      <div className="px-8 py-7 overflow-x-auto">
                        <OutlineMarkdownView
                          bundle={outlineBundle}
                          onCitationClick={(moduleKey, refId) => {
                            setRefsOpen(true)
                            setHighlightedRef(`${moduleKey}:${refId}`)
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <EmptyHint text="尚未生成调研大纲。请到「调研大纲」sub-action 触发生成。" />
                  )}
                </div>
              </div>
            )
          )}
          {view === 'questionnaire' && (
            surveyBundle ? (
              <div className="rd-questionnaire-glass" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
                <ResearchQuestionnaire
                  bundle={surveyBundle}
                  groupBy={groupBy}
                  selectedRole={selectedRole}
                  selectedLtcKey={selectedLtcKey}
                  selectedPhase={selectedPhase}
                  onChangePhase={setSelectedPhase}
                  onRefetch={onRefetch}
                  ltcModules={ltcDict?.modules ?? []}
                />
              </div>
            ) : (
              <div className="p-6">
                <EmptyHint text="尚未生成调研问卷。请到「调研问卷」sub-action 触发生成。" />
              </div>
            )
          )}
          {view === 'report' && (
            <div className="min-h-full px-5 py-5">
              <div className="max-w-[1600px] mx-auto">
                {reportBundle ? (
                  <div className="rd-card overflow-hidden" style={{ padding: 0 }}>
                    <ReportHeaderBar bundle={reportBundle} />
                    <div className="px-8 py-7 overflow-x-auto">
                      <ReportMarkdownView bundle={reportBundle} />
                    </div>
                  </div>
                ) : (
                  <ReportEmptyState
                    projectId={projectId}
                    inflight={reportInflight}
                    onRefetch={onRefetch}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 右:引用追溯 ── */}
      {view === 'outline' && outlineBundle && Object.keys(outlineBundle.provenance || {}).length > 0 ? (
        refsOpen ? (
          <div
            className="w-[320px] flex-shrink-0"
            style={{
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(32px) saturate(180%)',
              WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.10)',
            }}
          >
            <CitationsPanel
              bundle={outlineBundle}
              highlightedRefId={highlightedRef}
              onPreviewDoc={() => {}}
              onClose={() => setRefsOpen(false)}
            />
          </div>
        ) : (
          <aside className="rd-side-rail rd-side-rail--right">
            <button
              onClick={() => setRefsOpen(true)}
              className="rd-rail-fab rd-rail-fab--right"
              title="展开引用追溯面板"
            >
              <span className="rd-rail-fab-glow" aria-hidden />
              <span className="rd-rail-fab-icon"><Sparkles size={15} /></span>
              <span className="rd-rail-fab-label">引用追溯</span>
            </button>
          </aside>
        )
      ) : null}
      </div>
    </div>
  )
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function GroupTabBtn({
  active, onClick, icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-xs rounded-md transition"
      style={{
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: active ? 'var(--rd-text)' : 'var(--rd-text-2)',
        fontWeight: active ? 600 : 400,
        boxShadow: active ? '0 1px 4px rgba(20,20,40,0.08)' : 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function AudienceRoleRow({
  role, selected, total, pre, meeting, onClick,
}: {
  role: ResearchAudienceRole
  selected: boolean
  total: number
  pre: number
  meeting: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-2 rounded-md text-xs transition"
      style={{
        background: selected ? 'rgba(255,141,26,0.10)' : 'transparent',
        border: selected ? '1px solid rgba(255,141,26,0.25)' : '1px solid transparent',
        color: selected ? 'var(--rd-accent)' : 'var(--rd-text)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">{AUDIENCE_ROLE_LABELS[role]}</span>
        {total > 0 ? (
          <span
            className="shrink-0 text-xs px-1 rounded"
            style={{ color: 'var(--rd-text-2)', background: 'rgba(255,255,255,0.06)' }}
          >
            {total} 题
          </span>
        ) : (
          <span className="shrink-0 text-xs" style={{ color: 'var(--rd-text-3)' }}>—</span>
        )}
      </div>
      <div className="mt-0.5 text-xs truncate" style={{ color: 'var(--rd-text-3)' }}>
        {AUDIENCE_ROLE_DESC[role]}
      </div>
      {total > 0 && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span style={{ color: '#3b82f6' }}>会前 {pre}</span>
          <span style={{ color: '#10b981' }}>会中 {meeting}</span>
        </div>
      )}
    </button>
  )
}

function LtcModuleRow({
  module: m, selected, hit, answeredCount, onClick,
}: {
  module: ResearchLtcDictionaryEntry
  selected: boolean
  hit: boolean
  answeredCount: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition"
      style={{
        background: selected ? 'rgba(255,141,26,0.10)' : 'transparent',
        border: selected ? '1px solid rgba(255,141,26,0.25)' : '1px solid transparent',
        color: selected ? 'var(--rd-accent)' : 'var(--rd-text)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ background: hit ? 'var(--rd-accent)' : m.category === 'support' ? '#cbd5e1' : '#94a3b8' }}
      />
      <span className="font-medium truncate">{m.label}</span>
      <span className="text-xs ml-auto shrink-0" style={{ color: 'var(--rd-text-3)' }}>{m.key.split('_')[0]}</span>
      {answeredCount > 0 && (
        <span
          className="text-xs shrink-0 px-1 rounded"
          style={{ color: 'var(--rd-text-2)', background: 'rgba(255,255,255,0.06)' }}
        >
          {answeredCount} 题
        </span>
      )}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// ResearchGroupCarousel — 顶部分组 carousel(替代左栏 sidebar)
// role 模式:4 张角色卡(带完成度环 + pre/meeting 分布)
// LTC 模式:横向滚动 chip 卡(SOW 高亮)
// ──────────────────────────────────────────────────────────────────────────
function ResearchGroupCarousel({
  groupBy, setGroupBy,
  selectedRole, setSelectedRole,
  selectedLtcKey, setSelectedLtcKey,
  roleCounts,
  ltcModules, sowHitKeys, ltcMapItems,
  questionnaireItems,
}: {
  groupBy: GroupBy
  setGroupBy: (g: GroupBy) => void
  selectedRole: ResearchAudienceRole | null
  setSelectedRole: (r: ResearchAudienceRole) => void
  selectedLtcKey: string | null
  setSelectedLtcKey: (k: string) => void
  roleCounts: Record<ResearchAudienceRole, { total: number; pre: number; meeting: number }>
  ltcModules: ResearchLtcDictionaryEntry[]
  sowHitKeys: Set<string>
  ltcMapItems: { sow_term: string; is_extra: boolean }[]
  questionnaireItems: { ltc_module_key?: string | null }[]
}) {
  return (
    <div className="rd-survey-carousel">
      {/* 顶栏:分组方式切换 + 总计统计 */}
      <div className="rd-survey-carousel-bar">
        <div className="rd-survey-segment">
          <button
            onClick={() => setGroupBy('role')}
            className={`rd-survey-seg-btn${groupBy === 'role' ? ' is-active' : ''}`}
            title="按访谈角色分组"
          >
            <Users size={11} /> 按角色
          </button>
          <button
            onClick={() => setGroupBy('ltc')}
            className={`rd-survey-seg-btn${groupBy === 'ltc' ? ' is-active' : ''}`}
            title="按 LTC 业务模块分组"
          >
            <Briefcase size={11} /> 按 LTC
          </button>
        </div>
        <span className="rd-survey-bar-hint">
          {groupBy === 'role'
            ? '来自调研大纲的 4 类访谈人群,点卡片切换'
            : <>共 <strong>{ltcModules.length}</strong> 个 LTC 模块 ·
                <span style={{ color: 'var(--rd-accent-2)' }}> SOW 涉及 {sowHitKeys.size} 个</span></>}
        </span>
      </div>

      {/* 主体:卡片 carousel */}
      {groupBy === 'role' ? (
        <div className="rd-role-cards">
          {AUDIENCE_ROLE_ORDER.map(role => (
            <RoleCard
              key={role}
              role={role}
              selected={role === selectedRole}
              total={roleCounts[role].total}
              pre={roleCounts[role].pre}
              meeting={roleCounts[role].meeting}
              onClick={() => setSelectedRole(role)}
            />
          ))}
        </div>
      ) : (
        <div className="rd-ltc-strip">
          {ltcModules.map(m => {
            const selected = m.key === selectedLtcKey
            const hit = sowHitKeys.has(m.key)
            const answered = questionnaireItems.filter(q => q.ltc_module_key === m.key).length
            return (
              <button
                key={m.key}
                onClick={() => setSelectedLtcKey(m.key)}
                className={`rd-ltc-chip${selected ? ' is-active' : ''}${hit ? ' is-hit' : ''}`}
                title={hit ? `SOW 涉及 · ${m.label}` : m.label}
              >
                {hit && <span className="rd-ltc-chip-dot" />}
                <span className="rd-ltc-chip-label">{m.label}</span>
                {answered > 0 && <span className="rd-ltc-chip-count">{answered}</span>}
              </button>
            )
          })}
          {/* SOW 客户自定义模块 */}
          {Array.from(new Set(ltcMapItems.filter(it => it.is_extra).map(it => it.sow_term))).slice(0, 12).map(sowTerm => {
            const selected = sowTerm === selectedLtcKey
            const answered = questionnaireItems.filter(q => q.ltc_module_key === sowTerm).length
            return (
              <button
                key={sowTerm}
                onClick={() => setSelectedLtcKey(sowTerm)}
                className={`rd-ltc-chip rd-ltc-chip--custom${selected ? ' is-active' : ''}`}
                title={`SOW 自定义 · ${sowTerm}`}
              >
                <span className="rd-ltc-chip-dot" style={{ background: '#a78bfa' }} />
                <span className="rd-ltc-chip-label">{sowTerm}</span>
                {answered > 0 && <span className="rd-ltc-chip-count">{answered}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 单张角色卡 — 玻璃 + 进度环 + 选中态 glow
const ROLE_ICON_MAP: Record<ResearchAudienceRole, typeof Crown> = {
  executive: Crown,
  dept_head: Users,
  frontline: UserCircle2,
  it:        Cpu,
}
// 4 个角色用不同 accent 色,让横向排列时有视觉差异
const ROLE_COLOR: Record<ResearchAudienceRole, { hue: string; soft: string; ring: string }> = {
  executive: { hue: '#C084FC', soft: 'rgba(192,132,252,0.18)', ring: 'rgba(192,132,252,0.45)' },
  dept_head: { hue: '#FFB066', soft: 'rgba(255,141,26,0.18)',  ring: 'rgba(255,141,26,0.55)'  },
  frontline: { hue: '#60A5FA', soft: 'rgba(96,165,250,0.18)',  ring: 'rgba(96,165,250,0.45)'  },
  it:        { hue: '#34D399', soft: 'rgba(52,211,153,0.18)',  ring: 'rgba(52,211,153,0.45)'  },
}

function RoleCard({
  role, selected, total, pre, meeting, onClick,
}: {
  role: ResearchAudienceRole
  selected: boolean
  total: number
  pre: number
  meeting: number
  onClick: () => void
}) {
  const Icon = ROLE_ICON_MAP[role]
  const colors = ROLE_COLOR[role]
  // 进度环:完成度 = (pre + meeting) / total (其实就是 100% 当有题时,但保留语义)
  // 这里用 meeting / total 作为「现场访谈题占比」可视化
  const meetingPct = total > 0 ? Math.round(meeting / total * 100) : 0
  const R = 22
  const C = 2 * Math.PI * R
  const dash = total > 0 ? (meetingPct / 100) * C : 0

  return (
    <button
      onClick={onClick}
      className={`rd-role-card${selected ? ' is-active' : ''}${total === 0 ? ' is-empty' : ''}`}
      style={{
        '--role-hue':  colors.hue,
        '--role-soft': colors.soft,
        '--role-ring': colors.ring,
      } as React.CSSProperties}
      disabled={total === 0}
      title={total === 0 ? `${AUDIENCE_ROLE_LABELS[role]} · 无问卷` : AUDIENCE_ROLE_LABELS[role]}
    >
      <span className="rd-role-card-glow" aria-hidden />

      <div className="rd-role-card-head">
        <span className="rd-role-card-icon"><Icon size={15} /></span>
        <div className="rd-role-card-titles">
          <strong>{AUDIENCE_ROLE_LABELS[role]}</strong>
          <span className="rd-role-card-desc">{AUDIENCE_ROLE_DESC[role]}</span>
        </div>
      </div>

      <div className="rd-role-card-body">
        <div className="rd-role-card-num">
          <span className="big">{total}</span>
          <span className="unit">题</span>
        </div>
        <svg className="rd-role-ring" width="58" height="58" viewBox="0 0 58 58">
          <circle cx="29" cy="29" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="29" cy="29" r={R} fill="none"
            stroke={colors.hue} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            transform="rotate(-90 29 29)"
            style={{ filter: `drop-shadow(0 0 6px ${colors.ring})`, transition: 'stroke-dasharray .35s ease' }}
          />
          <text x="29" y="33" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="ui-monospace,monospace">
            {total > 0 ? `${meetingPct}%` : '—'}
          </text>
        </svg>
      </div>

      <div className="rd-role-card-foot">
        <span className="rd-role-pill rd-role-pill--pre">
          访前 <strong>{pre}</strong>
        </span>
        <span className="rd-role-pill rd-role-pill--meeting">
          现场 <strong>{meeting}</strong>
        </span>
      </div>
    </button>
  )
}

function ViewTab({
  active, onClick, icon, label, muted, disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  muted?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? '正在重新生成,请稍候…' : undefined}
      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition"
      style={{
        background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
        border: active ? '1px solid var(--rd-line)' : '1px solid transparent',
        color: active ? 'var(--rd-text)' : (muted ? 'var(--rd-text-3)' : 'var(--rd-text-2)'),
        boxShadow: active ? '0 1px 4px rgba(20,20,40,0.06)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function PreparationView({
  projectId, outlineBundle, outlineInflight, surveyBundle, surveyInflight,
  reportBundle, reportInflight,
  ltcMapCount, sowHitCount, extraCount, onRefetch,
}: {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
  reportBundle: CuratedBundle | undefined
  reportInflight: CuratedBundle | undefined
  ltcMapCount: number
  sowHitCount: number
  extraCount: number
  onRefetch: () => void
}) {
  const [trig, setTrig] = useState<OutputKind | null>(null)

  const trigger = async (kind: OutputKind) => {
    setTrig(kind)
    try {
      await generateOutput({ kind, project_id: projectId })
      onRefetch()
    } catch (e) {
      // GenerationProgressCard 会展示
    } finally {
      setTrig(null)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="text-base font-semibold" style={{ color: 'var(--rd-text)' }}>需求调研工作区</div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--rd-text-2)' }}>
        本工作区基于项目洞察 + SOW + 行业 knowhow,生成<strong style={{ color: 'var(--rd-text)' }}>调研大纲</strong>(顾问拿着上现场)
        和 <strong style={{ color: 'var(--rd-text)' }}>调研问卷</strong>(顾问录入选择题答案)。
      </div>

      <div
        className="rd-card text-xs space-y-1"
        style={{ padding: '14px 16px' }}
      >
        <div className="font-medium" style={{ color: 'var(--rd-text)' }}>SOW → LTC 流程映射</div>
        {ltcMapCount > 0 ? (
          <div style={{ color: 'var(--rd-text-2)' }}>
            已识别 {ltcMapCount} 项,其中字典命中 {sowHitCount} 个 LTC 模块,
            超出字典 {extraCount} 项(下方左栏底部列出)。
          </div>
        ) : (
          <div style={{ color: 'var(--rd-text-3)' }}>大纲生成时会自动跑 SOW → LTC 映射。当前未生成。</div>
        )}
      </div>

      <ProductCard
        title="调研大纲"
        bundle={outlineBundle}
        inflight={outlineInflight}
        triggering={trig === 'survey_outline'}
        onGenerate={() => trigger('survey_outline')}
      />

      <ProductCard
        title="调研问卷"
        bundle={surveyBundle}
        inflight={surveyInflight}
        triggering={trig === 'survey'}
        onGenerate={() => trigger('survey')}
        extraInfo={surveyBundle ? `结构化题目 ${surveyBundle.questionnaire_items?.length ?? 0} 道` : null}
        footerSlot={
          surveyBundle?.status === 'done' && (surveyBundle.questionnaire_items?.length ?? 0) > 0
            ? <ExportPreMeetingButton bundleId={surveyBundle.id} />
            : null
        }
      />

      <ProductCard
        title="调研报告"
        bundle={reportBundle}
        inflight={reportInflight}
        triggering={trig === 'research_report'}
        onGenerate={() => trigger('research_report')}
        extraInfo="建议 outline / 问卷答案填得差不多了再生成,生成耗时 2-4 分钟"
      />
    </div>
  )
}


// ── 调研报告渲染(Liquid Glass 版) ────────────────────────────────────────

function ReportHeaderBar({ bundle }: { bundle: CuratedBundle }) {
  const updatedAt = bundle.updated_at ? new Date(bundle.updated_at) : null
  const stamp = updatedAt
    ? `${String(updatedAt.getMonth() + 1).padStart(2, '0')}/${String(updatedAt.getDate()).padStart(2, '0')} ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`
    : ''
  const ss = (bundle as any).sources_summary as
    | { docs_n?: number; prior_bundles_n?: number; meetings_n?: number; answered_responses_n?: number; industry_pack?: string | null }
    | undefined
  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ borderBottom: '1px solid var(--rd-line)', background: 'rgba(255,255,255,0.05)' }}
    >
      <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: 'var(--rd-text-2)' }}>
        <FileText size={11} style={{ color: 'var(--rd-accent)' }} />
        <span className="font-medium" style={{ color: 'var(--rd-text)' }}>{bundle.title || '调研报告'}</span>
        {stamp && <span>· 生成于 {stamp}</span>}
        {ss && (
          <span style={{ color: 'var(--rd-text-3)' }}>
            · 素材 {ss.docs_n || 0} 份文档 · {ss.prior_bundles_n || 0} 份上游产物
            {(ss.meetings_n || 0) > 0 ? ` · ${ss.meetings_n} 场会议` : ''}
            {(ss.answered_responses_n || 0) > 0 ? ` · ${ss.answered_responses_n} 道已答` : ''}
            {ss.industry_pack ? ` · 行业:${ss.industry_pack}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function ReportEmptyState({
  projectId, inflight, onRefetch,
}: {
  projectId: string
  inflight: CuratedBundle | undefined
  onRefetch: () => void
}) {
  const [triggering, setTriggering] = useState(false)
  const trigger = async () => {
    setTriggering(true)
    try {
      await generateOutput({ kind: 'research_report', project_id: projectId })
      onRefetch()
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || '触发生成失败')
    } finally {
      setTriggering(false)
    }
  }
  return (
    <div className="p-2 max-w-3xl mx-auto">
      <div
        className="rd-card space-y-3"
        style={{ padding: 18 }}
      >
        <div className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--rd-text)' }}>
          <FileText size={15} style={{ color: 'var(--rd-accent)' }} />
          调研报告
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--rd-text-2)' }}>
          综合本项目所有文档 + 上游产物(项目洞察 / 调研大纲 / 调研问卷)+ 会议素材 +
          顾问已答 + 行业最佳实践,一次输出 8 章「调研报告」(执行摘要 / 客户现状 /
          业务线与流程 / 业务诉求与痛点 / 结构化需求清单 / SOW-LTC 覆盖度 /
          方案设计建议 / 风险与下一步),作为 PM 出方案设计的核心输入。
        </div>
        <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>
          建议大纲 / 问卷答案填得差不多了再生成。耗时 2-4 分钟。
        </div>
        {inflight ? (
          <GenerationProgressCard bundle={inflight} />
        ) : (
          <button
            onClick={trigger}
            disabled={triggering}
            className="rd-btn rd-btn-primary inline-flex items-center gap-1 px-4 py-2 text-sm"
          >
            {triggering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            立即生成调研报告
          </button>
        )}
      </div>
    </div>
  )
}

function ReportMarkdownView({ bundle }: { bundle: CuratedBundle }) {
  const { data, isLoading } = useQuery({
    queryKey: ['research-report-detail', bundle.id],
    queryFn: () => getOutput(bundle.id),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? (bundle as any) : undefined,
  })
  if (isLoading) {
    return <div className="text-center py-12 text-xs" style={{ color: 'var(--rd-text-3)' }}>加载报告内容…</div>
  }
  const md = data?.content_md
  if (!md) {
    return <div className="text-sm italic py-8 text-center" style={{ color: 'var(--rd-text-3)' }}>报告无 markdown 内容</div>
  }
  // 复用 outline 同款深色 markdown 渲染(无 provenance → 无角标)
  return <InsightReportDark content={md} provenance={{}} onCitationClick={() => {}} />
}


function ProductCard({
  title, bundle, inflight, triggering, onGenerate, extraInfo, footerSlot,
}: {
  title: string
  bundle: CuratedBundle | undefined
  inflight: CuratedBundle | undefined
  triggering: boolean
  onGenerate: () => void
  extraInfo?: string | null
  footerSlot?: React.ReactNode
}) {
  const isDone = bundle?.status === 'done'
  const updatedAt = bundle?.updated_at ? new Date(bundle.updated_at) : null
  const stamp = updatedAt
    ? `${String(updatedAt.getMonth() + 1).padStart(2, '0')}/${String(updatedAt.getDate()).padStart(2, '0')} ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`
    : ''

  return (
    <div
      className="rd-card space-y-2"
      style={{
        padding: '16px',
        border: isDone ? '1px solid rgba(16,185,129,0.25)' : undefined,
        boxShadow: isDone ? '0 0 0 1px rgba(16,185,129,0.10) inset, 0 4px 16px rgba(20,20,40,0.05)' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--rd-text)' }}>
            <span>{title}</span>
            {isDone && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(16,185,129,0.10)',
                  color: '#34D399',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <CheckCircle2 size={10} />
                已生成{stamp ? ` · ${stamp}` : ''}
              </span>
            )}
          </div>
          {extraInfo && (
            <div className="text-xs mt-1.5" style={{ color: 'var(--rd-text-2)' }}>{extraInfo}</div>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={triggering || !!inflight}
          className="rd-btn rd-btn-primary shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {(triggering || inflight) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {bundle ? '重新生成' : '生成'}
        </button>
      </div>
      {inflight && (
        <GenerationProgressCard bundle={inflight} />
      )}
      {footerSlot && (
        <div
          className="pt-2 flex items-center gap-2 flex-wrap"
          style={{ borderTop: '1px solid var(--rd-line)' }}
        >
          <span className="text-xs" style={{ color: 'var(--rd-text-3)' }}>导出 / 分发:</span>
          {footerSlot}
        </div>
      )}
    </div>
  )
}

function OutlineMarkdownView({
  bundle, onCitationClick,
}: {
  bundle: CuratedBundle
  onCitationClick?: (moduleKey: string, refId: string) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['research-outline-detail', bundle.id],
    queryFn: () => getOutput(bundle.id),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  if (isLoading) {
    return <div className="text-center py-12 text-xs" style={{ color: 'var(--rd-text-3)' }}>加载大纲内容…</div>
  }
  const md = data?.content_md
  if (!md) {
    return <div className="text-sm italic py-8 text-center" style={{ color: 'var(--rd-text-3)' }}>没有 markdown 内容</div>
  }
  const provenance = (data?.provenance ?? bundle.provenance) || {}
  // 无论有无引用,统一走深色版渲染(没引用时 provenance={} 自然不会渲染角标)
  return (
    <InsightReportDark
      content={md}
      provenance={provenance}
      onCitationClick={onCitationClick || (() => {})}
    />
  )
}

function OutlineEditorView({
  bundle, onDone,
}: {
  bundle: CuratedBundle
  onDone: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['research-outline-detail', bundle.id],
    queryFn: () => getOutput(bundle.id),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  if (isLoading || !data?.content_md) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--rd-text-3)' }}>
        <Loader2 size={14} className="inline animate-spin mr-1" /> 加载大纲内容…
      </div>
    )
  }
  return (
    <MarkdownEditor
      bundle={bundle}
      initialContent={data.content_md}
      onClose={onDone}
      onSaved={onDone}
    />
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-sm" style={{ color: 'var(--rd-text-3)' }}>
      <Lightbulb size={20} className="mx-auto mb-2 opacity-50" />
      {text}
    </div>
  )
}
