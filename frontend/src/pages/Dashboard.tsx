import { useQuery } from '@tanstack/react-query'
import { getStats, listDocuments } from '../api/client'
import { FileText, Layers, Zap, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react'

const statusIcon = {
  pending:    <Clock size={14} className="text-yellow-500" />,
  processing: <Loader size={14} className="text-blue-500 animate-spin" />,
  done:       <CheckCircle size={14} className="text-green-500" />,
  failed:     <AlertCircle size={14} className="text-red-500" />,
}

const statusLabel = {
  pending: '等待处理', processing: '处理中', done: '完成', failed: '失败',
}

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: 10_000 })
  const { data: docs }  = useQuery({ queryKey: ['documents'], queryFn: listDocuments })

  const cards = [
    { label: '文档总数', value: stats?.documents ?? '—', icon: FileText, color: 'text-blue-600 bg-blue-50' },
    { label: 'Chunk 数', value: stats?.chunks    ?? '—', icon: Layers,   color: 'text-purple-600 bg-purple-50' },
    { label: '向量数',   value: stats?.vectors   ?? '—', icon: Zap,       color: 'text-green-600 bg-green-50' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">总览</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-5 mb-10">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={22} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent documents */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">最近文档</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {!docs && (
            <p className="px-6 py-8 text-center text-gray-400">加载中…</p>
          )}
          {docs?.length === 0 && (
            <p className="px-6 py-8 text-center text-gray-400">暂无文档，请先上传</p>
          )}
          {docs?.slice(0, 8).map(doc => (
            <div key={doc.id} className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-800 truncate max-w-xs">{doc.filename}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {statusIcon[doc.conversion_status]}
                {statusLabel[doc.conversion_status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
