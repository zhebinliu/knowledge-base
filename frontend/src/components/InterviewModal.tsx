import { useEffect, useState, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, Sparkles, Check } from 'lucide-react'
import { getInterview, saveInterviewAnswer, type InterviewQuestion } from '../api/client'

interface Props {
  kind: 'kickoff_pptx' | 'insight'
  projectId: string
  kindTitle: string
  onClose: () => void
  onReadyToGenerate: () => void
}

export default function InterviewModal({ kind, projectId, kindTitle, onClose, onReadyToGenerate }: Props) {
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getInterview(kind, projectId)
      .then(st => {
        if (cancelled) return
        setQuestions(st.questions)
        setAnswers(st.answers)
        // jump to first unanswered
        const firstUnansweredIdx = st.next_key
          ? Math.max(0, st.questions.findIndex(q => q.key === st.next_key))
          : 0
        setIdx(firstUnansweredIdx)
        setDraft(st.answers[st.questions[firstUnansweredIdx]?.key] ?? '')
      })
      .catch(() => setError('加载访谈失败，请关闭重试'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [kind, projectId])

  const current = questions[idx]
  const total = questions.length
  const answeredCount = useMemo(
    () => questions.filter(q => (answers[q.key] ?? '').trim()).length,
    [questions, answers],
  )
  const allDone = total > 0 && answeredCount === total

  const persistCurrent = async (): Promise<boolean> => {
    if (!current) return true
    if (draft === (answers[current.key] ?? '')) return true  // unchanged
    setSaving(true)
    try {
      await saveInterviewAnswer(kind, {
        project_id: projectId,
        question_key: current.key,
        question_text: current.question,
        answer: draft,
      })
      setAnswers(a => ({ ...a, [current.key]: draft }))
      return true
    } catch {
      setError('保存失败，请重试')
      return false
    } finally {
      setSaving(false)
    }
  }

  const goTo = async (i: number) => {
    if (i < 0 || i >= total) return
    const ok = await persistCurrent()
    if (!ok) return
    setIdx(i)
    setDraft(answers[questions[i].key] ?? (i === idx ? draft : ''))
  }

  const next = () => goTo(idx + 1)
  const prev = () => goTo(idx - 1)

  const finishAndGenerate = async () => {
    const ok = await persistCurrent()
    if (!ok) return
    onReadyToGenerate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Sparkles size={16} style={{ color: '#FF8D1A' }} />
              {kindTitle} · 项目访谈
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">一问一答，答案会保存到项目资产；下次再生成时直接复用</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded">
            <X size={18} />
          </button>
        </div>

        {/* Progress */}
        {!loading && total > 0 && (
          <div className="px-6 pt-3 shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                第 {idx + 1} / {total} 题
                {current?.stage && <span className="ml-2 text-gray-400">· {current.stage}</span>}
              </span>
              <span>已答 {answeredCount} / {total}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${(answeredCount / total) * 100}%`, background: 'linear-gradient(90deg,#FF8D1A,#D96400)' }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> 加载访谈题目…
            </div>
          ) : total === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              当前输出智能体未启用任何含题库的技能。请到"设置 → 技能库"为 skill 配置 questions 字段，或直接点下方按钮跳过访谈生成。
              <div className="mt-4">
                <button
                  onClick={onReadyToGenerate}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
                >
                  跳过访谈，直接生成
                </button>
              </div>
            </div>
          ) : current ? (
            <>
              <p className="text-xs text-gray-400 mb-1">来自技能：{current.skill_name}</p>
              <h3 className="text-lg font-medium text-gray-800 leading-relaxed mb-2">{current.question}</h3>
              {current.hint && (
                <p className="text-xs text-gray-500 bg-orange-50/60 border border-orange-100 rounded-lg px-3 py-2 mb-3">
                  提示：{current.hint}
                </p>
              )}
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="在此作答；写得越具体，生成的文档越靠谱。可以留空后续补充。"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300 resize-none"
                style={{ minHeight: 200 }}
              />
              <p className="text-[11px] text-gray-400 mt-1">{draft.length} 字符</p>
            </>
          ) : null}

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        {/* Footer */}
        {!loading && total > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
            <button
              onClick={prev}
              disabled={idx === 0 || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> 上一题
            </button>
            <div className="flex items-center gap-2">
              {idx < total - 1 ? (
                <button
                  onClick={next}
                  disabled={saving}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  下一题
                </button>
              ) : (
                <button
                  onClick={finishAndGenerate}
                  disabled={saving || !allDone}
                  className="flex items-center gap-1 px-4 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
                  title={allDone ? '开始生成文档' : '还有未回答的题目'}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  完成访谈，生成文档
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
