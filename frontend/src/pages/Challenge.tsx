import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, Play, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader, Square, HelpCircle, ThumbsUp, ThumbsDown, Plus, Clock, Trash2, Power } from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import {
  approveReview, rejectReview,
  listChallengeSchedules, createChallengeSchedule, deleteChallengeSchedule,
  toggleChallengeSchedule, type ChallengeSchedule,
} from '../api/client'

const PRESET_STAGES = ['线索', '客户', '商机', '报价', '订单', '合同', '交付', '回款', '售后', '通用']

interface QuestionCard {
  q_index: number
  question: string
  ltc_stage: string
  // Filled in Phase 2:
  answer?: string
  score?: number
  decision?: string
  reasoning?: string
  answering?: boolean   // true while waiting for Phase 2 result
  // KB persistence (set after Phase 2):
  chunk_id?: string | null
  review_status?: 'auto_approved' | 'needs_review' | 'approved' | 'rejected' | null
  review_id?: string | null
}

export default function Challenge() {
  const [stages, setStages]     = useState<string[]>(['线索', '客户', '商机'])
  const [customStages, setCustomStages] = useState<string[]>([])
  const [customInput, setCustomInput]   = useState('')
  const [perStage, setPerStage] = useState(2)
  const [cards, setCards]       = useState<QuestionCard[]>([])
  const [status, setStatus]     = useState('')
  const [phase, setPhase]       = useState<'idle' | 'generating' | 'answering' | 'done'>('idle')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const abortRef                = useRef<AbortController | null>(null)
  const qc = useQueryClient()

  const approveMut = useMutation({
    mutationFn: ({ reviewId }: { reviewId: string; qIndex: number }) => approveReview(reviewId),
    onSuccess: (_data, vars) => {
      setCards(prev => prev.map(c => c.q_index === vars.qIndex ? { ...c, review_status: 'approved' } : c))
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      qc.invalidateQueries({ queryKey: ['chunks'] })
    },
  })
  const rejectMut = useMutation({
    mutationFn: ({ reviewId }: { reviewId: string; qIndex: number }) => rejectReview(reviewId),
    onSuccess: (_data, vars) => {
      setCards(prev => prev.map(c => c.q_index === vars.qIndex ? { ...c, review_status: 'rejected' } : c))
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      qc.invalidateQueries({ queryKey: ['chunks'] })
    },
  })

  const toggle = (i: number) => setExpanded(e => ({ ...e, [i]: !e[i] }))
  const toggleStage = (s: string) =>
    setStages(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const runChallenge = async () => {
    if (phase !== 'idle' || stages.length === 0) return
    setCards([])
    setExpanded({})
    setStatus('正在连接…')
    setPhase('generating')
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch('/api/challenge/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_stages: stages, questions_per_stage: perStage }),
        signal: ctrl.signal,
      })
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            setCards(prev => {
              if (prev.length === 0) setStatus('所选阶段未生成任何题目，请尝试选择其他阶段或确认知识库中有对应内容')
              else setStatus('')
              return prev
            })
            setPhase('done')
            break
          }

          try {
            const ev = JSON.parse(data)

            if (ev.type === 'status') {
              setStatus(ev.message)
              // Detect phase transition from status messages
              if (ev.message.includes('作答和评判')) setPhase('answering')
            }

            if (ev.type === 'question') {
              // Phase 1: append new question card (no answer yet)
              setCards(prev => [...prev, {
                q_index:  ev.q_index,
                question: ev.question,
                ltc_stage: ev.ltc_stage,
                answering: false,
              }])
            }

            if (ev.type === 'result') {
              // Phase 2: fill in answer for matching card
              setCards(prev => prev.map(c =>
                c.q_index === ev.q_index
                  ? {
                      ...c,
                      answer: ev.answer,
                      score: ev.score,
                      decision: ev.decision,
                      reasoning: ev.reasoning,
                      answering: false,
                      chunk_id: ev.chunk_id ?? null,
                      review_status: ev.review_status ?? null,
                      review_id: ev.review_id ?? null,
                    }
                  : c
              ))
              // New chunks were added — refresh chunks list and review queue
              qc.invalidateQueries({ queryKey: ['chunks'] })
              qc.invalidateQueries({ queryKey: ['review-queue'] })
              // Mark next unanswered card as "answering"
              setCards(prev => {
                const nextUnanswered = prev.find(c => c.answer === undefined && !c.answering)
                if (!nextUnanswered) return prev
                return prev.map(c => c.q_index === nextUnanswered.q_index ? { ...c, answering: true } : c)
              })
            }

            if (ev.error) setStatus(`错误：${ev.error}`)
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setStatus(`连接错误：${String(err)}`)
      setPhase('idle')
    } finally {
      if (phase !== 'idle') setPhase('done')
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setPhase('idle')
    setStatus('')
  }

  const reset = () => {
    setCards([])
    setExpanded({})
    setStatus('')
    setPhase('idle')
  }

  const answered = cards.filter(c => c.answer !== undefined).length
  const passed   = cards.filter(c => c.decision === 'pass').length
  const total    = cards.length
  const running  = phase === 'generating' || phase === 'answering'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">知识挑战</h1>

      {/* Config */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">配置挑战</h2>
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">选择挑战阶段</p>
          <div className="flex flex-wrap gap-2">
            {[...PRESET_STAGES, ...customStages].map(s => (
              <button key={s} onClick={() => toggleStage(s)} disabled={running}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
                  stages.includes(s) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>{s}
                {customStages.includes(s) && !running && (
                  <span
                    className="ml-1 text-xs opacity-60 hover:opacity-100"
                    onClick={e => { e.stopPropagation(); setCustomStages(cs => cs.filter(c => c !== s)); setStages(st => st.filter(x => x !== s)) }}
                  >&times;</span>
                )}
              </button>
            ))}
            {/* Custom stage input */}
            <form
              className="inline-flex items-center"
              onSubmit={e => {
                e.preventDefault()
                const v = customInput.trim()
                if (v && !PRESET_STAGES.includes(v) && !customStages.includes(v)) {
                  setCustomStages(cs => [...cs, v])
                  setStages(st => [...st, v])
                  setCustomInput('')
                }
              }}
            >
              <input
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                disabled={running}
                placeholder="自定义..."
                className="w-24 px-2 py-1 border border-gray-200 rounded-l-full text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={running || !customInput.trim()}
                className="px-2 py-1 bg-gray-100 border border-l-0 border-gray-200 rounded-r-full text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                <Plus size={14}/>
              </button>
            </form>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">每阶段题数：</label>
          <select value={perStage} disabled={running} onChange={e => setPerStage(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
            {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="text-xs text-gray-400">预计 {stages.length * perStage} 道题</p>
          <div className="ml-auto flex gap-2">
            {phase === 'done' && (
              <button onClick={reset}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                重新开始
              </button>
            )}
            {running && (
              <button onClick={stop}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors">
                <Square size={13}/> 停止
              </button>
            )}
            <button onClick={runChallenge} disabled={running || stages.length === 0 || phase === 'done'}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
              {running ? <><Loader size={15} className="animate-spin"/>生成中…</> : <><Play size={15}/>开始挑战</>}
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      {(running || status) && (
        <div className="flex items-center gap-3 px-5 py-3 bg-blue-50 border border-blue-100 rounded-xl mb-5">
          {running && <Loader size={15} className="animate-spin text-blue-500 flex-shrink-0"/>}
          <div>
            {phase === 'generating' && (
              <p className="text-xs font-semibold text-blue-700 mb-0.5">第一阶段：出题中</p>
            )}
            {phase === 'answering' && (
              <p className="text-xs font-semibold text-blue-700 mb-0.5">
                第二阶段：作答中（{answered}/{total}）
              </p>
            )}
            <p className="text-sm text-blue-600">{status}</p>
          </div>
        </div>
      )}

      {/* Score summary (once answering has started) */}
      {answered > 0 && (
        <div className="flex items-center gap-3 mb-5">
          <span className={`text-sm font-bold flex-shrink-0 ${passed === answered && !running ? 'text-green-600' : 'text-gray-700'}`}>
            {passed}/{answered} 通过
          </span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${answered ? (passed / answered) * 100 : 0}%` }}/>
          </div>
          <span className="text-sm text-gray-500 flex-shrink-0">
            {answered ? Math.round((passed / answered) * 100) : 0}%
          </span>
        </div>
      )}

      {/* Question cards */}
      <div className="space-y-3">
        {cards.map((card) => {
          const hasResult  = card.answer !== undefined
          const isPassed   = card.decision === 'pass'
          const isAnswering = card.answering || (!hasResult && phase === 'answering')

          return (
            <div key={card.q_index}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${
                hasResult
                  ? isPassed ? 'border-gray-200' : 'border-red-200'
                  : 'border-blue-100'
              }`}
            >
              {/* Card header */}
              <div
                className={`flex items-center gap-3 px-5 py-4 ${hasResult ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                onClick={() => hasResult && toggle(card.q_index)}
              >
                {/* Status icon */}
                {hasResult
                  ? isPassed
                    ? <CheckCircle2 size={17} className="text-green-500 flex-shrink-0"/>
                    : <XCircle size={17} className="text-red-400 flex-shrink-0"/>
                  : isAnswering
                    ? <Loader size={17} className="text-blue-400 animate-spin flex-shrink-0"/>
                    : <HelpCircle size={17} className="text-gray-300 flex-shrink-0"/>
                }

                {/* Stage badge */}
                {card.ltc_stage && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 flex-shrink-0">
                    {card.ltc_stage}
                  </span>
                )}

                {/* Question text */}
                <span className="flex-1 text-sm font-medium text-gray-800 leading-relaxed break-words">
                  {card.question}
                </span>

                {/* Score */}
                {hasResult && card.score !== undefined && (
                  <span className={`text-lg font-extrabold flex-shrink-0 tabular-nums ${card.score >= 0.7 ? 'text-green-600' : 'text-red-500'}`}>
                    {Math.round(card.score * 100)}
                    <span className="text-xs font-semibold ml-0.5">分</span>
                  </span>
                )}

                {/* Answering label */}
                {!hasResult && isAnswering && (
                  <span className="text-xs text-blue-500 flex-shrink-0">作答中…</span>
                )}
                {!hasResult && !isAnswering && (
                  <span className="text-xs text-gray-400 flex-shrink-0">等待中</span>
                )}

                {hasResult && (
                  expanded[card.q_index]
                    ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0"/>
                    : <ChevronDown size={15} className="text-gray-400 flex-shrink-0"/>
                )}
              </div>

              {/* Expanded answer */}
              {hasResult && expanded[card.q_index] && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">答案</p>
                    {card.answer && <MarkdownView content={card.answer} />}
                  </div>
                  {card.reasoning && (
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">评分理由</p>
                      <MarkdownView content={card.reasoning} size="sm" toolbar={false} />
                    </div>
                  )}

                  {/* KB persistence status + review actions */}
                  {card.chunk_id && (
                    <div className="pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-500">知识库</span>
                      {card.review_status === 'auto_approved' && (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                          已入库
                        </span>
                      )}
                      {card.review_status === 'approved' && (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                          审核通过
                        </span>
                      )}
                      {card.review_status === 'rejected' && (
                        <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                          已拒绝
                        </span>
                      )}
                      {card.review_status === 'needs_review' && (
                        <>
                          <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full border border-orange-100">
                            待审核
                          </span>
                          {card.review_id && (
                            <div className="ml-auto flex gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); approveMut.mutate({ reviewId: card.review_id!, qIndex: card.q_index }) }}
                                disabled={approveMut.isPending}
                                className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <ThumbsUp size={12}/> 通过
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); rejectMut.mutate({ reviewId: card.review_id!, qIndex: card.q_index }) }}
                                disabled={rejectMut.isPending}
                                className="flex items-center gap-1 px-3 py-1 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                <ThumbsDown size={12}/> 拒绝
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Pulse skeleton while generating first question */}
        {phase === 'generating' && cards.length === 0 && (
          <div className="space-y-3">
            {[1, 2].map(n => (
              <div key={n} className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center gap-3 animate-pulse">
                <div className="w-4 h-4 rounded-full bg-gray-100 flex-shrink-0"/>
                <div className="h-3 bg-gray-100 rounded flex-1"/>
              </div>
            ))}
          </div>
        )}

        {/* Brain placeholder before start */}
        {phase === 'idle' && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Brain size={48} className="mb-3"/>
            <p className="text-sm text-gray-400">选择阶段后点击「开始挑战」</p>
          </div>
        )}
      </div>

      {/* ---- Schedule Panel (isolated error boundary) ---- */}
      <SchedulePanelSafe />
    </div>
  )
}


/* ======== Schedule Panel (self-contained sub-component) ======== */

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: '工作日 9:00',  value: '0 9 * * 1-5' },
  { label: '每天 9:00',    value: '0 9 * * *' },
  { label: '每天 18:00',   value: '0 18 * * *' },
  { label: '每周一 9:00',  value: '0 9 * * 1' },
  { label: '每小时',       value: '0 * * * *' },
]

function SchedulePanel() {
  const qc = useQueryClient()
  const { data: schedules } = useQuery({
    queryKey: ['challenge-schedules'],
    queryFn: listChallengeSchedules,
  })

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('默认计划')
  const [formStages, setFormStages] = useState('线索, 客户, 商机')
  const [formQps, setFormQps]       = useState(2)
  const [formCron, setFormCron]     = useState('0 9 * * 1-5')

  const createMut = useMutation({
    mutationFn: () => createChallengeSchedule({
      name: formName,
      stages: formStages.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      questions_per_stage: formQps,
      cron_expression: formCron,
      enabled: true,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenge-schedules'] }); setShowForm(false) },
  })

  const toggleMut = useMutation({
    mutationFn: (id: string) => toggleChallengeSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge-schedules'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChallengeSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge-schedules'] }),
  })

  return (
    <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Clock size={16}/> 计划任务
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus size={14}/> 新建计划
          </button>
        )}
      </div>

      {/* Existing schedules */}
      {schedules && schedules.length > 0 && (
        <div className="space-y-2 mb-4">
          {schedules.map((s: ChallengeSchedule) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <button
                onClick={() => toggleMut.mutate(s.id)}
                className={`flex-shrink-0 p-1 rounded transition-colors ${s.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-200'}`}
                title={s.enabled ? '点击暂停' : '点击启用'}
              >
                <Power size={16}/>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-500">
                  {s.stages.join(' / ')} -- 每阶段 {s.questions_per_stage} 题 -- <code className="bg-gray-200 px-1 rounded">{s.cron_expression}</code>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.last_run_at && (
                  <span className="text-xs text-gray-400">
                    上次: {new Date(s.last_run_at).toLocaleString('zh-CN')}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.enabled ? '运行中' : '已暂停'}
                </span>
                <button
                  onClick={() => { if (confirm('确认删除此计划?')) deleteMut.mutate(s.id) }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {schedules?.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 mb-4">暂无计划任务，点击右上角「新建计划」</p>
      )}

      {/* Create form */}
      {showForm && (
        <div className="border border-blue-100 bg-blue-50/30 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">计划名称</span>
              <input value={formName} onChange={e => setFormName(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">每阶段题数</span>
              <select value={formQps} onChange={e => setFormQps(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">挑战阶段（逗号分隔，支持自定义）</span>
            <input value={formStages} onChange={e => setFormStages(e.target.value)}
              placeholder="线索, 客户, 商机, 订单"
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">执行频率</span>
            <div className="flex gap-2 flex-wrap">
              {CRON_PRESETS.map(p => (
                <button key={p.value} type="button" onClick={() => setFormCron(p.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${formCron === p.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p.label}
                </button>
              ))}
              <input value={formCron} onChange={e => setFormCron(e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono bg-white w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="自定义 cron"/>
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              取消
            </button>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !formName.trim()}
              className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {createMut.isPending ? <Loader size={13} className="animate-spin"/> : <Plus size={13}/>}
              创建并启用
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* Safe wrapper: isolates schedule panel errors so they don't crash the challenge UI */
import { Component, type ReactNode } from 'react'

class ScheduleErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div className="mt-8 px-6 py-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          计划任务模块加载失败：{this.state.err.message}
          <button onClick={() => this.setState({ err: null })} className="ml-3 underline">重试</button>
        </div>
      )
    }
    return this.props.children
  }
}

function SchedulePanelSafe() {
  return (
    <ScheduleErrorBoundary>
      <SchedulePanel />
    </ScheduleErrorBoundary>
  )
}
