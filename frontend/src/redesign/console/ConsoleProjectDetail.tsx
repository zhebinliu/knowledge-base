/**
 * NewConsoleProjectDetail — uat 下的项目详情页(Liquid Glass)
 *
 * 功能 100% 等价于生产 `frontend/src/pages/console/ConsoleProjectDetail.tsx`(1417 行):
 *   - 5 个 useQuery:project / docs / outputs(2s polling when inflight) / meta / stageFlow
 *   - 动态阶段流程(后端 stage_flow API + DEFAULT_STAGES fallback)
 *   - URL ?stage= 双向同步
 *   - subKinds 切换(survey: 大纲 / 问卷)
 *   - V3 文档驱动 kinds 直接 generateOutput;BRIEF_KINDS 弹 BriefDrawer
 *   - 三种主区:InsightWorkspace(insight stage)/ ResearchWorkspace(survey)/ 通用对话栏
 *   - v2 质量评审 Banner(critic + challenger)
 *   - 协作者 + 干系人 + 项目编辑面板 + 文档抽屉 + 文档预览
 *   - 浮动 FAB chat
 *
 * 视觉:主体 Liquid Glass(顶栏 / 阶段流程 / action bar / 卡片);
 *       内嵌的子组件(CenterWorkspace / DocChecklist / CitationsPanel / OutputChatPanel 等)
 *       仍是老 UI,视觉略断裂但功能完整
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, ClipboardList, Lightbulb, MessageSquare, Sparkles,
  CheckCircle2, Loader2, Lock, Download, ExternalLink,
  Save, X, Wand2, AlertCircle, Pencil, Home, Files, Search,
  Bot, ShieldAlert, ChevronDown, ChevronRight, ChevronLeft, Users, Eye, RotateCw,
} from 'lucide-react'

// 11 个子组件全部走 Liquid Glass 新版(redesign 目录下)
import CollaboratorsModal from './CollaboratorsModal'
import DeleteProjectControl from '../../components/DeleteProjectControl'
import { useAuth } from '../../auth/AuthContext'
import ProjectStakeholdersDrawer from './ProjectStakeholdersDrawer'
import ProjectMeetingsDrawer from './ProjectMeetingsDrawer'
import OutputChatPanel from './OutputChatPanel'
import BriefDrawer from './BriefDrawer'
import MarkdownView from '../../components/MarkdownView'
import AgenticGapFiller from '../AgenticGapFiller'
import DocChecklist from './DocChecklist'
import CenterWorkspace, { type CenterView } from './CenterWorkspace'
import CitationsPanel from './CitationsPanel'
import FloatingChat, { type FloatingChatState } from './FloatingChat'
import ChallengeRoundsPanel from './ChallengeRoundsPanel'
import ResearchWorkspace from './research/ResearchWorkspace'
import ImplementationWorkspace from '../../components/console/implementation/ImplementationWorkspace'

// QA 用新版
import NewQA from '../QA'

import {
  getProject, updateProject, generateCustomerProfile, generateOutput,
  listProjectDocuments, getDocumentMarkdown, listOutputs, downloadOutputUrl, viewOutputUrl,
  getOutput, getProjectMeta, TOKEN_STORAGE_KEY, getStageFlow,
  type CuratedBundle, type OutputKind, type Project, type ProjectDocument,
  type StageDef as ApiStageDef,
} from '../../api/client'

const BRIEF_KINDS: OutputKind[] = ['kickoff_pptx', 'kickoff_html', 'insight', 'survey', 'survey_outline', 'research_report', 'blueprint_design', 'implementation_plan', 'test_plan', 'acceptance_report']
const V3_DOC_DRIVEN_KINDS: OutputKind[] = ['insight', 'survey', 'survey_outline', 'research_report', 'blueprint_design', 'implementation_plan', 'test_plan', 'acceptance_report']

const STAGE_ICON_MAP = {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
} as const

interface SubKindDef { kind: OutputKind; label: string }
interface StageDef {
  key: string; label: string; kind: OutputKind | null
  icon: typeof FileText; active: boolean; beta?: boolean
  subKinds?: SubKindDef[]
}

function _mapStage(s: ApiStageDef): StageDef {
  const IconComp = (STAGE_ICON_MAP as any)[s.icon] || FileText
  return {
    key: s.key, label: s.label,
    kind: (s.kind as OutputKind | null),
    icon: IconComp, active: s.active, beta: s.beta,
    subKinds: s.sub_kinds && s.sub_kinds.length > 0
      ? s.sub_kinds.map(sk => ({ kind: sk.kind as OutputKind, label: sk.label }))
      : undefined,
  }
}

// 2026-06-03:启动会 PPT/HTML 并入「项目洞察」作 sub_kinds,不再独立成 stage
const DEFAULT_STAGES: StageDef[] = [
  { key: 'insight',      label: '项目洞察',     kind: null,           icon: Bot,      active: true,
    subKinds: [
      { kind: 'insight',      label: '洞察报告' },
      { kind: 'kickoff_pptx', label: '启动会·PPT' },
      { kind: 'kickoff_html', label: '启动会·HTML' },
    ],
  },
  { key: 'survey',       label: '需求调研',     kind: null,           icon: Bot,      active: true,
    subKinds: [
      { kind: 'survey_outline', label: '调研大纲' },
      { kind: 'survey',         label: '调研问卷' },
      { kind: 'research_report',label: '调研报告' },
    ],
  },
  { key: 'design',     label: '方案设计', kind: 'blueprint_design', icon: FileText, active: true },
  { key: 'implement',  label: '项目实施', kind: 'implementation_plan', icon: FileText, active: true, beta: true },
  { key: 'test',       label: '上线测试', kind: 'test_plan',         icon: FileText, active: true, beta: true },
  { key: 'acceptance', label: '项目验收', kind: 'acceptance_report', icon: FileText, active: true, beta: true },
]

type ChatMode = { type: 'pm' } | { type: 'output'; kind: OutputKind; label: string }
type StageStatus = 'locked' | 'idle' | 'inflight' | 'done'

// 顶部 header 框样式:不要加 backdrop-filter — 否则会"玻璃叠玻璃"把里面按钮的色彩透过路径堵死
// 改用浅色 hairline 分隔 + 微透白底,让里面的 rd-btn 直接看到页面 mesh
const GLASS_PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.22)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
}

export default function NewConsoleProjectDetail() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  const [chatMode, setChatMode] = useState<ChatMode>({ type: 'pm' })
  const [editing, setEditing] = useState(false)
  const [collabOpen, setCollabOpen] = useState(false)
  const [stakesOpen, setStakesOpen] = useState(false)
  const [meetingsOpen, setMeetingsOpen] = useState(false)
  const [previewDocId, setPreviewDocId] = useState<string | null>(null)
  const [activeStageKey, setActiveStageKey] = useState<string>(() => searchParams.get('stage') || 'insight')

  useEffect(() => {
    const urlStage = searchParams.get('stage')
    if (urlStage && urlStage !== activeStageKey) setActiveStageKey(urlStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get('stage') !== activeStageKey) {
      const next = new URLSearchParams(searchParams)
      next.set('stage', activeStageKey)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageKey])

  const [docsOpen, setDocsOpen] = useState(false)
  const [briefDrawer, setBriefDrawer] = useState<{ kind: OutputKind; label: string } | null>(null)
  const [selectedSubKind, setSelectedSubKind] = useState<OutputKind | null>(null)
  const [centerView, setCenterView] = useState<CenterView>({ type: 'preparation' })
  const [rightOpen, setRightOpen] = useState(false)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  const [chatState, setChatState] = useState<FloatingChatState>({ open: false, minimized: false, fullscreen: false })

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
      // 2026-06-03:按角色逐步生成 survey 时 bundle.status 维持 done,
      // 单独检查 role_progress 是否有 generating(否则按钮一直转、拿不到最新状态)
      const items = q.state.data?.items ?? []
      return items.some((b: CuratedBundle) =>
        b.status === 'pending' || b.status === 'generating' ||
        (b.role_progress && Object.values(b.role_progress).some(v => v === 'generating'))
      ) ? 2000 : false
    },
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const { data: stageFlow } = useQuery({
    queryKey: ['stage-flow'], queryFn: getStageFlow,
    staleTime: 30 * 1000, refetchOnMount: 'always',
  })

  useEffect(() => {
    if (!stageFlow?.stages?.length) return
    const activeKeys = stageFlow.stages.filter(s => s.active).map(s => s.key)
    if (activeKeys.length === 0) return
    if (!activeKeys.includes(activeStageKey)) setActiveStageKey(activeKeys[0])
  }, [stageFlow?.stages, activeStageKey])

  const ALL_STAGES: StageDef[] = stageFlow?.stages?.length
    ? stageFlow.stages.map(_mapStage)
    : DEFAULT_STAGES
  const STAGES: StageDef[] = ALL_STAGES.filter(s => s.active)

  const bundles = outputs?.items ?? []
  const bundleByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && b.status === 'done')
  const inflightByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && (b.status === 'pending' || b.status === 'generating'))

  const stageStatus = (s: StageDef): StageStatus => {
    if (!s.active) return 'locked'
    const kindsToCheck: OutputKind[] = s.subKinds ? s.subKinds.map(sk => sk.kind) : (s.kind ? [s.kind] : [])
    if (kindsToCheck.length === 0) return 'locked'
    if (kindsToCheck.some(k => bundleByKind(k))) return 'done'
    if (kindsToCheck.some(k => inflightByKind(k))) return 'inflight'
    return 'idle'
  }

  const activeStage: StageDef | null = STAGES.length > 0
    ? (STAGES.find(s => s.key === activeStageKey) ?? STAGES[0])
    : null
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

  if (!id) return null
  if (isLoading) return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--rd-text-3)', fontSize: 13 }}>加载中…</div>
  if (!project) return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--rd-text-3)', fontSize: 13 }}>项目不存在</div>
  if (STAGES.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--rd-text-3)', fontSize: 13 }}>
        当前没有启用任何阶段,请管理员到「系统配置 · 项目流程」启用至少一个阶段
      </div>
    )
  }
  if (!activeStage) return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--rd-text-3)', fontSize: 13 }}>阶段配置异常</div>

  const industryLabel = (val: string | null) => {
    if (!val) return null
    return meta?.industries?.find(i => i.value === val)?.label || val
  }

  const startGeneration = async () => {
    if (!activeStage.active || !activeKind) return
    if (V3_DOC_DRIVEN_KINDS.includes(activeKind)) {
      try { await generateOutput({ kind: activeKind, project_id: id! }); refetchOutputs() }
      catch (e) { console.error('generateOutput failed', e) }
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
    try { await generateOutput({ kind: briefDrawer.kind, project_id: id! }); refetchOutputs() }
    catch (e: any) { alert(e?.response?.data?.detail || '触发生成失败') }
  }

  // insight / survey / design 阶段下,用精简版 header(单行 + 阶段 popover);其他阶段保留厚 header stack
  const useCompactHeader = activeKind === 'insight' || activeStageKey === 'survey' || activeStageKey === 'design'

  return (
    <div style={{
      flex: 1, minHeight: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── 精简单行 header(insight + survey 阶段)── */}
      {useCompactHeader && (
        <>
          <CompactInsightHeader
            project={project}
            industryLabel={industryLabel}
            stages={STAGES}
            activeStageKey={activeStageKey}
            setActiveStageKey={setActiveStageKey}
            stageStatus={stageStatus}
            onOpenCollab={() => setCollabOpen(true)}
            onOpenStakes={() => setStakesOpen(true)}
            onOpenMeetings={() => setMeetingsOpen(true)}
            onEdit={() => setEditing(v => !v)}
            editing={editing}
            onBack={() => nav('/console/projects')}
            actions={(project.my_role === 'owner' || user?.is_admin) ? (
              <DeleteProjectControl
                project={{ id: project.id, name: project.name, document_count: project.document_count }}
                variant="header"
                onDeleted={() => nav('/console/projects')}
              />
            ) : null}
          />
          {/* subKind 切换条 — 当前阶段有子产物(如 survey 的「调研大纲 / 调研问卷」)时显示 */}
          {activeStage.subKinds && (
            <div style={{
              ...GLASS_PANEL, flexShrink: 0,
              padding: '7px 20px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderTop: '1px solid rgba(0,0,0,0.18)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>本阶段产物</span>
              {activeStage.subKinds.map(sk => {
                const has = !!bundleByKind(sk.kind)
                const inflight = !!inflightByKind(sk.kind)
                const selected = activeKind === sk.kind
                return (
                  <button
                    key={sk.kind}
                    onClick={() => setSelectedSubKind(sk.kind)}
                    className={`rd-chip${selected ? ' is-active' : ''}`}
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    title={sk.label}
                  >
                    {has ? <CheckCircle2 size={10} color="#34D399" /> :
                     inflight ? <Loader2 size={10} className="animate-spin" color="#38BDF8" /> :
                     <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rd-text-3)' }} />}
                    {sk.label}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── 原版 Header Stack(其他阶段)── */}
      {!useCompactHeader && (
      <div style={{ ...GLASS_PANEL, flexShrink: 0 }}>
      {/* ── 顶部信息条:返回 + 项目名 + 元信息 + 操作 ── */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => nav('/console/projects')}
          className="rd-icon-btn"
          style={{ width: 30, height: 30 }}
          title="返回项目列表"
        >
          <ArrowLeft size={14} />
        </button>
        <Home size={14} color="var(--rd-text-3)" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{
            fontSize: 15, fontWeight: 700, color: 'var(--rd-text)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{project.name}</h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--rd-text-3)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span>{project.customer || '未填客户'}</span>
            {project.industry && <><span style={{ opacity: 0.5 }}>·</span><span>{industryLabel(project.industry)}</span></>}
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{project.document_count} 份文档</span>
          </div>
        </div>
        {project.my_role === 'read' && (
          <span className="rd-badge is-gray" style={{ flexShrink: 0 }}>
            <Eye size={10} /> 只读
          </span>
        )}
        <button onClick={() => setCollabOpen(true)} className="rd-btn" style={{ padding: '6px 12px', fontSize: 12 }} title="项目成员">
          <Users size={11} /> <span className="hidden-sm">成员</span>
        </button>
        <button onClick={() => setStakesOpen(true)} className="rd-btn" style={{ padding: '6px 12px', fontSize: 12 }} title="项目级干系人">
          <Users size={11} /> <span className="hidden-sm">干系人</span>
        </button>
        <button onClick={() => setMeetingsOpen(true)} className="rd-btn" style={{ padding: '6px 12px', fontSize: 12 }} title="关联会议(纪要 / 录音 / 需求)">
          <MessageSquare size={11} /> <span className="hidden-sm">会议</span>
        </button>
        <button
          onClick={() => setEditing(v => !v)}
          className={editing ? 'rd-btn rd-btn-primary' : 'rd-btn'}
          style={{ padding: '6px 12px', fontSize: 12 }}
          title="项目信息"
        >
          <Pencil size={11} /> <span className="hidden-sm">项目信息</span>
        </button>
        {(project.my_role === 'owner' || user?.is_admin) && (
          <DeleteProjectControl
            project={{ id: project.id, name: project.name, document_count: project.document_count }}
            variant="header"
            onDeleted={() => nav('/console/projects')}
          />
        )}
      </div>

      {/* ── 阶段流程栏 ── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto' }}>
          {STAGES.map((s, i) => {
            const status = stageStatus(s)
            const isActive = activeStageKey === s.key

            let bg = 'rgba(255,255,255,0.06)'
            let color = 'var(--rd-text-2)'
            let borderColor = 'rgba(255,255,255,0.06)'
            if (isActive) {
              bg = 'linear-gradient(135deg, #FF8D1A, #D96400)'
              color = '#fff'
              borderColor = 'transparent'
            } else if (status === 'done') {
              bg = 'rgba(5, 150, 105, 0.12)'
              color = '#34D399'
              borderColor = 'rgba(5, 150, 105, 0.28)'
            } else if (status === 'inflight') {
              bg = 'rgba(14, 116, 144, 0.12)'
              color = '#38BDF8'
              borderColor = 'rgba(14, 116, 144, 0.28)'
            } else if (status === 'locked') {
              bg = 'rgba(0,0,0,0.25)'
              color = 'var(--rd-text-3)'
              borderColor = 'var(--rd-line)'
            }

            return (
              <button
                key={s.key}
                onClick={() => s.active && setActiveStageKey(s.key)}
                disabled={!s.active}
                style={{
                  flex: 1, minWidth: 110,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: bg,
                  color,
                  border: `1px solid ${borderColor}`,
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  whiteSpace: 'nowrap', cursor: s.active ? 'pointer' : 'not-allowed',
                  boxShadow: isActive
                    ? '0 4px 12px -2px rgba(255, 141, 26, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  transition: 'all .22s',
                  fontFamily: 'inherit',
                }}
                title={s.label}
              >
                {status === 'done' ? <CheckCircle2 size={11} /> :
                 status === 'inflight' ? <Loader2 size={10} className="animate-spin" /> :
                 status === 'locked' ? <Lock size={9} /> :
                 <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{i + 1}</span>}
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── subKinds 切换 ── */}
      {activeStage.subKinds && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>本阶段产物:</span>
          {activeStage.subKinds.map(sk => {
            const has = !!bundleByKind(sk.kind)
            const inflight = !!inflightByKind(sk.kind)
            const selected = activeKind === sk.kind
            return (
              <button
                key={sk.kind}
                onClick={() => setSelectedSubKind(sk.kind)}
                className={`rd-chip${selected ? ' is-active' : ''}`}
                style={{ fontSize: 12, padding: '5px 12px' }}
                title={sk.label}
              >
                {has ? <CheckCircle2 size={10} color="#34D399" /> :
                 inflight ? <Loader2 size={10} className="animate-spin" color="#38BDF8" /> :
                 <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rd-text-3)' }} />}
                {sk.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── 当前阶段 action bar ── */}
      <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--rd-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!activeStage.active ? '该阶段即将上线' :
           activeInflight && activeBundle ? `${activeKindLabel} · 已有交付物 · 正在重新生成…` :
           activeBundle ? `${activeKindLabel} · 已生成交付物` :
           activeInflight ? `${activeKindLabel} · 正在生成中…` :
           `${activeKindLabel} · 尚未生成`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {activeStage.active && activeKind && BRIEF_KINDS.includes(activeKind) && !activeInflight && (
            <button onClick={openBriefForActive} className="rd-btn" style={{ padding: '5px 12px', fontSize: 12 }} title="查看 / 编辑项目要点">
              <ClipboardList size={11} /> 要点
            </button>
          )}
          {activeBundle ? (
            <>
              <BundlePreviewBtn b={activeBundle} />
              <BundleDownloadBtn b={activeBundle} />
              {activeInflight ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12, color: '#38BDF8' }}>
                  <Loader2 size={11} className="animate-spin" /> 重新生成中…
                </span>
              ) : (
                <button onClick={startGeneration} className="rd-btn" style={{ padding: '5px 12px', fontSize: 12 }}>
                  <Sparkles size={11} /> 重新生成
                </button>
              )}
            </>
          ) : activeInflight ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12, color: '#38BDF8' }}>
              <Loader2 size={11} className="animate-spin" /> 后台任务进行中
            </span>
          ) : activeStage.active ? (
            <>
              {activeKind && (activeKind === 'kickoff_pptx' || activeKind === 'kickoff_html') && (
                <button onClick={startChatFallback} className="rd-btn" style={{ padding: '5px 12px', fontSize: 12 }} title="对话式访谈生成 PPT">
                  <MessageSquare size={11} /> 对话
                </button>
              )}
              <button onClick={startGeneration} className="rd-btn rd-btn-primary" style={{ padding: '6px 16px', fontSize: 12 }}>
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
      </div>
      )}
      {/* ── Header Stack 玻璃片结束 ── */}

      {/* ── 全局浮层 modals / drawers / edit panel(脱离 header 玻璃) ── */}
      <CollaboratorsModal
        open={collabOpen}
        projectId={project.id}
        myRole={(project.my_role === 'none' ? 'read' : (project.my_role || 'read'))}
        onClose={() => setCollabOpen(false)}
      />
      <ProjectStakeholdersDrawer
        open={stakesOpen}
        projectId={project.id}
        onClose={() => setStakesOpen(false)}
      />
      <ProjectMeetingsDrawer
        open={meetingsOpen}
        projectId={project.id}
        onClose={() => setMeetingsOpen(false)}
      />
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

      {/* ── v2 质量评审 Banner ── */}
      {!activeInflight
        && activeBundle?.agentic_version === 'v2'
        && activeBundle.status === 'done'
        && !(activeBundle.validity_status === 'invalid' && activeBundle.short_circuited)
        && <AgenticValidityBanner bundle={activeBundle} />}

      {/* ── 主区分支 ── */}
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
      ) : activeStageKey === 'design' && activeKind === 'blueprint_design' ? (
        <BlueprintDesignWorkspace
          projectId={id}
          activeBundle={activeBundle}
          activeInflight={activeInflight}
          onRefetch={refetchOutputs}
        />
      ) : activeStageKey === 'survey' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResearchWorkspace
            projectId={id}
            outlineBundle={bundleByKind('survey_outline')}
            outlineInflight={inflightByKind('survey_outline')}
            surveyBundle={bundleByKind('survey')}
            surveyInflight={inflightByKind('survey')}
            reportBundle={bundleByKind('research_report')}
            reportInflight={inflightByKind('research_report')}
            activeKind={activeKind}
            onRefetch={refetchOutputs}
          />
        </div>
      ) : activeStageKey === 'implement' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ImplementationWorkspace
            projectId={id!}
            planBundle={bundleByKind('implementation_plan')}
            planInflight={inflightByKind('implementation_plan')}
            onRefetch={refetchOutputs}
          />
        </div>
      ) : activeBundle?.agentic_version === 'v2'
        && activeBundle.validity_status === 'invalid'
        && activeBundle.short_circuited
        && activeKind
        && !activeInflight ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <AgenticGapFiller
            key={`gap-${activeBundle.id}`}
            bundle={activeBundle}
            kind={activeKind}
            projectId={id}
            onSubmitted={() => refetchOutputs()}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ChatTabs
            mode={chatMode}
            setMode={setChatMode}
            docCount={docs?.length ?? 0}
            onOpenDocs={() => setDocsOpen(true)}
          />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {chatMode.type === 'pm' ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <NewQA lockedProjectId={id} />
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

      <FloatingChat projectId={id} state={chatState} onChange={setChatState} />

      {!chatState.open && (
        <button
          onClick={() => setChatState({ open: true, minimized: false, fullscreen: false })}
          style={{
            position: 'fixed', bottom: 110, right: 24, zIndex: 40,
            width: 50, height: 50, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
            color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px -4px rgba(255,141,26,.55), inset 0 1px 0 rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform .2s, box-shadow .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="项目问答(基于本项目知识库)"
        >
          <MessageSquare size={20} />
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// InsightWorkspace
// ──────────────────────────────────────────────────────────────────────────
function InsightWorkspace({
  projectId, activeBundle, activeInflight, centerView, setCenterView,
  rightOpen, setRightOpen, highlightedRef, setHighlightedRef, onRefetch,
  stage = 'insight',
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
  /** 阶段 key — DocChecklist 按这个查需要哪些文档。默认 'insight';
   *  其他 stage(如 'design')复用本组件时传过来即可。后端 STAGE_DOC_REQUIREMENTS
   *  没配会返空清单,UI 显示"该阶段无文档清单",不影响一键生成。 */
  stage?: string
}) {
  useEffect(() => {
    if (activeInflight && centerView.type !== 'preparation') {
      setCenterView({ type: 'preparation' })
      return
    }
    if (centerView.type !== 'preparation') return
    if (activeInflight) return
    if (activeBundle?.agentic_version === 'v2'
        && activeBundle.validity_status === 'invalid'
        && activeBundle.short_circuited) {
      setCenterView({ type: 'gap_filler' })
    } else if (activeBundle?.status === 'done') {
      setCenterView({ type: 'report' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBundle?.id, activeBundle?.status, activeBundle?.validity_status,
      activeBundle?.short_circuited, activeInflight?.id])

  const onCitationClick = (moduleKey: string, refId: string) => {
    setRightOpen(true)
    setHighlightedRef(`${moduleKey}:${refId}`)
  }

  // ── 资料清单浮窗 tab + 浮动抽屉(始终显示 tab,点击弹抽屉)──
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  const docChecklist = (
    <DocChecklist
      projectId={projectId}
      stage={stage}
      onOpenDocPreview={(docId) => { setCenterView({ type: 'preview', docId }); closeDrawer() }}
      onOpenVirtualForm={(vkey) => { setCenterView({ type: 'virtual', vkey }); closeDrawer() }}
      onOpenStakeholderCanvas={() => { setCenterView({ type: 'canvas' }); closeDrawer() }}
    />
  )

  const hasProvenance = activeBundle?.provenance && Object.keys(activeBundle.provenance).length > 0

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>

      {/* ── 左侧固定 rail — "小浮窗"按钮始终可见(改用 flex 子项,不再 absolute,保证显示) ── */}
      <aside className="rd-side-rail rd-side-rail--left">
        <button
          onClick={() => setDrawerOpen(true)}
          className="rd-rail-fab"
          title="打开资料清单"
        >
          <span className="rd-rail-fab-glow" aria-hidden />
          <span className="rd-rail-fab-icon"><ClipboardList size={15} /></span>
          <span className="rd-rail-fab-label">资料清单</span>
          <span className="rd-rail-fab-chev"><ChevronRight size={11} /></span>
        </button>
      </aside>

      {/* ── 中:工作区 ── */}
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          // 准备视图限宽 880(焦点卡居中聚焦);其他视图铺满
          maxWidth: centerView.type === 'preparation' ? 880 : 'none',
          display: 'flex', flexDirection: 'column', minWidth: 0,
        }}>
          <CenterWorkspace
            projectId={projectId}
            activeBundle={activeBundle}
            activeInflight={activeInflight}
            view={centerView}
            setView={setCenterView}
            onRefetch={onRefetch}
            onCitationClick={onCitationClick}
          />
        </div>
      </div>

      {/* ── 右:CitationsPanel(展开 vs tab) ── */}
      {rightOpen ? (
        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--rd-line)' }}>
          <CitationsPanel
            bundle={activeBundle}
            highlightedRefId={highlightedRef}
            onPreviewDoc={(docId) => setCenterView({ type: 'preview', docId })}
            onClose={() => setRightOpen(false)}
          />
        </div>
      ) : hasProvenance ? (
        <aside className="rd-side-rail rd-side-rail--right">
          <button
            onClick={() => setRightOpen(true)}
            className="rd-rail-fab rd-rail-fab--right"
            title="展开引用追溯面板"
          >
            <span className="rd-rail-fab-glow" aria-hidden />
            <span className="rd-rail-fab-icon"><Search size={15} /></span>
            <span className="rd-rail-fab-label">引用追溯</span>
          </button>
        </aside>
      ) : null}

      {/* ── 资料清单浮动抽屉 ── */}
      {drawerOpen && (
        <div
          onClick={closeDrawer}
          style={{
            position: 'absolute', inset: 0, zIndex: 25,
            background: 'rgba(5, 8, 16, .45)',
            backdropFilter: 'blur(2px)',
            animation: 'rd-fade-in .18s ease-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: 'min(340px, 90vw)',
              background: 'rgba(15, 18, 36, .94)',
              backdropFilter: 'blur(28px) saturate(160%)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%)',
              borderRight: '1px solid var(--rd-line)',
              boxShadow: '8px 0 32px -8px rgba(0,0,0,.55)',
              display: 'flex', flexDirection: 'column',
              animation: 'rd-slide-in-left .25s var(--rd-ease)',
            }}
          >
            <div style={{
              padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid var(--rd-line)',
              flexShrink: 0,
            }}>
              <ClipboardList size={13} color="var(--rd-accent-2)" />
              <span style={{
                fontSize: 11.5, color: 'var(--rd-text)',
                letterSpacing: '.1em', fontWeight: 600, flex: 1,
                textTransform: 'uppercase',
              }}>
                资料清单
              </span>
              <button
                onClick={closeDrawer}
                className="rd-icon-btn"
                style={{ width: 26, height: 26, padding: 0 }}
                title="关闭"
              >
                <X size={13} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {docChecklist}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// BlueprintDesignWorkspace — 方案设计 / 蓝图设计 专属工作区(2026-06-01)
//
// 极简版,只做核心闭环:
//   空态  → 一张大卡 + "开始生成方案设计" CTA
//   生成中 → 显示当前阶段 / 进度信息
//   完成  → 顶部"重新生成"按钮 + 主区 markdown 报告
//
// 不复用 InsightWorkspace(后者内部 PreparationView hardcode 了 insight
// kind / 资料清单 / 体检报告,对 design 来说全是噪音 — design 阶段没配
// STAGE_DOC_REQUIREMENTS,资料清单是空的)。
// ──────────────────────────────────────────────────────────────────────────
function BlueprintDesignWorkspace({
  projectId, activeBundle, activeInflight, onRefetch,
}: {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  onRefetch: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const genMut = useMutation({
    mutationFn: () => generateOutput({ kind: 'blueprint_design', project_id: projectId }),
    onSuccess: () => { onRefetch(); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '触发失败'),
  })

  const isInflight = !!activeInflight
  const isDone = activeBundle?.status === 'done'
  const md = (activeBundle as any)?.markdown_content || ''
  const progressMsg = (activeInflight as any)?.extra?.progress?.message
                    || (activeInflight as any)?.extra?.progress?.stage
                    || '准备中…'

  // 空态(从未生成 + 当前没在跑)
  if (!activeBundle && !isInflight) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="rd-card" style={{ padding: '40px 48px', maxWidth: 560, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 700, marginBottom: 12, color: 'var(--rd-text)' }}>
            <Lightbulb size={20} color="var(--rd-accent)" /> 方案设计 · 蓝图
          </div>
          <p style={{ fontSize: 13, color: 'var(--rd-text-2)', marginBottom: 24, lineHeight: 1.6 }}>
            基于项目洞察 + 调研报告 + 行业最佳实践,输出客户级 LTC 蓝图设计文档
            (业务对象 / 流程 / 角色 / 集成等)。
          </p>
          <button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending}
            className="rd-btn-primary"
            style={{ padding: '10px 24px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {genMut.isPending
              ? <><Loader2 size={14} className="animate-spin" /> 触发中…</>
              : <><Sparkles size={14} /> 开始生成方案设计</>}
          </button>
          {error && <p style={{ fontSize: 12, color: '#F87171', marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    )
  }

  // 生成中
  if (isInflight) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="rd-card" style={{ padding: '32px 40px', maxWidth: 560, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: 600, color: 'var(--rd-text)' }}>
            <Loader2 size={16} className="animate-spin" color="var(--rd-accent)" />
            正在生成方案设计…
          </div>
          <p style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 8 }}>{progressMsg}</p>
          <p style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 12 }}>
            典型耗时 2-5 分钟,稍候页面会自动刷新。
          </p>
        </div>
      </div>
    )
  }

  // 完成(有 bundle 且没在跑)
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px 32px 32px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--rd-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Lightbulb size={14} color="var(--rd-accent)" /> 方案设计 · 蓝图
        </span>
        {isDone && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', fontSize: 11, fontWeight: 500,
              background: 'rgba(16,185,129,0.10)', color: '#34D399',
              border: '1px solid rgba(16,185,129,0.25)', borderRadius: 999,
            }}
          >
            <CheckCircle2 size={10} /> 已生成
          </span>
        )}
        <button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          className="rd-btn"
          style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          title="基于最新资料重新生成"
        >
          {genMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
          重新生成
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: '#F87171', marginBottom: 12 }}>{error}</p>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {md
          ? <MarkdownView content={md} size="base" toolbar={false} />
          : <p style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>报告内容为空 — 试一下「重新生成」?</p>}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// CompactInsightHeader — insight 阶段专用的精简单行 header(方案 A · Focus)
// ──────────────────────────────────────────────────────────────────────────
function CompactInsightHeader({
  project, industryLabel, stages, activeStageKey, setActiveStageKey, stageStatus,
  onOpenCollab, onOpenStakes, onOpenMeetings, onEdit, editing, onBack, actions,
}: {
  project: Project
  industryLabel: (val: string | null) => string | null
  stages: StageDef[]
  activeStageKey: string
  setActiveStageKey: (k: string) => void
  stageStatus: (s: StageDef) => StageStatus
  onOpenCollab: () => void
  onOpenStakes: () => void
  onOpenMeetings: () => void
  onEdit: () => void
  editing: boolean
  onBack: () => void
  actions?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const activeStage = stages.find(s => s.key === activeStageKey) ?? stages[0]
  const activeIdx = stages.findIndex(s => s.key === activeStageKey)

  // 点外部关闭 popover
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement
      if (!tgt.closest('[data-stage-menu]')) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div style={{ ...GLASS_PANEL, flexShrink: 0 }}>
      <div style={{
        padding: '9px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} className="rd-icon-btn" style={{ width: 30, height: 30 }} title="返回项目列表">
          <ArrowLeft size={14} />
        </button>

        {/* 面包屑 + 项目名 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: '0 1 auto' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 12, color: 'var(--rd-text-3)', fontFamily: 'inherit',
            }}
            title="返回项目列表"
            onMouseEnter={e => e.currentTarget.style.color = 'var(--rd-text-2)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text-3)'}
          >
            项目 /
          </button>
          <h1 style={{
            fontSize: 14, fontWeight: 700, color: 'var(--rd-text)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
          }}>{project.name}</h1>
          <span style={{
            fontSize: 11.5, color: 'var(--rd-text-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {project.customer || '未填客户'}
            {project.industry && <> · {industryLabel(project.industry)}</>}
            <> · {project.document_count} 份文档</>
          </span>
        </div>

        {/* 阶段下拉药丸 */}
        <div style={{ position: 'relative' }} data-stage-menu>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '5px 12px 5px 10px',
              background: 'rgba(255,141,26,.12)',
              border: '1px solid rgba(255,141,26,.35)',
              borderRadius: 999,
              fontSize: 12.5, color: 'var(--rd-text)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            title="切换阶段"
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--rd-accent)',
              boxShadow: 'var(--rd-accent-glow)',
            }} />
            <span style={{
              fontSize: 10.5, color: 'var(--rd-text-3)',
              fontFamily: 'ui-monospace, monospace', letterSpacing: '.04em',
            }}>
              {String(activeIdx + 1).padStart(2, '0')} / {String(stages.length).padStart(2, '0')}
            </span>
            <strong style={{ fontWeight: 600 }}>{activeStage?.label}</strong>
            <ChevronDown size={12} style={{ color: 'var(--rd-text-3)' }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0,
              minWidth: 240,
              background: 'rgba(20, 24, 40, .92)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              border: '1px solid var(--rd-line)',
              borderRadius: 12,
              padding: 6,
              boxShadow: '0 20px 48px -12px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)',
              zIndex: 50,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {stages.map((s, i) => {
                const st = stageStatus(s)
                const isActive = s.key === activeStageKey
                return (
                  <button
                    key={s.key}
                    onClick={() => { setActiveStageKey(s.key); setMenuOpen(false) }}
                    disabled={!s.active}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: isActive ? 'rgba(255,141,26,.16)' : 'transparent',
                      border: isActive ? '1px solid rgba(255,141,26,.32)' : '1px solid transparent',
                      color: isActive ? 'var(--rd-text)' : (s.active ? 'var(--rd-text-2)' : 'var(--rd-text-3)'),
                      fontSize: 12.5, textAlign: 'left',
                      cursor: s.active ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!isActive && s.active) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: st === 'done' ? 'var(--rd-green)'
                        : st === 'inflight' ? 'var(--rd-cyan)'
                        : isActive ? 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))'
                        : 'rgba(255,255,255,.05)',
                      color: st === 'done' || st === 'inflight' || isActive ? '#fff' : 'var(--rd-text-3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9.5, fontFamily: 'ui-monospace, monospace', fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {st === 'done' ? '✓'
                        : st === 'inflight' ? <Loader2 size={10} className="animate-spin" />
                        : st === 'locked' ? <Lock size={9} />
                        : String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, fontWeight: isActive ? 600 : 400 }}>{s.label}</span>
                    {st === 'done' && <span style={{ fontSize: 10, color: 'var(--rd-green)' }}>已生成</span>}
                    {st === 'inflight' && <span style={{ fontSize: 10, color: 'var(--rd-cyan)' }}>生成中</span>}
                    {st === 'locked' && <span style={{ fontSize: 10, color: 'var(--rd-text-3)' }}>未开放</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {project.my_role === 'read' && (
          <span className="rd-badge is-gray" style={{ flexShrink: 0 }}>
            <Eye size={10} /> 只读
          </span>
        )}
        <button onClick={onOpenCollab} className="rd-btn" style={{ padding: '5px 10px', fontSize: 12 }} title="项目成员">
          <Users size={11} />
        </button>
        <button onClick={onOpenStakes} className="rd-btn" style={{ padding: '5px 10px', fontSize: 12 }} title="项目级干系人">
          <Users size={11} />
        </button>
        <button onClick={onOpenMeetings} className="rd-btn" style={{ padding: '5px 10px', fontSize: 12 }} title="关联会议">
          <MessageSquare size={11} />
        </button>
        <button
          onClick={onEdit}
          className={editing ? 'rd-btn rd-btn-primary' : 'rd-btn'}
          style={{ padding: '5px 10px', fontSize: 12 }}
          title="项目信息"
        >
          <Pencil size={11} />
        </button>
        {actions}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// AgenticValidityBanner(v2 质量评审)
// ──────────────────────────────────────────────────────────────────────────
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

function AgenticValidityBanner({ bundle }: { bundle: CuratedBundle }) {
  const [expanded, setExpanded] = useState(false)
  const isInvalid = bundle.validity_status === 'invalid'
  const askPrompts = bundle.ask_user_prompts || []
  const moduleStates = bundle.module_states || {}
  const all = Object.values(moduleStates).filter(Boolean) as NonNullable<typeof moduleStates[string]>[]

  const incompleteCritical = all.filter(m => m.necessity === 'critical' && (m.status === 'blocked' || m.status === 'insufficient' || m.status === 'failed'))
  const incompleteOptional = all.filter(m => m.necessity !== 'critical' && (m.status === 'blocked' || m.status === 'insufficient' || m.status === 'failed'))
  const warnCritical = all.filter(m => m.necessity === 'critical' && m.status === 'done_with_warnings')
  const warnOptional = all.filter(m => m.necessity !== 'critical' && m.status === 'done_with_warnings')
  const issuesCount = incompleteCritical.length + warnCritical.length + incompleteOptional.length

  const cs = bundle.challenge_summary
  const challengerVerdict = cs?.final_verdict
  const challengerPassed = challengerVerdict === 'pass'
  const challengerHasIssues = challengerVerdict === 'major_issues'
  const challengerErrored = challengerVerdict === 'parse_failed'
  const issuesRemaining = cs?.issues_remaining ?? 0
  const hasChallenge = !!cs && (cs.rounds_total ?? 0) > 0

  type Color = 'red' | 'amber' | 'sky' | 'emerald'
  let mainColor: Color
  let mainText: string
  let mainIcon: typeof ShieldAlert = ShieldAlert
  if (isInvalid) { mainColor = 'red'; mainText = '信息不足 — 关键字段缺失,补充后重新生成' }
  else if (issuesRemaining > 0 || challengerHasIssues) {
    mainColor = 'amber'
    mainText = `挑战 ${cs?.rounds_total ?? '?'} 轮后仍有 ${issuesRemaining} 项重大问题未解决`
      + (issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : '')
  } else if (challengerErrored) {
    mainColor = 'amber'
    mainText = `挑战未完成(LLM 输出解析异常)${issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : ''}`
  } else if (challengerPassed && issuesCount === 0) {
    mainColor = 'emerald'; mainText = '已通过整体审核'; mainIcon = CheckCircle2
  } else if (challengerPassed || challengerVerdict === 'minor_issues') {
    mainColor = 'sky'
    mainText = challengerVerdict === 'minor_issues'
      ? `整体可交付 · ${issuesCount > 0 ? `${issuesCount} 项细节待补` : '剩余小问题不阻塞发布'}`
      : `整体可交付${issuesCount > 0 ? ` · ${issuesCount} 项细节待补` : ''}`
  } else if (issuesCount > 0) { mainColor = 'amber'; mainText = `细节待补 ${issuesCount} 项` }
  else { mainColor = 'emerald'; mainText = '已通过质量评审'; mainIcon = CheckCircle2 }

  const COLOR_MAP: Record<Color, { bg: string; text: string; border: string }> = {
    red:     { bg: 'rgba(220, 38, 38, .08)',  text: '#FB7185', border: 'rgba(220, 38, 38, .25)' },
    amber:   { bg: 'rgba(245, 158, 11, .10)', text: '#FBBF24', border: 'rgba(245, 158, 11, .28)' },
    sky:     { bg: 'rgba(14, 116, 144, .08)', text: '#38BDF8', border: 'rgba(14, 116, 144, .25)' },
    emerald: { bg: 'rgba(5, 150, 105, .08)',  text: '#34D399', border: 'rgba(5, 150, 105, .25)' },
  }
  const C = COLOR_MAP[mainColor]
  const MainIcon = mainIcon

  const renderModuleList = (mods: typeof all) => mods.map((m, i) => {
    const issues = (m.score?.issues || []).map(localizeIssue)
    return (
      <li key={i} style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 600 }}>{m.title}</span>
        {issues.length > 0 && <span style={{ color: 'var(--rd-text-3)' }}> — {issues.slice(0, 2).join('; ')}</span>}
      </li>
    )
  })
  const hasAnyDetail = issuesCount + warnOptional.length + askPrompts.length + (hasChallenge ? 1 : 0) > 0

  return (
    <div style={{
      flexShrink: 0, padding: '8px 18px',
      background: C.bg,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderBottom: `1px solid ${C.border}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      color: C.text,
    }}>
      <button
        onClick={() => setExpanded(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          color: 'inherit', fontFamily: 'inherit', padding: 0,
        }}
        title={expanded ? '点击折叠详情' : '点击展开详情'}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <MainIcon size={13} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{mainText}</span>
        {hasChallenge && (
          <span style={{ fontSize: 12, color: 'var(--rd-text-3)', marginLeft: 4 }}>· 挑战 {cs!.rounds_total} 轮</span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: 8, marginLeft: 18, maxHeight: '55vh', overflowY: 'auto', paddingRight: 8 }}>
          {hasChallenge && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>整体审核</div>
              <ChallengeRoundsPanel bundleId={bundle.id} challengeSummary={cs} />
            </div>
          )}
          {(issuesCount > 0 || warnOptional.length > 0 || askPrompts.length > 0) && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                细节待补 — 由顾问 review 后补全(AI 评审给的提示)
              </div>
              {incompleteCritical.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--rd-text-2)', marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>未完成关键模块:</span>
                  <ul style={{ marginLeft: 16, marginTop: 2, listStyle: 'disc' }}>{renderModuleList(incompleteCritical)}</ul>
                </div>
              )}
              {warnCritical.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--rd-text-2)', marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>关键模块质量待提升:</span>
                  <ul style={{ marginLeft: 16, marginTop: 2, listStyle: 'disc' }}>{renderModuleList(warnCritical)}</ul>
                </div>
              )}
              {incompleteOptional.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>未完成可选模块:</span>
                  <ul style={{ marginLeft: 16, marginTop: 2, listStyle: 'disc' }}>{renderModuleList(incompleteOptional)}</ul>
                </div>
              )}
              {warnOptional.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--rd-text-3)', fontWeight: 600 }}>
                    可选模块质量提示({warnOptional.length} 个)
                  </summary>
                  <ul style={{ marginLeft: 16, marginTop: 4, listStyle: 'disc', fontSize: 12, color: 'var(--rd-text-3)' }}>{renderModuleList(warnOptional)}</ul>
                </details>
              )}
              {askPrompts.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    需要补充的信息({askPrompts.length} 项)
                  </summary>
                  <ul style={{ marginTop: 6, fontSize: 12, color: 'var(--rd-text-2)', listStyle: 'disc', paddingLeft: 18 }}>
                    {askPrompts.slice(0, 8).map((p, i) => <li key={i}>{p.question}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {!hasAnyDetail && (
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', fontStyle: 'italic' }}>
              所有关键模块都通过质量评审,无需调整。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// ChatTabs(在主区上方,切换 PM 问答 / 生成模式)
// ──────────────────────────────────────────────────────────────────────────
function ChatTabs({ mode, setMode, docCount, onOpenDocs }: {
  mode: ChatMode; setMode: (m: ChatMode) => void; docCount: number; onOpenDocs: () => void
}) {
  return (
    <div style={{
      ...GLASS_PANEL, flexShrink: 0,
      padding: '8px 20px',
      display: 'flex', alignItems: 'flex-end', gap: 6,
    }}>
      <button
        onClick={() => setMode({ type: 'pm' })}
        className={`rd-chip${mode.type === 'pm' ? ' is-active' : ''}`}
        style={{ fontSize: 12, padding: '6px 12px' }}
      >
        <MessageSquare size={11} /> 项目问答
      </button>
      {mode.type === 'output' && (
        <span className="rd-chip is-active" style={{ fontSize: 12, padding: '6px 12px' }}>
          <Sparkles size={11} /> 生成 · {mode.label}
        </span>
      )}
      <button
        onClick={onOpenDocs}
        className="rd-btn"
        style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: 12 }}
        title="查看关联文档"
      >
        <Files size={11} /> 关联文档
        <span style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, background: 'rgba(0,0,0,0.25)', color: 'var(--rd-text-3)' }}>{docCount}</span>
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// BundlePreviewBtn / BundleInlinePreview / BundleDownloadBtn
// ──────────────────────────────────────────────────────────────────────────
function BundlePreviewBtn({ b }: { b: CuratedBundle }) {
  const previewable = b.has_content || (b.has_file && b.file_ext === 'html')
  if (!previewable) return null
  const isHtmlFile = b.has_file && b.file_ext === 'html'
  const onClick = () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
    if (isHtmlFile) {
      const url = `${viewOutputUrl(b.id)}?token=${encodeURIComponent(token)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
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
    <button onClick={onClick} className="rd-btn" style={{ padding: '5px 12px', fontSize: 12, borderColor: 'rgba(255,141,26,.35)', color: 'var(--rd-accent-2)' }}>
      <ExternalLink size={11} /> 在线预览
    </button>
  )
}

function BundleInlinePreview({ bundle }: { bundle: CuratedBundle }) {
  const isHtmlFile = bundle.has_file && bundle.file_ext === 'html'
  const token = isHtmlFile ? (localStorage.getItem(TOKEN_STORAGE_KEY) || '') : ''

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
        style={{ flex: 1, width: '100%', minHeight: 0, border: 0, background: '#fff', display: 'block' }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
      />
    )
  }

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rd-text-3)', fontSize: 12 }}>
        <Loader2 size={14} className="animate-spin" style={{ marginRight: 8 }} /> 加载交付物预览…
      </div>
    )
  }

  const md = full?.content_md || bundle.content_md || ''
  if (md) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
        <MarkdownView content={md} size="base" toolbar={false} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{
        maxWidth: 420, width: '100%', borderRadius: 16,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 28px', textAlign: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          margin: '0 auto 12px',
          background: 'linear-gradient(135deg, rgba(255,141,26,.18), rgba(255,141,26,.06))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--rd-accent-2)',
        }}>
          <FileText size={22} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--rd-text)', margin: '0 0 4px' }}>{bundle.title}</p>
        <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '0 0 14px', lineHeight: 1.6 }}>
          这份交付物为二进制文件{bundle.file_ext ? `(.${bundle.file_ext})` : ''},浏览器无法内联预览。
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
    <button onClick={onClick} className="rd-btn" style={{ padding: '5px 12px', fontSize: 12 }}>
      <Download size={11} /> 下载
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// DocsDrawer
// ──────────────────────────────────────────────────────────────────────────
function DocsDrawer({ docs, onClose, onSelect, previewDocId }: {
  docs: ProjectDocument[]; onClose: () => void; onSelect: (id: string) => void; previewDocId: string | null
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim() ? docs.filter(d => d.filename.toLowerCase().includes(q.trim().toLowerCase())) : docs

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        background: 'rgba(15, 18, 36, 0.30)',
        display: 'flex', justifyContent: 'flex-start',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, 100vw)', height: '100%',
          background: 'rgba(255,255,255,0.10)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25)',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--rd-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, margin: 0 }}>
              <Files size={14} color="var(--rd-accent-2)" /> 关联文档
              <span style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 400 }}>{docs.length}</span>
            </h3>
            <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }}><X size={14} /></button>
          </div>
          {docs.length > 0 && (
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--rd-text-3)' }} />
              <input
                className="rd-input"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="搜索文档名…"
                style={{ paddingLeft: 32, fontSize: 12, padding: '7px 12px 7px 32px' }}
              />
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 16px' }}>
              <Files size={28} color="var(--rd-text-3)" style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: 'var(--rd-text-3)', margin: 0 }}>暂无关联文档</p>
              <p style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 4 }}>在后台「项目库」中关联文档</p>
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)', padding: '48px 0' }}>没有匹配的文档</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(d => {
                const active = previewDocId === d.id
                return (
                  <li
                    key={d.id}
                    onClick={() => onSelect(d.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: active ? '1px solid rgba(255, 141, 26, .35)' : '1px solid transparent',
                      background: active ? 'rgba(255, 141, 26, .10)' : 'transparent',
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.25)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: 'rgba(0,0,0,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <FileText size={13} color="var(--rd-text-3)" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--rd-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.filename}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.doc_type_label || '未分类'}
                          {d.uploader_name && <> · {d.uploader_name}</>}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// ProjectEditPanel
// ──────────────────────────────────────────────────────────────────────────
function ProjectEditPanel({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: () => void
}) {
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const [customer, setCustomer] = useState(project.customer || '')
  const [industry, setIndustry] = useState(project.industry || '')
  const [kickoffDate, setKickoffDate] = useState(project.kickoff_date || '')
  const [profile, setProfile] = useState(project.customer_profile || '')
  const [aliasesRaw, setAliasesRaw] = useState((project.aliases || []).join('\n'))
  const [err, setErr] = useState('')

  const saveMut = useMutation({
    mutationFn: () => updateProject(project.id, {
      customer: customer.trim() || null,
      industry: industry || null,
      kickoff_date: kickoffDate || null,
      customer_profile: profile.trim() || null,
      aliases: aliasesRaw.split(/[\n、,;,;]/).map(s => s.trim()).filter(Boolean),
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
    <div style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid var(--rd-line)' }}>
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 18,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px -6px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--rd-text)', margin: 0 }}>
            <Pencil size={12} color="var(--rd-accent-2)" /> 编辑项目基础信息
          </h3>
          <button onClick={onClose} className="rd-icon-btn" style={{ width: 26, height: 26 }}><X size={13} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          <Field label="客户名称">
            <input className="rd-input" value={customer} onChange={e => setCustomer(e.target.value)} style={{ fontSize: 13, padding: '7px 10px' }} />
          </Field>
          <Field label="行业">
            <select
              className="rd-input"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              style={{ fontSize: 13, padding: '7px 10px', cursor: 'pointer' }}
            >
              <option value="">未选择</option>
              {(meta?.industries ?? []).map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </Field>
          <Field label="立项日期">
            <input className="rd-input" type="date" value={kickoffDate} onChange={e => setKickoffDate(e.target.value)} style={{ fontSize: 13, padding: '7px 10px' }} />
          </Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 600 }}>客户画像 · Markdown</label>
            <button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending}
              className="rd-btn"
              style={{ padding: '4px 10px', fontSize: 12, borderColor: 'rgba(255,141,26,.35)', color: 'var(--rd-accent-2)' }}
            >
              {genMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
              {genMut.isPending ? '生成中…' : (profile.trim() ? 'AI 重新生成' : 'AI 生成草稿')}
            </button>
          </div>
          <textarea
            className="rd-input"
            value={profile}
            onChange={e => setProfile(e.target.value)}
            rows={7}
            placeholder="客户画像:行业地位、规模、组织决策风格、数字化成熟度、与本项目相关的关键诉求…"
            style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', resize: 'vertical', lineHeight: 1.6 }}
          />
          {profile.trim() && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 12, color: 'var(--rd-text-3)', cursor: 'pointer' }}>预览渲染</summary>
              <div style={{ marginTop: 6, padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--rd-line)' }}>
                <MarkdownView content={profile} size="sm" toolbar={false} />
              </div>
            </details>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            脱敏别名表
            <span style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 400, marginLeft: 8 }}>
              一行一个 / 或用顿号、逗号分隔。文档转写时,这些变体会被替换成客户拼音首字母。
            </span>
          </label>
          <textarea
            className="rd-input"
            value={aliasesRaw}
            onChange={e => setAliasesRaw(e.target.value)}
            rows={3}
            placeholder="电信&#10;中电信&#10;China Telecom"
            style={{ fontSize: 13, resize: 'vertical' }}
          />
        </div>

        {err && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(220, 38, 38, .08)',
            border: '1px solid rgba(220, 38, 38, .25)',
            color: '#FB7185', fontSize: 12,
            marginBottom: 8,
          }}>
            <AlertCircle size={12} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button onClick={onClose} className="rd-btn" style={{ padding: '6px 14px', fontSize: 12 }}>取消</button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="rd-btn rd-btn-primary"
            style={{ padding: '6px 16px', fontSize: 12 }}
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
      <label style={{ display: 'block', fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// DocPreviewDrawer
// ──────────────────────────────────────────────────────────────────────────
function DocPreviewDrawer({ docId, docs, onClose }: {
  docId: string; docs: ProjectDocument[]; onClose: () => void
}) {
  const meta = docs.find(d => d.id === docId)
  const { data, isLoading, error } = useQuery({
    queryKey: ['doc-md', docId],
    queryFn: () => getDocumentMarkdown(docId),
    enabled: !!docId,
  })
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: 'rgba(15, 18, 36, .30)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(680px, 100vw)', height: '100%',
          background: 'rgba(255,255,255,0.10)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25)',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(255, 141, 26, .12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText size={14} color="var(--rd-accent-2)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta?.filename || '文档预览'}</p>
              <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '2px 0 0' }}>{meta?.doc_type_label || '未分类'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }}><X size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--rd-text-3)' }}>
              <Loader2 size={13} className="animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <div style={{ fontSize: 12, color: '#F87171' }}>加载失败</div>
          ) : !data?.markdown_content ? (
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', textAlign: 'center', padding: '32px 0' }}>该文档尚未转换为 Markdown 或内容为空</div>
          ) : (
            <MarkdownView content={data.markdown_content} size="sm" toolbar={false} />
          )}
        </div>
      </div>
    </div>
  )
}
