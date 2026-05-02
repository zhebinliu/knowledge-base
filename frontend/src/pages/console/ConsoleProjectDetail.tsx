import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, ClipboardList, Lightbulb, MessageSquare, Sparkles,
  CheckCircle2, Loader2, Lock, Download, ExternalLink,
  Save, X, Wand2, AlertCircle, Pencil, Home, Files, Search,
  Bot, ShieldAlert, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  getProject, updateProject, generateCustomerProfile, generateOutput,
  listProjectDocuments, getDocumentMarkdown, listOutputs, downloadOutputUrl, viewOutputUrl,
  getOutput,
  getProjectMeta, TOKEN_STORAGE_KEY,
  getStageFlow,
  type CuratedBundle, type OutputKind, type Project, type ProjectDocument,
  type StageDef as ApiStageDef,
} from '../../api/client'
import OutputChatPanel from '../../components/OutputChatPanel'
import BriefDrawer from '../../components/BriefDrawer'
import MarkdownView from '../../components/MarkdownView'
import AgenticGapFiller from '../../components/AgenticGapFiller'
import DocChecklist from '../../components/console/DocChecklist'
import CenterWorkspace, { type CenterView } from '../../components/console/CenterWorkspace'
import CitationsPanel from '../../components/console/CitationsPanel'
import FloatingChat, { type FloatingChatState } from '../../components/console/FloatingChat'
import ChallengeRoundsPanel from '../../components/console/ChallengeRoundsPanel'
import ResearchWorkspace from '../../components/console/research/ResearchWorkspace'
import QA from '../QA'
import { useEffect } from 'react'

const BRIEF_KINDS: OutputKind[] = ['kickoff_pptx', 'kickoff_html', 'insight', 'survey', 'survey_outline']

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

// 图标白名单 — 与后端 stage_flow.ALLOWED_ICONS 对齐
const STAGE_ICON_MAP = {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
  // 其他 lucide 图标按需添加
} as const

interface SubKindDef {
  kind: OutputKind
  label: string
}
interface StageDef {
  key: string
  label: string
  kind: OutputKind | null               // 单一 kind(没有 subKinds 时使用)
  icon: typeof FileText
  active: boolean
  beta?: boolean                        // v2 / agentic 标记
  subKinds?: SubKindDef[]               // 可选:本 stage 下有多个产物(在 action strip 显示按钮组)
}

// 后端 ApiStageDef → 前端 StageDef:icon 字符串映射成组件
function _mapStage(s: ApiStageDef): StageDef {
  const IconComp = (STAGE_ICON_MAP as any)[s.icon] || FileText
  return {
    key: s.key,
    label: s.label,
    kind: (s.kind as OutputKind | null),
    icon: IconComp,
    active: s.active,
    beta: s.beta,
    subKinds: s.sub_kinds && s.sub_kinds.length > 0
      ? s.sub_kinds.map(sk => ({ kind: sk.kind as OutputKind, label: sk.label }))
      : undefined,
  }
}

// API 拉取失败时的默认 fallback(跟后端 DEFAULT_STAGES 同步)
const DEFAULT_STAGES: StageDef[] = [
  { key: 'insight',      label: '项目洞察',     kind: 'insight',      icon: Bot,      active: true },
  { key: 'kickoff',      label: '启动会·PPT',   kind: 'kickoff_pptx', icon: FileText, active: true },
  { key: 'kickoff_html', label: '启动会·HTML',  kind: 'kickoff_html', icon: FileText, active: true },
  { key: 'survey',       label: '需求调研',     kind: null,           icon: Bot,      active: true,
    subKinds: [
      { kind: 'survey_outline', label: '调研大纲' },
      { kind: 'survey',         label: '调研问卷' },
    ],
  },
  { key: 'design',     label: '方案设计', kind: null, icon: FileText, active: false },
  { key: 'implement',  label: '项目实施', kind: null, icon: FileText, active: false },
  { key: 'test',       label: '上线测试', kind: null, icon: FileText, active: false },
  { key: 'acceptance', label: '项目验收', kind: null, icon: FileText, active: false },
]

type ChatMode = { type: 'pm' } | { type: 'output'; kind: OutputKind; label: string }
type StageStatus = 'locked' | 'idle' | 'inflight' | 'done'

export default function ConsoleProjectDetail() {
  const nav = useNavigate()
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [chatMode, setChatMode] = useState<ChatMode>({ type: 'pm' })
  const [editing, setEditing] = useState(false)
  const [previewDocId, setPreviewDocId] = useState<string | null>(null)
  const [activeStageKey, setActiveStageKey] = useState<string>('insight')
  const [docsOpen, setDocsOpen] = useState(false)
  const [briefDrawer, setBriefDrawer] = useState<{ kind: OutputKind; label: string } | null>(null)
  // 当 active stage 有 subKinds 时,记当前选中的 sub-action(默认第一个)
  const [selectedSubKind, setSelectedSubKind] = useState<OutputKind | null>(null)
  // v3 insight stage 的中栏 view(其他 stage 不用)
  const [centerView, setCenterView] = useState<CenterView>({ type: 'preparation' })
  // 右栏(引用面板)是否展开
  const [rightOpen, setRightOpen] = useState(false)
  // 右栏当前高亮的引用 ID(报告角标点击 → 同步)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  // 浮动聊天框状态
  const [chatState, setChatState] = useState<FloatingChatState>({
    open: false, minimized: false, fullscreen: false,
  })

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id], queryFn: () => getProject(id!), enabled: !!id,
  })
  const { data: docs } = useQuery({
    queryKey: ['project-docs', id], queryFn: () => listProjectDocuments(id!), enabled: !!id,
  })
  const { data: outputs, refetch: refetchOutputs } = useQuery({
    queryKey: ['project-bundles', id],
    queryFn: () => listOutputs({ project_id: id, page: 1 }),
    enabled: !!id,
    refetchInterval: (q: any) => {
      // inflight 中 2s polling — 让 GenerationProgressCard 的进度更新更顺滑
      const items = q.state.data?.items ?? []
      return items.some((b: CuratedBundle) => b.status === 'pending' || b.status === 'generating') ? 2000 : false
    },
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })

  // 项目阶段流程 — 后端动态配置(/api/settings/stage-flow);失败 fallback 到内置默认
  // staleTime 短 + refetchOnMount=always:管理员改完配置,前台进项目页就能立刻看到新流程
  const { data: stageFlow } = useQuery({
    queryKey: ['stage-flow'],
    queryFn: getStageFlow,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
  // STAGES 加载后,若当前 activeStageKey 不在新清单里(管理员改过流程,或默认 'insight' 被禁用),
  // 自动同步到第一个有效阶段,避免阶段栏没高亮的 bug
  useEffect(() => {
    if (!stageFlow?.stages?.length) return
    const activeKeys = stageFlow.stages.filter(s => s.active).map(s => s.key)
    if (activeKeys.length === 0) return
    if (!activeKeys.includes(activeStageKey)) {
      setActiveStageKey(activeKeys[0])
    }
  }, [stageFlow?.stages, activeStageKey])
  // 后端返回所有 stage(含禁用占位),前端只渲染启用的 — 干净简洁
  const ALL_STAGES: StageDef[] = stageFlow?.stages?.length
    ? stageFlow.stages.map(_mapStage)
    : DEFAULT_STAGES
  const STAGES: StageDef[] = ALL_STAGES.filter(s => s.active)

  // ─ 派生状态 — 在 early return 之前计算,以便 useEffect 引用(React 规则:hook 必须在 return 之前) ─
  const bundles = outputs?.items ?? []
  const bundleByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && b.status === 'done')
  const inflightByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && (b.status === 'pending' || b.status === 'generating'))

  const stageStatus = (s: StageDef): StageStatus => {
    if (!s.active) return 'locked'
    const kindsToCheck: OutputKind[] = s.subKinds ? s.subKinds.map(sk => sk.kind) : (s.kind ? [s.kind] : [])
    if (kindsToCheck.length === 0) return 'locked'
    // subKinds 时:任一 done → done;任一 inflight → inflight
    if (kindsToCheck.some(k => bundleByKind(k))) return 'done'
    if (kindsToCheck.some(k => inflightByKind(k))) return 'inflight'
    return 'idle'
  }

  // STAGES 可能为空(项目还在加载或管理员禁用了所有 stage),activeStage 等用 ?: 兜底
  const activeStage: StageDef | null = STAGES.length > 0
    ? (STAGES.find(s => s.key === activeStageKey) ?? STAGES[0])
    : null
  // 当 stage 有 subKinds,activeKind 取 selectedSubKind ?? 第一个 sub
  const activeKind: OutputKind | null = activeStage?.subKinds
    ? (selectedSubKind && activeStage.subKinds.some(sk => sk.kind === selectedSubKind)
        ? selectedSubKind
        : activeStage.subKinds[0].kind)
    : (activeStage?.kind ?? null)
  const activeKindLabel = activeStage?.subKinds
    ? (activeStage.subKinds.find(sk => sk.kind === activeKind)?.label || activeStage.label)
    : (activeStage?.label ?? '')
  const activeBundle = activeKind ? bundleByKind(activeKind) : undefined
  const activeInflight = activeKind ? inflightByKind(activeKind) : undefined

  // chatMode 跟随 activeKind 同步 — 解决两个问题:
  //  1. 用户切换阶段后,chatMode.kind 残留旧值会让 OutputChatPanel 显示上一阶段的标题
  //  2. 当前阶段已有 done bundle → 默认展示成果(预览),而不是 QA
  // ★ 此 useEffect 必须放在 early return 之前 — 否则首次 render 时早期 return 会跳过它,
  //   第二次 render 时多调一个 hook → React error #310
  useEffect(() => {
    if (!activeKind) return
    if (activeBundle) {
      setChatMode({ type: 'output', kind: activeKind, label: activeKindLabel })
    } else {
      setChatMode(prev =>
        prev.type === 'output'
          ? { type: 'output', kind: activeKind, label: activeKindLabel }
          : prev,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKind, activeKindLabel, activeBundle?.id])

  // ─ 所有 hook 调用完毕后,可以安全 early return ─
  if (!id) return null
  if (isLoading) return <div className="text-center py-20 text-ink-muted text-sm">加载中…</div>
  if (!project) return <div className="text-center py-20 text-ink-muted text-sm">项目不存在</div>
  if (STAGES.length === 0) {
    return (
      <div className="text-center py-20 text-ink-muted text-sm">
        当前没有启用任何阶段,请管理员到「系统配置 · 项目流程」启用至少一个阶段
      </div>
    )
  }
  if (!activeStage) {
    // 理论上 STAGES.length > 0 时 activeStage 必非 null;此分支只是 TypeScript narrow
    return <div className="text-center py-20 text-ink-muted text-sm">阶段配置异常</div>
  }

  const industryLabel = (val: string | null) => {
    if (!val) return null
    return meta?.industries?.find(i => i.value === val)?.label || val
  }

  // v3:文档驱动的 kind — 不弹 brief,直接调 generateOutput 触发 v3 流程
  // (runner 会自动 auto_extract + planner 从 docs 兜底)
  const V3_DOC_DRIVEN_KINDS: OutputKind[] = ['insight', 'survey', 'survey_outline']

  const startGeneration = async () => {
    if (!activeStage.active || !activeKind) return
    if (V3_DOC_DRIVEN_KINDS.includes(activeKind)) {
      try {
        await generateOutput({ kind: activeKind, project_id: id! })
        refetchOutputs()
      } catch (e) {
        console.error('generateOutput failed', e)
      }
      return
    }
    if (BRIEF_KINDS.includes(activeKind)) {
      setBriefDrawer({ kind: activeKind, label: activeKindLabel })
    } else {
      setChatMode({ type: 'output', kind: activeKind, label: activeKindLabel })
    }
  }

  const openBriefForActive = () => {
    if (!activeKind || !BRIEF_KINDS.includes(activeKind)) return
    setBriefDrawer({ kind: activeKind, label: activeKindLabel })
  }

  const startChatFallback = () => {
    if (!activeStage.active || !activeKind) return
    setChatMode({ type: 'output', kind: activeKind, label: activeKindLabel })
  }

  const handleBriefGenerate = async () => {
    if (!briefDrawer) return
    try {
      await generateOutput({ kind: briefDrawer.kind, project_id: id! })
      refetchOutputs()
    } catch (e: any) {
      alert(e?.response?.data?.detail || '触发生成失败')
    }
  }

  return (
    <div className="-mx-4 sm:-mx-6 -my-6 h-[calc(100vh-56px)] flex flex-col bg-canvas overflow-hidden">
      {/* 顶部信息条：返回 + 项目名 + 元信息 + 编辑 */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-2.5 bg-white border-b border-line flex items-center gap-3">
        <button
          onClick={() => nav('/console/projects')}
          className="p-1.5 -ml-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas shrink-0"
          title="返回项目列表"
        >
          <ArrowLeft size={15} />
        </button>
        <Home size={15} strokeWidth={1.75} className="text-ink-muted shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-ink leading-tight truncate">{project.name}</h1>
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted truncate mt-0.5">
            <span className="truncate">{project.customer || '未填客户'}</span>
            {project.industry && <><span className="opacity-50">·</span><span className="truncate">{industryLabel(project.industry)}</span></>}
            <span className="opacity-50">·</span>
            <span className="shrink-0">{project.document_count} 份文档</span>
          </div>
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            editing ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-line text-ink-secondary hover:bg-canvas'
          }`}
          title="项目信息"
        >
          <Pencil size={11} />
          <span className="hidden sm:inline">项目信息</span>
        </button>
      </div>

      {editing && (
        <ProjectEditPanel
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['project', id] })
            qc.invalidateQueries({ queryKey: ['projects'] })
          }}
        />
      )}

      {/* 阶段流程 + 当前阶段动作 — 视觉上一整块 */}
      <div className="flex-shrink-0 bg-white border-b border-line pt-2 pb-3 px-2 sm:px-3">
        <div className="flex items-stretch gap-[2px] overflow-x-auto scrollbar-thin">
          {STAGES.map((s, i) => {
            const status = stageStatus(s)
            const isActive = activeStageKey === s.key
            const isFirst = i === 0
            const isLast = i === STAGES.length - 1
            const arrow = 10 // px — 箭头深度
            const points: string[] = []
            points.push('0 0')
            points.push(isLast ? '100% 0' : `calc(100% - ${arrow}px) 0`)
            if (!isLast) points.push('100% 50%')
            points.push(isLast ? '100% 100%' : `calc(100% - ${arrow}px) 100%`)
            points.push('0 100%')
            if (!isFirst) points.push(`${arrow}px 50%`)
            const clipPath = `polygon(${points.join(', ')})`

            const bg = isActive
              ? BRAND_GRAD
              : status === 'done' ? '#D1FAE5'
              : status === 'inflight' ? '#DBEAFE'
              : status === 'locked' ? '#F3F4F6'
              : '#F8FAFC'

            const text = isActive
              ? '#FFFFFF'
              : status === 'done' ? '#047857'
              : status === 'inflight' ? '#1D4ED8'
              : status === 'locked' ? '#9CA3AF'
              : '#475569'

            return (
              <button
                key={s.key}
                onClick={() => s.active && setActiveStageKey(s.key)}
                disabled={!s.active}
                className={`relative h-8 flex-1 min-w-[96px] flex items-center justify-center gap-1.5 text-[11.5px] whitespace-nowrap ${
                  isActive ? 'font-semibold' : ''
                } ${!s.active ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                style={{
                  clipPath,
                  background: bg,
                  color: text,
                  paddingLeft: isFirst ? 10 : arrow + 4,
                  paddingRight: isLast ? 10 : arrow + 4,
                }}
                title={s.label}
              >
                {status === 'done' ? <CheckCircle2 size={11} /> :
                 status === 'inflight' ? <Loader2 size={10} className="animate-spin" /> :
                 status === 'locked' ? <Lock size={9} /> :
                 <span className="text-[9.5px] opacity-70 font-semibold tabular-nums">{i + 1}</span>}
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 当 stage 有 subKinds — 显示按钮组(大纲 / 问卷) */}
      {activeStage.subKinds && (
        <div className="flex-shrink-0 px-3 pt-2 pb-1 bg-white border-b border-line flex items-center gap-1">
          <span className="text-[11px] text-ink-muted mr-1">本阶段产物:</span>
          {activeStage.subKinds.map(sk => {
            const has = !!bundleByKind(sk.kind)
            const inflight = !!inflightByKind(sk.kind)
            const selected = activeKind === sk.kind
            return (
              <button
                key={sk.kind}
                onClick={() => setSelectedSubKind(sk.kind)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  selected
                    ? 'border-[#D96400] bg-orange-50 text-[#D96400] font-semibold'
                    : 'border-line text-ink-secondary hover:bg-canvas'
                }`}
                title={sk.label}
              >
                {has ? <CheckCircle2 size={10} className="text-emerald-600" /> :
                 inflight ? <Loader2 size={10} className="animate-spin text-blue-500" /> :
                 <span className="w-2 h-2 rounded-full bg-slate-300" />}
                {sk.label}
              </button>
            )
          })}
        </div>
      )}

      {/* 当前阶段 action — 与上方阶段栏共享白底 */}
      <div className="flex-shrink-0 px-2 sm:px-3 pt-2 pb-2.5 bg-white border-b border-line flex items-center gap-2">
        <span className="text-[11px] text-ink-muted truncate">
          {!activeStage.active ? '该阶段即将上线' :
           activeInflight && activeBundle ? `${activeKindLabel} · 已有交付物 · 正在重新生成…` :
           activeBundle ? `${activeKindLabel} · 已生成交付物` :
           activeInflight ? `${activeKindLabel} · 正在生成中…` :
           `${activeKindLabel} · 尚未生成`}
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {activeStage.active && activeKind && BRIEF_KINDS.includes(activeKind) && !activeInflight && (
            <button
              onClick={openBriefForActive}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
              title="查看 / 编辑项目要点"
            >
              <ClipboardList size={11} /> 要点
            </button>
          )}
          {activeBundle ? (
            <>
              <BundlePreviewBtn b={activeBundle} />
              <BundleDownloadBtn b={activeBundle} />
              {activeInflight ? (
                <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-700">
                  <Loader2 size={11} className="animate-spin" /> 重新生成中…
                </span>
              ) : (
                <button
                  onClick={startGeneration}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
                >
                  <Sparkles size={11} /> 重新生成
                </button>
              )}
            </>
          ) : activeInflight ? (
            <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-700">
              <Loader2 size={11} className="animate-spin" /> 后台任务进行中
            </span>
          ) : activeStage.active ? (
            <>
              {/* 对话生成兜底:只对启动会 PPT 两套(对话式访谈才有意义);
                  insight / survey / survey_outline 不走对话流程 */}
              {activeKind && (activeKind === 'kickoff_pptx' || activeKind === 'kickoff_html') && (
                <button
                  onClick={startChatFallback}
                  className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
                  title="对话式访谈生成 PPT"
                >
                  <MessageSquare size={11} /> 对话
                </button>
              )}
              <button
                onClick={startGeneration}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white rounded-md shadow-sm"
                style={{ background: BRAND_GRAD }}
              >
                <Sparkles size={11} />
                {activeKind && V3_DOC_DRIVEN_KINDS.includes(activeKind)
                  ? '开始生成'
                  : activeKind && BRIEF_KINDS.includes(activeKind)
                    ? '填写 Brief 并生成'
                    : '开始生成'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* v2 质量评审 panel —— 整合 critic 细节反馈 + challenger 整体挑战
          所有 v2 done 报告都显示(valid 也展示挑战日志);
          invalid+short_circuited 走 AgenticGapFiller(下方分支),这里跳过;
          inflight 时隐藏 — 避免显示旧 bundle 的"已通过审核"误导用户 */}
      {!activeInflight
        && activeBundle?.agentic_version === 'v2'
        && activeBundle.status === 'done'
        && !(activeBundle.validity_status === 'invalid' && activeBundle.short_circuited)
        && (
          <AgenticValidityBanner bundle={activeBundle} onReGenerate={startGeneration} />
        )}

      {/* ── insight stage 用 v3 三栏布局 ── */}
      {activeKind === 'insight' ? (
        <InsightWorkspace
          projectId={id}
          activeBundle={activeBundle}
          activeInflight={activeInflight}
          centerView={centerView}
          setCenterView={setCenterView}
          rightOpen={rightOpen}
          setRightOpen={setRightOpen}
          highlightedRef={highlightedRef}
          setHighlightedRef={setHighlightedRef}
          onRefetch={refetchOutputs}
        />
      ) : activeStageKey === 'survey' ? (
        /* survey stage 用 research v1 三栏 — 同一个工作区里同时承载 outline + survey 两个 sub-kind */
        <ResearchWorkspace
          projectId={id}
          outlineBundle={bundleByKind('survey_outline')}
          outlineInflight={inflightByKind('survey_outline')}
          surveyBundle={bundleByKind('survey')}
          surveyInflight={inflightByKind('survey')}
          activeKind={activeKind}
          onRefetch={refetchOutputs}
        />
      ) : activeBundle?.agentic_version === 'v2'
        && activeBundle.validity_status === 'invalid'
        && activeBundle.short_circuited
        && activeKind
        && !activeInflight ? (
        /* 其他 stage 的 v2 invalid+short_circuited 仍用旧 GapFiller 占满 */
        <AgenticGapFiller
          key={`gap-${activeBundle.id}`}
          bundle={activeBundle}
          kind={activeKind}
          projectId={id}
          onSubmitted={() => refetchOutputs()}
        />
      ) : (
        /* 主区(非 insight stage):
           - 已生成 bundle (status=done) → 直接在工作区预览成果(HTML iframe / markdown / pptx 摘要)
           - 否则走原对话生成 (ChatTabs + OutputChatPanel)
           对话历史可通过 ChatTabs 顶部「对话生成」tab 切回查看 */
        <div className="flex-1 min-h-0 flex flex-col bg-white">
          <ChatTabs
            mode={chatMode}
            setMode={setChatMode}
            docCount={docs?.length ?? 0}
            onOpenDocs={() => setDocsOpen(true)}
          />
          <div className="flex-1 min-h-0 flex flex-col">
            {chatMode.type === 'pm' ? (
              <div className="flex-1 min-h-0 h-full">
                <QA lockedProjectId={id} />
              </div>
            ) : activeBundle && activeBundle.status === 'done' && !activeInflight ? (
              <BundleInlinePreview bundle={activeBundle} />
            ) : (
              <OutputChatPanel
                key={`${chatMode.kind}-${id}`}
                kind={chatMode.kind}
                projectId={id}
                stageTitle={chatMode.label}
                onGenerated={() => refetchOutputs()}
              />
            )}
          </div>
        </div>
      )}

      {docsOpen && (
        <DocsDrawer
          docs={docs ?? []}
          onClose={() => setDocsOpen(false)}
          onSelect={(docId) => setPreviewDocId(docId)}
          previewDocId={previewDocId}
        />
      )}

      {previewDocId && (
        <DocPreviewDrawer
          docId={previewDocId}
          docs={docs ?? []}
          onClose={() => setPreviewDocId(null)}
        />
      )}

      {briefDrawer && (
        <BriefDrawer
          open={true}
          kind={briefDrawer.kind}
          projectId={id}
          stageTitle={briefDrawer.label}
          onClose={() => setBriefDrawer(null)}
          onGenerate={handleBriefGenerate}
        />
      )}

      {/* 全局浮动聊天窗(任意 stage 可用,切换不打断对话进程) */}
      <FloatingChat projectId={id} state={chatState} onChange={setChatState} />

      {/* 浮动 chat 触发按钮(右下角,chat 关闭时显示)
          位置上移到 bottom-24 避开中栏可能的 sticky 操作栏(如 VirtualForm 保存栏);
          形态收缩成圆形 FAB,只显示 icon,降低视觉占位。 */}
      {!chatState.open && (
        <button
          onClick={() => setChatState({ open: true, minimized: false, fullscreen: false })}
          className="fixed bottom-24 right-5 z-40 flex items-center justify-center w-12 h-12 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
          style={{ background: BRAND_GRAD }}
          title="项目问答(基于本项目知识库)"
        >
          <MessageSquare size={18} />
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// InsightWorkspace —— insight stage 的三栏工作区
// 左:DocChecklist 280px / 中:CenterWorkspace flex-1 / 右:可折叠 380px(QA)
// ──────────────────────────────────────────────────────────────────────────────

function InsightWorkspace({
  projectId, activeBundle, activeInflight, centerView, setCenterView,
  rightOpen, setRightOpen, highlightedRef, setHighlightedRef, onRefetch,
}: {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  centerView: CenterView
  setCenterView: (v: CenterView) => void
  rightOpen: boolean
  setRightOpen: (b: boolean) => void
  highlightedRef: string | null
  setHighlightedRef: (s: string | null) => void
  onRefetch: () => void
}) {
  // 根据 bundle 状态自动选定中栏内容
  useEffect(() => {
    // v3.4:inflight 出现时(无论当前 view 是啥) → 跳回 preparation 显示进度卡
    // 否则用户点了"重新生成"看不到 GenerationProgressCard
    if (activeInflight && centerView.type !== 'preparation') {
      setCenterView({ type: 'preparation' })
      return
    }
    // 其他切换只在 preparation 视图触发,避免覆盖用户主动选择(预览/canvas/虚拟物等)
    if (centerView.type !== 'preparation') return
    if (activeInflight) return  // 已经在 preparation,保留显示 GenerationProgressCard
    if (activeBundle?.agentic_version === 'v2'
        && activeBundle.validity_status === 'invalid'
        && activeBundle.short_circuited) {
      setCenterView({ type: 'gap_filler' })
    } else if (activeBundle?.status === 'done') {
      setCenterView({ type: 'report' })
    }
  }, [activeBundle?.id, activeBundle?.status, activeBundle?.validity_status,
      activeBundle?.short_circuited, activeInflight?.id])

  // 报告角标点击 → 自动展开右栏 + 高亮对应 ref + 滚动定位
  const onCitationClick = (moduleKey: string, refId: string) => {
    setRightOpen(true)
    setHighlightedRef(`${moduleKey}:${refId}`)
  }

  return (
    <div className="flex-1 min-h-0 flex bg-canvas overflow-hidden">
      {/* 左:文档清单 */}
      <div className="w-[300px] flex-shrink-0">
        <DocChecklist
          projectId={projectId}
          stage="insight"
          onOpenDocPreview={(docId) => setCenterView({ type: 'preview', docId })}
          onOpenVirtualForm={(vkey) => setCenterView({ type: 'virtual', vkey })}
          onOpenStakeholderCanvas={() => setCenterView({ type: 'canvas' })}
        />
      </div>

      {/* 中:工作区 */}
      <CenterWorkspace
        projectId={projectId}
        activeBundle={activeBundle}
        activeInflight={activeInflight}
        view={centerView}
        setView={setCenterView}
        onRefetch={onRefetch}
        onCitationClick={onCitationClick}
      />

      {/* 右:引用追溯面板(默认收起,点报告角标自动展开) — 320px 避免挤窄中栏 */}
      {rightOpen ? (
        <div className="w-[320px] flex-shrink-0 border-l border-line">
          <CitationsPanel
            bundle={activeBundle}
            highlightedRefId={highlightedRef}
            onPreviewDoc={(docId) => setCenterView({ type: 'preview', docId })}
            onClose={() => setRightOpen(false)}
          />
        </div>
      ) : activeBundle?.provenance && Object.keys(activeBundle.provenance).length > 0 ? (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-2 py-3 bg-white border border-line rounded-l-md shadow text-xs text-ink-secondary hover:text-ink hover:border-orange-300 writing-vertical"
          style={{ writingMode: 'vertical-rl' as any }}
          title="展开引用追溯面板"
        >
          引用追溯
        </button>
      ) : null}
    </div>
  )
}

// ── i18n:critic LLM 偶尔输出英文术语,前端兜底翻译 ──────────────────────────
const CRITIC_TERM_MAP: [RegExp, string][] = [
  [/\bspecificity\b/gi, '具体性'],
  [/\bevidence\b/gi, '证据'],
  [/\btimeliness\b/gi, '时效性'],
  [/\bnext_step\b/gi, '下一步'],
  [/\bnext step\b/gi, '下一步'],
  [/\bcompleteness\b/gi, '完整性'],
  [/\bconsistency\b/gi, '一致性'],
  [/\bjargon\b/gi, '黑话'],
  [/\bOwner\b/g, '责任人'],
  [/\bdeadline\b/gi, '截止日期'],
]

function localizeIssue(s: string): string {
  let out = s
  for (const [re, zh] of CRITIC_TERM_MAP) out = out.replace(re, zh)
  return out
}

function AgenticValidityBanner({ bundle, onReGenerate }: { bundle: CuratedBundle; onReGenerate: () => void }) {
  // 默认折叠 — 顶部 bar 已显示综合状态 + 重生成按钮,详情按需展开
  const [expanded, setExpanded] = useState(false)
  const isInvalid = bundle.validity_status === 'invalid'
  const askPrompts = bundle.ask_user_prompts || []
  const moduleStates = bundle.module_states || {}
  const all = Object.values(moduleStates).filter(Boolean) as NonNullable<typeof moduleStates[string]>[]

  // critic 角度 — 模块细节状态
  const incompleteCritical = all.filter(m => m.necessity === 'critical' && (m.status === 'blocked' || m.status === 'insufficient' || m.status === 'failed'))
  const incompleteOptional = all.filter(m => m.necessity !== 'critical' && (m.status === 'blocked' || m.status === 'insufficient' || m.status === 'failed'))
  const warnCritical = all.filter(m => m.necessity === 'critical' && m.status === 'done_with_warnings')
  const warnOptional = all.filter(m => m.necessity !== 'critical' && m.status === 'done_with_warnings')

  // 总待补项 = 未完成关键 + 关键有警告 + 未完成可选(可选警告权重低,不计入主信号)
  const issuesCount = incompleteCritical.length + warnCritical.length + incompleteOptional.length

  // challenger 角度 — 整体审核
  const cs = bundle.challenge_summary
  const challengerVerdict = cs?.final_verdict
  const challengerPassed = challengerVerdict === 'pass'
  const challengerHasIssues = challengerVerdict === 'major_issues'    // 挑战完成但有重大问题
  const challengerErrored = challengerVerdict === 'parse_failed'      // 挑战 LLM 输出格式异常,未完成审核
  const issuesRemaining = cs?.issues_remaining ?? 0                    // 挑战循环结束后仍未解决的 major+ 数
  const hasChallenge = !!cs && (cs.rounds_total ?? 0) > 0

  // ── 综合主信号:
  //    优先级 invalid > 挑战循环跑完仍有 major+ > parse_failed > minor 但有 critic 待补
  //    > 完全通过(pass + 0 issues + 0 remaining) > 整体可交付(有细节)
  // ──
  let mainColor: 'red' | 'amber' | 'sky' | 'emerald'
  let mainText: string
  let mainIcon = ShieldAlert
  if (isInvalid) {
    mainColor = 'red'
    mainText = '信息不足 — 关键字段缺失,补充后重新生成'
  } else if (issuesRemaining > 0 || challengerHasIssues) {
    // 挑战循环跑完后仍有 major+ 问题没解决(包括 verdict=major_issues 和
    // verdict=minor_issues 但 issues_remaining > 0 的情况)
    mainColor = 'amber'
    mainText = `挑战 ${cs?.rounds_total ?? '?'} 轮后仍有 ${issuesRemaining} 项 major+ 问题未解决`
      + (issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : '')
  } else if (challengerErrored) {
    mainColor = 'amber'
    mainText = `挑战未完成(LLM 输出解析异常)${issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : ''}`
  } else if (challengerPassed && issuesCount === 0) {
    mainColor = 'emerald'
    mainText = '已通过整体审核'
    mainIcon = CheckCircle2
  } else if (challengerPassed || challengerVerdict === 'minor_issues') {
    // 挑战 pass 或 minor_issues 且 issues_remaining=0(即跑完循环把 major+ 修干净了)
    mainColor = 'sky'
    mainText = challengerVerdict === 'minor_issues'
      ? `整体可交付 · ${issuesCount > 0 ? `${issuesCount} 项细节待补` : '剩余 minor 问题不阻塞发布'}`
      : `整体可交付${issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : ''}`
  } else if (issuesCount > 0) {
    mainColor = 'amber'
    mainText = `细节待补 ${issuesCount} 项`
  } else {
    mainColor = 'emerald'
    mainText = '已通过质量评审'
    mainIcon = CheckCircle2
  }

  const COLOR_MAP = {
    red:     { bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     btn: 'border-red-300 text-red-700 bg-white hover:bg-red-100' },
    amber:   { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   btn: 'border-amber-300 text-amber-700 bg-white hover:bg-amber-100' },
    sky:     { bg: 'bg-sky-50 border-sky-200',         text: 'text-sky-700',     btn: 'border-sky-300 text-sky-700 bg-white hover:bg-sky-100' },
    emerald: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', btn: 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-100' },
  }[mainColor]

  const MainIcon = mainIcon

  // 把模块 + critic issues 拼成 hint 行(issues 经 localizeIssue 翻译英文术语)
  const renderModuleList = (mods: typeof all, cls: string) => mods.map((m, i) => {
    const issues = (m.score?.issues || []).map(localizeIssue)
    return (
      <li key={i} className={cls}>
        <span className="font-medium">{m.title}</span>
        {issues.length > 0 && (
          <span className="text-ink-muted">{' — '}{issues.slice(0, 2).join('; ')}</span>
        )}
      </li>
    )
  })

  const hasAnyDetail = issuesCount + warnOptional.length + askPrompts.length + (hasChallenge ? 1 : 0) > 0

  return (
    <div className={`flex-shrink-0 px-3 sm:px-4 py-2 border-b ${COLOR_MAP.bg}`}>
      {/* 标题行 — 整行可点击展开/折叠 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(o => !o)}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:opacity-80"
          title={expanded ? '点击折叠详情' : '点击展开详情'}
        >
          {expanded ? <ChevronDown size={12} className={`${COLOR_MAP.text} shrink-0`} /> : <ChevronRight size={12} className={`${COLOR_MAP.text} shrink-0`} />}
          <MainIcon size={13} className={`${COLOR_MAP.text} shrink-0`} />
          <span className={`text-xs font-semibold ${COLOR_MAP.text}`}>{mainText}</span>
          {hasChallenge && (
            <span className="text-[10px] text-ink-muted ml-1">
              · 挑战 {cs!.rounds_total} 轮
            </span>
          )}
        </button>
        {/* 注:不再渲染"重新生成"按钮 — 上方阶段栏 action bar 已经有了一个,
            放这里跟它重复;invalid 短路时走 AgenticGapFiller 单独的 CTA */}
      </div>

      {/* 详情区 — 默认收起,展开后包含【整体审核】+【细节待补】两节
          高度限制 + 内部滚动:挑战 3 轮 × 5 个 issues 内容很长,
          不限会把整页撑爆,用户无法上滑看到下面的报告 */}
      {expanded && (
        <div className="mt-2 ml-5 space-y-3 max-h-[55vh] overflow-y-auto pr-2">
          {/* —— 整体审核(挑战详情) —— */}
          {hasChallenge && (
            <div>
              <div className={`text-[11px] font-semibold ${COLOR_MAP.text} mb-1`}>整体审核</div>
              <ChallengeRoundsPanel bundleId={bundle.id} challengeSummary={cs} />
            </div>
          )}

          {/* —— 细节待补(critic) —— */}
          {(issuesCount > 0 || warnOptional.length > 0 || askPrompts.length > 0) && (
            <div>
              <div className={`text-[11px] font-semibold ${COLOR_MAP.text} mb-1`}>
                细节待补 — 由顾问 review 后补全(AI 评审给的提示)
              </div>

              {incompleteCritical.length > 0 && (
                <div className="text-[11px] text-ink-secondary mt-1">
                  <span className="font-medium">未完成关键模块:</span>
                  <ul className="ml-4 mt-0.5 list-disc">{renderModuleList(incompleteCritical, '')}</ul>
                </div>
              )}

              {warnCritical.length > 0 && (
                <div className="text-[11px] text-ink-secondary mt-1">
                  <span className="font-medium">关键模块质量待提升:</span>
                  <ul className="ml-4 mt-0.5 list-disc">{renderModuleList(warnCritical, '')}</ul>
                  <div className="ml-4 mt-0.5 text-ink-muted/80">提示:补充更具体的证据 / 量化数据 / 责任人与截止日期,AI 评审会打更高分</div>
                </div>
              )}

              {incompleteOptional.length > 0 && (
                <div className="text-[11px] text-ink-muted mt-1">
                  <span className="font-medium">未完成可选模块:</span>
                  <ul className="ml-4 mt-0.5 list-disc">{renderModuleList(incompleteOptional, '')}</ul>
                  <div className="ml-4 mt-0.5">不影响整体合格性</div>
                </div>
              )}

              {warnOptional.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] cursor-pointer text-ink-muted font-medium">
                    可选模块质量提示({warnOptional.length} 个)
                  </summary>
                  <ul className="ml-4 mt-1 list-disc text-[11px] text-ink-muted">{renderModuleList(warnOptional, '')}</ul>
                </details>
              )}

              {askPrompts.length > 0 && (
                <details className="mt-1.5">
                  <summary className={`text-[11px] cursor-pointer ${COLOR_MAP.text} font-medium`}>
                    需要补充的信息({askPrompts.length} 项 — 点开展开)
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-secondary list-disc list-inside">
                    {askPrompts.slice(0, 8).map((p, i) => <li key={i}>{p.question}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* 兜底:都通过且没挑战 */}
          {!hasAnyDetail && (
            <div className="text-[11px] text-ink-muted italic">
              所有关键模块都通过质量评审,无需调整。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChatTabs({ mode, setMode, docCount, onOpenDocs }: {
  mode: ChatMode; setMode: (m: ChatMode) => void; docCount: number; onOpenDocs: () => void
}) {
  return (
    <div className="flex-shrink-0 px-4 sm:px-6 pt-3 border-b border-line bg-white flex items-end gap-1">
      <button
        onClick={() => setMode({ type: 'pm' })}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg border-b-2 ${
          mode.type === 'pm'
            ? 'border-[#D96400] text-ink font-semibold bg-orange-50/60'
            : 'border-transparent text-ink-secondary hover:text-ink'
        }`}
      >
        <MessageSquare size={12} /> 项目问答
      </button>
      {mode.type === 'output' && (
        <span className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg border-b-2 border-[#D96400] text-ink font-semibold bg-orange-50/60">
          <Sparkles size={12} /> 生成 · {mode.label}
        </span>
      )}
      <button
        onClick={onOpenDocs}
        className="ml-auto mb-1.5 flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas hover:text-ink"
        title="查看关联文档"
      >
        <Files size={12} /> 关联文档
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">{docCount}</span>
      </button>
    </div>
  )
}

function BundlePreviewBtn({ b }: { b: CuratedBundle }) {
  // 只有 HTML / markdown 内容可在浏览器内联预览；真 .pptx 需要下载后用 PPT 打开
  const previewable = b.has_content || (b.has_file && b.file_ext === 'html')
  if (!previewable) return null
  const isHtmlFile = b.has_file && b.file_ext === 'html'
  const onClick = () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
    if (isHtmlFile) {
      // HTML 幻灯片：直接 new tab 打开同源 URL，注入的 deck-nav 才能调 save API
      const url = `${viewOutputUrl(b.id)}?token=${encodeURIComponent(token)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    // markdown / 其他：blob 沙箱预览
    fetch(viewOutputUrl(b.id), { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) { alert('预览失败'); return }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
      })
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50"
    >
      <ExternalLink size={11} /> 在线预览
    </button>
  )
}

/** 工作区内联预览:已生成 bundle 直接展示成果。
 *  - kickoff_html (单 HTML 文件 / .html 后缀):iframe 同源加载 viewOutputUrl + token query string
 *  - 含 content_md(markdown 半结构化输出,如 PPT 脚本、insight v1):用 MarkdownView 渲染
 *  - 仅有二进制文件无 markdown(如纯 .pptx):占位卡 + 下载提示
 *  顶部不放重复操作 — 上面阶段条已经有「在线预览 / 下载 / 重新生成」按钮 */
function BundleInlinePreview({ bundle }: { bundle: CuratedBundle }) {
  const isHtmlFile = bundle.has_file && bundle.file_ext === 'html'
  const token = isHtmlFile ? (localStorage.getItem(TOKEN_STORAGE_KEY) || '') : ''

  // 非 HTML:拉完整 bundle 拿 content_md(列表接口为节省流量可能不返回 content_md)
  const { data: full, isLoading } = useQuery({
    queryKey: ['output-full', bundle.id],
    queryFn: () => getOutput(bundle.id),
    enabled: !isHtmlFile,
    staleTime: 30 * 1000,
  })

  if (isHtmlFile) {
    const url = `${viewOutputUrl(bundle.id)}?token=${encodeURIComponent(token)}`
    return (
      <iframe
        key={bundle.id}
        src={url}
        title={bundle.title}
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-muted text-xs">
        <Loader2 size={14} className="animate-spin mr-2" /> 加载交付物预览…
      </div>
    )
  }

  const md = full?.content_md || bundle.content_md || ''
  if (md) {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <MarkdownView content={md} size="base" toolbar={false} />
      </div>
    )
  }

  // 仅有二进制文件(常见为 .pptx)
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-2xl border border-line bg-canvas px-6 py-7 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-orange-100 flex items-center justify-center">
          <FileText size={22} className="text-orange-700" />
        </div>
        <p className="text-sm text-ink mb-1">{bundle.title}</p>
        <p className="text-xs text-ink-muted mb-4">
          这份交付物为二进制文件{bundle.file_ext ? `(.${bundle.file_ext})` : ''},
          浏览器无法内联预览。请下载到本地查看,或通过顶部「重新生成」开启新一轮对话。
        </p>
        <BundleDownloadBtn b={bundle} />
      </div>
    </div>
  )
}

function BundleDownloadBtn({ b }: { b: CuratedBundle }) {
  if (!(b.has_file || b.has_content)) return null
  const onClick = () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    fetch(downloadOutputUrl(b.id), { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) { alert('下载失败'); return }
        const disposition = res.headers.get('content-disposition') || ''
        const match = disposition.match(/filename="([^"]+)"/)
        const filename = match ? match[1] : b.title
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      })
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas"
    >
      <Download size={11} /> 下载
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function DocsDrawer({ docs, onClose, onSelect, previewDocId }: {
  docs: ProjectDocument[]
  onClose: () => void
  onSelect: (id: string) => void
  previewDocId: string | null
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? docs.filter(d => d.filename.toLowerCase().includes(q.trim().toLowerCase()))
    : docs
  return (
    <div className="fixed inset-0 z-30 bg-black/30 flex" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:w-[420px] bg-white h-full flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Files size={14} className="text-[#D96400]" /> 关联文档
              <span className="text-[11px] text-ink-muted font-normal">{docs.length}</span>
            </h3>
            <button onClick={onClose} className="text-ink-muted hover:text-ink p-1 rounded hover:bg-canvas">
              <X size={16} />
            </button>
          </div>
          {docs.length > 0 && (
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="搜索文档名…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-line rounded-lg bg-canvas focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {docs.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Files size={28} className="mx-auto text-ink-muted opacity-30 mb-3" />
              <p className="text-sm text-ink-muted">暂无关联文档</p>
              <p className="text-[11px] text-ink-muted mt-1">在后台「项目库」中关联文档</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-ink-muted text-center py-12">没有匹配的文档</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map(d => (
                <li
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    previewDocId === d.id
                      ? 'bg-orange-50 border border-orange-200'
                      : 'border border-transparent hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-canvas flex items-center justify-center shrink-0">
                      <FileText size={13} className="text-ink-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate leading-tight">{d.filename}</p>
                      <p className="text-[11px] text-ink-muted mt-0.5 truncate">
                        {d.doc_type_label || '未分类'}
                        {d.uploader_name && <> · {d.uploader_name}</>}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function ProjectEditPanel({ project, onClose, onSaved }: {
  project: Project
  onClose: () => void
  onSaved: () => void
}) {
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const [customer, setCustomer] = useState(project.customer || '')
  const [industry, setIndustry] = useState(project.industry || '')
  const [kickoffDate, setKickoffDate] = useState(project.kickoff_date || '')
  const [profile, setProfile] = useState(project.customer_profile || '')
  const [err, setErr] = useState('')

  const saveMut = useMutation({
    mutationFn: () => updateProject(project.id, {
      customer: customer.trim() || null,
      industry: industry || null,
      kickoff_date: kickoffDate || null,
      customer_profile: profile.trim() || null,
    }),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: any) => setErr(e?.response?.data?.detail || '保存失败'),
  })

  const genMut = useMutation({
    mutationFn: () => generateCustomerProfile(project.id),
    onSuccess: (res) => setProfile(res.profile),
    onError: (e: any) => setErr(e?.response?.data?.detail || '画像生成失败'),
  })

  return (
    <div className="flex-shrink-0 px-4 sm:px-6 py-4 bg-canvas border-b border-line">
      <div className="bg-white rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Pencil size={13} className="text-[#D96400]" /> 编辑项目基础信息
          </h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1 rounded hover:bg-canvas">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="客户名称">
            <input
              value={customer}
              onChange={e => setCustomer(e.target.value)}
              className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300"
            />
          </Field>
          <Field label="行业">
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">未选择</option>
              {(meta?.industries ?? []).map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </Field>
          <Field label="立项日期">
            <input
              type="date"
              value={kickoffDate}
              onChange={e => setKickoffDate(e.target.value)}
              className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm"
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-ink-muted font-medium">客户画像 · Markdown</label>
            <button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
              title="LLM 基于客户/行业/已关联文档摘要生成画像草稿"
            >
              {genMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
              {genMut.isPending ? '生成中…' : (profile.trim() ? 'AI 重新生成' : 'AI 生成草稿')}
            </button>
          </div>
          <textarea
            value={profile}
            onChange={e => setProfile(e.target.value)}
            rows={7}
            placeholder="客户画像：行业地位、规模、组织决策风格、数字化成熟度、与本项目相关的关键诉求…"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-orange-300"
          />
          {profile.trim() && (
            <details className="mt-2">
              <summary className="text-[11px] text-ink-muted cursor-pointer hover:text-ink">预览渲染</summary>
              <div className="mt-2 p-3 border border-line rounded-lg bg-canvas">
                <MarkdownView content={profile} size="sm" toolbar={false} />
              </div>
            </details>
          )}
        </div>

        {err && (
          <div className="text-xs text-red-600 flex items-center gap-1 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertCircle size={12} />{err}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3.5 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas">取消</button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 shadow-sm"
            style={{ background: BRAND_GRAD }}
          >
            {saveMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-muted font-medium mb-1">{label}</label>
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function DocPreviewDrawer({ docId, docs, onClose }: {
  docId: string
  docs: ProjectDocument[]
  onClose: () => void
}) {
  const meta = docs.find(d => d.id === docId)
  const { data, isLoading, error } = useQuery({
    queryKey: ['doc-md', docId],
    queryFn: () => getDocumentMarkdown(docId),
    enabled: !!docId,
  })
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end animate-in fade-in" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:w-[680px] bg-white h-full flex flex-col shadow-2xl"
      >
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
              <FileText size={14} className="text-[#D96400]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{meta?.filename || '文档预览'}</p>
              <p className="text-[11px] text-ink-muted">{meta?.doc_type_label || '未分类'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1 rounded hover:bg-canvas">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 size={13} className="animate-spin" />加载中…</div>
          ) : error ? (
            <div className="text-xs text-red-500">加载失败</div>
          ) : !data?.markdown_content ? (
            <div className="text-xs text-ink-muted py-8 text-center">该文档尚未转换为 Markdown 或内容为空</div>
          ) : (
            <MarkdownView content={data.markdown_content} size="sm" toolbar={false} />
          )}
        </div>
      </div>
    </div>
  )
}
