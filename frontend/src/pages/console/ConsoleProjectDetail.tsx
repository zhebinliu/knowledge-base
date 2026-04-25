import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, ClipboardList, Lightbulb, MessageSquare, Sparkles,
  CheckCircle2, Loader2, Lock, Download, ExternalLink,
  Save, X, Wand2, AlertCircle, Pencil, Building2, Calendar, Tag, Files, Search,
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

const BRIEF_KINDS: OutputKind[] = ['kickoff_pptx', 'insight']

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface StageDef {
  key: string
  label: string
  kind: OutputKind | null
  icon: typeof FileText
  active: boolean
}

const STAGES: StageDef[] = [
  { key: 'insight',    label: '项目洞察', kind: 'insight',      icon: Lightbulb,     active: true },
  { key: 'kickoff',    label: '启动会',   kind: 'kickoff_pptx', icon: FileText,      active: true },
  { key: 'survey',     label: '需求调研', kind: 'survey',       icon: ClipboardList, active: true },
  { key: 'design',     label: '方案设计', kind: null,           icon: FileText,      active: false },
  { key: 'implement',  label: '项目实施', kind: null,           icon: FileText,      active: false },
  { key: 'test',       label: '上线测试', kind: null,           icon: FileText,      active: false },
  { key: 'acceptance', label: '项目验收', kind: null,           icon: FileText,      active: false },
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
      {/* Hero 项目卡 */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-5 pb-4 bg-white border-b border-line">
        <button
          onClick={() => nav('/console/projects')}
          className="flex items-center gap-1 mb-3 px-2 py-0.5 -ml-2 rounded text-xs text-ink-muted hover:text-ink hover:bg-canvas"
        >
          <ArrowLeft size={12} /> 返回项目列表
        </button>
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: BRAND_GRAD }}>
            <Building2 size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-ink leading-tight truncate">{project.name}</h1>
            <div className="mt-1.5 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
              <span className="inline-flex items-center gap-1"><Building2 size={11} className="text-ink-muted" />{project.customer || '未填客户'}</span>
              {project.industry && (
                <span className="inline-flex items-center gap-1"><Tag size={11} className="text-ink-muted" />{industryLabel(project.industry)}</span>
              )}
              <span className="inline-flex items-center gap-1"><Calendar size={11} className="text-ink-muted" />{project.kickoff_date ? `立项 ${project.kickoff_date}` : '未填立项日'}</span>
              <span className="inline-flex items-center gap-1"><Files size={11} className="text-ink-muted" />{project.document_count} 份文档</span>
            </div>
          </div>
          <button
            onClick={() => setEditing(v => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              editing ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-line text-ink-secondary hover:bg-canvas'
            }`}
          >
            <Pencil size={11} /> 项目信息
          </button>
        </div>
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

      {/* 阶段进度条 */}
      <div className="flex-shrink-0 bg-white border-b border-line px-4 sm:px-6 py-5">
        <div className="flex items-start overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const status = stageStatus(s)
            const isActive = activeStageKey === s.key
            return (
              <div key={s.key} className="flex items-start min-w-[88px] flex-1">
                <div className="flex flex-col items-center flex-1">
                  <button
                    onClick={() => s.active && setActiveStageKey(s.key)}
                    disabled={!s.active}
                    className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      status === 'done' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200' :
                      status === 'inflight' ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' :
                      status === 'locked' ? 'bg-gray-100 text-ink-muted border border-dashed border-gray-300' :
                      isActive ? 'text-white shadow-md ring-4 ring-orange-100' :
                      'bg-white text-ink border border-line hover:border-orange-300'
                    } ${!s.active ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    style={isActive && status === 'idle' ? { background: BRAND_GRAD } : undefined}
                  >
                    {status === 'done' ? <CheckCircle2 size={16} /> :
                     status === 'inflight' ? <Loader2 size={14} className="animate-spin" /> :
                     status === 'locked' ? <Lock size={11} /> :
                     <span>{i + 1}</span>}
                  </button>
                  <button
                    onClick={() => s.active && setActiveStageKey(s.key)}
                    disabled={!s.active}
                    className={`mt-2 text-[11px] leading-tight text-center px-1 ${
                      isActive ? 'text-ink font-semibold' :
                      status === 'locked' ? 'text-ink-muted' :
                      'text-ink-secondary'
                    } ${!s.active ? 'cursor-not-allowed' : 'cursor-pointer hover:text-ink'}`}
                  >
                    {s.label}
                  </button>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`h-px flex-1 mt-[18px] ${
                    status === 'done' ? 'bg-emerald-300' : 'bg-line'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        {/* 当前阶段动作条 */}
        <div className="mt-5 rounded-xl border border-line bg-canvas/50 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              activeStage.active ? 'text-white' : 'bg-gray-100 text-ink-muted'
            }`} style={activeStage.active ? { background: BRAND_GRAD } : undefined}>
              <activeStage.icon size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{activeStage.label}</p>
              <p className="text-[11px] text-ink-muted truncate">
                {!activeStage.active ? '该阶段即将上线' :
                 activeBundle ? '已生成交付物' :
                 activeInflight ? '正在生成…' :
                 '尚未生成，可开始对话生成'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {activeStage.kind && BRIEF_KINDS.includes(activeStage.kind) && (
              <button
                onClick={openBriefForActive}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-white"
                title="查看 / 编辑项目 Brief"
              >
                <ClipboardList size={11} /> 项目 Brief
              </button>
            )}
            {activeBundle ? (
              <>
                <BundlePreviewBtn b={activeBundle} />
                <BundleDownloadBtn b={activeBundle} />
                <button
                  onClick={startGeneration}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-white"
                >
                  <Sparkles size={11} /> 重新生成
                </button>
              </>
            ) : activeInflight ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                <Loader2 size={11} className="animate-spin" /> 后台任务进行中
              </span>
            ) : activeStage.active ? (
              <button
                onClick={startGeneration}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm"
                style={{ background: BRAND_GRAD }}
              >
                <Sparkles size={11} />
                {activeStage.kind && BRIEF_KINDS.includes(activeStage.kind) ? '填写 Brief 并生成' : '开始对话生成'}
              </button>
            ) : (
              <span className="text-xs text-ink-muted">敬请期待</span>
            )}
          </div>
        </div>
      </div>

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
  const previewable = b.has_content || (b.kind === 'kickoff_pptx' && b.has_file)
  if (!previewable) return null
  const onClick = () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
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
