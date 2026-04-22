import { useEffect, useMemo, useState } from 'react'
import { X, Plus, FileUp } from 'lucide-react'
import {
  Project,
  ProjectMeta,
} from '../api/client'
import { industryLabel } from '../utils/labels'

export interface UploadOptionsModalProps {
  open: boolean
  files: File[]
  projects: Project[]
  meta: ProjectMeta | undefined
  onClose: () => void
  onConfirm: (opts: { project_id: string | null; doc_type: string | null }) => void
  onCreateProject: () => void
}

const SENTINEL_NEW = '__new__'

export default function UploadOptionsModal({
  open, files, projects, meta, onClose, onConfirm, onCreateProject,
}: UploadOptionsModalProps) {
  const [projectId, setProjectId] = useState<string>('')
  const [docType, setDocType] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setProjectId(''); setDocType('')
  }, [open])

  const docTypeOptions = useMemo(() => meta?.doc_types ?? [], [meta])
  const selectedProject = useMemo(() => projects.find(p => p.id === projectId) ?? null, [projects, projectId])

  if (!open) return null

  const handleProjectChange = (v: string) => {
    if (v === SENTINEL_NEW) {
      onCreateProject()
      return
    }
    setProjectId(v)
  }

  const submit = () => {
    onConfirm({
      project_id: projectId || null,
      doc_type: docType || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileUp size={16} /> 上传选项
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-gray-500">
            共 <span className="font-semibold text-gray-700">{files.length}</span> 个文件待上传
            <ul className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
              {files.slice(0, 4).map((f, i) => (
                <li key={i} className="truncate text-gray-600">· {f.name}</li>
              ))}
              {files.length > 4 && <li className="text-gray-400">... 还有 {files.length - 4} 个</li>}
            </ul>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">归属项目（可选）</label>
            <div className="flex gap-2">
              <select value={projectId} onChange={(e) => handleProjectChange(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— 不归属任何项目 —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.customer ? ` · ${p.customer}` : ''}
                  </option>
                ))}
                <option value={SENTINEL_NEW}>+ 新建项目...</option>
              </select>
              <button type="button" onClick={onCreateProject} title="新建项目"
                className="px-2 py-2 border border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-400">
                <Plus size={14} />
              </button>
            </div>
            {selectedProject?.industry && (
              <p className="text-[11px] text-gray-400 mt-1">
                行业：<span className="text-gray-600 font-medium">{industryLabel(selectedProject.industry)}</span>（将自动同步到上传文档）
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">文档类型（可选）</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— 不指定 —</option>
              {docTypeOptions.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">后续问答时不同类型可被赋予不同权重（暂未启用）。</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} type="button" className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={submit} type="button"
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            开始上传
          </button>
        </div>
      </div>
    </div>
  )
}
