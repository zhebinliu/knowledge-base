/**
 * ResearchWorkspace —— survey stage 的三栏工作区(MVP)
 *
 * 布局:左 LTC 模块清单 + 中 切换视图(preparation / outline / questionnaire) + 右占位
 * 数据流:
 *   - outline bundle (kind=survey_outline):承载 markdown 大纲 + bundle.extra.ltc_module_map
 *   - survey  bundle (kind=survey)        :承载 markdown 题目 + bundle.extra.questionnaire_items[]
 *   - 顾问录入答案走 /api/research/responses(upsert by bundle_id+item_key)
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, Lightbulb, Sparkles, Loader2, Workflow,
  CheckCircle2, ChevronRight, Pencil, Users, Briefcase, FileText,
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

// 受访角色的固定顺序与中文标签 — 与 backend AUDIENCE_ROLE_LABELS 保持一致
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
import MarkdownView from '../../MarkdownView'
import CitedReportView from '../CitedReportView'
import CitationsPanel from '../CitationsPanel'
import MarkdownEditor from '../MarkdownEditor'
import GenerationProgressCard from '../GenerationProgressCard'
import ResearchQuestionnaire from './ResearchQuestionnaire'
import ExportPreMeetingButton from './ExportPreMeetingButton'

type ResearchView = 'preparation' | 'outline' | 'questionnaire' | 'report'

interface Props {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
  reportBundle: CuratedBundle | undefined
  reportInflight: CuratedBundle | undefined
  /** 当前选中的 sub-kind:决定中栏默认显示 outline / questionnaire / report */
  activeKind: OutputKind | null
  onRefetch: () => void
}

export default function ResearchWorkspace({
  projectId, outlineBundle, outlineInflight, surveyBundle, surveyInflight,
  reportBundle, reportInflight, activeKind, onRefetch,
}: Props) {
  const [selectedLtcKey, setSelectedLtcKey] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('role')                       // 默认按角色分组
  const [selectedRole, setSelectedRole] = useState<ResearchAudienceRole | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<ResearchQuestionPhase | 'all'>('all')
  const [view, setView] = useState<ResearchView>('preparation')
  const [refsOpen, setRefsOpen] = useState(false)   // 右侧"引用追溯"默认收起
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)  // 报告角标点击 → 同步
  const [outlineEditing, setOutlineEditing] = useState(false)  // 调研大纲在线编辑模式

  // activeKind 切换 → 切默认 view(顾问点顶部 sub-action 切换大纲/问卷/报告)
  // 注意 research_report 不 fallback 到 preparation — 没生成时 report view 内部
  // 渲染 ReportEmptyState(独立的「生成调研报告」卡片),让用户体感连贯,不会"sub-action
  // 切过去又被弹回准备页"。outline / questionnaire 保留旧 fallback 行为(它们的
  // preparation 卡片是历史路径,不动以免影响现有顾问操作习惯)。
  useEffect(() => {
    if (activeKind === 'survey_outline') {
      setView(outlineBundle ? 'outline' : 'preparation')
    } else if (activeKind === 'survey') {
      setView(surveyBundle ? 'questionnaire' : 'preparation')
    } else if (activeKind === 'research_report') {
      setView('report')
    }
  }, [activeKind, outlineBundle?.id, surveyBundle?.id, reportBundle?.id])

  // 重新生成进行中 → 强制跳回准备页,展示 GenerationProgressCard
  // 仅在 inflight 从无到有的瞬间触发(id 变化即识别为新任务)
  const outlineInflightId = outlineInflight?.id
  const surveyInflightId = surveyInflight?.id
  const reportInflightId = reportInflight?.id
  useEffect(() => {
    if (outlineInflightId || surveyInflightId || reportInflightId) {
      setView('preparation')
      setOutlineEditing(false)
    }
  }, [outlineInflightId, surveyInflightId, reportInflightId])

  // LTC 字典
  const { data: ltcDict } = useQuery({
    queryKey: ['research-ltc-dict'],
    queryFn: getLtcDictionary,
    staleTime: 60 * 60 * 1000,  // 字典稳定,缓存 1 小时
  })

  // SOW → LTC 映射(outline 生成后落库的)
  const { data: ltcMap } = useQuery({
    queryKey: ['research-ltc-module-map', projectId],
    queryFn: () => listResearchLtcModuleMap(projectId),
    enabled: !!projectId,
  })

  // 字典里命中的 module set —— 用于左栏标记"SOW 涉及"
  const sowHitKeys = useMemo(() => {
    const s = new Set<string>()
    for (const it of (ltcMap?.items ?? [])) {
      if (it.mapped_ltc_key) s.add(it.mapped_ltc_key)
    }
    return s
  }, [ltcMap])

  // 问卷 items(后端 _bundle_dto 已经 flat 出来)
  const questionnaireItems = useMemo(() => surveyBundle?.questionnaire_items ?? [], [surveyBundle])

  // 按角色统计题数(全卷 / 会前 / 会中 三档)
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

  // 第一次进来:按角色模式默认选第一个有题的角色;按 LTC 模式默认选 SOW 命中的第一个模块
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
    <div className="flex-shrink-0 h-[calc(100vh-56px)] flex bg-canvas overflow-hidden relative">
      {/* ── 左:分组面板 ── */}
      <div className="w-[280px] flex-shrink-0 border-r border-line bg-white flex flex-col">
        {/* 分组方式切换 */}
        <div className="flex-shrink-0 px-2.5 pt-2.5 pb-2 border-b border-line">
          <div className="text-[11px] text-ink-muted mb-1.5">问卷分组方式</div>
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded">
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

        {/* 列表主体 */}
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
          {groupBy === 'role' ? (
            <>
              <div className="text-[10px] text-ink-muted px-1 mb-1">
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
              <div className="text-[10px] text-ink-muted px-1 mb-1">
                共 {ltcDict?.modules?.length ?? 0} 个 ·
                <span className="text-orange-600 ml-1">SOW 涉及 {sowHitKeys.size} 个</span>
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
                <div className="mt-2 pt-2 border-t border-line">
                  <div className="text-[10px] text-ink-muted px-1 mb-1">SOW 客户自定义模块</div>
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
                          className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition ${
                            selected ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'hover:bg-slate-50 text-ink-secondary'
                          }`}
                        >
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400" />
                          <span className="truncate flex-1">{sowTerm}</span>
                          {answeredCount > 0 && (
                            <span className="text-[10px] text-ink-muted shrink-0 bg-slate-100 px-1 rounded">
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
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
        {/* 顶栏:view 切换 */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-line bg-slate-50/60 flex items-center gap-1">
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
          {/* 大纲已生成 + 不在生成中 → 顶栏常驻「生成 / 重新生成调研问卷」按钮(无需切回准备页) */}
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
              className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium text-white border border-orange-700"
              style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}
              title={surveyBundle ? '基于当前大纲重新生成问卷(旧答案不会迁移)' : '基于调研大纲一键生成结构化问卷'}
            >
              <Sparkles size={11} />
              {surveyBundle ? '重新生成调研问卷' : '生成调研问卷'}
            </button>
          )}
          {view === 'questionnaire' && (
            <span className="text-[11px] text-ink-muted">
              {groupBy === 'role'
                ? (selectedRole ? `当前角色:${AUDIENCE_ROLE_LABELS[selectedRole]}` : '请选择左侧角色')
                : (selectedLtcKey ? `当前模块:${ltcDict?.modules?.find(m => m.key === selectedLtcKey)?.label || selectedLtcKey}` : '请选择左侧模块')}
            </span>
          )}
        </div>
        {/* 主体 */}
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
            // 编辑态:全屏 OutlineEditorView(独立 fiber tree);非编辑态:灰底+白卡同 ReportView
            outlineEditing && outlineBundle ? (
              <OutlineEditorView
                bundle={outlineBundle}
                onDone={() => setOutlineEditing(false)}
              />
            ) : (
              <div className="bg-canvas min-h-full px-5 py-5">
                <div className="max-w-[1600px] mx-auto">
                  {outlineBundle ? (
                    <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
                      <div className="flex items-center justify-end px-4 py-2 border-b border-line bg-slate-50/40">
                        <button
                          onClick={() => setOutlineEditing(true)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
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
            ) : (
              <div className="p-6">
                <EmptyHint text="尚未生成调研问卷。请到「调研问卷」sub-action 触发生成。" />
              </div>
            )
          )}
          {view === 'report' && (
            <div className="bg-canvas min-h-full px-5 py-5">
              <div className="max-w-[1600px] mx-auto">
                {reportBundle ? (
                  <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
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

      {/* ── 右:引用追溯(复用 InsightWorkspace 的 CitationsPanel) ──
          只对 outline view 有意义 — 大纲 markdown 里有 [D1][K1][W1] 角标 + provenance
          questionnaire / preparation view 时不展示 */}
      {view === 'outline' && outlineBundle && Object.keys(outlineBundle.provenance || {}).length > 0 ? (
        refsOpen ? (
          <div className="w-[320px] flex-shrink-0 border-l border-line">
            <CitationsPanel
              bundle={outlineBundle}
              highlightedRefId={highlightedRef}
              onPreviewDoc={() => { /* ResearchWorkspace 暂无中栏文档预览,doc 引用打开新窗口在 CitationsPanel 内已处理 */ }}
              onClose={() => setRefsOpen(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setRefsOpen(true)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-2 py-3 bg-white border border-line rounded-l-md shadow text-xs text-ink-secondary hover:text-ink hover:border-orange-300"
            style={{ writingMode: 'vertical-rl' as any }}
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
      className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] rounded transition ${
        active
          ? 'bg-white text-ink shadow-sm font-medium'
          : 'text-ink-secondary hover:text-ink'
      }`}
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
      className={`w-full text-left px-2 py-2 rounded text-xs transition ${
        selected
          ? 'bg-orange-50 ring-1 ring-orange-200 text-orange-800'
          : 'hover:bg-slate-50 text-ink'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">{AUDIENCE_ROLE_LABELS[role]}</span>
        {total > 0 ? (
          <span className="shrink-0 text-[10px] text-ink-muted bg-slate-100 px-1 rounded">
            {total} 题
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-ink-muted">—</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-ink-muted truncate">
        {AUDIENCE_ROLE_DESC[role]}
      </div>
      {total > 0 && (
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          <span className="text-blue-600">会前 {pre}</span>
          <span className="text-emerald-700">会中 {meeting}</span>
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
      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition ${
        selected ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'hover:bg-slate-50 text-ink'
      }`}
    >
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
        hit ? 'bg-orange-500' : m.category === 'support' ? 'bg-slate-300' : 'bg-slate-400'
      }`} />
      <span className="font-medium truncate">{m.label}</span>
      <span className="text-[10px] text-ink-muted ml-auto shrink-0">{m.key.split('_')[0]}</span>
      {answeredCount > 0 && (
        <span className="text-[10px] text-ink-muted shrink-0 bg-slate-100 px-1 rounded">
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
      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition ${
        active
          ? 'bg-white text-ink ring-1 ring-line shadow-sm'
          : muted
          ? 'text-ink-muted hover:text-ink hover:bg-white/60'
          : 'text-ink-secondary hover:text-ink hover:bg-white/60'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
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
      // 不弹 alert,GenerationProgressCard 会显示
    } finally {
      setTrig(null)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="text-base font-semibold text-ink">需求调研工作区</div>
      <div className="text-sm text-ink-secondary leading-relaxed">
        本工作区基于项目洞察 + SOW + 行业 knowhow,生成<strong>调研大纲</strong>(顾问拿着上现场)
        和 <strong>调研问卷</strong>(顾问录入选择题答案)。
      </div>

      {/* SOW 映射状态 */}
      <div className="rounded-lg border border-line bg-slate-50/40 p-3 text-xs space-y-1">
        <div className="font-medium text-ink">SOW → LTC 流程映射</div>
        {ltcMapCount > 0 ? (
          <div className="text-ink-secondary">
            已识别 {ltcMapCount} 项,其中字典命中 {sowHitCount} 个 LTC 模块,
            超出字典 {extraCount} 项(下方左栏底部列出)。
          </div>
        ) : (
          <div className="text-ink-muted">大纲生成时会自动跑 SOW → LTC 映射。当前未生成。</div>
        )}
      </div>

      {/* 调研大纲 */}
      <ProductCard
        title="调研大纲"
        subtitle="顾问拿着上现场访谈用 — 9 列日程表 + 主题 + 客户准备材料"
        bundle={outlineBundle}
        inflight={outlineInflight}
        triggering={trig === 'survey_outline'}
        onGenerate={() => trigger('survey_outline')}
      />

      {/* 调研问卷 */}
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

      {/* 调研报告 — 调研收尾产物,给 PM 出方案设计 */}
      <ProductCard
        title="调研报告"
        subtitle="综合本项目所有文档 + 上游产物 + 会议素材 + 行业最佳实践,一次性输出 7 章「调研报告」,作为方案设计的核心输入"
        bundle={reportBundle}
        inflight={reportInflight}
        triggering={trig === 'research_report'}
        onGenerate={() => trigger('research_report')}
        extraInfo={reportBundle?.status === 'done'
          ? '建议 outline / 问卷答案填得差不多了再生成,生成耗时 2-4 分钟'
          : '建议 outline / 问卷答案填得差不多了再生成,生成耗时 2-4 分钟'}
      />
    </div>
  )
}


// ── 调研报告渲染 ────────────────────────────────────────────────────────────

function ReportHeaderBar({ bundle }: { bundle: CuratedBundle }) {
  const updatedAt = bundle.updated_at ? new Date(bundle.updated_at) : null
  const stamp = updatedAt
    ? `${String(updatedAt.getMonth() + 1).padStart(2, '0')}/${String(updatedAt.getDate()).padStart(2, '0')} ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`
    : ''
  const ss = (bundle as any).sources_summary as
    | { docs_n?: number; prior_bundles_n?: number; meetings_n?: number; answered_responses_n?: number; industry_pack?: string | null }
    | undefined
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-slate-50/40">
      <div className="text-[11px] text-ink-secondary flex items-center gap-2 flex-wrap">
        <FileText size={11} className="text-orange-600" />
        <span className="font-medium text-ink">{bundle.title || '调研报告'}</span>
        {stamp && <span>· 生成于 {stamp}</span>}
        {ss && (
          <span className="text-ink-muted">
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
      <div className="rounded-lg border border-line bg-white p-5 space-y-3">
        <div className="text-base font-semibold text-ink flex items-center gap-2">
          <FileText size={15} className="text-orange-600" />
          调研报告
        </div>
        <div className="text-sm text-ink-secondary leading-relaxed">
          综合本项目所有文档 + 上游产物(项目洞察 / 调研大纲 / 调研问卷)+ 会议素材 +
          顾问已答 + 行业最佳实践,一次输出 8 章「调研报告」(执行摘要 / 客户现状 /
          业务线与流程 / 业务诉求与痛点 / 结构化需求清单 / SOW-LTC 覆盖度 /
          方案设计建议 / 风险与下一步),作为 PM 出方案设计的核心输入。
        </div>
        <div className="text-xs text-ink-muted">
          建议大纲 / 问卷答案填得差不多了再生成。耗时 2-4 分钟。
        </div>
        {inflight ? (
          <GenerationProgressCard bundle={inflight} />
        ) : (
          <button
            onClick={trigger}
            disabled={triggering}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
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
    return <div className="text-center py-12 text-xs text-ink-muted">加载报告内容…</div>
  }
  const md = data?.content_md
  if (!md) {
    return <div className="text-sm text-ink-muted italic py-8 text-center">报告无 markdown 内容</div>
  }
  // 跟项目洞察一致用 CitedReportView(支持引用 chips)
  const provenance = (data as any)?.provenance || {}
  return <CitedReportView content={md} provenance={provenance} onCitationClick={() => {}} />
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
    <div className={`rounded-lg border bg-white p-4 space-y-2 ${
      isDone ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-line'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {isDone && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium ring-1 ring-emerald-200">
                <CheckCircle2 size={10} />
                已生成{stamp ? ` · ${stamp}` : ''}
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted mt-1">{subtitle}</div>
          {extraInfo && (
            <div className="text-[11px] text-ink-secondary mt-1.5">{extraInfo}</div>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={triggering || !!inflight}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
        >
          {(triggering || inflight) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {bundle ? '重新生成' : '生成'}
        </button>
      </div>
      {inflight && (
        <GenerationProgressCard bundle={inflight} />
      )}
      {footerSlot && (
        <div className="pt-2 border-t border-line/60 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-ink-muted">导出 / 分发:</span>
          {footerSlot}
        </div>
      )}
    </div>
  )
}

/** 大纲 markdown 渲染 — 复用 insight 同款 CitedReportView,把 [D1][K1][W1] 角标渲染成
 *  可点击橙色徽章。bundle.provenance 由 generate_survey_outline 在 v3.7+ 写入。
 *  list API 不返回 content_md / provenance,需单独 GET /api/outputs/{id} 拿详情。
 *
 *  注:本组件只做"读"。"编辑态"由父组件直接渲染 <MarkdownEditor /> — 不传 editing prop
 *  让父子组件 hook 路径相互独立,避免 React error #310。 */
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
    return <div className="text-center py-12 text-xs text-ink-muted">加载大纲内容…</div>
  }
  const md = data?.content_md
  if (!md) {
    return <div className="text-sm text-ink-muted italic py-8 text-center">没有 markdown 内容</div>
  }
  // provenance 在 list 接口和 detail 接口都可能有,优先取 detail
  const provenance = (data?.provenance ?? bundle.provenance) || {}
  // 旧 bundle(没跑过 v3.7 的 outline)provenance 为空 → 退回 MarkdownView
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

/** 调研大纲编辑态:自己拉 content_md → 渲染 MarkdownEditor。
 *  跟 OutlineMarkdownView 完全独立的 fiber tree,避免 hook 路径混乱。 */
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
      <div className="h-full flex items-center justify-center text-xs text-ink-muted">
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
    <div className="text-center py-16 text-ink-muted text-sm">
      <Lightbulb size={20} className="mx-auto mb-2 opacity-50" />
      {text}
    </div>
  )
}
