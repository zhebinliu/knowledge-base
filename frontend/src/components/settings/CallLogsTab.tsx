import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, Search, Copy, Check, Inbox, Cpu, BarChart3 } from 'lucide-react'
import {
  listCallLogs, getLlmStats,
  type CallLogItem, type CallLogPage, type LlmStatsItem,
} from '../../api/client'

const TYPE_BADGE: Record<string, string> = {
  mcp:  'bg-purple-50 text-purple-700 ring-purple-200',
  rest: 'bg-blue-50 text-blue-700 ring-blue-200',
  llm:  'bg-orange-50 text-orange-700 ring-orange-200',
}
const TOKEN_BADGE: Record<string, string> = {
  mcp_key: 'bg-amber-50 text-amber-700 ring-amber-200',
  jwt:     'bg-emerald-50 text-emerald-700 ring-emerald-200',
  system:  'bg-slate-100 text-slate-600 ring-slate-200',
}


function fmtAbsolute(dt: string) {
  const d = new Date(dt)
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** 列表里用的紧凑时间:今天显示 HH:MM:SS,本年显示 MM-DD HH:MM:SS,跨年显示完整 */
function fmtCompact(dt: string) {
  const d = new Date(dt)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hms = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  if (d.toDateString() === now.toDateString()) return hms
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (d.getFullYear() === now.getFullYear()) return `${md} ${hms}`
  return `${d.getFullYear()}-${md} ${hms}`
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
  return fmtCompact(dt)
}


function statusMeta(code: number | null): { dot: string; text: string; label: string } {
  if (code == null) return { dot: 'bg-slate-300', text: 'text-slate-400', label: '—' }
  if (code >= 500)   return { dot: 'bg-red-500',     text: 'text-red-700',     label: String(code) }
  if (code >= 400)   return { dot: 'bg-amber-500',   text: 'text-amber-700',   label: String(code) }
  if (code >= 300)   return { dot: 'bg-blue-500',    text: 'text-blue-700',    label: String(code) }
  if (code >= 200)   return { dot: 'bg-emerald-500', text: 'text-emerald-700', label: String(code) }
  return { dot: 'bg-slate-400', text: 'text-slate-500', label: String(code) }
}


function fmtTokens(n: number | null): string {
  if (n == null) return '—'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function fmtMs(n: number | null): string {
  if (n == null) return '—'
  if (n < 1000) return `${n} ms`
  return `${(n / 1000).toFixed(1)} s`
}


export default function CallLogsTab() {
  const [data, setData] = useState<CallLogPage | null>(null)
  const [stats, setStats] = useState<LlmStatsItem[] | null>(null)
  const [page, setPage] = useState(1)
  const [callType, setCallType] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number, ct: string) => {
    setLoading(true)
    try {
      const [list, st] = await Promise.all([
        listCallLogs(p, 50, ct || undefined),
        // 只在用户看 LLM 视图或全部视图时拉统计
        (ct === '' || ct === 'llm') ? getLlmStats(24).then(r => r.models) : Promise.resolve(null),
      ])
      setData(list)
      setStats(st)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page, callType) }, [load, page, callType])

  const changeFilter = (ct: string) => { setCallType(ct); setPage(1) }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  // 关键字过滤(端点 / 用户名 / 调用方模块)— 客户端轻量过滤
  const filteredItems = (data?.items ?? []).filter(it => {
    if (!keyword.trim()) return true
    const k = keyword.trim().toLowerCase()
    return (it.endpoint || '').toLowerCase().includes(k)
        || (it.username || '').toLowerCase().includes(k)
        || (it.user_id || '').toLowerCase().includes(k)
        || (it.caller_module || '').toLowerCase().includes(k)
        || (it.model_name || '').toLowerCase().includes(k)
        || (it.task || '').toLowerCase().includes(k)
  })

  const isLlmView = callType === 'llm'

  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Activity size={14} className="text-orange-600" />
            调用日志
          </h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            REST / MCP / LLM 调用记录,最近 50 条 / 页
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="搜端点 / 用户 / 模块 / 模型"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="text-xs border border-line rounded pl-6 pr-2 py-1.5 w-[200px] focus:outline-none focus:border-orange-300"
            />
          </div>
          <select
            value={callType}
            onChange={e => changeFilter(e.target.value)}
            className="text-xs border border-line rounded px-2 py-1.5 focus:outline-none focus:border-orange-300 bg-white"
          >
            <option value="">全部类型</option>
            <option value="llm">LLM 大模型</option>
            <option value="mcp">MCP</option>
            <option value="rest">REST</option>
          </select>
          <button
            onClick={() => load(page, callType)}
            className="p-1.5 text-ink-muted hover:text-ink rounded border border-line hover:bg-slate-50"
            title="刷新"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* LLM 统计卡片 — 仅 LLM/全部 视图显示 */}
      {stats && stats.length > 0 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary mb-2">
            <BarChart3 size={12} className="text-orange-600" />
            过去 24 小时 LLM 调用统计
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-ink-secondary">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">模型</th>
                  <th className="px-2 py-1.5 text-right font-medium">调用次数</th>
                  <th className="px-2 py-1.5 text-right font-medium">输入 token</th>
                  <th className="px-2 py-1.5 text-right font-medium">输出 token</th>
                  <th className="px-2 py-1.5 text-right font-medium">平均耗时</th>
                  <th className="px-2 py-1.5 text-right font-medium">异常</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.map(s => (
                  <tr key={s.model_name} className="hover:bg-slate-50/40">
                    <td className="px-2 py-1.5 font-medium text-ink">
                      <span className="inline-flex items-center gap-1">
                        <Cpu size={11} className="text-orange-600" />
                        {s.model_name || '(unknown)'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.calls}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtTokens(s.input_tokens)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtTokens(s.output_tokens)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{fmtMs(s.avg_duration_ms)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${s.errors > 0 ? 'text-red-600' : 'text-ink-muted'}`}>
                      {s.errors > 0 ? s.errors : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-lg border border-line overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-ink-secondary">
              <tr>
                <Th className="w-[130px]">时间</Th>
                <Th className="w-[80px]">类型</Th>
                {isLlmView ? (
                  <>
                    <Th className="w-[140px]">模型</Th>
                    <Th className="w-[170px]">调用模块</Th>
                    <Th className="w-[130px]">任务</Th>
                    <Th className="w-[90px] text-right">输入 tok</Th>
                    <Th className="w-[90px] text-right">输出 tok</Th>
                    <Th className="w-[80px] text-right">耗时</Th>
                  </>
                ) : (
                  <>
                    <Th className="w-[120px]">用户</Th>
                    <Th className="w-[90px]">凭证</Th>
                    <Th>端点</Th>
                  </>
                )}
                <Th className="w-[80px]">状态</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} cols={isLlmView ? 9 : 6} />
              ))}

              {!loading && filteredItems.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-12 text-center">
                  <Inbox size={28} className="mx-auto mb-2 text-ink-muted/40" />
                  <div className="text-sm text-ink-muted">
                    {data?.items.length === 0 ? '暂无调用记录' : `没有匹配「${keyword}」的记录`}
                  </div>
                </td></tr>
              )}

              {!loading && filteredItems.map((r) => (
                isLlmView || r.call_type === 'llm'
                  ? <LlmRow key={r.id} r={r} compact={!isLlmView} />
                  : <Row key={r.id} r={r} />
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
      <td className="px-3 py-2 text-ink-muted whitespace-nowrap" title={fmtAbsolute(r.created_at)}>
        {fmtRelative(r.created_at)}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] uppercase tracking-wide ${
          TYPE_BADGE[r.call_type] || 'bg-slate-50 text-slate-600 ring-slate-200'
        }`}>
          {r.call_type}
        </span>
      </td>
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
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] ${
          TOKEN_BADGE[r.token_type] || 'bg-slate-50 text-slate-600 ring-slate-200'
        }`}>
          {r.token_type}
        </span>
      </td>
      <td className="px-3 py-2">
        <EndpointCell endpoint={r.endpoint} />
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span className={`tabular-nums font-medium ${status.text}`}>{status.label}</span>
        </span>
      </td>
    </tr>
  )
}


function LlmRow({ r, compact = false }: { r: CallLogItem; compact?: boolean }) {
  const status = statusMeta(r.status_code)
  // compact 模式:用在"全部类型"视图,跟 REST 行用同样的 3 列结构,降饱和。
  // 列映射:用户 ← caller_module(LLM 没真实用户),凭证 ← system,端点 ← model · task + 子行 tokens/耗时
  if (compact) {
    return (
      <tr className="hover:bg-slate-50/40 transition-colors">
        <td className="px-3 py-2 text-ink-muted whitespace-nowrap tabular-nums font-mono text-[11px]"
            title={`${fmtAbsolute(r.created_at)}\n${fmtRelative(r.created_at)}`}>
          {fmtCompact(r.created_at)}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] uppercase tracking-wide ${TYPE_BADGE.llm}`}>
            llm
          </span>
        </td>
        {/* 用户 → 调用方模块 */}
        <td className="px-3 py-2">
          <code className="text-[11px] font-mono text-ink-secondary" title={r.caller_module || ''}>
            {r.caller_module || '—'}
          </code>
        </td>
        {/* 凭证 → system */}
        <td className="px-3 py-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] ${TOKEN_BADGE.system}`}>
            system
          </span>
        </td>
        {/* 端点 → model · task,tokens/耗时放副行 */}
        <td className="px-3 py-2">
          <div className="flex items-baseline gap-2 text-[11px]">
            <code className="font-mono text-ink-secondary">
              {r.model_name || r.endpoint}
              {r.task && <span className="text-ink-muted"> · {r.task}</span>}
            </code>
            <span className="text-ink-muted tabular-nums text-[10px] ml-auto">
              {fmtTokens(r.input_tokens)} → {fmtTokens(r.output_tokens)} · {fmtMs(r.duration_ms)}
            </span>
          </div>
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1" title={r.error_message || ''}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className={`tabular-nums font-medium ${status.text}`}>{status.label}</span>
          </span>
        </td>
      </tr>
    )
  }
  return (
    <tr className="hover:bg-slate-50/40 transition-colors">
      <td className="px-3 py-2 text-ink-muted whitespace-nowrap" title={fmtAbsolute(r.created_at)}>
        {fmtRelative(r.created_at)}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] uppercase tracking-wide ${TYPE_BADGE.llm}`}>
          llm
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 text-ink">
          <Cpu size={11} className="text-orange-600" />
          <span className="font-medium">{r.model_name || '—'}</span>
        </span>
      </td>
      <td className="px-3 py-2">
        <code className="text-[10px] font-mono text-ink-secondary" title={r.caller_module || ''}>
          {r.caller_module || '—'}
        </code>
      </td>
      <td className="px-3 py-2">
        {r.task ? (
          <span className="text-orange-700 bg-orange-50 ring-1 ring-orange-200 px-1.5 py-0.5 rounded text-[10px]">
            {r.task}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmtTokens(r.input_tokens)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmtTokens(r.output_tokens)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{fmtMs(r.duration_ms)}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1" title={r.error_message || ''}>
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
        title="复制"
      >
        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      </button>
    </div>
  )
}


function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
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
