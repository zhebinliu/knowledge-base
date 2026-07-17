import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Plus, Loader2, ChevronLeft, Clock, Users, ThumbsUp, ExternalLink, Copy, Share2, MoreHorizontal, Trash2 } from 'lucide-react'
import { listMeetingSurveys, createMeetingSurvey, deleteMeetingSurvey, type MeetingSurveyData, type TimeOption, type SatisfactionQuestion } from '../../api/client'

const SURVEY_TYPE_LABEL: Record<string, string> = {
  time_poll: '时间调查',
  attendance: '出席确认',
  satisfaction: '满意度',
}
const SURVEY_TYPE_COLOR: Record<string, string> = {
  time_poll: 'text-blue-600 bg-blue-50',
  attendance: 'text-emerald-600 bg-emerald-50',
  satisfaction: 'text-purple-600 bg-purple-50',
}
const SURVEY_TYPE_ICON: Record<string, typeof Clock> = {
  time_poll: Clock,
  attendance: Users,
  satisfaction: ThumbsUp,
}
const STATUS_LABEL: Record<string, string> = {
  open: '收集中',
  closed: '已截止',
  finalized: '已确定',
}

export default function MeetingSurveys() {
  const nav = useNavigate()
  const [surveys, setSurveys] = useState<MeetingSurveyData[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  // 创建表单
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [surveyType, setSurveyType] = useState<'time_poll' | 'attendance' | 'satisfaction'>('time_poll')
  const [projectId, setProjectId] = useState('')

  // 时间调查选项
  const [timeOptions, setTimeOptions] = useState<TimeOption[]>([
    { start: '', end: '', label: '' },
  ])
  // 满意度题目
  const [satisfactionQuestions, setSatisfactionQuestions] = useState<SatisfactionQuestion[]>([
    { id: crypto.randomUUID(), question: '', qtype: 'score' },
  ])

  // 确认删除
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await listMeetingSurveys()
      setSurveys(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 时间段仅要求填写起始时间,标题为空时自动用起始时间生成展示文案(2026-07-17 修复:此前要求 start 和 label 同时填写,
  // 导致组织者只填了日期时段被整段过滤掉,问卷创建后没有任何可勾选的时间段)
  const formatSlotLabel = (start: string) => {
    try {
      return new Date(start).toLocaleString('zh-CN', {
        month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch { return start }
  }
  const validTimeOptions = timeOptions
    .filter((t: TimeOption) => t.start)
    .map((t: TimeOption) => ({ ...t, label: t.label.trim() || formatSlotLabel(t.start) }))
  const validSatisfactionQuestions = satisfactionQuestions.filter((q: SatisfactionQuestion) => q.question.trim())

  const handleCreate = async () => {
    if (!title.trim()) return
    if (surveyType === 'time_poll' && validTimeOptions.length === 0) return
    if (surveyType === 'satisfaction' && validSatisfactionQuestions.length === 0) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        survey_type: surveyType,
        project_id: projectId || undefined,
      }
      if (surveyType === 'time_poll') {
        body.time_options = validTimeOptions
      }
      if (surveyType === 'satisfaction') {
        body.satisfaction_questions = validSatisfactionQuestions
      }
      await createMeetingSurvey(body as Parameters<typeof createMeetingSurvey>[0])
      setShowCreate(false)
      resetForm()
      await load()
    } catch { /* ignore */ }
    setCreating(false)
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setSurveyType('time_poll')
    setProjectId('')
    setTimeOptions([{ start: '', end: '', label: '' }])
    setSatisfactionQuestions([{ id: crypto.randomUUID(), question: '', qtype: 'score' }])
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try {
      await deleteMeetingSurvey(deleteId)
      setDeleteId(null)
      await load()
    } catch { /* ignore */ }
    setDeleting(false)
  }

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/survey/${token}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-line bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/console/meeting')} className="p-1 rounded-md hover:bg-slate-100 text-ink-muted">
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
            <CalendarCheck size={20} className="text-brand" /> 组织会议
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand hover:bg-brand/90 transition-colors"
        >
          <Plus size={15} /> 新建调查
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-ink-muted">
            <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : surveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-ink-muted">
            <CalendarCheck size={48} className="mb-3 opacity-30" />
            <p className="text-sm">暂无调查问卷</p>
            <p className="text-xs mt-1">点击右上角「新建调查」开始组织会议</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {surveys.map((s) => {
              const Icon = SURVEY_TYPE_ICON[s.survey_type] || CalendarCheck
              return (
                <div
                  key={s.id}
                  onClick={() => nav(`/console/meeting/surveys/${s.id}`)}
                  className="rounded-xl border border-line bg-white p-4 hover:shadow-md hover:border-brand/30 transition-all cursor-pointer group"
                >
                  {/* 顶栏:类型标签 + 操作 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${SURVEY_TYPE_COLOR[s.survey_type] || ''}`}>
                      <Icon size={11} /> {SURVEY_TYPE_LABEL[s.survey_type] || s.survey_type}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyShareLink(s.share_token) }}
                        className="p-1 rounded hover:bg-slate-100 text-ink-muted"
                        title="复制分享链接"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(s.id) }}
                        className="p-1 rounded hover:bg-red-50 text-ink-muted hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-sm font-semibold text-ink mb-1 line-clamp-1">{s.title}</h3>
                  {s.description && (
                    <p className="text-[11px] text-ink-muted line-clamp-2 mb-2">{s.description}</p>
                  )}

                  {/* 底部:状态 + 统计 */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      s.status === 'open' ? 'text-emerald-600 bg-emerald-50' :
                      s.status === 'finalized' ? 'text-blue-600 bg-blue-50' :
                      'text-ink-muted bg-slate-50'
                    }`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                    <span className="text-[10px] text-ink-muted">
                      {s.response_count ?? 0} 条回答
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 新建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-base font-semibold text-ink">新建调查问卷</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* 标题 */}
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">会议主题 *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入会议主题" className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
              </div>
              {/* 描述 */}
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">会议描述</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="会议议程、背景说明…" rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm resize-none focus:outline-none focus:border-brand" />
              </div>
              {/* 类型 */}
              <div>
                <label className="text-[11px] font-semibold text-ink-muted">问卷类型</label>
                <select value={surveyType} onChange={(e) => setSurveyType(e.target.value as typeof surveyType)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand bg-white">
                  <option value="time_poll">时间调查 — 收集大家可接受的会议时间</option>
                  <option value="attendance">出席确认 — 确认谁能出席</option>
                  <option value="satisfaction">满意度 — 会后满意度问卷</option>
                </select>
              </div>

              {/* 时间调查：候选时间段 */}
              {surveyType === 'time_poll' && (
                <div>
                  <label className="text-[11px] font-semibold text-ink-muted">候选时间段</label>
                  <div className="space-y-2 mt-1">
                    {timeOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={opt.label} onChange={(e) => {
                          const next = [...timeOptions]; next[i] = { ...next[i], label: e.target.value }; setTimeOptions(next)
                        }} placeholder="标签(选填,默认用日期时间)"
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand" />
                        <input type="datetime-local" value={opt.start} onChange={(e) => {
                          const next = [...timeOptions]; next[i] = { ...next[i], start: e.target.value }; setTimeOptions(next)
                        }} className="px-2 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand w-44" />
                        {timeOptions.length > 1 && (
                          <button onClick={() => setTimeOptions(timeOptions.filter((_, j) => j !== i))}
                            className="p-1 text-ink-muted hover:text-red-500">×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setTimeOptions([...timeOptions, { start: '', end: '', label: '' }])}
                      className="text-xs text-brand hover:underline">+ 添加时间段</button>
                    {validTimeOptions.length === 0 && (
                      <p className="text-[11px] text-red-500">请至少填写一个时间段的起始时间</p>
                    )}
                  </div>
                </div>
              )}

              {/* 满意度：题目 */}
              {surveyType === 'satisfaction' && (
                <div>
                  <label className="text-[11px] font-semibold text-ink-muted">满意度题目</label>
                  <div className="space-y-2 mt-1">
                    {satisfactionQuestions.map((q, i) => (
                      <div key={q.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-ink-muted w-4">{i + 1}.</span>
                        <input value={q.question} onChange={(e) => {
                          const next = [...satisfactionQuestions]; next[i] = { ...next[i], question: e.target.value }; setSatisfactionQuestions(next)
                        }} placeholder="如: 会议效率评分"
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:border-brand" />
                        {satisfactionQuestions.length > 1 && (
                          <button onClick={() => setSatisfactionQuestions(satisfactionQuestions.filter((_, j) => j !== i))}
                            className="p-1 text-ink-muted hover:text-red-500">×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setSatisfactionQuestions([...satisfactionQuestions, { id: crypto.randomUUID(), question: '', qtype: 'score' }])}
                      className="text-xs text-brand hover:underline">+ 添加题目</button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
              <button onClick={() => { setShowCreate(false); resetForm() }}
                className="px-4 py-2 rounded-lg text-sm text-ink-secondary border border-line hover:bg-slate-50">
                取消
              </button>
              <button onClick={handleCreate} disabled={
                creating || !title.trim() ||
                (surveyType === 'time_poll' && validTimeOptions.length === 0) ||
                (surveyType === 'satisfaction' && validSatisfactionQuestions.length === 0)
              }
                className="px-4 py-2 rounded-lg text-sm text-white bg-brand hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1.5">
                {creating && <Loader2 size={14} className="animate-spin" />} 创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-2">确认删除</h3>
            <p className="text-xs text-ink-muted mb-4">删除后不可恢复，所有回答数据也将清除。</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-ink-secondary border border-line hover:bg-slate-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 inline-flex items-center gap-1">
                {deleting && <Loader2 size={12} className="animate-spin" />} 删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
