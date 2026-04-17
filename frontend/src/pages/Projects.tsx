import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Folder, Calendar, Building2, FileText, Trash2 } from 'lucide-react'
import {
  Project,
  deleteProject,
  getProjectMeta,
  listProjects,
} from '../api/client'
import ProjectFormModal from '../components/ProjectFormModal'

export default function Projects() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })

  const del = useMutation({
    mutationFn: ({ id, cascade }: { id: string; cascade: boolean }) => deleteProject(id, cascade),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const onDelete = async (p: Project) => {
    if (!confirm(`确认删除项目 "${p.name}"？\n（项目下文档不会被删除，仅解除关联）`)) return
    try {
      await del.mutateAsync({ id: p.id, cascade: false })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e.response?.status === 409) {
        if (confirm(`${e.response?.data?.detail}\n\n仍要继续吗？`)) {
          await del.mutateAsync({ id: p.id, cascade: true })
        }
      } else {
        alert(e?.response?.data?.detail ?? '删除失败')
      }
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">项目库</h1>
          <p className="text-sm text-gray-500 mt-1">按项目组织实施过程中产出的所有文档</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> 新建项目
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400">加载中...</p>}
      {!isLoading && projects?.length === 0 && (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Folder size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">暂无项目，点击右上角"新建项目"开始</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow group">
            <div className="flex items-start justify-between gap-2 mb-2">
              <Link to={`/projects/${p.id}`} className="flex items-start gap-2 min-w-0 flex-1">
                <Folder size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">{p.name}</h3>
              </Link>
              <button onClick={() => onDelete(p)} title="删除项目"
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-gray-600">
              {p.customer && (
                <div className="flex items-center gap-1.5">
                  <Building2 size={12} className="text-gray-400" />
                  {p.customer}
                </div>
              )}
              {p.kickoff_date && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-gray-400" />
                  立项 {p.kickoff_date}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <FileText size={12} className="text-gray-400" />
                {p.document_count} 份文档
              </div>
            </div>
            {p.modules && p.modules.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {p.modules.slice(0, 4).map((m) => (
                  <span key={m} className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{m}</span>
                ))}
                {p.modules.length > 4 && <span className="text-[11px] text-gray-400">+{p.modules.length - 4}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <ProjectFormModal
        open={creating}
        meta={meta}
        onClose={() => setCreating(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['projects'] })}
      />
    </div>
  )
}
