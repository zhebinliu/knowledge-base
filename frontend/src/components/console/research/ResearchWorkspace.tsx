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
  CheckCircle2, ChevronRight,
} from 'lucide-react'
import {
  generateOutput,
  getLtcDictionary,
  getOutput,
  listResearchLtcModuleMap,
  type CuratedBundle,
  type ResearchLtcDictionaryEntry,
  type OutputKind,
} from '../../../api/client'
import MarkdownView from '../../MarkdownView'
import CitedReportView from '../CitedReportView'
import CitationsPanel from '../CitationsPanel'
import GenerationProgressCard from '../GenerationProgressCard'
import ResearchQuestionnaire from './ResearchQuestionnaire'

type ResearchView = 'preparation' | 'outline' | 'questionnaire'

interface Props {
  projectId: string
  outlineBundle: CuratedBundle | undefined
  outlineInflight: CuratedBundle | undefined
  surveyBundle: CuratedBundle | undefined
  surveyInflight: CuratedBundle | undefined
  /** 当前选中的 sub-kind:决定中栏默认显示 outline 还是 questionnaire */
  activeKind: OutputKind | null
  onRefetch: () => void
}

export default function ResearchWorkspace({
  projectId, outlineBundle, outlineInflight, surveyBundle, surveyInflight, activeKind, onRefetch,
}: Props) {
  const [selectedLtcKey, setSelectedLtcKey] = useState<string | null>(null)
  const [view, setView] = useState<ResearchView>('preparation')
  const [refsOpen, setRefsOpen] = useState(false)   // 右侧"引用追溯"默认收起
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)  // 报告角标点击 → 同步

  // activeKind 切换 → 切默认 view(顾问点顶部 sub-action 切换大纲/问卷)
  useEffect(() => {
    if (activeKind === 'survey_outline') {
      setView(outlineBundle ? 'outline' : 'preparation')
    } else if (activeKind === 'survey') {
      setView(surveyBundle ? 'questionnaire' : 'preparation')
    }
  }, [activeKind, outlineBundle?.id, surveyBundle?.id])

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

  // 第一次进来,如果 sow 命中了模块,自动选第一个
  useEffect(() => {
    if (selectedLtcKey || !ltcDict?.modules?.length) return
    const firstHit = ltcDict.modules.find(m => sowHitKeys.has(m.key))
    setSelectedLtcKey(firstHit?.key ?? ltcDict.modules[0].key)
  }, [ltcDict, sowHitKeys, selectedLtcKey])

  return (
    <div className="flex-1 min-h-0 flex bg-canvas overflow-hidden relative">
      {/* ── 左:LTC 模块清单 ── */}
      <div className="w-[280px] flex-shrink-0 border-r border-line bg-white flex flex-col">
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-line">
          <div className="text-[11px] text-ink-muted">LTC 流程模块</div>
          <div className="text-xs text-ink mt-0.5">
            共 {ltcDict?.modules?.length ?? 0} 个 ·
            <span className="text-orange-600 ml-1">SOW 涉及 {sowHitKeys.size} 个</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
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
        </div>
      </div>

      {/* ── 中:工作区 ── */}
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
        {/* 顶栏:view 切换 */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-line bg-slate-50/60 flex items-center gap-1">
          <ViewTab active={view === 'preparation'} onClick={() => setView('preparation')}
                   icon={<Sparkles size={11} />} label="准备" />
          <ViewTab active={view === 'outline'} onClick={() => setView('outline')}
                   icon={<ClipboardList size={11} />} label="调研大纲"
                   muted={!outlineBundle} />
          <ViewTab active={view === 'questionnaire'} onClick={() => setView('questionnaire')}
                   icon={<Workflow size={11} />} label="调研问卷(录入)"
                   muted={!surveyBundle} />
          <div className="flex-1" />
          {selectedLtcKey && view === 'questionnaire' && (
            <span className="text-[11px] text-ink-muted">
              当前模块:{ltcDict?.modules?.find(m => m.key === selectedLtcKey)?.label || selectedLtcKey}
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
              ltcMapCount={ltcMap?.items?.length ?? 0}
              sowHitCount={sowHitKeys.size}
              extraCount={(ltcMap?.items ?? []).filter(it => it.is_extra).length}
              onRefetch={onRefetch}
            />
          )}
          {view === 'outline' && (
            // 灰底 + 白卡 — 与项目洞察 ReportView 同款样式(CenterWorkspace.tsx:394)
            <div className="bg-canvas min-h-full px-5 py-5">
              <div className="max-w-[1200px] mx-auto">
                {outlineBundle ? (
                  <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
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
          )}
          {view === 'questionnaire' && (
            surveyBundle ? (
              <ResearchQuestionnaire
                bundle={surveyBundle}
                selectedLtcKey={selectedLtcKey}
              />
            ) : (
              <div className="p-6">
                <EmptyHint text="尚未生成调研问卷。请到「调研问卷」sub-action 触发生成。" />
              </div>
            )
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
  active, onClick, icon, label, muted,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition ${
        active
          ? 'bg-white text-ink ring-1 ring-line shadow-sm'
          : muted
          ? 'text-ink-muted hover:text-ink hover:bg-white/60'
          : 'text-ink-secondary hover:text-ink hover:bg-white/60'
      }`}
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
      />
    </div>
  )
}

function ProductCard({
  title, subtitle, bundle, inflight, triggering, onGenerate, extraInfo,
}: {
  title: string
  subtitle: string
  bundle: CuratedBundle | undefined
  inflight: CuratedBundle | undefined
  triggering: boolean
  onGenerate: () => void
  extraInfo?: string | null
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
    </div>
  )
}

/** 大纲 markdown 渲染 — 复用 insight 同款 CitedReportView,把 [D1][K1][W1] 角标渲染成
 *  可点击橙色徽章。bundle.provenance 由 generate_survey_outline 在 v3.7+ 写入。
 *  list API 不返回 content_md / provenance,需单独 GET /api/outputs/{id} 拿详情。 */
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-ink-muted text-sm">
      <Lightbulb size={20} className="mx-auto mb-2 opacity-50" />
      {text}
    </div>
  )
}
