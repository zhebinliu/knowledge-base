import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { Brain, Play, Loader, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react'

const ALL_STAGES = ['线索', '商机', '报价', '合同', '回款', '售后']

// Backend returns: { batch_id, results: [{question, ltc_stage, answer, score, decision, reasoning, source_chunk_ids}] }
interface ChallengeResult {
  question: string
  ltc_stage: string
  answer: string
  score?: number
  decision?: string   // "pass" | "fail"
  reasoning?: string
  source_chunk_ids?: string[]
}

interface ChallengeResponse {
  batch_id?: string
  results?: ChallengeResult[]
}

export default function Challenge() {
  const [stages, setStages]     = useState<string[]>(ALL_STAGES)
  const [perStage, setPerStage] = useState(3)
  const [results, setResults]   = useState<ChallengeResult[]>([])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const run = useMutation({
    mutationFn: () =>
      api.post<ChallengeResponse>('/challenge/run', {
        target_stages: stages,
        questions_per_stage: perStage,
      }).then(r => r.data),
    onSuccess: data => {
      const list = data.results ?? []
      setResults(list)
      setExpanded({})
    },
    onError: err => {
      console.error('Challenge error:', err)
    },
  })

  const toggle = (i: number) => setExpanded(e => ({ ...e, [i]: !e[i] }))

  const toggleStage = (s: string) =>
    setStages(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const passed = results.filter(r => r.decision === 'pass').length
  const total  = results.length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">知识挑战</h1>

      {/* Config card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">配置挑战</h2>

        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">选择 LTC 阶段</p>
          <div className="flex flex-wrap gap-2">
            {ALL_STAGES.map(s => (
              <button
                key={s}
                onClick={() => toggleStage(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  stages.includes(s)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">每阶段问题数：</label>
            <select
              value={perStage}
              onChange={e => setPerStage(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400">预计生成 {stages.length * perStage} 道题</p>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || stages.length === 0}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {run.isPending
              ? <><Loader size={15} className="animate-spin"/> 运行中…</>
              : <><Play size={15}/> 开始挑战</>}
          </button>
        </div>

        {run.isError && (
          <div className="mt-3 px-4 py-2 bg-red-50 text-red-700 text-sm rounded-lg">
            挑战失败：{String((run.error as any)?.response?.data?.detail ?? run.error)}
          </div>
        )}
      </div>

      {run.isPending && (
        <div className="text-center py-16 text-gray-400">
          <Brain size={48} className="mx-auto mb-4 animate-pulse text-blue-400"/>
          <p className="text-sm font-medium text-gray-600">AI 正在生成问题并评估答案…</p>
          <p className="text-xs text-gray-400 mt-1">大约需要 30–120 秒，请耐心等待</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !run.isPending && (
        <>
          <div className="flex items-center gap-4 mb-5">
            <h2 className="font-semibold text-gray-800">挑战结果</h2>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${passed === total ? 'text-green-600' : 'text-gray-700'}`}>
                {passed}/{total} 通过
              </span>
            </div>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${total ? (passed / total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-gray-500">{total ? Math.round((passed / total) * 100) : 0}%</span>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => {
              const isPassed = r.decision === 'pass'
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-xl overflow-hidden shadow-sm ${
                    isPassed ? 'border-gray-200' : 'border-red-200'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggle(i)}
                  >
                    {isPassed
                      ? <CheckCircle2 size={17} className="text-green-500 flex-shrink-0"/>
                      : <XCircle size={17} className="text-red-400 flex-shrink-0"/>
                    }
                    {r.ltc_stage && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 flex-shrink-0">
                        {r.ltc_stage}
                      </span>
                    )}
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">{r.question}</span>
                    {r.score !== undefined && (
                      <span className={`text-xs font-bold flex-shrink-0 ${r.score >= 0.7 ? 'text-green-600' : 'text-red-500'}`}>
                        {Math.round(r.score * 100)}分
                      </span>
                    )}
                    {expanded[i]
                      ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0"/>
                      : <ChevronDown size={15} className="text-gray-400 flex-shrink-0"/>
                    }
                  </div>
                  {expanded[i] && (
                    <div className="border-t border-gray-100">
                      <div className="px-5 py-4 space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">答案</p>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.answer}</p>
                        </div>
                        {r.reasoning && (
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">评分理由</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{r.reasoning}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
