import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDocuments, uploadDocument, deleteDocument } from '../api/client'
import { Upload, Trash2, Clock, CheckCircle, AlertCircle, Loader, FileText } from 'lucide-react'

const statusBadge: Record<string, JSX.Element> = {
  pending:    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700"><Clock size={11} />等待处理</span>,
  processing: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700"><Loader size={11} className="animate-spin" />处理中</span>,
  done:       <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700"><CheckCircle size={11} />完成</span>,
  failed:     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700"><AlertCircle size={11} />失败</span>,
}

export default function Documents() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const { data: docs, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: listDocuments,
    refetchInterval: 5_000,
  })

  const upload = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })

  const del = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(f => upload.mutate(f))
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">文档管理</h1>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload size={16} /> 上传文档
        </button>
        <input
          ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.md"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 mb-6 text-center transition-colors cursor-pointer ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
      >
        <FileText size={36} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">拖拽文件到此处，或点击上传</p>
        <p className="text-xs text-gray-400 mt-1">支持 PDF、Word、TXT、Markdown</p>
      </div>

      {/* Upload progress */}
      {upload.isPending && (
        <div className="mb-4 px-4 py-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> 正在上传并触发处理…
        </div>
      )}
      {upload.isError && (
        <div className="mb-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-700">
          上传失败：{String((upload.error as any)?.response?.data?.detail ?? upload.error)}
        </div>
      )}

      {/* Document table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-medium text-gray-600">文件名</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">格式</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">状态</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">创建时间</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">加载中…</td></tr>
            )}
            {docs?.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">暂无文档</td></tr>
            )}
            {docs?.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 max-w-xs truncate font-medium text-gray-800">{doc.filename}</td>
                <td className="px-5 py-3 text-gray-500 uppercase text-xs">{doc.original_format}</td>
                <td className="px-5 py-3">{statusBadge[doc.conversion_status] ?? doc.conversion_status}</td>
                <td className="px-5 py-3 text-gray-500">{new Date(doc.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => { if (confirm('确认删除？')) del.mutate(doc.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
