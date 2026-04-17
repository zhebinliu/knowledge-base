import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDocuments, uploadDocument, deleteDocument,
  getDocumentMarkdown, getDocumentChunks,
  getProjectMeta, listProjects,
  type Chunk,
} from '../api/client'
import {
  Upload, Trash2, Clock, CheckCircle, AlertCircle, Loader,
  FileText, Eye, Layers, X, Folder, FileType, Filter,
} from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import UploadOptionsModal from '../components/UploadOptionsModal'
import ProjectFormModal from '../components/ProjectFormModal'

const STATUS_BADGE: Record<string, JSX.Element> = {
  pending:    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700"><Clock size={11}/>等待处理</span>,
  converting: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700"><Loader size={11} className="animate-spin"/>转换中</span>,
  slicing:    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700"><Loader size={11} className="animate-spin"/>切片中</span>,
  completed:  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700"><CheckCircle size={11}/>完成</span>,
  failed:     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700"><AlertCircle size={11}/>失败</span>,
}

const REVIEW_BADGE: Record<string, string> = {
  pending:      'bg-gray-100 text-gray-600',
  approved:     'bg-green-50 text-green-700',
  rejected:     'bg-red-50 text-red-700',
  needs_review: 'bg-orange-50 text-orange-700',
}

type DrawerMode = 'markdown' | 'chunks'

export default function Documents() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [drawerDocId, setDrawerDocId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('markdown')

  // 上传缓冲区
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showUploadOpts, setShowUploadOpts] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)

  // 筛选
  const [filterProject, setFilterProject] = useState<string>(searchParams.get('project') ?? '')
  const [filterDocType, setFilterDocType] = useState<string>(searchParams.get('type') ?? '')

  const docsParams = useMemo(() => ({
    project_id: filterProject || undefined,
    doc_type: filterDocType || undefined,
  }), [filterProject, filterDocType])

  const { data: docs, isLoading } = useQuery({
    queryKey: ['documents', docsParams],
    queryFn: () => listDocuments(docsParams),
    refetchInterval: 5_000,
  })
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

  const upload = useMutation({
    mutationFn: ({ file, opts }: { file: File; opts: { project_id: string | null; doc_type: string | null } }) =>
      uploadDocument(file, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })

  const del = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setDrawerDocId(null)
    },
  })

  // 支持 /documents?open=<id> 直链
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

  const onConfirmUpload = (opts: { project_id: string | null; doc_type: string | null }) => {
    pendingFiles.forEach((f) => upload.mutate({ file: f, opts }))
    setPendingFiles([])
    setShowUploadOpts(false)
  }

  const openDrawer = (docId: string, mode: DrawerMode) => {
    setDrawerDocId(docId)
    setDrawerMode(mode)
  }

  const setFilter = (project: string, type: string) => {
    setFilterProject(project); setFilterDocType(type)
    const next = new URLSearchParams(searchParams)
    if (project) next.set('project', project); else next.delete('project')
    if (type) next.set('type', type); else next.delete('type')
    setSearchParams(next, { replace: true })
  }

  const drawerDoc = docs?.find(d => d.id === drawerDocId)

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className={`flex-1 p-8 transition-all ${drawerDocId ? 'max-w-3xl' : 'max-w-6xl'} mx-auto w-full`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">文档管理</h1>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
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
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white">
            <option value="">全部项目</option>
            <option value="none">未归属项目</option>
            {projects?.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <select value={filterDocType} onChange={(e) => setFilter(filterProject, e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white">
            <option value="">全部类型</option>
            {meta?.doc_types.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
          {(filterProject || filterDocType) && (
            <button onClick={() => setFilter('', '')} className="text-xs text-gray-500 hover:text-blue-600">清除</button>
          )}
        </div>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-colors cursor-pointer ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
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

        {upload.isPending && (
          <div className="mb-4 px-4 py-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
            <Loader size={14} className="animate-spin"/> 正在上传并触发处理…
          </div>
        )}
        {upload.isError && (
          <div className="mb-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-700">
            上传失败：{String((upload.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? upload.error)}
          </div>
        )}

        {/* Document table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-600">文件名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">项目</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">类型</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">上传者</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">加载中…</td></tr>
              )}
              {docs?.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">暂无文档</td></tr>
              )}
              {docs?.map(doc => (
                <tr
                  key={doc.id}
                  className={`hover:bg-gray-50 transition-colors ${drawerDocId === doc.id ? 'bg-blue-50/40' : ''}`}
                >
                  <td className="px-5 py-3 max-w-[200px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-gray-400 flex-shrink-0"/>
                      <span className="truncate font-medium text-gray-800">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {doc.project_id && doc.project_name ? (
                      <Link to={`/projects/${doc.project_id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                        <Folder size={11} /> {doc.project_name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {doc.doc_type_label ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                        <FileType size={10} /> {doc.doc_type_label}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {STATUS_BADGE[doc.conversion_status] ?? doc.conversion_status}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {doc.uploader_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold flex items-center justify-center">
                          {doc.uploader_name.slice(0, 1).toUpperCase()}
                        </span>
                        {doc.uploader_name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(doc.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openDrawer(doc.id, 'markdown')}
                        title="查看转换后 Markdown"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
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
      </div>

      {/* Right drawer */}
      {drawerDocId && (
        <div className="w-[480px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setDrawerMode('markdown')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  drawerMode === 'markdown' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                }`}
              ><Eye size={13}/> Markdown</button>
              <button
                onClick={() => setDrawerMode('chunks')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  drawerMode === 'chunks' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                }`}
              ><Layers size={13}/> Chunks</button>
            </div>
            <button onClick={() => { setDrawerDocId(null); const next = new URLSearchParams(searchParams); next.delete('open'); setSearchParams(next, { replace: true }) }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
              <X size={16}/>
            </button>
          </div>

          <div className="px-5 py-2.5 border-b border-gray-100 flex-shrink-0">
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
                  <div key={chunk.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-400">#{chunk.chunk_index}</span>
                      {chunk.ltc_stage && (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{chunk.ltc_stage}</span>
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
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{chunk.content}</p>
                    {chunk.tags && chunk.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {chunk.tags.slice(0, 5).map(tag => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
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
    </div>
  )
}
