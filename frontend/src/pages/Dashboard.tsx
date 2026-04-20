import { useQuery } from '@tanstack/react-query'
import { getStats, listDocuments, listReviewQueue, listProjects, listChallengeRuns } from '../api/client'
import { Link } from 'react-router-dom'
import {
  FileText, Layers, Zap, Clock, CheckCircle, AlertCircle,
  Loader, ClipboardCheck, ArrowRight, Folder, Brain,
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
  const { data: stats }      = useQuery({ queryKey: ['stats'],     queryFn: getStats,                   refetchInterval: 10_000 })
  const { data: docs }       = useQuery({ queryKey: ['documents'], queryFn: () => listDocuments() })
  const { data: queue }      = useQuery({ queryKey: ['review-queue'], queryFn: listReviewQueue,         refetchInterval: 30_000 })
  const { data: projects }   = useQuery({ queryKey: ['projects'],  queryFn: listProjects })
  const { data: recentRuns } = useQuery({ queryKey: ['challenge-runs-recent'], queryFn: () => listChallengeRuns(3, 0), refetchInterval: 30_000 })

  const cards = [
    { label: '文档总数', value: stats?.documents  ?? '—', icon: FileText, color: 'blue',   to: '/documents' },
    { label: 'Chunk 数', value: stats?.chunks     ?? '—', icon: Layers,   color: 'purple', to: '/chunks' },
    { label: '向量数',   value: stats?.vectors    ?? '—', icon: Zap,      color: 'green',  to: '/chunks' },
    { label: '项目数',   value: projects?.length  ?? '—', icon: Folder,   color: 'orange', to: '/projects' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="page-head">
        <h2>总览</h2>
        <p>实施知识综合管理平台</p>
      </div>

      {/* Stat cards */}
      <div className="stats">
        {cards.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="stat">
            <div className={`stat-icon ${color}`}>
              <Icon size={22} />
            </div>
            <div className="stat-body">
              <p className="stat-label">{label}</p>
              <p className="stat-value">{value}</p>
            </div>
            <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
          </Link>
        ))}
      </div>

      {/* Review alert */}
      {queue && queue.length > 0 && (
        <Link to="/review" className="info-bar orange mb-6 block">
          <ClipboardCheck size={16} className="flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">{queue.length} 条内容待审核</span>
            <span className="opacity-75 ml-2">点击前往审核队列</span>
          </div>
          <ArrowRight size={14} className="flex-shrink-0 opacity-60" />
        </Link>
      )}

      {/* Recent challenges */}
      {recentRuns && recentRuns.items.length > 0 && (
        <div className="card mb-6">
          <div className="card-head">
            <h3 className="flex items-center gap-2">
              <Brain size={15} style={{ color: 'var(--accent)' }} /> 最近挑战
            </h3>
            <Link to="/challenge" className="text-xs hover:underline flex items-center gap-1"
              style={{ color: 'var(--accent-deep)' }}>
              查看全部 <ArrowRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentRuns.items.map(run => (
              <div key={run.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                  <Clock size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="flex-shrink-0">{new Date(run.started_at).toLocaleString('zh-CN', { hour12: false })}</span>
                  <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {run.target_stages?.slice(0, 3).join(' / ')}
                    {(run.target_stages?.length ?? 0) > 3 ? '…' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-mono font-semibold ${
                    run.pass_rate >= 0.8 ? 'text-green-600' : run.pass_rate >= 0.5 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {run.total > 0 ? `${Math.round(run.pass_rate * 100)}%` : '—'}
                  </span>
                  <span className={`badge ${
                    run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'blue'
                  }`}>
                    {run.status === 'completed' ? '完成' : run.status === 'failed' ? '失败' : '执行中'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent documents */}
      <div className="card">
        <div className="card-head">
          <h3>最近文档</h3>
          <Link to="/documents" className="text-xs hover:underline flex items-center gap-1"
            style={{ color: 'var(--accent-deep)' }}>
            查看全部 <ArrowRight size={11} />
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {!docs && (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</p>
          )}
          {docs?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>暂无文档，请先上传</p>
          )}
          {docs?.slice(0, 8).map(doc => (
            <div key={doc.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={15} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
                <span className="text-sm text-gray-800 truncate max-w-xs">{doc.filename}</span>
                {doc.original_format && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono uppercase flex-shrink-0">
                    {doc.original_format}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
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
