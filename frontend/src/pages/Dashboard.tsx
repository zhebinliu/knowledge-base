import { useQuery } from '@tanstack/react-query'
import { getStats, listDocuments, listReviewQueue } from '../api/client'
import { Link } from 'react-router-dom'
import {
  FileText, Layers, Zap, Clock, CheckCircle, AlertCircle,
  Loader, ClipboardCheck, ArrowRight,
} from 'lucide-react'

const STATUS_ICON: Record<string, JSX.Element> = {
  pending:    <Clock size={14} className="text-yellow-500"/>,
  converting: <Loader size={14} className="text-blue-500 animate-spin"/>,
  slicing:    <Loader size={14} className="text-purple-500 animate-spin"/>,
  completed:  <CheckCircle size={14} className="text-green-500"/>,
  failed:     <AlertCircle size={14} className="text-red-500"/>,
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待处理', converting: '转换中', slicing: '切片中', completed: '完成', failed: '失败',
}

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ['stats'],     queryFn: getStats,         refetchInterval: 10_000 })
  const { data: docs }  = useQuery({ queryKey: ['documents'], queryFn: listDocuments })
  const { data: queue } = useQuery({ queryKey: ['review-queue'], queryFn: listReviewQueue, refetchInterval: 30_000 })

  const cards = [
    { label: '文档总数', value: stats?.documents ?? '—', icon: FileText, color: 'text-blue-600 bg-blue-50',   to: '/documents' },
    { label: 'Chunk 数', value: stats?.chunks    ?? '—', icon: Layers,   color: 'text-purple-600 bg-purple-50', to: '/chunks' },
    { label: '向量数',   value: stats?.vectors   ?? '—', icon: Zap,       color: 'text-green-600 bg-green-50',  to: '/chunks' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">总览</h1>
      <p className="text-sm text-gray-500 mb-8">实施知识综合管理平台</p>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        {cards.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4 hover:border-gray-300 hover:shadow-sm transition-all group">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={22}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors"/>
          </Link>
        ))}
      </div>

      {/* Review alert */}
      {queue && queue.length > 0 && (
        <Link
          to="/review"
          className="flex items-center gap-3 px-5 py-3.5 bg-orange-50 border border-orange-200 rounded-xl mb-6 hover:bg-orange-100 transition-colors"
        >
          <ClipboardCheck size={18} className="text-orange-500 flex-shrink-0"/>
          <div className="flex-1">
            <span className="text-sm font-semibold text-orange-800">
              {queue.length} 条内容待审核
            </span>
            <span className="text-sm text-orange-600 ml-2">点击前往审核队列</span>
          </div>
          <ArrowRight size={15} className="text-orange-400"/>
        </Link>
      )}

      {/* Recent documents */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">最近文档</h2>
          <Link to="/documents" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            查看全部 <ArrowRight size={11}/>
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {!docs && (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">加载中…</p>
          )}
          {docs?.length === 0 && (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">暂无文档，请先上传</p>
          )}
          {docs?.slice(0, 8).map(doc => (
            <div key={doc.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={15} className="text-gray-400 flex-shrink-0"/>
                <span className="text-sm text-gray-800 truncate max-w-xs">{doc.filename}</span>
                {doc.original_format && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono uppercase flex-shrink-0">
                    {doc.original_format}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                {STATUS_ICON[doc.conversion_status]}
                {STATUS_LABEL[doc.conversion_status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
