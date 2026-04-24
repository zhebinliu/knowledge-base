import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { listCallLogs, type CallLogItem, type CallLogPage } from '../../api/client'

const TYPE_BADGE: Record<string, string> = {
  mcp: 'bg-purple-100 text-purple-700',
  rest: 'bg-blue-100 text-blue-700',
}
const TOKEN_BADGE: Record<string, string> = {
  mcp_key: 'bg-amber-100 text-amber-700',
  jwt: 'bg-green-100 text-green-700',
}

function fmt(dt: string) {
  const d = new Date(dt)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function CallLogsTab() {
  const [data, setData] = useState<CallLogPage | null>(null)
  const [page, setPage] = useState(1)
  const [callType, setCallType] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number, ct: string) => {
    setLoading(true)
    try {
      setData(await listCallLogs(p, 50, ct || undefined))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, callType) }, [load, page, callType])

  const changeFilter = (ct: string) => { setCallType(ct); setPage(1) }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">调用日志</h2>
          <p className="text-xs text-gray-500 mt-0.5">API 与 MCP 外部调用记录（最近 50 条/页）</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={callType}
            onChange={e => changeFilter(e.target.value)}
            className="text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">全部类型</option>
            <option value="mcp">MCP</option>
            <option value="rest">REST</option>
          </select>
          <button onClick={() => load(page, callType)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded border">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-left">用户</th>
              <th className="px-3 py-2 text-left">凭证类型</th>
              <th className="px-3 py-2 text-left">调用类型</th>
              <th className="px-3 py-2 text-left">端点</th>
              <th className="px-3 py-2 text-left">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">加载中…</td></tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">暂无调用记录</td></tr>
            )}
            {!loading && data?.items.map((r: CallLogItem) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-3 py-2 text-gray-700">{r.username ?? r.user_id ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TOKEN_BADGE[r.token_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.token_type}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[r.call_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.call_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 font-mono">{r.endpoint}</td>
                <td className="px-3 py-2 text-gray-500">{r.status_code ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>共 {data.total} 条记录</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">上一页</button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">下一页</button>
          </div>
        </div>
      )}
    </div>
  )
}
