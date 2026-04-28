import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, ClipboardList, Lightbulb, MessageSquare, Sparkles,
  CheckCircle2, Loader2, Lock, Download, ExternalLink,
  Save, X, Wand2, AlertCircle, Pencil, Home, Files, Search,
  Bot, ShieldAlert,
} from 'lucide-react'
import {
  getProject, updateProject, generateCustomerProfile, generateOutput,
  listProjectDocuments, getDocumentMarkdown, listOutputs, downloadOutputUrl, viewOutputUrl,
  getProjectMeta, TOKEN_STORAGE_KEY,
  type CuratedBundle, type OutputKind, type Project, type ProjectDocument,
} from '../../api/client'
import OutputChatPanel from '../../components/OutputChatPanel'
import BriefDrawer from '../../components/BriefDrawer'
import MarkdownView from '../../components/MarkdownView'
import QA from '../QA'

const BRIEF_KINDS: OutputKind[] = ['kickoff_pptx', 'kickoff_html', 'insight', 'insight_v2', 'survey_v2']

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface StageDef {
  key: string
  label: string
  kind: OutputKind | null
  icon: typeof FileText
  active: boolean
  beta?: boolean                      // v2 / agentic 标记
}

const STAGES: StageDef[] = [
  { key: 'insight',       label: '项目洞察',          kind: 'insight',      icon: Lightbulb,     active: true },
  { key: 'kickoff',       label: '启动会·PPT',        kind: 'kickoff_pptx', icon: FileText,      active: true },
  { key: 'kickoff_html',  label: '启动会·HTML',       kind: 'kickoff_html', icon: FileText,      active: true },
  { key: 'survey',        label: '需求调研',          kind: 'survey',       icon: ClipboardList, active: true },
  // v2 (agentic) — 旁路验证版本
  { key: 'insight_v2',    label: '项目洞察 v2 (β)',   kind: 'insight_v2',   icon: Bot,           active: true, beta: true },
  { key: 'survey_v2',     label: '需求调研 v2 (β)',   kind: 'survey_v2',    icon: Bot,           active: true, beta: true },
  { key: 'design',        label: '方案设计',          kind: null,           icon: FileText,      active: false },
  { key: 'implement',     label: '项目实施',          kind: null,           icon: FileText,      active: false },
  { key: 'test',          label: '上线测试',          kind: null,           icon: FileText,      active: false },
  { key: 'acceptance',    label: '项目验收',          kind: null,           icon: FileText,      active: false },
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
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? []
      return items.some((b: CuratedBundle) => b.status === 'pending' || b.status === 'generating') ? 4000 : false
    },
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })

  if (!id) return null
  if (isLoading) return <div className="text-center py-20 text-ink-muted text-sm">加载中…</div>
  if (!project) return <div className="text-center py-20 text-ink-muted text-sm">项目不存在</div>

  const bundles = outputs?.items ?? []
  const bundleByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && b.status === 'done')
  const inflightByKind = (kind: OutputKind) => bundles.find(b => b.kind === kind && (b.status === 'pending' || b.status === 'generating'))

  const stageStatus = (s: StageDef): StageStatus => {
    if (!s.active || !s.kind) return 'locked'
    if (bundleByKind(s.kind)) return 'done'
    if (inflightByKind(s.kind)) return 'inflight'
    return 'idle'
  }

  const activeStage = STAGES.find(s => s.key === activeStageKey) ?? STAGES[0]
  const activeBundle = activeStage.kind ? bundleByKind(activeStage.kind) : undefined
  const activeInflight = activeStage.kind ? inflightByKind(activeStage.kind) : undefined

  const industryLabel = (val: string | null) => {
    if (!val) return null
    return meta?.industries?.find(i => i.value === val)?.label || val
  }

  const startGeneration = () => {
    if (!activeStage.active || !activeStage.kind) return
    if (BRIEF_KINDS.includes(activeStage.kind)) {
      setBriefDrawer({ kind: activeStage.kind, label: activeStage.label })
    } else {
      setChatMode({ type: 'output', kind: activeStage.kind, label: activeStage.label })
    }
  }

  const openBriefForActive = () => {
    if (!activeStage.kind || !BRIEF_KINDS.includes(activeStage.kind)) return
    setBriefDrawer({ kind: activeStage.kind, label: activeStage.label })
  }

  const startChatFallback = () => {
    if (!activeStage.active || !activeStage.kind) return
    setChatMode({ type: 'output', kind: activeStage.kind, label: activeStage.label })
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
      <div className="flex-shrink-0 bg-white border-b border-line pt-2 px-2 sm:px-3">
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

      {/* 当前阶段 action — 与上方阶段栏共享白底 */}
      <div className="flex-shrink-0 px-2 sm:px-3 pt-2 pb-2.5 bg-white border-b border-line flex items-center gap-2">
        <span className="text-[11px] text-ink-muted truncate">
          {!activeStage.active ? '该阶段即将上线' :
           activeInflight && activeBundle ? '已有交付物 · 正在重新生成…' :
           activeBundle ? '已生成交付物' :
           activeInflight ? '正在生成中…' :
           '尚未生成'}
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {activeStage.active && activeStage.kind && BRIEF_KINDS.includes(activeStage.kind) && !activeInflight && (
            <button
              onClick={openBriefForActive}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
              title="查看 / 编辑项目 Brief"
            >
              <ClipboardList size={11} /> Brief
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
              {activeStage.kind && BRIEF_KINDS.includes(activeStage.kind) && (
                <button
                  onClick={startChatFallback}
                  className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
                  title="走旧版逐题问答流程"
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
                {activeStage.kind && BRIEF_KINDS.includes(activeStage.kind) ? '填写 Brief 并生成' : '开始生成'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* v2 validity banner —— 仅 agentic 产物且 validity != valid 时显示 */}
      {activeBundle?.agentic_version === 'v2' && activeBundle.validity_status && activeBundle.validity_status !== 'valid' && (
        <V2ValidityBanner bundle={activeBundle} onReGenerate={startGeneration} />
      )}

      {/* 主区：对话独占 */}
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
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function V2ValidityBanner({ bundle, onReGenerate }: { bundle: CuratedBundle; onReGenerate: () => void }) {
  const isInvalid = bundle.validity_status === 'invalid'
  const askPrompts = bundle.ask_user_prompts || []
  const moduleStates = bundle.module_states || {}
  const insufficient = Object.values(moduleStates).filter(m =>
    m && (m.status === 'blocked' || m.status === 'insufficient')
  )
  const bg = isInvalid ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  const text = isInvalid ? 'text-red-700' : 'text-amber-700'
  const label = isInvalid ? '信息不足 · invalid' : '部分通过 · partial'

  return (
    <div className={`flex-shrink-0 px-3 sm:px-4 py-2.5 border-b ${bg}`}>
      <div className="flex items-start gap-2">
        <ShieldAlert size={14} className={`${text} mt-0.5 shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold ${text}`}>
            {label}{isInvalid && ' — 本份产物缺少关键信息,建议补充后重新生成'}
          </div>
          {insufficient.length > 0 && (
            <div className="mt-1 text-[11px] text-ink-secondary">
              <span className="font-medium">未完成关键模块:</span>{' '}
              {insufficient.map(m => m!.title).join(', ')}
            </div>
          )}
          {askPrompts.length > 0 && (
            <details className="mt-1.5">
              <summary className={`text-[11px] cursor-pointer ${text} font-medium`}>
                需要补充的信息({askPrompts.length} 项)
              </summary>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-secondary list-disc list-inside">
                {askPrompts.slice(0, 8).map((p, i) => <li key={i}>{p.question}</li>)}
              </ul>
            </details>
          )}
        </div>
        <button
          onClick={onReGenerate}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border ${
            isInvalid ? 'border-red-300 text-red-700 bg-white hover:bg-red-100'
                      : 'border-amber-300 text-amber-700 bg-white hover:bg-amber-100'
          }`}
        >
          <Sparkles size={10} /> 补充信息后重新生成
        </button>
      </div>
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
