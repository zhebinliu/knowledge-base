import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDocuments, uploadDocument, deleteDocument, updateDocumentMeta,
  getDocumentMarkdown, getDocumentChunks,
  getProjectMeta, listProjects,
  type Chunk, type Project,
} from '../api/client'
import {
  Upload, Trash2, Clock, CheckCircle, AlertCircle, Loader,
  FileText, Eye, Layers, X, Folder, FileType, Filter,
  ChevronLeft, ChevronRight, Pencil, ChevronDown, ChevronUp,
} from 'lucide-react'
import { ltcLabel, tagLabel } from '../utils/labels'

// ── Upload queue panel ──────────────────────────────────────────────────────
type UploadJobStatus = 'queued' | 'uploading' | 'done' | 'failed'
interface UploadJob { id: string; name: string; status: UploadJobStatus; error?: string }

function UploadQueuePanel({ jobs, onDismiss }: { jobs: UploadJob[]; onDismiss: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const done    = jobs.filter(j => j.status === 'done').length
  const failed  = jobs.filter(j => j.status === 'failed').length
  const active  = jobs.filter(j => j.status === 'uploading').length
  const queued  = jobs.filter(j => j.status === 'queued').length
  const allDone = done + failed === jobs.length

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {active > 0 && <Loader size={13} className="animate-spin text-orange-500"/>}
          {allDone && failed === 0 && <CheckCircle size={13} className="text-green-500"/>}
          {allDone && failed > 0 && <AlertCircle size={13} className="text-red-500"/>}
          <span>
            {allDone
              ? `完成 ${done}/${jobs.length}${failed > 0 ? `，失败 ${failed}` : ''}`
              : `上传中 ${done + failed}/${jobs.length}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(c => !c)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            {collapsed ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          {allDone && (
            <button onClick={onDismiss} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={13}/></button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
          {jobs.map(j => (
            <div key={j.id} className="flex items-center gap-2 px-4 py-2">
              {j.status === 'queued'    && <Clock size={12} className="text-gray-400 flex-shrink-0"/>}
              {j.status === 'uploading' && <Loader size={12} className="animate-spin text-orange-500 flex-shrink-0"/>}
              {j.status === 'done'      && <CheckCircle size={12} className="text-green-500 flex-shrink-0"/>}
              {j.status === 'failed'    && <AlertCircle size={12} className="text-red-500 flex-shrink-0"/>}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate">{j.name}</p>
                {j.status === 'failed' && j.error && (
                  <p className="text-[10px] text-red-500 truncate">{j.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!collapsed && (
        <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${failed > 0 && allDone ? 'bg-red-400' : 'bg-orange-400'}`}
              style={{ width: `${Math.round((done + failed) / jobs.length * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// ── Inline edit modal ─────────────────────────────────────────────────────────
function EditMetaModal({
  doc, projects, meta, onClose, onSaved,
}: {
  doc: { id: string; filename: string; project_id?: string | null; doc_type?: string | null }
  projects: Project[]
  meta?: { doc_types: { value: string; label: string }[] }
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState<string>(doc.project_id ?? '')
  const [docType,   setDocType]   = useState<string>(doc.doc_type   ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateDocumentMeta(doc.id, {
        project_id: projectId || null,
        doc_type:   docType   || null,
      })
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[360px] p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 text-sm">修改归属</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={15}/></button>
        </div>
        <p className="text-xs text-gray-500 mb-4 truncate">{doc.filename}</p>

        <label className="block text-xs font-medium text-gray-600 mb-1.5">项目</label>
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white mb-4 focus:outline-none"
        >
          <option value="">无项目</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label className="block text-xs font-medium text-gray-600 mb-1.5">文档类型</label>
        <select
          value={docType}
          onChange={e => setDocType(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white mb-5 focus:outline-none"
        >
          <option value="">无类型</option>
          {meta?.doc_types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="ds-btn text-sm">取消</button>
          <button onClick={save} disabled={saving} className="ds-btn ds-btn-primary text-sm">
            {saving ? <><Loader size={13} className="animate-spin mr-1"/>保存中…</> : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
import MarkdownView from '../components/MarkdownView'
import UploadOptionsModal from '../components/UploadOptionsModal'
import ProjectFormModal from '../components/ProjectFormModal'

const STATUS_BADGE: Record<string, JSX.Element> = {
  pending:    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700 whitespace-nowrap"><Clock size={11}/>等待处理</span>,
  converting: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 whitespace-nowrap"><Loader size={11} className="animate-spin"/>转换中</span>,
  slicing:    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 whitespace-nowrap"><Loader size={11} className="animate-spin"/>切片中</span>,
  completed:  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 whitespace-nowrap"><CheckCircle size={11}/>完成</span>,
  failed:     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 whitespace-nowrap"><AlertCircle size={11}/>失败</span>,
}

const REVIEW_BADGE: Record<string, string> = {
  pending:      'bg-gray-100 text-gray-600',
  approved:     'bg-green-50 text-green-700',
  rejected:     'bg-red-50 text-red-700',
  needs_review: 'bg-orange-50 text-orange-700',
}

type DrawerMode = 'markdown' | 'chunks'

function ChunkCard({ chunk }: { chunk: Chunk }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-mono text-gray-400">#{chunk.chunk_index}</span>
        {chunk.ltc_stage && (
          <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full">{ltcLabel(chunk.ltc_stage)}</span>
        )}
        {chunk.review_status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${REVIEW_BADGE[chunk.review_status] ?? 'bg-gray-100 text-gray-600'}`}>
            {chunk.review_status === 'needs_review' ? '待审核' :
             chunk.review_status === 'approved' ? '已通过' :
             chunk.review_status === 'rejected' ? '已拒绝' : '待处理'}
          </span>
        )}
        {chunk.char_count > 0 && (
          <span className="text-xs text-gray-400 ml-auto">{chunk.char_count} 字</span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs font-medium ml-1"
          style={{ color: 'var(--accent-deep)' }}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {expanded ? (
        <MarkdownView content={chunk.content} size="sm" />
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{chunk.content}</p>
      )}
      {chunk.tags && chunk.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {chunk.tags.slice(0, 5).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{tagLabel(tag)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Documents() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [drawerDocId, setDrawerDocId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('markdown')

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showUploadOpts, setShowUploadOpts] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [editingDoc, setEditingDoc] = useState<{ id: string; filename: string; project_id?: string | null; doc_type?: string | null } | null>(null)

  // Upload queue state
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([])
  const [showQueue, setShowQueue] = useState(false)

  const [filterProject, setFilterProject] = useState<string>(searchParams.get('project') ?? '')
  const [filterDocType, setFilterDocType] = useState<string>(searchParams.get('type') ?? '')
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(0)   // 0-indexed

  const docsParams = useMemo(() => ({
    project_id: filterProject || undefined,
    doc_type: filterDocType || undefined,
    limit: pageSize,
    offset: page * pageSize,
  }), [filterProject, filterDocType, pageSize, page])

  const { data: docsPage, isLoading } = useQuery({
    queryKey: ['documents', docsParams],
    queryFn: () => listDocuments(docsParams),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  })
  const docs  = docsPage?.items ?? []
  const total = docsPage?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const { data: markdownData, isLoading: mdLoading } = useQuery({
    queryKey: ['document-markdown', drawerDocId],
    queryFn: () => getDocumentMarkdown(drawerDocId!),
    enabled: !!drawerDocId && drawerMode === 'markdown',
  })

  const { data: chunksData, isLoading: chunksLoading } = useQuery({
    queryKey: ['document-chunks', drawerDocId],
    queryFn: () => getDocumentChunks(drawerDocId!),
    enabled: !!drawerDocId && drawerMode === 'chunks',
  })

  const del = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setDrawerDocId(null)
    },
  })

  useEffect(() => {
    const open = searchParams.get('open')
    if (open && open !== drawerDocId) {
      setDrawerDocId(open)
      setDrawerMode('markdown')
    }
  }, [searchParams, drawerDocId])

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setPendingFiles(Array.from(files))
    setShowUploadOpts(true)
  }

  const onConfirmUpload = useCallback((opts: { project_id: string | null; doc_type: string | null }) => {
    const jobs: UploadJob[] = pendingFiles.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      status: 'queued' as const,
    }))
    setUploadJobs(jobs)
    setShowQueue(true)
    setPendingFiles([])
    setShowUploadOpts(false)

    // Upload up to 3 at a time
    const CONCURRENCY = 3
    let idx = 0
    const runNext = async (jobId: string, file: File) => {
      setUploadJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'uploading' } : j))
      try {
        await uploadDocument(file, opts)
        setUploadJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'done' } : j))
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
        setUploadJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: msg } : j))
      } finally {
        qc.invalidateQueries({ queryKey: ['documents'] })
        // Pick next
        if (idx < pendingFiles.length) {
          const nextIdx = idx++
          runNext(jobs[nextIdx].id, pendingFiles[nextIdx])
        }
      }
    }

    // Kick off initial batch
    const batch = Math.min(CONCURRENCY, pendingFiles.length)
    idx = batch
    for (let b = 0; b < batch; b++) {
      runNext(jobs[b].id, pendingFiles[b])
    }
  }, [pendingFiles, qc])

  const openDrawer = (docId: string, mode: DrawerMode) => {
    setDrawerDocId(docId)
    setDrawerMode(mode)
  }

  const setFilter = (project: string, type: string) => {
    setFilterProject(project); setFilterDocType(type)
    setPage(0)
    const next = new URLSearchParams(searchParams)
    if (project) next.set('project', project); else next.delete('project')
    if (type) next.set('type', type); else next.delete('type')
    setSearchParams(next, { replace: true })
  }

  const handlePageSize = (size: number) => {
    setPageSize(size)
    setPage(0)
  }

  const drawerDoc = docs?.find(d => d.id === drawerDocId)

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">文档管理</h1>
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
              style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}
            >
              <Upload size={16}/> 上传文档
            </button>
            <input
              ref={inputRef} type="file" multiple
              accept=".pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.csv"
              className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Filter size={12} /> 筛选:
            </span>
            <select value={filterProject} onChange={(e) => setFilter(e.target.value, filterDocType)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
              <option value="">全部项目</option>
              <option value="none">未归属项目</option>
              {projects?.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select value={filterDocType} onChange={(e) => setFilter(filterProject, e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
              <option value="">全部类型</option>
              {meta?.doc_types.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
            {(filterProject || filterDocType) && (
              <button onClick={() => setFilter('', '')}
                className="text-xs text-gray-500 hover:text-orange-500 transition-colors">清除</button>
            )}
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-colors cursor-pointer ${
              dragging ? 'border-orange-400 bg-orange-50' : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            <FileText size={32} className="mx-auto text-gray-300 mb-2"/>
            <p className="text-sm text-gray-500">拖拽文件到此处，或点击上传（可选择项目和文档类型）</p>
            <p className="text-xs text-gray-400 mt-1">支持 PDF、Word、PowerPoint、Excel、TXT、Markdown</p>
          </div>


          {/* Document table — overflow-x-auto prevents column squeeze */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">文件名</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">项目</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">类型</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">上传者</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">创建时间</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading && !docsPage && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">加载中…</td></tr>
                  )}
                  {!isLoading && docs.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">暂无文档</td></tr>
                  )}
                  {docs.map(doc => (
                    <tr
                      key={doc.id}
                      className={`hover:bg-gray-50 transition-colors ${drawerDocId === doc.id ? 'bg-orange-50/30' : ''}`}
                    >
                      <td className="px-5 py-3 max-w-[200px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={14} className="text-gray-400 flex-shrink-0"/>
                          <span className="truncate font-medium text-gray-800" title={doc.filename}>{doc.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {doc.project_id && doc.project_name ? (
                          <Link to={`/projects/${doc.project_id}`}
                            className="inline-flex items-center gap-1 hover:underline font-medium"
                            style={{ color: 'var(--accent-deep)' }}>
                            <Folder size={11} /> {doc.project_name}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {doc.doc_type_label ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded whitespace-nowrap">
                            <FileType size={10} /> {doc.doc_type_label}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {STATUS_BADGE[doc.conversion_status] ?? doc.conversion_status}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {doc.uploader_name ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, #FF8D1A, #D96400)' }}>
                              {doc.uploader_name.slice(0, 1).toUpperCase()}
                            </span>
                            {doc.uploader_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openDrawer(doc.id, 'markdown')}
                            title="查看转换后 Markdown"
                            className="p-1.5 text-gray-400 hover:text-orange-500 rounded transition-colors"
                          >
                            <Eye size={15}/>
                          </button>
                          <button
                            onClick={() => openDrawer(doc.id, 'chunks')}
                            title="查看关联 Chunks"
                            className="p-1.5 text-gray-400 hover:text-purple-600 rounded transition-colors"
                          >
                            <Layers size={15}/>
                          </button>
                          <button
                            onClick={() => setEditingDoc({ id: doc.id, filename: doc.filename, project_id: doc.project_id, doc_type: doc.doc_type })}
                            title="修改项目/类型"
                            className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors"
                          >
                            <Pencil size={15}/>
                          </button>
                          <button
                            onClick={() => { if (confirm('确认删除？')) del.mutate(doc.id) }}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          >
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination bar ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span>每页显示</span>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => handlePageSize(n)}
                    className={`px-2.5 py-1 rounded border transition-colors ${
                      pageSize === n
                        ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >{n} 条</button>
                ))}
                <span className="ml-2 text-gray-400">共 {total} 条</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                {/* Page number pills */}
                {Array.from({ length: totalPages }, (_, i) => i)
                  .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1)
                  .reduce<(number | '…')[]>((acc, i, idx, arr) => {
                    if (idx > 0 && (i as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                    acc.push(i)
                    return acc
                  }, [])
                  .map((item, idx) =>
                    item === '…'
                      ? <span key={`ellipsis-${idx}`} className="px-1 text-gray-400">…</span>
                      : <button
                          key={item}
                          onClick={() => setPage(item as number)}
                          className={`min-w-[28px] h-7 rounded border text-xs transition-colors ${
                            page === item
                              ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold'
                              : 'border-gray-200 hover:border-gray-300 text-gray-600'
                          }`}
                        >{(item as number) + 1}</button>
                  )}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right drawer ───────────────────────────────────────────────── */}
      {drawerDocId && (
        <div className="w-[460px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setDrawerMode('markdown')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  drawerMode === 'markdown' ? 'text-white' : 'text-gray-600 hover:bg-gray-200'
                }`}
                style={drawerMode === 'markdown' ? { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' } : {}}
              ><Eye size={13}/> Markdown</button>
              <button
                onClick={() => setDrawerMode('chunks')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  drawerMode === 'chunks' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                }`}
              ><Layers size={13}/> Chunks</button>
            </div>
            <button onClick={() => {
              setDrawerDocId(null)
              const next = new URLSearchParams(searchParams)
              next.delete('open')
              setSearchParams(next, { replace: true })
            }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
              <X size={16}/>
            </button>
          </div>

          <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
            <p className="text-xs text-gray-500 truncate">{drawerDoc?.filename}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {drawerMode === 'markdown' && (
              <div className="p-5">
                {mdLoading && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
                    <Loader size={14} className="animate-spin"/> 加载中…
                  </div>
                )}
                {!mdLoading && !markdownData?.markdown_content && (
                  <p className="text-sm text-gray-400 py-8 text-center">
                    {drawerDoc?.conversion_status === 'completed' ? '暂无 Markdown 内容' : '文档尚未处理完成'}
                  </p>
                )}
                {markdownData?.markdown_content && (
                  <MarkdownView content={markdownData.markdown_content} />
                )}
              </div>
            )}

            {drawerMode === 'chunks' && (
              <div className="p-4 space-y-3">
                {chunksLoading && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
                    <Loader size={14} className="animate-spin"/> 加载中…
                  </div>
                )}
                {!chunksLoading && (!chunksData || chunksData.length === 0) && (
                  <p className="text-sm text-gray-400 py-8 text-center">暂无关联 Chunks</p>
                )}
                {chunksData?.map((chunk: Chunk) => (
                  <ChunkCard key={chunk.id} chunk={chunk} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <UploadOptionsModal
        open={showUploadOpts}
        files={pendingFiles}
        projects={projects ?? []}
        meta={meta}
        onClose={() => { setShowUploadOpts(false); setPendingFiles([]) }}
        onConfirm={onConfirmUpload}
        onCreateProject={() => { setShowUploadOpts(false); setShowCreateProject(true) }}
      />

      <ProjectFormModal
        open={showCreateProject}
        meta={meta}
        onClose={() => { setShowCreateProject(false); if (pendingFiles.length > 0) setShowUploadOpts(true) }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['projects'] })
          setShowCreateProject(false)
          if (pendingFiles.length > 0) setShowUploadOpts(true)
        }}
      />

      {editingDoc && (
        <EditMetaModal
          doc={editingDoc}
          projects={projects ?? []}
          meta={meta}
          onClose={() => setEditingDoc(null)}
          onSaved={() => setEditingDoc(null)}
        />
      )}

      {showQueue && uploadJobs.length > 0 && (
        <UploadQueuePanel
          jobs={uploadJobs}
          onDismiss={() => { setShowQueue(false); setUploadJobs([]) }}
        />
      )}
    </div>
  )
}
