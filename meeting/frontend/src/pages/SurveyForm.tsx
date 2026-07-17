import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CalendarCheck, Clock, CheckCircle2, Send } from 'lucide-react'
import {
  getPublicSurvey, submitSurveyResponse, getPublicSurveyResults,
  type MeetingSurveyData,
} from '../api/client'

const SURVEY_TYPE_LABEL: Record<string, string> = {
  time_poll: '会议时间调查',
  attendance: '会议出席确认',
  satisfaction: '会议满意度问卷',
}
const SURVEY_TYPE_DESC: Record<string, string> = {
  time_poll: '请勾选您可以参加的时间段',
  attendance: '请确认您是否能出席本次会议',
  satisfaction: '请为本次会议评分',
}

export default function SurveyForm() {
  const { share_token } = useParams<{ share_token: string }>()
  const [survey, setSurvey] = useState<MeetingSurveyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 表单字段
  const [respondentName, setRespondentName] = useState('')
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [canAttend, setCanAttend] = useState<boolean | null>(null)
  const [satisfactionAnswers, setSatisfactionAnswers] = useState<Record<string, number>>({})
  const [suggestion, setSuggestion] = useState('')

  useEffect(() => {
    if (!share_token) return
    setLoading(true)
    getPublicSurvey(share_token)
      .then(setSurvey)
      .catch(() => setError('问卷不存在或已失效'))
      .finally(() => setLoading(false))
  }, [share_token])

  const toggleSlot = (idx: number) => {
    setSelectedSlots(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  const handleSubmit = async () => {
    if (!respondentName.trim() || !share_token) return
    setSubmitting(true)
    try {
      const body: Parameters<typeof submitSurveyResponse>[1] = {
        respondent_name: respondentName.trim(),
        suggestion: suggestion.trim() || undefined,
      }
      if (survey?.survey_type === 'time_poll') {
        body.selected_time_slots = selectedSlots
      }
      if (survey?.survey_type === 'attendance') {
        body.can_attend = canAttend
      }
      if (survey?.survey_type === 'satisfaction') {
        body.satisfaction_answers = Object.entries(satisfactionAnswers).map(([qId, score]) => ({
          question_id: qId, score,
        }))
      }
      await submitSurveyResponse(share_token, body)
      setSubmitted(true)
    } catch {
      setError('提交失败，请重试')
    }
    setSubmitting(false)
  }

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand" />
      </div>
    )
  }

  // 错误
  if (error || !survey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <CalendarCheck size={48} className="mx-auto mb-3 text-ink-muted opacity-40" />
          <p className="text-sm text-ink-muted">{error || '问卷不存在'}</p>
        </div>
      </div>
    )
  }

  // 已提交感谢页
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-ink mb-2">提交成功！</h2>
          <p className="text-sm text-ink-muted mb-1">感谢您的参与</p>
          <p className="text-xs text-ink-muted">您的回答已成功提交</p>
        </div>
      </div>
    )
  }

  const isClosed = survey.status === 'closed'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* 头部 */}
        <div className="px-6 py-5 border-b border-line bg-gradient-to-r from-brand/5 to-transparent">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-blue-50 text-blue-600">
              <Clock size={10} /> {SURVEY_TYPE_LABEL[survey.survey_type] || '问卷'}
            </span>
            {isClosed && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-ink-muted">已截止</span>
            )}
          </div>
          <h1 className="text-lg font-bold text-ink mt-1">{survey.title}</h1>
          {survey.description && (
            <p className="text-[12px] text-ink-muted mt-1 whitespace-pre-wrap">{survey.description}</p>
          )}
          <p className="text-[11px] text-ink-muted mt-2">{SURVEY_TYPE_DESC[survey.survey_type] || '请填写以下信息'}</p>
        </div>

        {/* 表单 */}
        <div className="px-6 py-4 space-y-4">
          {/* 姓名 */}
          <div>
            <label className="text-[12px] font-semibold text-ink">您的姓名 *</label>
            <input value={respondentName} onChange={(e) => setRespondentName(e.target.value)}
              disabled={isClosed}
              placeholder="请输入姓名"
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-line text-sm focus:outline-none focus:border-brand disabled:bg-slate-50 disabled:text-ink-muted" />
          </div>

          {/* 时间调查 */}
          {survey.survey_type === 'time_poll' && (
            <div>
              <label className="text-[12px] font-semibold text-ink mb-2 block">您可接受的时间段（可多选）</label>
              <div className="space-y-2">
                {(survey.time_options || []).map((opt, i) => (
                  <label
                    key={i}
                    onClick={() => !isClosed && toggleSlot(i)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                      selectedSlots.includes(i)
                        ? 'border-brand bg-brand/5 shadow-sm'
                        : 'border-line hover:border-brand/30 hover:bg-slate-50'
                    } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      selectedSlots.includes(i)
                        ? 'border-brand bg-brand'
                        : 'border-slate-300'
                    }`}>
                      {selectedSlots.includes(i) && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink">{opt.label || `时段${i + 1}`}</div>
                      {opt.start && (
                        <div className="text-[10px] text-ink-muted">
                          {new Date(opt.start).toLocaleString('zh-CN', {
                            month: 'long', day: 'numeric', weekday: 'short',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 出席确认 */}
          {survey.survey_type === 'attendance' && (
            <div>
              <label className="text-[12px] font-semibold text-ink mb-2 block">您是否能出席？</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => !isClosed && setCanAttend(true)}
                  disabled={isClosed}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                    canAttend === true
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-line hover:border-emerald-300 text-ink-secondary'
                  } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <CheckCircle2 size={18} className="mx-auto mb-1" />
                  可以出席
                </button>
                <button
                  onClick={() => !isClosed && setCanAttend(false)}
                  disabled={isClosed}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                    canAttend === false
                      ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                      : 'border-line hover:border-red-300 text-ink-secondary'
                  } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span className="text-lg block mb-1">✕</span>
                  无法出席
                </button>
              </div>
            </div>
          )}

          {/* 满意度调查 */}
          {survey.survey_type === 'satisfaction' && (
            <div className="space-y-3">
              {(survey.satisfaction_questions || []).map((q) => {
                const score = satisfactionAnswers[q.id] || 0
                return (
                  <div key={q.id}>
                    <label className="text-[12px] font-semibold text-ink mb-1.5 block">{q.question}</label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          onClick={() => !isClosed && setSatisfactionAnswers(prev => ({ ...prev, [q.id]: v }))}
                          disabled={isClosed}
                          className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all ${
                            score >= v
                              ? 'bg-brand text-white shadow-sm'
                              : 'bg-slate-100 text-ink-muted hover:bg-slate-200'
                          } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {v}
                        </button>
                      ))}
                      <span className="text-[10px] text-ink-muted ml-1">{score > 0 ? `${score}/5` : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 建议 */}
          <div>
            <label className="text-[12px] font-semibold text-ink mb-1 block">
              {survey.survey_type === 'satisfaction' ? '其他建议或意见' : '备注（选填）'}
            </label>
            <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)}
              disabled={isClosed}
              placeholder="如有任何补充意见，请在此填写..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-line text-sm resize-none focus:outline-none focus:border-brand disabled:bg-slate-50" />
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="px-6 py-4 border-t border-line bg-slate-50/50">
          {isClosed ? (
            <p className="text-center text-xs text-ink-muted py-2">该问卷已截止</p>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !respondentName.trim() || (
                survey.survey_type === 'attendance' && canAttend === null
              ) || (
                survey.survey_type === 'time_poll' && selectedSlots.length === 0
              )}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand/90 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> 提交中...</>
              ) : (
                <><Send size={16} /> 提交</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
