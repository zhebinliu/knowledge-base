import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Loader2, Copy, Clock, Users, ThumbsUp, Target, ChevronDown,
  BarChart3, PieChart, CheckCircle2, XCircle, HelpCircle, ExternalLink,
} from 'lucide-react'
import {
  getMeetingSurvey, getMeetingSurveyStats, updateMeetingSurvey,
  finalizeMeetingSurvey, switchToSatisfaction,
  type MeetingSurveyData, type MeetingSurveyResponseItem,
  type TimeOption, type SatisfactionQuestion,
} from '../../api/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend,
} from 'recharts'

const SURVEY_TYPE_LABEL: Record<string, string> = {
  time_poll: '时间调查',
  attendance: '出席确认',
  satisfaction: '满意度',
}
const STATUS_LABEL: Record<string, string> = {
  open: '收集中',
  closed: '已截止',
  finalized: '已确定',
}
const PIE_COLORS = ['#22c55e', '#ef4444', '#94a3b8']
const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6', '#f97316']

export default function MeetingSurveyDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const surveyId = Number(id)

  const [survey, setSurvey] = useState<MeetingSurveyData | null>(null)
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'stats' | 'responses'>('stats')
  const [responses, setResponses] = useState<MeetingSurveyResponseItem[]>([])

  // 确定会议时间弹窗
  const [showFinalize, setShowFinalize] = useState(false)
  const [finalizeTime, setFinalizeTime] = useState('')
  const [finalizeLocation, setFinalizeLocation] = useState('')
  const [finalizing, setFinalizing] = useState(false)

  // 切换满意度弹窗
  const [showSatisfaction, setShowSatisfaction] = useState(false)
  const [satQuestions, setSatQuestions] = useState<SatisfactionQuestion[]>([])
  const [switching, setSwitching] = useState(false)

  // 编辑弹窗
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTimeOptions, setEditTimeOptions] = useState<TimeOption[]>([])
  const [editSatQuestions, setEditSatQuestions] = useState<SatisfactionQuestion[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, st] = await Promise.all([
        getMeetingSurvey(surveyId),
        getMeetingSurveyStats(surveyId),
      ])
      setSurvey(s)
      setStats(st)
      setResponses((st.responses as MeetingSurveyResponseItem[]) || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [surveyId])

  useEffect(() => { load() }, [load])

  const copyShareLink = () => {
    if (!survey) return
    const url = `${window.location.origin}/survey/${survey.share_token}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  const handleFinalize = async () => {
    if (!finalizeTime) return
    setFinalizing(true)
    try {
      await finalizeMeetingSurvey(surveyId, {
        meeting_time: new Date(finalizeTime).toISOString(),
        meeting_location: finalizeLocation || undefined,
      })
      setShowFinalize(false)
      await load()
    } catch { /* ignore */ }
    setFinalizing(false)
  }

  const handleSwitchToSatisfaction = async () => {
    const valid = satQuestions.filter((q: SatisfactionQuestion) => q.question.trim())
    if (!valid.length) return
    setSwitching(true)
    try {
      await switchToSatisfaction(surveyId, valid)
      setShowSatisfaction(false)
      await load()
    } catch { /* ignore */ }
    setSwitching(false)
  }

  // 时间段仅要求填写起始时间,标题为空时用起始时间自动生成(2026-07-17 修复:同创建处问题,
  // 避免编辑时因未同时填写 label 而把已有时间段整段清空)
  const formatSlotLabel = (start: string) => {
    try {
      return new Date(start).toLocaleString('zh-CN', {
        month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch { return start }
  }
  const validEditTimeOptions = editTimeOptions
    .filter((t: TimeOption) => t.start)
    .map((t: TimeOption) => ({ ...t, label: t.label.trim() || formatSlotLabel(t.start) }))
  const validEditSatQuestions = editSatQuestions.filter((q: SatisfactionQuestion) => q.question.trim())

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return
    if (survey?.survey_type === 'time_poll' && validEditTimeOptions.length === 0) return
    if (survey?.survey_type === 'satisfaction' && validEditSatQuestions.length === 0) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { title: editTitle.trim(), description: editDesc.trim() }
      if (survey?.survey_type === 'time_poll') {
        body.time_options = validEditTimeOptions
      }
      if (survey?.survey_type === 'satisfaction') {
        body.satisfaction_questions = validEditSatQuestions
      }
      await updateMeetingSurvey(surveyId, body)
      setShowEdit(false)
      await load()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const openEdit = () => {
    if (!survey) return
    setEditTitle(survey.title)
    setEditDesc(survey.description || '')
    setEditTimeOptions(survey.time_options?.length ? survey.time_options : [{ start: '', end: '', label: '' }])
    setEditSatQuestions(survey.satisfaction_questions?.length ? survey.satisfaction_questions : [{ id: crypto.randomUUID(), question: '', qtype: 'score' }])
    setShowEdit(true)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-ink-muted" />
      </div>
    )
  }
  if (!survey) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas text-ink-muted text-sm">
        调查问卷不存在
      </div>
    )
  }

  const statData = (stats.statistics as Record<string, unknown>) || {}
  const timeCounts = statData.time_counts as Record<string, number> || {}
  const attendanceCounts = statData.attendance as Record<string, number> || {}
  const satAverages = statData.satisfaction_averages as Record<string, number> || {}

  // 时间调查柱状图数据
  const timeChartData = survey.time_options?.map((opt: TimeOption, i: number) => ({
    name: opt.label || `时段${i + 1}`,
    count: timeCounts[String(i)] || 0,
  })) || []

  // 出席确认饼图数据
  const attendChartData = [
    { name: '可出席', value: attendanceCounts.yes || 0 },
    { name: '无法出席', value: attendanceCounts.no || 0 },
    { name: '未回复', value: attendanceCounts.pending !== undefined ? (attendanceCounts.pending as number) : Math.max(0, (statData.total_respondents as number || 0) - (attendanceCounts.yes || 0) - (attendanceCounts.no || 0)) },
  ]

  // 满意度柱状图数据
  const satChartData = Object.entries(satAverages).map(([question, avg]) => ({
    name: question.length > 15 ? question.slice(0, 15) + '…' : question,
    score: Number(avg),
  }))

  const showStatsTab = survey.survey_type !== 'satisfaction'

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-line bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => nav('/console/meeting/surveys')} className="p-1 rounded-md hover:bg-slate-100 text-ink-muted shrink-0">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink truncate">{survey.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                survey.survey_type === 'time_poll' ? 'text-blue-600 bg-blue-50' :
                survey.survey_type === 'attendance' ? 'text-emerald-600 bg-emerald-50' :
                'text-purple-600 bg-purple-50'
              }`}>
                {SURVEY_TYPE_LABEL[survey.survey_type] || survey.survey_type}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                survey.status === 'open' ? 'text-emerald-600 bg-emerald-50' :
                survey.status === 'finalized' ? 'text-blue-600 bg-blue-50' :
                'text-ink-muted bg-slate-50'
              }`}>
                {STATUS_LABEL[survey.status] || survey.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyShareLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line bg-white hover:bg-slate-50 text-ink-secondary transition-colors">
            <Copy size={13} /> 复制链接
          </button>
          <button onClick={openEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line bg-white hover:bg-slate-50 text-ink-secondary transition-colors">
            编辑
          </button>
          {/* 操作按钮 */}
          {survey.survey_type === 'time_poll' && survey.status === 'open' && (
            <button onClick={() => setShowFinalize(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-brand hover:bg-brand/90 transition-colors">
              <Target size={13} /> 确定会议时间
            </button>
          )}
          {survey.survey_type === 'attendance' && survey.status === 'finalized' && (
            <button onClick={() => { setSatQuestions([{ id: crypto.randomUUID(), question: '', qtype: 'score' }]); setShowSatisfaction(true) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors">
              <ThumbsUp size={13} /> 发布满意度
            </button>
          )}
        </div>
      </div>

      {/* 描述 */}
      {survey.description && (
        <div className="shrink-0 px-6 py-2 border-b border-line bg-white/50">
          <p className="text-[12px] text-ink-muted whitespace-pre-wrap">{survey.description}</p>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="shrink-0 flex items-center gap-4 px-6 border-b border-line bg-white">
        {showStatsTab && (
          <button onClick={() => setTab('stats')}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === 'stats' ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink'
            }`}>
            <BarChart3 size={13} className="inline mr-1" /> 数据看板
          </button>
        )}
        <button onClick={() => setTab('responses')}
          className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
            tab === 'responses' ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink'
          }`}>
          <Users size={13} className="inline mr-1" /> 回答明细 ({survey.response_count ?? 0})
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 数据看板 */}
        {tab === 'stats' && (
          <div className="space-y-6">
            {/* 总体概览 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-line bg-white p-3">
                <div className="text-[10px] text-ink-muted mb-1">总回答数</div>
                <div className="text-xl font-bold text-ink">{survey.response_count ?? 0}</div>
              </div>
              {survey.survey_type === 'time_poll' && (
                <div className="rounded-xl border border-line bg-white p-3">
                  <div className="text-[10px] text-ink-muted mb-1">候选时段</div>
                  <div className="text-xl font-bold text-ink">{survey.time_options?.length ?? 0}</div>
                </div>
              )}
              {survey.survey_type === 'attendance' && (
                <div className="rounded-xl border border-line bg-white p-3">
                  <div className="text-[10px] text-ink-muted mb-1">可出席</div>
                  <div className="text-xl font-bold text-emerald-600">{attendanceCounts.yes || 0}</div>
                </div>
              )}
              {survey.survey_type === 'satisfaction' && (
                <div className="rounded-xl border border-line bg-white p-3">
                  <div className="text-[10px] text-ink-muted mb-1">平均分</div>
                  <div className="text-xl font-bold text-ink">
                    {Object.values(satAverages).length
                      ? (Object.values(satAverages).reduce((a, b) => a + b, 0) / Object.values(satAverages).length).toFixed(1)
                      : '-'}
                  </div>
                </div>
              )}
            </div>

            {/* 时间调查：柱状图 */}
            {survey.survey_type === 'time_poll' && timeChartData.length > 0 && (
              <div className="rounded-xl border border-line bg-white p-4">
                <h3 className="text-xs font-semibold text-ink mb-3 flex items-center gap-1.5">
                  <BarChart3 size={14} className="text-brand" /> 各时间段可接受人数
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={timeChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" name="可接受人数" radius={[4, 4, 0, 0]}>
                      {timeChartData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 出席确认：饼图 */}
            {survey.survey_type === 'attendance' && (
              <div className="rounded-xl border border-line bg-white p-4">
                <h3 className="text-xs font-semibold text-ink mb-3 flex items-center gap-1.5">
                  <PieChart size={14} className="text-brand" /> 出席率
                </h3>
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width={300} height={260}>
                    <RePieChart>
                      <Pie
                        data={attendChartData.filter(d => d.value > 0)}
                        cx="50%" cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}人`}
                        labelLine={false}
                      >
                        {attendChartData.filter(d => d.value > 0).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> 可出席 {attendanceCounts.yes || 0}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> 无法出席 {attendanceCounts.no || 0}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> 待确认</span>
                </div>
              </div>
            )}

            {/* 满意度：柱状图 */}
            {survey.survey_type === 'satisfaction' && satChartData.length > 0 && (
              <div className="rounded-xl border border-line bg-white p-4">
                <h3 className="text-xs font-semibold text-ink mb-3 flex items-center gap-1.5">
                  <BarChart3 size={14} className="text-purple-500" /> 满意度平均分
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={satChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="score" name="平均分" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 回答明细 */}
        {tab === 'responses' && (
          <div>
            {responses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-ink-muted">
                <Users size={32} className="mb-2 opacity-30" />
                <p className="text-xs">暂无回答</p>
              </div>
            ) : (
              <div className="space-y-2">
                {responses.map((r, i) => (
                  <div key={r.id != null ? r.id : i} className="rounded-xl border border-line bg-white p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-ink">{r.respondent_name || '匿名'}</span>
                      <span className="text-[10px] text-ink-muted">{r.created_at ? new Date(r.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    {survey.survey_type === 'time_poll' && r.selected_time_slots && (
                      <div className="flex flex-wrap gap-1">
                        {r.selected_time_slots.map((slotIdx, j) => (
                          <span key={j} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                            {survey.time_options?.[slotIdx]?.label || `时段${slotIdx + 1}`}
                          </span>
                        ))}
                      </div>
                    )}
                    {survey.survey_type === 'attendance' && r.can_attend != null && (
                      <span className={`text-xs flex items-center gap-1 ${
                        r.can_attend ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {r.can_attend ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {r.can_attend ? '可出席' : '无法出席'}
                      </span>
                    )}
                    {survey.survey_type === 'satisfaction' && r.satisfaction_answers && (
                      <div className="space-y-0.5">
                        {r.satisfaction_answers.map((ans, j) => {
                          const q = survey.satisfaction_questions?.find(sq => sq.id === ans.question_id)
                          return (
                            <div key={j} className="text-[11px] text-ink-secondary flex items-center gap-2">
                              <span className="text-ink-muted">{q?.question || '问题'}:</span>
                              <span className="font-semibold">{ans.score ?? '?'}/5</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {r.suggestion && (
                      <p className="text-[11px] text-ink-muted mt-1 italic">💬 {r.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 确定会议时间弹窗 */}
      {showFinalize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowFinalize(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-96 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">确定会议时间</h3>
            <p className="text-[11px] text-ink-muted mb-3">确定时间后，问卷将切换为「出席确认」模式，通知参会者确认能否出席。</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">会议时间 *</label>
                <input type="datetime-local" value={finalizeTime} onChange={(e) => setFinalizeTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">会议地点</label>
                <input value={finalizeLocation} onChange={(e) => setFinalizeLocation(e.target.value)}
                  placeholder="如: 3楼会议室 / 腾讯会议链接" className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowFinalize(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-ink-secondary border border-line hover:bg-slate-50">取消</button>
              <button onClick={handleFinalize} disabled={finalizing || !finalizeTime}
                className="px-3 py-1.5 rounded-lg text-xs text-white bg-brand hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1">
                {finalizing && <Loader2 size={12} className="animate-spin" />} 确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 满意度切换弹窗 */}
      {showSatisfaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSatisfaction(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-96 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">发布满意度问卷</h3>
            <p className="text-[11px] text-ink-muted mb-3">设置满意度题目，发布后参会者可以评分。</p>
            <div className="space-y-2 mb-4">
              {satQuestions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-muted">{i + 1}.</span>
                  <input value={q.question} onChange={(e) => {
                    const next = [...satQuestions]; next[i] = { ...next[i], question: e.target.value }; setSatQuestions(next)
                  }} placeholder="如: 会议效率评分"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand" />
                  {satQuestions.length > 1 && (
                    <button onClick={() => setSatQuestions(satQuestions.filter((_, j) => j !== i))}
                      className="p-1 text-ink-muted hover:text-red-500">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setSatQuestions([...satQuestions, { id: crypto.randomUUID(), question: '', qtype: 'score' }])}
                className="text-xs text-brand hover:underline">+ 添加题目</button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowSatisfaction(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-ink-secondary border border-line hover:bg-slate-50">取消</button>
              <button onClick={handleSwitchToSatisfaction} disabled={switching || !satQuestions.some(q => q.question.trim())}
                className="px-3 py-1.5 rounded-lg text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-1">
                {switching && <Loader2 size={12} className="animate-spin" />} 发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">编辑调查</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">会议主题</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">描述</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm resize-none focus:outline-none focus:border-brand" />
              </div>
              {survey.survey_type === 'time_poll' && (
                <div>
                  <label className="text-[11px] font-semibold text-ink-muted">候选时间段</label>
                  {editTimeOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1">
                      <input value={opt.label} onChange={(e) => {
                        const next = [...editTimeOptions]; next[i] = { ...next[i], label: e.target.value }; setEditTimeOptions(next)
                      }} placeholder="标签(选填,默认用日期时间)"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand" />
                      <input type="datetime-local" value={opt.start} onChange={(e) => {
                        const next = [...editTimeOptions]; next[i] = { ...next[i], start: e.target.value }; setEditTimeOptions(next)
                      }} className="px-2 py-1.5 rounded-lg border border-line text-xs w-40" />
                      {editTimeOptions.length > 1 && (
                        <button onClick={() => setEditTimeOptions(editTimeOptions.filter((_, j) => j !== i))} className="p-1 text-ink-muted hover:text-red-500">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setEditTimeOptions([...editTimeOptions, { start: '', end: '', label: '' }])}
                    className="text-xs text-brand hover:underline mt-1">+ 添加</button>
                  {validEditTimeOptions.length === 0 && (
                    <p className="text-[11px] text-red-500 mt-1">请至少填写一个时间段的起始时间</p>
                  )}
                </div>
              )}
              {survey.survey_type === 'satisfaction' && (
                <div>
                  <label className="text-[11px] font-semibold text-ink-muted">满意度题目</label>
                  {editSatQuestions.map((q, i) => (
                    <div key={q.id} className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-ink-muted">{i + 1}.</span>
                      <input value={q.question} onChange={(e) => {
                        const next = [...editSatQuestions]; next[i] = { ...next[i], question: e.target.value }; setEditSatQuestions(next)
                      }} placeholder="题目"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand" />
                      {editSatQuestions.length > 1 && (
                        <button onClick={() => setEditSatQuestions(editSatQuestions.filter((_, j) => j !== i))} className="p-1 text-ink-muted hover:text-red-500">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setEditSatQuestions([...editSatQuestions, { id: crypto.randomUUID(), question: '', qtype: 'score' }])}
                    className="text-xs text-brand hover:underline mt-1">+ 添加</button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-line">
              <button onClick={() => setShowEdit(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-ink-secondary border border-line hover:bg-slate-50">取消</button>
              <button onClick={handleSaveEdit} disabled={
                saving || !editTitle.trim() ||
                (survey.survey_type === 'time_poll' && validEditTimeOptions.length === 0) ||
                (survey.survey_type === 'satisfaction' && validEditSatQuestions.length === 0)
              }
                className="px-3 py-1.5 rounded-lg text-xs text-white bg-brand hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1">
                {saving && <Loader2 size={12} className="animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
