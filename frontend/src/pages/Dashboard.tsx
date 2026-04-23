import { useQuery } from '@tanstack/react-query'
import { getStats, listDocuments, listReviewQueue, listProjects, listChallengeRuns, listUnanswered, resolveUnanswered } from '../api/client'
import { Link } from 'react-router-dom'
import {
  FileText, Layers, Clock, CheckCircle, AlertCircle,
  Loader, ClipboardCheck, ArrowRight, Folder, Brain, HelpCircle, Check,
} from 'lucide-react'

const STATUS_ICON: Record<string, JSX.Element> = {
  pending:    <Clock size={14} className="text-yellow-500"/>,
  converting: <Loader size={14} className="text-blue-500 animate-spin"/>,
  slicing:    <Loader size={14} className="text-purple-500 animate-spin"/>,
  retrying:   <Loader size={14} className="text-orange-500 animate-spin"/>,
  completed:  <CheckCircle size={14} className="text-green-500"/>,
  failed:     <AlertCircle size={14} className="text-red-500"/>,
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待处理', converting: '转换中', slicing: '切片中', retrying: '重试中', completed: '完成', failed: '失败',
}

// 处理进度卡片按此顺序展示，对齐文档生命周期
const STATUS_ORDER = ['completed', 'converting', 'slicing', 'pending', 'retrying', 'failed'] as const

const STATUS_BAR_COLOR: Record<string, string> = {
  completed:  'bg-green-500',
  converting: 'bg-blue-500',
  slicing:    'bg-purple-500',
  pending:    'bg-yellow-400',
  retrying:   'bg-orange-500',
  failed:     'bg-red-500',
}

export default function Dashboard() {
  const { data: stats }      = useQuery({ queryKey: ['stats'],     queryFn: getStats,                   refetchInterval: 10_000 })
  const { data: docsPage }   = useQuery({ queryKey: ['documents'], queryFn: () => listDocuments({ limit: 8 }) })
  const docs = docsPage?.items
  const { data: queue }      = useQuery({ queryKey: ['review-queue'], queryFn: listReviewQueue,         refetchInterval: 30_000 })
  const { data: projects }   = useQuery({ queryKey: ['projects'],  queryFn: listProjects })
  const { data: recentRuns } = useQuery({ queryKey: ['challenge-runs-recent'], queryFn: () => listChallengeRuns(3, 0), refetchInterval: 30_000 })
  const { data: unanswered, refetch: refetchUnanswered } = useQuery({
    queryKey: ['unanswered'],
    queryFn: () => listUnanswered(5, 0),
    refetchInterval: 30_000,
    retry: false,  // 未登录时 401 不重试
  })

  const cards = [
    { label: '文档总数', value: stats?.documents  ?? '—', icon: FileText, color: 'blue',   to: '/documents' },
    { label: '切片数',   value: stats?.chunks     ?? '—', icon: Layers,   color: 'purple', to: '/chunks' },
    { label: '项目数',   value: projects?.length  ?? '—', icon: Folder,   color: 'orange', to: '/projects' },
  ]

  // 处理进度分布：按状态聚合 + 进度条
  const statusMap = stats?.status_distribution ?? {}
  const statusTotal = Object.values(statusMap).reduce((a, b) => a + b, 0)
  const completedCount = statusMap.completed ?? 0
  const inFlightCount = statusTotal - completedCount
  const completedPct = statusTotal > 0 ? Math.round((completedCount / statusTotal) * 100) : 0
  const statusEntries = STATUS_ORDER
    .map(s => ({ status: s, count: statusMap[s] ?? 0 }))
    .filter(e => e.count > 0)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
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

      {/* Processing progress */}
      {statusTotal > 0 && (
        <div className="card mb-6">
          <div className="card-head">
            <h3 className="flex items-center gap-2">
              <Loader size={15} style={{ color: 'var(--accent)' }} className={inFlightCount > 0 ? 'animate-spin' : ''} />
              文档处理进度
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {completedCount} / {statusTotal} 完成（{completedPct}%）
            </span>
          </div>
          <div className="px-5 py-4">
            {/* 堆叠进度条 */}
            <div className="flex h-2 w-full overflow-hidden rounded bg-gray-100 mb-3">
              {statusEntries.map(({ status, count }) => (
                <div
                  key={status}
                  className={`h-full ${STATUS_BAR_COLOR[status] ?? 'bg-gray-300'}`}
                  style={{ width: `${(count / statusTotal) * 100}%` }}
                  title={`${STATUS_LABEL[status] ?? status}: ${count}`}
                />
              ))}
            </div>
            {/* 分状态计数 */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {statusEntries.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-1.5">
                  {STATUS_ICON[status]}
                  <span style={{ color: 'var(--text-secondary)' }}>{STATUS_LABEL[status] ?? status}</span>
                  <span className="font-mono font-semibold text-gray-800">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Unanswered queue */}
      {unanswered && unanswered.total > 0 && (
        <div className="card mb-6">
          <div className="card-head">
            <h3 className="flex items-center gap-2">
              <HelpCircle size={15} className="text-red-500"/> 未解决的问题
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {unanswered.total} 条等待补充知识
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {unanswered.items.map(q => (
              <div key={q.id} className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 line-clamp-2">{q.question}</p>
                  {q.answer_preview && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{q.answer_preview}</p>
                  )}
                  <span className="text-[11px] text-gray-400">
                    {new Date(q.created_at).toLocaleString('zh-CN', { hour12: false })}
                    {q.persona === 'pm' ? ' · PM 模式' : ''}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    try { await resolveUnanswered(q.id); refetchUnanswered() } catch {}
                  }}
                  className="text-xs px-2 py-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors flex-shrink-0"
                  title="标记为已解决"
                >
                  <Check size={12} className="inline"/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review alert */}
      {queue && queue.length > 0 && (
        <Link to="/review" className="info-bar orange mb-6">
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
          {!docsPage && (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</p>
          )}
          {docs?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>暂无文档，请先上传</p>
          )}
          {docs?.map(doc => (
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
              <div
                className="flex items-center gap-1.5 text-xs flex-shrink-0"
                style={{ color: doc.conversion_status === 'failed' ? '#dc2626' : 'var(--text-secondary)' }}
                title={doc.conversion_status === 'failed' && doc.conversion_error ? doc.conversion_error : undefined}
              >
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
