import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRoutingRules, updateRoutingRule, deleteRoutingRule,
  getTaskParams, updateTaskParams as updateTaskParamsApi,
  getModels,
  type RoutingRule, type TaskParamsEntry,
} from '../../api/client'
import { Save, Trash2, Loader } from 'lucide-react'

export default function RoutingTab() {
  const qc = useQueryClient()
  const { data: rules, isLoading: loadingRules } = useQuery({ queryKey: ['routing'], queryFn: getRoutingRules })
  const { data: params, isLoading: loadingParams } = useQuery({ queryKey: ['task-params'], queryFn: getTaskParams })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: getModels })

  const modelKeys = models?.map(m => m.key) ?? []

  return (
    <div className="space-y-6">
      {/* Routing Rules */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">路由规则</h2>
          <p className="text-xs text-gray-400 mt-0.5">为不同任务类型分配主模型和备选模型</p>
        </div>
        {loadingRules ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">任务</th>
                  <th className="px-4 py-3 font-medium">主模型</th>
                  <th className="px-4 py-3 font-medium">备选模型</th>
                  <th className="px-4 py-3 font-medium w-20">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules?.map(r => (
                  <RoutingRow key={r.task} rule={r} modelKeys={modelKeys} qc={qc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rules?.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">暂无路由规则</div>
        )}
      </div>

      {/* Task Params */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">任务参数</h2>
          <p className="text-xs text-gray-400 mt-0.5">为每种任务类型配置生成参数</p>
        </div>
        {loadingParams ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">任务</th>
                  <th className="px-4 py-3 font-medium">Max Tokens</th>
                  <th className="px-4 py-3 font-medium">Temperature</th>
                  <th className="px-4 py-3 font-medium">Timeout (s)</th>
                  <th className="px-4 py-3 font-medium w-20">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {params?.map(p => (
                  <TaskParamsRow key={p.task} entry={p} qc={qc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {params?.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">暂无任务参数</div>
        )}
      </div>
    </div>
  )
}

/* ── Routing row with inline edit ─────────────────────────────────────────── */

function RoutingRow({ rule, modelKeys, qc }: { rule: RoutingRule; modelKeys: string[]; qc: ReturnType<typeof useQueryClient> }) {
  const [primary, setPrimary] = useState(rule.primary)
  const [fallback, setFallback] = useState(rule.fallback)
  const dirty = primary !== rule.primary || fallback !== rule.fallback

  const mut = useMutation({
    mutationFn: () => updateRoutingRule(rule.task, { primary, fallback }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }),
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const delMut = useMutation({
    mutationFn: () => deleteRoutingRule(rule.task),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }),
    onError: (e: any) => alert(`删除失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-800">{rule.task}</td>
      <td className="px-4 py-3">
        <select
          value={primary}
          onChange={e => setPrimary(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        >
          {modelKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={fallback}
          onChange={e => setFallback(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        >
          {modelKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => mut.mutate()}
            disabled={!dirty || mut.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Save size={12} />
            {mut.isPending ? '...' : '保存'}
          </button>
          <button
            onClick={() => { if (window.confirm(`确认删除路由规则 "${rule.task}"?`)) delMut.mutate() }}
            disabled={delMut.isPending}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ── Task Params row with inline edit ─────────────────────────────────────── */

function TaskParamsRow({ entry, qc }: { entry: TaskParamsEntry; qc: ReturnType<typeof useQueryClient> }) {
  const [maxTokens, setMaxTokens] = useState(entry.max_tokens)
  const [temperature, setTemperature] = useState(entry.temperature)
  const [timeout, setTimeout_] = useState(entry.timeout)
  const dirty = maxTokens !== entry.max_tokens || temperature !== entry.temperature || timeout !== entry.timeout

  const mut = useMutation({
    mutationFn: () => updateTaskParamsApi(entry.task, { max_tokens: maxTokens, temperature, timeout }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-params'] }),
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-800">{entry.task}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={1} max={200000}
          value={maxTokens}
          onChange={e => setMaxTokens(Number(e.target.value))}
          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0} max={2} step={0.1}
          value={temperature}
          onChange={e => setTemperature(Number(e.target.value))}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={1} max={600}
          value={timeout}
          onChange={e => setTimeout_(Number(e.target.value))}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => mut.mutate()}
          disabled={!dirty || mut.isPending}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Save size={12} />
          {mut.isPending ? '...' : '保存'}
        </button>
      </td>
    </tr>
  )
}
