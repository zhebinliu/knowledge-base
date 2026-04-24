import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Calendar, FileText, Pencil, FileType,
} from 'lucide-react'
import {
  getProject,
  getProjectMeta,
  listProjectDocuments,
} from '../api/client'
import ProjectFormModal from '../components/ProjectFormModal'
import { formatTime } from '../utils/datetime'

const STATUS_LABEL: Record<string, string> = {
  pending: '等待处理',
  converting: '转换中',
  slicing: '切片中',
  completed: '完成',
  failed: '失败',
}

const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-yellow-50 text-yellow-700',
  converting: 'bg-orange-50 text-orange-700',
  slicing:    'bg-purple-50 text-purple-700',
  completed:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id], queryFn: () => getProject(id!), enabled: !!id,
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['project-docs', id], queryFn: () => listProjectDocuments(id!), enabled: !!id,
  })

  if (isLoading || !project) {
    return <div className="p-4 md:p-8 text-sm text-gray-400">加载中...</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Link to="/projects"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600 mb-4 transition-colors">
        <ArrowLeft size={14} /> 返回项目库
      </Link>

      {/* 项目信息卡 */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-3 text-sm text-gray-600">
              {project.customer && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={13} className="text-gray-400" /> {project.customer}
                </span>
              )}
              {project.kickoff_date && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={13} className="text-gray-400" /> 立项 {project.kickoff_date}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <FileText size={13} className="text-gray-400" /> {project.document_count} 份文档
              </span>
            </div>
            {project.modules && project.modules.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {project.modules.map((m) => (
                  <span key={m} className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded">{m}</span>
                ))}
              </div>
            )}
            {project.description && (
              <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{project.description}</p>
            )}
          </div>
          <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
            <Pencil size={13} /> 编辑
          </button>
        </div>
      </div>

      {/* 文档列表 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">项目文档</h2>
          <Link to="/documents"
            className="text-xs font-medium hover:underline transition-colors"
            style={{ color: 'var(--accent-deep)' }}>前往上传 →</Link>
        </div>
        {docsLoading && <p className="px-5 py-6 text-sm text-gray-400">加载中...</p>}
        {!docsLoading && docs?.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-400">暂无文档</p>
        )}
        {docs && docs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-2.5 font-medium text-gray-600">文件名</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">类型</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">状态</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">上传者</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">上传时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 max-w-[280px]">
                      <Link to={`/documents?open=${d.id}`}
                        className="flex items-center gap-2 min-w-0 text-gray-800 hover:text-orange-600 transition-colors">
                        <FileText size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{d.filename}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {d.doc_type_label ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                          <FileType size={10} /> {d.doc_type_label}
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[d.conversion_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[d.conversion_status] ?? d.conversion_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{d.uploader_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {formatTime(d.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectFormModal
        open={editing}
        meta={meta}
        initial={project}
        onClose={() => setEditing(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['project', id] })
          qc.invalidateQueries({ queryKey: ['projects'] })
        }}
      />
    </div>
  )
}
