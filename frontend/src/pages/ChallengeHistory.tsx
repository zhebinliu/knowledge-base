import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Loader, CheckCircle2, XCircle, Clock, User as UserIcon, CalendarClock, ChevronRight, X } from 'lucide-react'
import { listChallengeRuns, getChallengeRun, type ChallengeRun } from '../api/client'
import MarkdownView from '../components/MarkdownView'

const STATUS_BADGE: Record<string, { color: string; label: string; Icon: typeof CheckCircle2 }> = {
  running:   { color: 'bg-blue-50 text-blue-700 border-blue-200',     label: '执行中',  Icon: Loader },
  completed: { color: 'bg-green-50 text-green-700 border-green-200',  label: '已完成',  Icon: CheckCircle2 },
  failed:    { color: 'bg-red-50 text-red-700 border-red-200',        label: '失败',    Icon: XCircle },
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m${s ? ` ${s}s` : ''}`
}

function formatTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function ChallengeHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['challenge-runs'],
    queryFn: () => listChallengeRuns(50, 0),
    refetchInterval: 5_000,  // 执行中场景秒级刷新
  })

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <History size={22} className="text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">挑战历史</h1>
        {data && (
          <span className="text-sm text-gray-500">共 {data.total} 次</span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">开始时间</th>
              <th className="px-4 py-3 text-left">触发方式</th>
              <th className="px-4 py-3 text-left">阶段</th>
              <th className="px-4 py-3 text-right">题数</th>
              <th className="px-4 py-3 text-right">通过率</th>
              <th className="px-4 py-3 text-right">耗时</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">加载中…</td></tr>
            )}
            {data && data.items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">还没有挑战记录，去触发一次吧</td></tr>
            )}
            {data?.items.map(run => {
              const badge = STATUS_BADGE[run.status] ?? STATUS_BADGE.running
              const isManual = run.trigger_type === 'manual'
              return (
                <tr
                  key={run.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedId(run.id)}
                >
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-gray-400" />
                      {formatTime(run.started_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                      isManual ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    }`}>
                      {isManual ? <UserIcon size={11} /> : <CalendarClock size={11} />}
                      {isManual ? '手动' : '定时'}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {run.triggered_by_name || run.triggered_by || '匿名'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {run.target_stages?.slice(0, 4).map(s => (
                        <span key={s} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                      {run.target_stages && run.target_stages.length > 4 && (
                        <span className="text-xs text-gray-400">+{run.target_stages.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {run.total}
                    {run.total > 0 && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({run.passed}过/{run.failed}败)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-sm ${
                      run.pass_rate >= 0.8 ? 'text-green-600' :
                      run.pass_rate >= 0.5 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {run.total > 0 ? `${Math.round(run.pass_rate * 100)}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs font-mono">
                    {formatDuration(run.duration_seconds)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded ${badge.color}`}>
                      <badge.Icon size={11} className={run.status === 'running' ? 'animate-spin' : ''} />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-gray-300" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <RunDetailDrawer runId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function RunDetailDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-run', runId],
    queryFn: () => getChallengeRun(runId),
  })

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full bg-white shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-semibold text-gray-900">挑战详情</h2>
            <p className="text-xs text-gray-500 font-mono">{runId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
            <X size={16} />
          </button>
        </div>

        {isLoading && <p className="px-6 py-8 text-center text-gray-400 text-sm">加载中…</p>}

        {data && (
          <>
            <div className="px-6 py-4 grid grid-cols-2 gap-3 text-sm border-b border-gray-100 bg-gray-50">
              <Field label="触发方式" value={data.trigger_type === 'manual' ? '手动' : '定时'} />
              <Field label="触发者" value={data.triggered_by_name || data.triggered_by || '匿名'} />
              <Field label="开始时间" value={formatTime(data.started_at)} />
              <Field label="结束时间" value={formatTime(data.finished_at)} />
              <Field label="耗时" value={formatDuration(data.duration_seconds)} />
              <Field label="状态" value={data.status} />
              <Field label="题数" value={`${data.total}（通过 ${data.passed} / 失败 ${data.failed}）`} />
              <Field label="通过率" value={data.total > 0 ? `${Math.round(data.pass_rate * 100)}%` : '—'} />
              <Field label="阶段" value={(data.target_stages ?? []).join('、') || '—'} />
              <Field label="每阶段题数" value={String(data.questions_per_stage)} />
              {data.error_message && (
                <div className="col-span-2">
                  <p className="text-xs text-red-500 mb-0.5">错误信息</p>
                  <p className="text-sm text-red-700 bg-red-50 px-2 py-1 rounded">{data.error_message}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">问答 ({data.questions.length})</h3>
              {data.questions.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">本次挑战未生成已固化的问答</p>
              )}
              <div className="space-y-3">
                {data.questions.map((q, idx) => {
                  const passed = q.tags?.includes('q-pass')
                  return (
                    <div key={q.chunk_id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">#{idx + 1}</span>
                          {q.ltc_stage && (
                            <span className="bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                              {q.ltc_stage}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded ${
                            passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {passed ? '通过' : '未通过'}
                          </span>
                          {q.score != null && (
                            <span className="text-gray-500 font-mono">分数 {q.score.toFixed(2)}</span>
                          )}
                        </div>
                        <span className="text-gray-400">{formatTime(q.created_at)}</span>
                      </div>
                      <div className="px-4 py-3">
                        <MarkdownView content={q.content} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}
