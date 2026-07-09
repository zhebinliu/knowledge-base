/**
 * ConsoleMeetingNew — 新建会议(2026-05-11;2026-06-22 record 升级为半实时边录边传 + 会议 Co-pilot)
 *
 * 提供三种入口:
 *  - upload:上传整段音频文件 → MinIO → xiaomi ASR → AI pipeline
 *  - record:半实时录音(每 10s 一段边录边传 → 即时转写 → 实时显示)+ 右侧「会议 Co-pilot」实时建议 → 停止跑 pipeline
 *  - text:粘贴/输入文本 → 直接走 AI pipeline(跳 ASR)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Upload, Type, ChevronLeft, ChevronRight, Loader2, Mic, Square, Sparkles, X, Check, Clock, ClipboardList, FileText, PenLine, ChevronDown, Target } from 'lucide-react'
import {
  uploadMeetingAudio,
  createMeetingFromText,
  createRecordingMeeting,
  uploadAudioChunk,
  finalizeRecording,
  runLiveAdvice,
  dismissLiveAdvice,
  resolveLiveAdvice,
  pendLiveAdvice,
  runLiveMinutes,
  saveMeetingMemo,
  runMeetingAction,
  listProjects,
  type Project,
  type LiveAdviceItem,
  type LiveAdviceCategory,
  type LiveMinutes,
} from '../../api/client'
import { useLiveRecorder } from '../../hooks/useLiveRecorder'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const MAX_FILE_SIZE_MB = 500
const SEGMENT_MS = 10000        // 半实时段长:10s
const ADVICE_NEW_CHARS = 100    // 转写新增超过这么多字就自动分析一次(内容驱动)
const ADVICE_MIN_GAP_MS = 18000 // 两次自动分析最小间隔(LLM ~10s,留点余量)
type Mode = 'upload' | 'record' | 'text'

const ADVICE_CATS: { key: LiveAdviceCategory; label: string; color: string }[] = [
  { key: 'clarification', label: '需进一步明确', color: '#2563eb' },
  { key: 'ambiguity', label: '歧义点', color: '#d97706' },
  { key: 'gap', label: '可能遗漏(影响方案)', color: '#dc2626' },
  { key: 'industry', label: '行业专属问题', color: '#7c3aed' },
  { key: 'consensus', label: '已达成共识', color: '#059669' },
]
const PRIO_COLOR: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#9ca3af' }
// 分类 key → {label,color} 快查(timeline 单卡显示分类标签用,无分组表头)
const CAT_BY_KEY: Record<string, { key: LiveAdviceCategory; label: string; color: string }> =
  Object.fromEntries(ADVICE_CATS.map((c) => [c.key, c]))
// 实时转写分段:seq 顺序 + 各段起始毫秒(复原 [MM:SS],把建议按 source_ts 落到对应段)+ 该段文本
type LiveSeg = { seq: number; startMs: number; text: string }

// 目标追踪:命中记录
type HighlightItem = {
  id: string              // seq + keyword 唯一标识
  seq: number             // 对应转录分段序号
  timeMs: number          // 时间点(毫秒)
  timeLabel: string       // [MM:SS] 显示用
  text: string            // 命中的转录文本(截断展示)
  matchedKeyword: string  // 匹配到的关键词
  source: 'goal' | 'task' // 来自目标还是任务
  sourceLabel: string     // 对应的目标/任务原文
}

// 关键词提取:从自由文本中提取有意义的关键词(用于即时匹配转写内容)
const STOP_WORDS = new Set([
  '的', '是', '和', '与', '及', '或', '在', '了', '对', '为', '到', '把', '被',
  '这个', '那个', '我们', '他们', '你们', '可以', '需要', '应该', '一个', '一些',
  '什么', '怎么', '如何', '为什么', '时候', '现在', '今天', '明天', '然后', '所以',
  '因为', '但是', '不过', '如果', '就是', '还是', '已经', '可能', '大概', '觉得',
  '讨论', '确认', '确定', '看看', '一下', '大家', '会议',
])
const KEYWORD_DELIMITERS = /[\n，,、;；。.！!？?（）()【】\[\]""'"'  ]/
const extractKeywords = (text: string): string[] => {
  if (!text.trim()) return []
  return text
    .split(KEYWORD_DELIMITERS)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !STOP_WORDS.has(s))
}

const fmtDuration = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtTs = (sec: number | null) =>
  sec == null ? '' : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export default function ConsoleMeetingNew() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('upload')
  const [title, setTitle] = useState('')
  // 从项目详情「关联会议」抽屉点「新建」过来时,URL 带 ?project_id=,预填到下拉
  const [projectId, setProjectId] = useState<string>(() => searchParams.get('project_id') || '')
  const [file, setFile] = useState<File | null>(null)
  const [fileSizeError, setFileSizeError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 半实时录音状态
  const [liveTranscript, setLiveTranscript] = useState('')      // 拼接整稿(内联录音器 + 触发判断用)
  const [liveSegments, setLiveSegments] = useState<LiveSeg[]>([]) // 分段(沉浸式时间轴按段渲染 + 落位建议)
  const [finalizing, setFinalizing] = useState(false)
  const [starting, setStarting] = useState(false)  // 点录音→建会议期间置灰,防重复点
  const liveMeetingIdRef = useRef<number | null>(null)
  // 分段「并行」上传:单段 ASR 延迟不稳(实测 4-25s),串行会越拖越后;并行 + 按 seq 落位排序。
  const segMapRef = useRef<Record<number, { text: string; startMs: number }>>({})
  const pendingRef = useRef<Promise<void>[]>([])

  // 会议 Co-pilot
  const [advice, setAdvice] = useState<LiveAdviceItem[]>([])
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [autoAdvice, setAutoAdvice] = useState(true)
  const [carryover, setCarryover] = useState<LiveAdviceItem[]>([])  // 同项目上次待定项,本场带出来问
  const [boardOpen, setBoardOpen] = useState(false)  // 实时会议看板:录音中默认向右收起
  const adviceBusyRef = useRef(false)

  // 会议三栏:议程 / 备忘 / 实时纪要(2026-06-30)
  const [agenda, setAgenda] = useState('')
  const [memo, setMemo] = useState('')
  const [liveMinutes, setLiveMinutes] = useState<LiveMinutes | null>(null)
  const [liveMinutesLoading, setLiveMinutesLoading] = useState(false)
  const [middleColumnOpen, setMiddleColumnOpen] = useState(true)  // 中间栏默认打开
  const liveMinutesBusyRef = useRef(false)
  const memoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveLenRef = useRef(0)        // 当前转写长度(内容驱动触发用)
  const lastAdviceLenRef = useRef(0)  // 上次分析时的转写长度
  const lastAdviceAtRef = useRef(0)   // 上次分析时间戳
  const transcriptScrollRef = useRef<HTMLDivElement>(null)  // 沉浸式转写区自动滚到底

  // 目标追踪(右下角浮动面板):用户填写会议目标/重点任务,转写命中关键词时高亮 + 记录
  const [meetingGoals, setMeetingGoals] = useState('')            // 会议主要目标
  const [keyTasks, setKeyTasks] = useState('')                    // 重点任务(每行一个)
  const [goalTrackerOpen, setGoalTrackerOpen] = useState(true)    // 面板展开/收起
  const [highlights, setHighlights] = useState<HighlightItem[]>([])  // 命中记录

  const refreshAdvice = useCallback(async () => {
    const id = liveMeetingIdRef.current
    if (!id || adviceBusyRef.current) return
    adviceBusyRef.current = true
    lastAdviceAtRef.current = Date.now()
    lastAdviceLenRef.current = liveLenRef.current
    setAdviceLoading(true)
    try {
      const r = await runLiveAdvice(id)
      if (Array.isArray(r.advice)) setAdvice(r.advice)
      if (Array.isArray(r.carryover)) setCarryover(r.carryover)
    } catch { /* ignore */ } finally {
      adviceBusyRef.current = false
      setAdviceLoading(false)
    }
  }, [])

  const live = useLiveRecorder({
    segmentMs: SEGMENT_MS,
    onSegment: (blob, seq, startMs) => {
      const id = liveMeetingIdRef.current
      if (!id) return
      const p = uploadAudioChunk(id, blob, seq, startMs)
        .then((r) => {
          segMapRef.current[seq] = { text: r.text || '', startMs }
          const segs: LiveSeg[] = Object.keys(segMapRef.current).map(Number).sort((a, b) => a - b)
            .map((k) => ({ seq: k, ...segMapRef.current[k] }))
          const merged = segs.map((s) => s.text).filter(Boolean).join('\n')
          liveLenRef.current = merged.length
          setLiveTranscript(merged)
          setLiveSegments(segs)
        })
        .catch(() => { /* 单段失败忽略,不中断录音 */ })
      pendingRef.current.push(p)
    },
    // 最后一段录完(stop 触发)后收尾:等所有分段上传完 → finalize → 跳详情页
    onStopped: () => {
      const id = liveMeetingIdRef.current
      if (!id) { setFinalizing(false); return }
      setFinalizing(true)
      // 保存备忘 + 等待所有分段上传完成 → finalize
      const saveMemo = memo.trim() ? saveMeetingMemo(id, memo).catch(() => {}) : Promise.resolve()
      Promise.allSettled([...pendingRef.current, saveMemo])
        .then(() => finalizeRecording(id))
        .then((r) => {
          if (r.status === 'failed') {
            setError('没有识别到语音内容,请重试')
            setFinalizing(false)
            liveMeetingIdRef.current = null
          } else {
            // 异步生成最终纪要(不阻塞跳转)
            runMeetingAction(id, 'generate-summary').catch(() => {})
            nav(`/console/meeting/${id}${projectId ? `?from_project=${projectId}` : ''}`)
          }
        })
        .catch((e) => { setError(e?.message || '收尾失败'); setFinalizing(false) })
    },
    onError: (msg) => setError(msg),
  })

  // 内容驱动:转写每新增一定量(且距上次≥最小间隔)就自动分析一次——识别到问题尽快提出,
  // 不再固定时钟轮询。说得多就分析得勤,冷场就不空跑。
  useEffect(() => {
    if (!live.recording || !autoAdvice || adviceBusyRef.current) return
    if (liveTranscript.length - lastAdviceLenRef.current >= ADVICE_NEW_CHARS
        && Date.now() - lastAdviceAtRef.current >= ADVICE_MIN_GAP_MS) {
      refreshAdvice()
    }
  }, [liveTranscript, live.recording, autoAdvice, refreshAdvice])

  // 内容驱动:实时纪要提取(与 advice 共用触发条件,独立调用)
  const refreshLiveMinutes = useCallback(async () => {
    const id = liveMeetingIdRef.current
    if (!id || liveMinutesBusyRef.current) return
    liveMinutesBusyRef.current = true
    setLiveMinutesLoading(true)
    try {
      const r = await runLiveMinutes(id)
      if (r.live_minutes) setLiveMinutes(r.live_minutes)
    } catch { /* ignore */ } finally {
      liveMinutesBusyRef.current = false
      setLiveMinutesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!live.recording || liveMinutesBusyRef.current) return
    if (liveTranscript.length - lastAdviceLenRef.current >= ADVICE_NEW_CHARS
        && Date.now() - lastAdviceAtRef.current >= ADVICE_MIN_GAP_MS) {
      refreshLiveMinutes()
    }
  }, [liveTranscript, live.recording, refreshLiveMinutes])

  // memo 自动保存:每 5 秒 debounce
  useEffect(() => {
    if (!live.recording) return
    if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current)
    memoSaveTimerRef.current = setTimeout(() => {
      const id = liveMeetingIdRef.current
      if (id && memo.trim()) {
        saveMeetingMemo(id, memo).catch(() => {})
      }
    }, 5000)
    return () => { if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current) }
  }, [memo, live.recording])

  // 沉浸式录制:转写更新时自动滚到底
  useEffect(() => {
    const el = transcriptScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [liveTranscript])

  // 目标追踪:转写分段更新时,即时检查是否命中目标/任务关键词 → 高亮 + 记录
  // 关键词从 meetingGoals / keyTasks 提取,按 (seq, keyword) 去重,新增关键词也会回溯已有序列
  useEffect(() => {
    if (!liveSegments.length) return
    // 构建关键词映射:keyword → {source, label}
    const goalKWs = extractKeywords(meetingGoals).map(k => ({ keyword: k, source: 'goal' as const, label: meetingGoals }))
    const taskLines = keyTasks.split('\n').map(l => l.trim()).filter(Boolean)
    const taskKWMaps: { keyword: string; source: 'task'; label: string }[] = []
    for (const line of taskLines) {
      for (const kw of extractKeywords(line)) {
        taskKWMaps.push({ keyword: kw, source: 'task', label: line })
      }
    }
    const allKWMaps = [...goalKWs, ...taskKWMaps]
    if (!allKWMaps.length) return

    setHighlights(prev => {
      const processed = new Set(prev.map(h => h.id))
      const newItems: HighlightItem[] = []
      for (const seg of liveSegments) {
        for (const { keyword, source, label } of allKWMaps) {
          const id = `${seg.seq}-${keyword}`
          if (processed.has(id)) continue
          if (seg.text.includes(keyword)) {
            processed.add(id)
            newItems.push({
              id,
              seq: seg.seq,
              timeMs: seg.startMs,
              timeLabel: fmtDuration(Math.floor(seg.startMs / 1000)),
              text: seg.text.length > 120 ? seg.text.slice(0, 120) + '…' : seg.text,
              matchedKeyword: keyword,
              source,
              sourceLabel: label.length > 30 ? label.slice(0, 30) + '…' : label,
            })
          }
        }
      }
      return newItems.length ? [...prev, ...newItems] : prev
    })
  }, [liveSegments, meetingGoals, keyTasks])

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const handleFileChange = (f: File | null) => {
    setFileSizeError(null)
    if (f && f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFileSizeError(`音频文件 ${(f.size / 1024 / 1024).toFixed(1)} MB 超过 ${MAX_FILE_SIZE_MB} MB 限制，请压缩或裁剪后重试`)
      return
    }
    setFile(f)
  }

  // 开始半实时录音:先建一个 recording 会议,再启动分段录音
  const startRecord = async () => {
    if (starting) return
    setError(null)
    setLiveTranscript('')
    setLiveSegments([])
    setAdvice([])
    setHighlights([])
    setStarting(true)
    try {
      const r = await createRecordingMeeting({ title: title || undefined, project_id: projectId || null, agenda: agenda.trim() || undefined })
      liveMeetingIdRef.current = r.meeting_id
      segMapRef.current = {}
      pendingRef.current = []
      liveLenRef.current = 0
      lastAdviceLenRef.current = 0
      lastAdviceAtRef.current = 0
      setMemo('')
      setLiveMinutes(null)
      live.start()
    } catch (e: any) {
      setError(e?.message || '无法开始录音')
    } finally {
      setStarting(false)
    }
  }

  const onDismissAdvice = async (aid: number) => {
    const id = liveMeetingIdRef.current
    setAdvice((prev) => prev.filter((a) => a.id !== aid))
    if (id) { try { await dismissLiveAdvice(id, aid) } catch { /* ignore */ } }
  }

  // 完成:标记为已完成(成果)→ 从未决面板移除,详情页归入「已完成」
  const onResolveAdvice = async (aid: number) => {
    const id = liveMeetingIdRef.current
    setAdvice((prev) => prev.filter((a) => a.id !== aid))
    if (id) { try { await resolveLiveAdvice(id, aid) } catch { /* ignore */ } }
  }

  // 待定:存着,下次同项目调研自动带出来问 → 从本场面板移除
  const onPendAdvice = async (aid: number) => {
    const id = liveMeetingIdRef.current
    setAdvice((prev) => prev.filter((a) => a.id !== aid))
    if (id) { try { await pendLiveAdvice(id, aid) } catch { /* ignore */ } }
  }

  const uploadMut = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请选择音频文件')
      return uploadMeetingAudio(file, { title: title || file.name, project_id: projectId || null })
    },
    onSuccess: (res) => nav(`/console/meeting/${res.meeting_id}${projectId ? `?from_project=${projectId}` : ''}`),
    onError: (e: Error) => setError(e?.message || '上传失败'),
  })

  const textMut = useMutation({
    mutationFn: () => {
      if (!transcript.trim()) throw new Error('请输入文本')
      return createMeetingFromText({
        title: title || '文本会议 ' + new Date().toLocaleString(),
        transcript: transcript.trim(),
        project_id: projectId || null,
      })
    },
    onSuccess: (m) => nav(`/console/meeting/${m.id}${projectId ? `?from_project=${projectId}` : ''}`),
    onError: (e: Error) => setError(e?.message || '创建失败'),
  })

  const submitting = uploadMut.isPending || textMut.isPending
  const recordBusy = live.recording || finalizing
  const started = liveMeetingIdRef.current != null

  // 单条建议卡:沉浸式时间轴与内联面板共用。
  // showCat:显示分类标签(timeline 无分组表头,靠标签区分类别);
  // showTs:显示 [MM:SS](内联面板用;timeline 靠所在行表达时间,不重复)。
  // 与详情页(会议纪要)的建议卡样式保持一致:分类色块 chip + 优先级点 + 标题 + 建议/确认/原话
  const renderAdviceCard = (a: LiveAdviceItem, opts: { showCat?: boolean; showTs?: boolean } = {}) => {
    const cat = CAT_BY_KEY[a.category]
    return (
      <div key={a.id} className="rounded-lg border border-line bg-white px-3 py-2.5 group">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {opts.showTs && a.source_ts != null && (
              <span className="text-[11px] font-mono text-ink-muted bg-canvas px-1.5 py-0.5 rounded">[{fmtTs(a.source_ts)}]</span>
            )}
            {cat && (
              <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ color: cat.color, background: cat.color + '1a' }}>{cat.label}</span>
            )}
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIO_COLOR[a.priority] || PRIO_COLOR.medium }} />
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
            <button type="button" onClick={() => onResolveAdvice(a.id)} title="完成(标记已处理)"
              className="p-0.5 rounded text-ink-muted hover:text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
            <button type="button" onClick={() => onPendAdvice(a.id)} title="待定(存着下次调研再问)"
              className="p-0.5 rounded text-ink-muted hover:text-amber-600 hover:bg-amber-50"><Clock size={14} /></button>
            <button type="button" onClick={() => onDismissAdvice(a.id)} title="删除"
              className="p-0.5 rounded text-ink-muted hover:text-rose-600 hover:bg-rose-50"><X size={14} /></button>
          </div>
        </div>
        <div className="text-[12px] text-ink-muted leading-snug">{a.title}</div>
        {a.question && (
          <div className="text-sm text-ink font-medium leading-snug rounded-md bg-brand/5 border-l-2 border-brand px-2 py-1.5 mt-1">
            <span className="text-brand">💬 这样确认:</span>{a.question}
          </div>
        )}
        {a.recommendation && (
          <details className="mt-1.5">
            <summary className="text-[12px] text-ink-muted font-medium cursor-pointer hover:text-ink select-none marker:text-ink-muted">💡 建议</summary>
            <div className="text-[12px] text-ink-secondary mt-1 leading-snug whitespace-pre-wrap">{a.recommendation}</div>
          </details>
        )}
        {a.source_quote && (
          <div className="text-[12px] text-ink-muted mt-1.5 leading-snug border-l-2 border-line pl-2 italic">「{a.source_quote}」</div>
        )}
      </div>
    )
  }

  // ── 会议 Co-pilot 面板(record 模式录音开始前的内联占位,按分类分组)─────────────
  const renderAdvicePanel = () => (
    <div className="rounded-lg border border-line bg-canvas/30 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <Sparkles size={15} className="text-brand" /> 会议 Co-pilot
        </div>
        <div className="flex items-center gap-2.5">
          <label className="text-[11px] text-ink-muted flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={autoAdvice} onChange={(e) => setAutoAdvice(e.target.checked)} />
            自动
          </label>
          <button
            type="button"
            onClick={refreshAdvice}
            disabled={adviceLoading || !started}
            className="text-xs px-2.5 py-1 rounded-md text-white inline-flex items-center gap-1 disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
          >
            {adviceLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} 给建议
          </button>
        </div>
      </div>

      {advice.length === 0 ? (
        <p className="text-xs text-ink-muted py-10 text-center leading-relaxed">
          {started
            ? '边录边自动分析…Co-pilot 会随对话推进\n提示该追问、有歧义、可能遗漏、以及行业专属的点'
            : '开始录音后,这里会基于现场内容\n实时给出调研建议'}
        </p>
      ) : (
        <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '30rem' }}>
          {ADVICE_CATS.map((c) => {
            const items = advice.filter((a) => a.category === c.key)
            if (!items.length) return null
            return (
              <div key={c.key}>
                <div className="text-[11px] font-semibold mb-1.5" style={{ color: c.color }}>
                  {c.label}({items.length})
                </div>
                <div className="space-y-1.5">
                  {items.map((a) => renderAdviceCard(a, { showTs: true }))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── 录音器 + 实时转写(record 模式左栏) ───────────────────────────────────
  const recorderBlock = (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">半实时录音(边录边转写,支持多人会议)</label>
      {!live.supported ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2.5 leading-relaxed">
          当前浏览器不支持录音。请使用 Chrome / Edge 桌面浏览器,或改用「上传录音」。
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-canvas/40 px-5 py-6 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={finalizing || starting}
            onClick={() => { if (live.recording) { live.stop() } else { startRecord() } }}
            title={live.recording ? '停止录音' : '开始录音'}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-50 ${
              live.recording ? 'bg-red-500 ring-4 ring-red-100' : 'shadow-md hover:shadow-lg'
            }`}
            style={live.recording ? undefined : { background: BRAND_GRAD }}
          >
            {(finalizing || starting) ? <Loader2 size={24} className="animate-spin" /> : live.recording ? <Square size={22} /> : <Mic size={24} />}
          </button>
          <div className="font-mono text-xl font-bold text-ink flex items-center gap-2">
            {live.recording && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {fmtDuration(live.seconds)}
          </div>
          <p className="text-xs text-ink-muted text-center max-w-lg">
            {starting
              ? '正在启动会议…'
              : finalizing
                ? '录音结束,正在收尾并生成纪要…'
                : live.recording
                  ? '正在录音…第一段转写约 15-30 秒后出现,之后边录边出。讲完点停止生成纪要'
                  : '点麦克风开始录音。边录边转写,右侧 Co-pilot 会实时给调研建议'}
          </p>
        </div>
      )}

      {(liveTranscript || live.recording) && (
        <div className="mt-3">
          <div className="text-[11px] text-ink-muted mb-1 flex items-center gap-1.5">
            实时转写{live.recording && <span className="text-brand">· 逐段识别中</span>}
          </div>
          <div className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink-secondary leading-relaxed overflow-y-auto whitespace-pre-wrap" style={{ maxHeight: '14rem' }}>
            {liveTranscript || <span className="text-ink-muted">正在识别第一段…(约 15-30 秒)</span>}
          </div>
        </div>
      )}

      {live.error && <p className="text-[11px] text-rose-600 mt-2">{live.error}</p>}
      <p className="text-[11px] text-ink-muted mt-2">
        每 10 秒上传一段做转写,停止后自动拼接整段音频供回放并跑 AI 流水线。
      </p>
    </div>
  )

  // ── 沉浸式录制:录音中隐去所有 chrome。主体 = 左「实时转写」/ 右「会议 Co-pilot 实时建议」按时间轴逐段一一对应;
  //    「会议看板」抽离为可收起的全局总结(上次待定 + 已达成共识),从右缘把手滑入,不再吞掉实时建议。 ──
  if (recordBusy) {
    const consensusItems = advice.filter((a) => a.category === 'consensus')
    const suggestItems = advice.filter((a) => a.category !== 'consensus')
    // 建议按 source_ts(秒)落到对应转写段:落在 [本段起始, 下段起始) 的归本段;
    // 无 source_ts(LLM 偶尔不给)的挂到最后一段(最新),保证可见、贴近当前进度。
    const adviceBySeg: Record<number, LiveAdviceItem[]> = {}
    if (liveSegments.length) {
      const startSecs = liveSegments.map((s) => Math.floor(s.startMs / 1000))
      for (const a of suggestItems) {
        let idx = liveSegments.length - 1
        if (a.source_ts != null) {
          idx = 0
          for (let i = 0; i < startSecs.length; i++) if (startSecs[i] <= (a.source_ts as number)) idx = i
        }
        if (!adviceBySeg[idx]) adviceBySeg[idx] = []
        adviceBySeg[idx].push(a)
      }
    }
    const boardCount = consensusItems.length + carryover.length
    const COLS = 'grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]'

    return (
      <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
        {/* 顶栏:状态 + 计时 + 停止 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-line bg-white shrink-0">
          <div className="flex items-center gap-2.5 text-sm font-medium text-ink min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="shrink-0">{finalizing ? '正在收尾,生成纪要…' : '录音中'}</span>
            <span className="font-mono text-ink-secondary shrink-0">{fmtDuration(live.seconds)}</span>
            {title && <span className="text-ink-muted truncate">· {title}</span>}
          </div>
          <button
            type="button"
            onClick={() => { if (live.recording) live.stop() }}
            disabled={finalizing}
            className="px-4 py-1.5 rounded-lg text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60 bg-red-500 hover:bg-red-600 shrink-0"
          >
            {finalizing ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} />}
            {finalizing ? '生成中' : '停止并生成纪要'}
          </button>
        </div>

        {/* 主体:时间轴 —— 每段一行,左 [MM:SS]+转写 / 右 锚定到该段的实时建议,同行一一对应;
            会议看板(全局总结)以可收起抽屉叠在右侧。 */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={transcriptScrollRef} className="h-full overflow-y-auto">
            {/* sticky 表头:左标题 / 右 Co-pilot 控件 */}
            <div className={`${COLS} sticky top-0 z-10 bg-canvas/95 backdrop-blur border-b border-line`}>
              <div className="px-6 py-2.5 text-[11px] text-ink-muted flex items-center gap-1.5 lg:border-r border-line">
                实时转写 <span className="text-brand">· 逐段识别中</span>
              </div>
              <div className="px-4 py-2 flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink flex items-center gap-1.5 min-w-0">
                  <Sparkles size={14} className="text-brand shrink-0" /> 会议 Co-pilot · 实时建议
                  {adviceLoading && <Loader2 size={12} className="animate-spin text-ink-muted shrink-0" />}
                </span>
                <span className="flex items-center gap-2.5 shrink-0">
                  <label className="text-[11px] text-ink-muted flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={autoAdvice} onChange={(e) => setAutoAdvice(e.target.checked)} /> 自动
                  </label>
                  <button
                    type="button"
                    onClick={refreshAdvice}
                    disabled={adviceLoading || !started}
                    className="text-xs px-2.5 py-1 rounded-md text-white inline-flex items-center gap-1 disabled:opacity-50"
                    style={{ background: BRAND_GRAD }}
                  >
                    {adviceLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} 给建议
                  </button>
                </span>
              </div>
            </div>

            {/* 时间轴行 */}
            {liveSegments.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-ink-muted">正在识别第一段…(约 15-30 秒)</div>
            ) : (
              liveSegments.map((seg, i) => {
                const hit = highlights.find(h => h.seq === seg.seq)
                return (
                // 无横向格线:转写顺读,仅一条连续竖分隔(同详情页),不做成表格
                <div key={seg.seq} className={COLS}>
                  {/* 左:时间戳 + 该段转写(命中目标/任务关键词时高亮) */}
                  <div className={`px-6 py-2 lg:border-r border-line ${hit ? 'bg-amber-50 border-l-2 border-amber-400' : ''}`}>
                    <span className="text-[11px] font-mono text-ink-muted mr-2 align-top">[{fmtDuration(Math.floor(seg.startMs / 1000))}]</span>
                    <span className="text-[15px] leading-relaxed text-ink-secondary whitespace-pre-wrap">{seg.text}</span>
                    {hit && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded align-middle">
                        🎯 {hit.matchedKeyword}
                      </span>
                    )}
                  </div>
                  {/* 右:锚定到该段的实时建议(空段留白,与左段对齐) */}
                  <div className="px-4 py-2 space-y-1.5">
                    {(adviceBySeg[i] || []).map((a) => renderAdviceCard(a, { showCat: true }))}
                  </div>
                </div>
                )
              })
            )}

            {suggestItems.length === 0 && liveSegments.length > 0 && (
              <div className="px-6 py-3 text-[11px] text-ink-muted">
                边录边自动分析…Co-pilot 会随对话推进,提示该追问 / 有歧义 / 可能遗漏 / 行业专属的点。
              </div>
            )}
            {live.error && <p className="px-6 py-3 text-[12px] text-rose-600">{live.error}</p>}
          </div>

          {/* 会议看板:全局总结(上次待定 + 已达成共识),默认向右收起,点击滑入。
              实时建议留在右列时间轴,这里只做「这场对齐到哪了」的全局快照。 */}
          <div className={`absolute inset-y-0 right-0 w-[400px] max-w-[88vw] bg-canvas border-l border-line shadow-2xl flex flex-col transition-transform duration-300 ease-out z-20 ${boardOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-white shrink-0">
              <span className="text-sm font-semibold text-ink flex items-center gap-1.5">
                <ClipboardList size={15} className="text-brand" /> 会议看板 · 全局总结
              </span>
              <button type="button" onClick={() => setBoardOpen(false)} title="收起" className="text-ink-muted hover:text-ink p-0.5"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {carryover.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                  <div className="text-[12px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1"><Clock size={13} /> 上次调研待定 · 记得问({carryover.length})</div>
                  <div className="space-y-1">
                    {carryover.map((a) => (
                      <div key={a.id} className="text-[12px] text-ink-secondary leading-snug">• {a.title}{a.question && <span className="text-ink-muted">　{a.question}</span>}</div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[12px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: '#059669' }}>
                  <Check size={14} /> 已达成共识({consensusItems.length})
                </div>
                {consensusItems.length === 0 ? (
                  <p className="text-[11px] text-ink-muted">暂无 —— 双方拍板的结论会自动记到这里。</p>
                ) : (
                  <div className="space-y-1.5">
                    {consensusItems.map((a) => (
                      <div key={a.id} className="group flex items-start gap-1.5 rounded-md border border-emerald-100 bg-emerald-50/40 px-2.5 py-1.5">
                        <Check size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                        <span className="text-[13px] text-ink flex-1 min-w-0 leading-snug">{a.title}
                          {a.source_ts != null && <span className="text-[10px] font-mono text-ink-muted ml-1">[{fmtTs(a.source_ts)}]</span>}
                        </span>
                        <button type="button" onClick={() => onDismissAdvice(a.id)} title="删除" className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-rose-600 shrink-0"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 收起时:右缘把手,点开看板全局总结(实时建议不在这里,始终在右列时间轴) */}
          {!boardOpen && (
            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className="absolute right-0 top-16 z-10 inline-flex items-center gap-1 pl-2 pr-3 py-2 rounded-l-lg bg-white border border-r-0 border-line shadow-md text-[12px] font-medium text-ink-secondary hover:text-brand"
            >
              <ChevronLeft size={14} /> 看板{boardCount ? ` ${boardCount}` : ''}
            </button>
          )}

          {/* 右下角:目标追踪浮动面板(填写会议目标/重点任务,转写命中时高亮+记录) */}
          {!boardOpen && (
            <div className={`absolute bottom-4 right-4 z-20 w-[320px] max-w-[calc(100vw-2rem)] transition-all duration-300 ${goalTrackerOpen ? '' : 'translate-y-[calc(100%-2.5rem)]'}`}>
              <div className="rounded-xl border border-line bg-white shadow-2xl overflow-hidden">
                {/* 标题栏:点击折叠/展开 */}
                <div
                  onClick={() => setGoalTrackerOpen(v => !v)}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer bg-gradient-to-r from-amber-50/80 to-transparent border-b border-line"
                >
                  <span className="text-sm font-semibold text-ink flex items-center gap-1.5">
                    <Target size={15} className="text-amber-500" /> 目标追踪
                    {highlights.length > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{highlights.length}</span>
                    )}
                  </span>
                  <ChevronDown size={15} className={`text-ink-muted transition-transform ${goalTrackerOpen ? '' : 'rotate-180'}`} />
                </div>

                {/* 展开内容 */}
                {goalTrackerOpen && (
                  <div className="max-h-[380px] overflow-y-auto">
                    {/* 会议目标输入 */}
                    <div className="px-3 py-2 border-b border-line">
                      <label className="text-[11px] font-semibold text-ink-muted">本场会议主要目标？</label>
                      <textarea
                        value={meetingGoals}
                        onChange={(e) => setMeetingGoals(e.target.value)}
                        placeholder="如：确定数据迁移方案、明确API设计规范…"
                        rows={2}
                        className="w-full mt-1 px-2 py-1.5 rounded-md border border-line text-[12px] resize-none focus:outline-none focus:border-amber-400 bg-canvas/30"
                      />
                    </div>

                    {/* 重点任务输入 */}
                    <div className="px-3 py-2 border-b border-line">
                      <label className="text-[11px] font-semibold text-ink-muted">重点任务是什么？</label>
                      <textarea
                        value={keyTasks}
                        onChange={(e) => setKeyTasks(e.target.value)}
                        placeholder={'每行一个，如：\nAPI接口设计\n数据迁移方案\n性能测试计划'}
                        rows={3}
                        className="w-full mt-1 px-2 py-1.5 rounded-md border border-line text-[12px] resize-none focus:outline-none focus:border-amber-400 bg-canvas/30"
                      />
                    </div>

                    {/* 命中记录列表 */}
                    <div className="px-3 py-2">
                      <div className="text-[11px] font-semibold text-ink-muted mb-1.5">📍 命中记录</div>
                      {highlights.length === 0 ? (
                        <p className="text-[11px] text-ink-muted py-3 text-center leading-relaxed">
                          {meetingGoals || keyTasks
                            ? '会议中出现相关内容时\n会在此自动记录'
                            : '请先填写目标和任务'}
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                          {highlights.map((h) => (
                            <div key={h.id} className="rounded-md bg-amber-50/60 border border-amber-100 px-2 py-1.5">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-1 rounded">[{h.timeLabel}]</span>
                                <span className="text-[10px] text-amber-600">🎯 {h.matchedKeyword}</span>
                                <span className={`text-[9px] px-1 rounded ${h.source === 'goal' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                  {h.source === 'goal' ? '目标' : '任务'}
                                </span>
                              </div>
                              <p className="text-[11px] text-ink-secondary leading-snug line-clamp-2">{h.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`mx-auto px-6 py-8 ${mode === 'record' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <button
        onClick={() => nav(projectId ? `/console/projects/${projectId}` : '/console/meeting')}
        className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-4"
      >
        <ChevronLeft size={16} /> {projectId ? '返回项目' : '返回列表'}
      </button>

      <h1 className="text-2xl font-extrabold text-ink mb-1">新建会议</h1>
      <p className="text-sm text-ink-secondary mb-6">
        上传录音(自动转写)或直接粘贴会议文本,系统会生成纪要、待办、需求、业务流程图和干系人图谱。
      </p>

      {/* Mode tabs */}
      <div className="flex border-b border-line mb-6">
        {([
          { v: 'upload' as const, label: '上传录音', Icon: Upload },
          { v: 'record' as const, label: '实时录音', Icon: Mic },
          { v: 'text' as const, label: '粘贴文本', Icon: Type },
        ]).map(t => (
          <button
            key={t.v}
            disabled={recordBusy}
            onClick={() => { if (recordBusy) return; setMode(t.v); setError(null) }}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px disabled:opacity-40 ${
              mode === t.v
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* 标题 */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">会议标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={recordBusy}
            placeholder={mode === 'upload' ? '默认使用音频文件名' : '默认按时间生成'}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand disabled:bg-canvas"
          />
        </div>

        {/* 关联项目 */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">关联项目(可选)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={recordBusy}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand disabled:bg-canvas"
          >
            <option value="">(不关联,后续也可在详情页修改)</option>
            {(projects || []).map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.customer ? ` · ${p.customer}` : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted mt-1">
            {mode === 'record'
              ? '关联项目后,会议 Co-pilot 会结合该项目的行业 / 客户 / LTC 模块给更准的建议。'
              : '关联项目后,纪要可一键同步到 KB,干系人可叠加到项目的干系人图谱里。'}
          </p>
        </div>

        {/* Mode-specific content */}
        {mode === 'upload' ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">音频文件</label>
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-line file:bg-canvas file:text-ink hover:file:bg-canvas-elevated"
            />
            {fileSizeError && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{fileSizeError}</p>
            )}
            <p className="text-[11px] text-ink-muted mt-1">
              支持 wav / mp3 / m4a / webm 等。最大 500 MB。上传后会异步走 xiaomi ASR 转写,完成后自动跑 AI pipeline。
            </p>
          </div>
        ) : mode === 'record' ? (
          <div className="space-y-4">
            {/* 会议议程(可选) */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">会议议程(可选)</label>
              <textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                disabled={recordBusy}
                placeholder="输入本次会议议程,开始录音后将只读展示…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand disabled:bg-canvas resize-y"
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {recorderBlock}
              {renderAdvicePanel()}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">会议文本</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="粘贴或输入会议转写内容…"
              rows={12}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm font-mono focus:outline-none focus:border-brand resize-y"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              提交后立即触发 AI 流水线(润色 / 纪要 / 需求 / 流程 / 干系人)。一般 30 秒到 2 分钟出结果。
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => nav(projectId ? `/console/projects/${projectId}` : '/console/meeting')}
            disabled={submitting || recordBusy}
            className="px-4 py-2 rounded-lg border border-line text-sm text-ink hover:bg-canvas disabled:opacity-50"
          >
            取消
          </button>
          {mode !== 'record' && (
            <button
              onClick={() => {
                setError(null)
                if (mode === 'text') textMut.mutate()
                else uploadMut.mutate()
              }}
              disabled={submitting || (
                mode === 'text' ? !transcript.trim()
                : (!file || !!fileSizeError)
              )}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
              style={{ background: BRAND_GRAD }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {mode === 'text' ? '提交并生成' : '上传并转写'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
