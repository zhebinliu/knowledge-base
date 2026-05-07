import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, Search, Copy, Check, Inbox } from 'lucide-react'
import { listCallLogs, type CallLogItem, type CallLogPage } from '../../api/client'

const TYPE_BADGE: Record<string, string> = {
  mcp:  'bg-purple-50 text-purple-700 ring-purple-200',
  rest: 'bg-blue-50 text-blue-700 ring-blue-200',
}
const TOKEN_BADGE: Record<string, string> = {
  mcp_key: 'bg-amber-50 text-amber-700 ring-amber-200',
  jwt:     'bg-emerald-50 text-emerald-700 ring-emerald-200',
}


function fmtAbsolute(dt: string) {
  const d = new Date(dt)
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtRelative(dt: string) {
  const t = new Date(dt).getTime()
  const now = Date.now()
  const diff = now - t
  if (diff < 0) return '稍后'
  if (diff < 30 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`
  // 一周以上,显示月日
  const d = new Date(dt)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}


function statusMeta(code: number | null): { dot: string; text: string; label: string } {
  if (code == null) return { dot: 'bg-slate-300', text: 'text-slate-400', label: '—' }
  if (code >= 500)   return { dot: 'bg-red-500',     text: 'text-red-700',     label: String(code) }
  if (code >= 400)   return { dot: 'bg-amber-500',   text: 'text-amber-700',   label: String(code) }
  if (code >= 300)   return { dot: 'bg-blue-500',    text: 'text-blue-700',    label: String(code) }
  if (code >= 200)   return { dot: 'bg-emerald-500', text: 'text-emerald-700', label: String(code) }
  return { dot: 'bg-slate-400', text: 'text-slate-500', label: String(code) }
}


export default function CallLogsTab() {
  const [data, setData] = useState<CallLogPage | null>(null)
  const [page, setPage] = useState(1)
  const [callType, setCallType] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number, ct: string) => {
    setLoading(true)
    try {
      setData(await listCallLogs(p, 50, ct || undefined))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page, callType) }, [load, page, callType])

  const changeFilter = (ct: string) => { setCallType(ct); setPage(1) }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  // 关键字过滤(端点 / 用户名)— 客户端轻量过滤,不影响分页计数(只过滤当前页)
  const filteredItems = (data?.items ?? []).filter(it => {
    if (!keyword.trim()) return true
    const k = keyword.trim().toLowerCase()
    return (it.endpoint || '').toLowerCase().includes(k)
        || (it.username || '').toLowerCase().includes(k)
        || (it.user_id || '').toLowerCase().includes(k)
  })

  const stats = (data?.items ?? []).reduce(
    (acc, it) => {
      if (it.status_code == null) acc.unknown++
      else if (it.status_code >= 500) acc.s5xx++
      else if (it.status_code >= 400) acc.s4xx++
      else if (it.status_code >= 200) acc.s2xx++
      return acc
    },
    { s2xx: 0, s4xx: 0, s5xx: 0, unknown: 0 }
  )

  return (
    <div className="space-y-4">
      {/* 顶栏:标题 + 统计 + 筛选 + 刷新 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Activity size={14} className="text-orange-600" />
            调用日志
          </h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            外部 API 与 MCP 调用记录,最近 50 条 / 页
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 关键字 */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="搜端点 / 用户"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="text-xs border border-line rounded pl-6 pr-2 py-1.5 w-[160px] focus:outline-none focus:border-orange-300"
            />
          </div>
          {/* 类型过滤 */}
          <select
            value={callType}
            onChange={e => changeFilter(e.target.value)}
            className="text-xs border border-line rounded px-2 py-1.5 focus:outline-none focus:border-orange-300 bg-white"
          >
            <option value="">全部类型</option>
            <option value="mcp">MCP</option>
            <option value="rest">REST</option>
          </select>
          {/* 刷新 */}
          <button
            onClick={() => load(page, callType)}
            className="p-1.5 text-ink-muted hover:text-ink rounded border border-line hover:bg-slate-50"
            title="刷新"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 状态码统计条(仅当前页) */}
      {data && data.items.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          <span>本页:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 成功 {stats.s2xx}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 客户端错误 {stats.s4xx}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 服务器错误 {stats.s5xx}
          </span>
          {stats.unknown > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> 无状态 {stats.unknown}
            </span>
          )}
        </div>
      )}

      {/* 表格卡片 */}
      <div className="rounded-lg border border-line overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-ink-secondary">
              <tr>
                <Th className="w-[140px]">时间</Th>
                <Th className="w-[120px]">用户</Th>
                <Th className="w-[90px]">凭证</Th>
                <Th className="w-[80px]">类型</Th>
                <Th>端点</Th>
                <Th className="w-[80px]">状态码</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}

              {!loading && filteredItems.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center">
                  <Inbox size={28} className="mx-auto mb-2 text-ink-muted/40" />
                  <div className="text-sm text-ink-muted">
                    {data?.items.length === 0 ? '暂无调用记录' : `没有匹配「${keyword}」的记录`}
                  </div>
                </td></tr>
              )}

              {!loading && filteredItems.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {data && (data.total > 0) && (
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <span>
            共 {data.total} 条
            {keyword.trim() && ` · 当前关键字过滤后 ${filteredItems.length} / ${data.items.length}`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <PageBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</PageBtn>
              <span className="px-2 tabular-nums text-ink-secondary">{page} / {totalPages}</span>
              <PageBtn disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>下一页</PageBtn>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left font-medium text-[11px] ${className || ''}`}>
      {children}
    </th>
  )
}


function Row({ r }: { r: CallLogItem }) {
  const status = statusMeta(r.status_code)
  return (
    <tr className="hover:bg-slate-50/40 transition-colors">
      {/* 时间 — 相对 + tooltip 绝对 */}
      <td className="px-3 py-2 text-ink-muted whitespace-nowrap" title={fmtAbsolute(r.created_at)}>
        {fmtRelative(r.created_at)}
      </td>
      {/* 用户 */}
      <td className="px-3 py-2">
        {r.username ? (
          <span className="text-ink">{r.username}</span>
        ) : r.user_id ? (
          <span className="text-ink-muted font-mono text-[10px]" title={r.user_id}>
            {r.user_id.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      {/* 凭证 */}
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] ${
          TOKEN_BADGE[r.token_type] || 'bg-slate-50 text-slate-600 ring-slate-200'
        }`}>
          {r.token_type}
        </span>
      </td>
      {/* 类型 */}
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] uppercase tracking-wide ${
          TYPE_BADGE[r.call_type] || 'bg-slate-50 text-slate-600 ring-slate-200'
        }`}>
          {r.call_type}
        </span>
      </td>
      {/* 端点 — mono + truncate + click 复制 */}
      <td className="px-3 py-2">
        <EndpointCell endpoint={r.endpoint} />
      </td>
      {/* 状态码 — 圆点 + 颜色 */}
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span className={`tabular-nums font-medium ${status.text}`}>{status.label}</span>
        </span>
      </td>
    </tr>
  )
}


function EndpointCell({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(endpoint).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="flex items-center gap-1.5 group">
      <code
        className="font-mono text-[11px] text-ink-secondary truncate max-w-[420px]"
        title={endpoint}
      >
        {endpoint}
      </code>
      <button
        onClick={copy}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-ink-muted hover:text-orange-600"
        title="复制端点"
      >
        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      </button>
    </div>
  )
}


function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-3 bg-slate-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}


function PageBtn({
  children, onClick, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 border border-line rounded disabled:opacity-40 hover:bg-slate-50 text-ink-secondary"
    >
      {children}
    </button>
  )
}
