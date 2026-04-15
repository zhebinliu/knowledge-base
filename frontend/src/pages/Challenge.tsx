import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { Brain, Play, Loader, ChevronDown, ChevronUp } from 'lucide-react'

const ALL_STAGES = ['线索', '商机', '报价', '合同', '回款', '售后']

interface ChallengeResult {
  stage: string
  question: string
  answer: string
  score?: number
  passed?: boolean
}

export default function Challenge() {
  const [stages, setStages]   = useState<string[]>(ALL_STAGES)
  const [perStage, setPerStage] = useState(3)
  const [results, setResults] = useState<ChallengeResult[]>([])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const run = useMutation({
    mutationFn: () =>
      api.post<{ results: ChallengeResult[] }>('/challenge/run', {
        target_stages: stages,
        questions_per_stage: perStage,
      }).then(r => r.data),
    onSuccess: data => setResults(data.results ?? []),
  })

  const toggle = (i: number) => setExpanded(e => ({ ...e, [i]: !e[i] }))

  const toggleStage = (s: string) =>
    setStages(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )

  const passed = results.filter(r => r.passed !== false).length
  const total  = results.length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">知识挑战</h1>

      {/* Config */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">配置挑战</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {ALL_STAGES.map(s => (
            <button
              key={s}
              onClick={() => toggleStage(s)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                stages.includes(s)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">每阶段问题数：</label>
          <select
            value={perStage}
            onChange={e => setPerStage(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || stages.length === 0}
            className="ml-auto flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {run.isPending
              ? <><Loader size={15} className="animate-spin" /> 运行中…</>
              : <><Play size={15} /> 开始挑战</>}
          </button>
        </div>
      </div>

      {run.isPending && (
        <div className="text-center py-12 text-gray-400">
          <Brain size={40} className="mx-auto mb-3 animate-pulse" />
          <p className="text-sm">AI 正在生成问题并评估答案，请稍候…</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !run.isPending && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <h2 className="font-semibold text-gray-800">挑战结果</h2>
            <span className="text-sm text-gray-500">通过 {passed}/{total}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${total ? (passed / total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className={`bg-white border rounded-xl overflow-hidden ${
                r.passed === false ? 'border-red-200' : 'border-gray-200'
              }`}>
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggle(i)}
                >
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{r.stage}</span>
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">{r.question}</span>
                  {r.score !== undefined && (
                    <span className={`text-xs font-bold ${r.score >= 0.7 ? 'text-green-600' : 'text-red-500'}`}>
                      {Math.round(r.score * 100)}分
                    </span>
                  )}
                  {expanded[i] ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </div>
                {expanded[i] && (
                  <div className="px-5 pb-4 border-t border-gray-100 pt-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {r.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
