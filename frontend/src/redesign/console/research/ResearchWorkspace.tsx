/**
 * ResearchWorkspace —— survey stage 三栏工作区(Liquid Glass 版)
 * 与旧版逻辑 100% 对齐,仅改 UI 风格
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, Lightbulb, Sparkles, Loader2, Workflow,
  CheckCircle2, Pencil, Users, Briefcase,
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
import MarkdownView from '../../../components/MarkdownView'
import CitedReportView from '../../../components/console/CitedReportView'
import CitationsPanel from '../CitationsPanel'
import MarkdownEditor from '../../../components/console/MarkdownEditor'
import GenerationProgressCard from '../GenerationProgressCard'
import ResearchQuestionnaire from '../../../components/console/research/ResearchQuestionnaire'
import ExportPreMeetingButton from '../../../components/console/research/ExportPreMeetingButton'

type ResearchView = 'preparation' | 'outline' | 'questionnaire'

interface Props {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
  activeKind: OutputKind | null
  onRefetch: () => void
}

export default function ResearchWorkspace({
  projectId, outlineBundle, outlineInflight, surveyBundle, surveyInflight, activeKind, onRefetch,
}: Props) {
  const [selectedLtcKey, setSelectedLtcKey] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('role')
  const [selectedRole, setSelectedRole] = useState<ResearchAudienceRole | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<ResearchQuestionPhase | 'all'>('all')
  const [view, setView] = useState<ResearchView>('preparation')
  const [refsOpen, setRefsOpen] = useState(false)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  const [outlineEditing, setOutlineEditing] = useState(false)

  useEffect(() => {
    if (activeKind === 'survey_outline') {
      setView(outlineBundle ? 'outline' : 'preparation')
    } else if (activeKind === 'survey') {
      setView(surveyBundle ? 'questionnaire' : 'preparation')
    }
  }, [activeKind, outlineBundle?.id, surveyBundle?.id])

  const outlineInflightId = outlineInflight?.id
  const surveyInflightId = surveyInflight?.id
  useEffect(() => {
    if (outlineInflightId || surveyInflightId) {
      setView('preparation')
      setOutlineEditing(false)
    }
  }, [outlineInflightId, surveyInflightId])

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
    <div className="flex-1 flex overflow-hidden relative" style={{ background: 'transparent', minHeight: 0 }}>
      {/* ── 左:分组面板 ── */}
      <div
        className="w-[280px] flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(255,255,255,0.50)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          borderRight: '1px solid rgba(255,255,255,0.55)',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.80), inset -1px 0 0 rgba(255,255,255,0.30)',
        }}
      >
        <div className="flex-shrink-0 px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--rd-line)' }}>
          <div className="text-xs mb-1.5" style={{ color: 'var(--rd-text-2)' }}>问卷分组方式</div>
          <div
            className="flex gap-1 p-0.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid var(--rd-line)' }}
          >
            <GroupTabBtn
              active={groupBy === 'role'}
              onClick={() => setGroupBy('role')}
              icon={<Users size={11} />}
              label="按角色"
            />
            <GroupTabBtn
              active={groupBy === 'ltc'}
              onClick={() => setGroupBy('ltc')}
              icon={<Briefcase size={11} />}
              label="按 LTC 模块"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
          {groupBy === 'role' ? (
            <>
              <div className="text-xs px-1 mb-1" style={{ color: 'var(--rd-text-3)' }}>
                来自调研大纲的不同访谈人群
              </div>
              {AUDIENCE_ROLE_ORDER.map(role => (
                <AudienceRoleRow
                  key={role}
                  role={role}
                  selected={role === selectedRole}
                  total={roleCounts[role].total}
                  pre={roleCounts[role].pre}
                  meeting={roleCounts[role].meeting}
                  onClick={() => {
                    setSelectedRole(role)
                    if (surveyBundle) setView('questionnaire')
                  }}
                />
              ))}
            </>
          ) : (
            <>
              <div className="text-xs px-1 mb-1" style={{ color: 'var(--rd-text-3)' }}>
                共 {ltcDict?.modules?.length ?? 0} 个 ·
                <span className="ml-1" style={{ color: 'var(--rd-accent)' }}>SOW 涉及 {sowHitKeys.size} 个</span>
              </div>
              {(ltcDict?.modules ?? []).map(m => (
                <LtcModuleRow
                  key={m.key}
                  module={m}
                  selected={m.key === selectedLtcKey}
                  hit={sowHitKeys.has(m.key)}
                  answeredCount={questionnaireItems.filter(q => q.ltc_module_key === m.key).length}
                  onClick={() => {
                    setSelectedLtcKey(m.key)
                    if (surveyBundle) setView('questionnaire')
                  }}
                />
              ))}
              {(ltcMap?.items ?? []).filter(it => it.is_extra).length > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--rd-line)' }}>
                  <div className="text-xs px-1 mb-1" style={{ color: 'var(--rd-text-3)' }}>SOW 客户自定义模块</div>
                  {Array.from(new Set((ltcMap?.items ?? []).filter(it => it.is_extra).map(it => it.sow_term)))
                    .slice(0, 12)
                    .map(sowTerm => {
                      const selected = sowTerm === selectedLtcKey
                      const answeredCount = questionnaireItems.filter(q => q.ltc_module_key === sowTerm).length
                      return (
                        <button
                          key={sowTerm}
                          onClick={() => {
                            setSelectedLtcKey(sowTerm)
                            if (surveyBundle) setView('questionnaire')
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition"
                          style={{
                            background: selected ? 'rgba(255,141,26,0.10)' : 'transparent',
                            color: selected ? 'var(--rd-accent)' : 'var(--rd-text-2)',
                            border: selected ? '1px solid rgba(255,141,26,0.25)' : '1px solid transparent',
                          }}
                          onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.55)' }}
                          onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                        >
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />
                          <span className="truncate flex-1">{sowTerm}</span>
                          {answeredCount > 0 && (
                            <span className="text-xs shrink-0 px-1 rounded" style={{ color: 'var(--rd-text-3)', background: 'rgba(255,255,255,0.55)' }}>
                              {answeredCount} 题
                            </span>
                          )}
                        </button>
                      )
                    })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 中:工作区 ── */}
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ background: 'transparent' }}
      >
        <div
          className="flex-shrink-0 px-3 py-2 flex items-center gap-1"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.45)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.80)',
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
                          background: 'rgba(255,255,255,0.55)',
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
        </div>
      </div>

      {/* ── 右:引用追溯 ── */}
      {view === 'outline' && outlineBundle && Object.keys(outlineBundle.provenance || {}).length > 0 ? (
        refsOpen ? (
          <div
            className="w-[320px] flex-shrink-0"
            style={{
              borderLeft: '1px solid rgba(255,255,255,0.55)',
              background: 'rgba(255,255,255,0.50)',
              backdropFilter: 'blur(32px) saturate(180%)',
              WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.80)',
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
          <button
            onClick={() => setRefsOpen(true)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-2 py-3 rounded-l-md text-xs"
            style={{
              writingMode: 'vertical-rl' as any,
              background: 'rgba(255,255,255,0.55)',
              border: '1px solid var(--rd-line)',
              boxShadow: '0 4px 16px rgba(20,20,40,0.06)',
              color: 'var(--rd-text-2)',
            }}
            title="展开引用追溯面板"
          >
            引用追溯
          </button>
        )
      ) : null}
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
        background: active ? 'rgba(255,255,255,0.55)' : 'transparent',
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
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.55)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">{AUDIENCE_ROLE_LABELS[role]}</span>
        {total > 0 ? (
          <span
            className="shrink-0 text-xs px-1 rounded"
            style={{ color: 'var(--rd-text-2)', background: 'rgba(255,255,255,0.55)' }}
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
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.55)' }}
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
          style={{ color: 'var(--rd-text-2)', background: 'rgba(255,255,255,0.55)' }}
        >
          {answeredCount} 题
        </span>
      )}
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
        background: active ? 'rgba(255,255,255,0.85)' : 'transparent',
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
  ltcMapCount, sowHitCount, extraCount, onRefetch,
}: {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
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
        subtitle="顾问拿着上现场访谈用 — 9 列日程表 + 主题 + 客户准备材料"
        bundle={outlineBundle}
        inflight={outlineInflight}
        triggering={trig === 'survey_outline'}
        onGenerate={() => trigger('survey_outline')}
      />

      <ProductCard
        title="调研问卷"
        subtitle="结构化题目(单选/多选/分级…) + 选项池预填,顾问勾选录入"
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
    </div>
  )
}

function ProductCard({
  title, subtitle, bundle, inflight, triggering, onGenerate, extraInfo, footerSlot,
}: {
  title: string
  subtitle: string
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
                  color: '#047857',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <CheckCircle2 size={10} />
                已生成{stamp ? ` · ${stamp}` : ''}
              </span>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--rd-text-3)' }}>{subtitle}</div>
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
  if (Object.keys(provenance).length === 0) {
    return <MarkdownView content={md} />
  }
  return (
    <CitedReportView
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
