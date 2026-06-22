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
import { Upload, Type, ChevronLeft, Loader2, Mic, Square, Sparkles, X } from 'lucide-react'
import {
  uploadMeetingAudio,
  createMeetingFromText,
  createRecordingMeeting,
  uploadAudioChunk,
  finalizeRecording,
  runLiveAdvice,
  dismissLiveAdvice,
  listProjects,
  type Project,
  type LiveAdviceItem,
  type LiveAdviceCategory,
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
]
const PRIO_COLOR: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#9ca3af' }

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
  const [liveTranscript, setLiveTranscript] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const liveMeetingIdRef = useRef<number | null>(null)
  // 分段「并行」上传:单段 ASR 延迟不稳(实测 4-25s),串行会越拖越后;并行 + 按 seq 落位排序。
  const segTextRef = useRef<Record<number, string>>({})
  const pendingRef = useRef<Promise<void>[]>([])

  // 会议 Co-pilot
  const [advice, setAdvice] = useState<LiveAdviceItem[]>([])
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [autoAdvice, setAutoAdvice] = useState(true)
  const adviceBusyRef = useRef(false)
  const liveLenRef = useRef(0)        // 当前转写长度(内容驱动触发用)
  const lastAdviceLenRef = useRef(0)  // 上次分析时的转写长度
  const lastAdviceAtRef = useRef(0)   // 上次分析时间戳

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
          segTextRef.current[seq] = r.text || ''
          const merged = Object.keys(segTextRef.current).map(Number).sort((a, b) => a - b)
            .map((k) => segTextRef.current[k]).filter(Boolean).join('\n')
          liveLenRef.current = merged.length
          setLiveTranscript(merged)
        })
        .catch(() => { /* 单段失败忽略,不中断录音 */ })
      pendingRef.current.push(p)
    },
    // 最后一段录完(stop 触发)后收尾:等所有分段上传完 → finalize → 跳详情页
    onStopped: () => {
      const id = liveMeetingIdRef.current
      if (!id) { setFinalizing(false); return }
      setFinalizing(true)
      Promise.allSettled(pendingRef.current)
        .then(() => finalizeRecording(id))
        .then((r) => {
          if (r.status === 'failed') {
            setError('没有识别到语音内容,请重试')
            setFinalizing(false)
            liveMeetingIdRef.current = null
          } else {
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
    setError(null)
    setLiveTranscript('')
    setAdvice([])
    try {
      const r = await createRecordingMeeting({ title: title || undefined, project_id: projectId || null })
      liveMeetingIdRef.current = r.meeting_id
      segTextRef.current = {}
      pendingRef.current = []
      liveLenRef.current = 0
      lastAdviceLenRef.current = 0
      lastAdviceAtRef.current = 0
      live.start()
    } catch (e: any) {
      setError(e?.message || '无法开始录音')
    }
  }

  const onDismissAdvice = async (aid: number) => {
    const id = liveMeetingIdRef.current
    setAdvice((prev) => prev.filter((a) => a.id !== aid))
    if (id) { try { await dismissLiveAdvice(id, aid) } catch { /* ignore */ } }
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

  // ── 会议 Co-pilot面板 ──────────────────────────────────────────────────────────
  const advicePanel = (
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
                  {items.map((a) => (
                    <div key={a.id} className="rounded-md border border-line bg-white px-2.5 py-2 group">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: PRIO_COLOR[a.priority] || PRIO_COLOR.medium }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-ink font-medium leading-snug">{a.title}</div>
                          {a.recommendation && (
                            <div className="text-[12px] text-ink-secondary mt-1 leading-snug whitespace-pre-wrap">
                              <span className="text-brand font-semibold">💡 建议:</span>{a.recommendation}
                            </div>
                          )}
                          {a.question && (
                            <div className="text-[12px] text-ink-muted mt-1 leading-snug">💬 这样确认:{a.question}</div>
                          )}
                          {a.rationale && (
                            <div className="text-[11px] text-ink-muted mt-1 leading-snug">{a.rationale}</div>
                          )}
                          {a.source_ts != null && (
                            <span className="text-[10px] text-ink-muted mt-1 inline-block font-mono">[{fmtTs(a.source_ts)}]</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDismissAdvice(a.id)}
                          title="忽略"
                          className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-ink shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
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
            disabled={finalizing}
            onClick={() => { if (live.recording) { live.stop() } else { startRecord() } }}
            title={live.recording ? '停止录音' : '开始录音'}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-50 ${
              live.recording ? 'bg-red-500 ring-4 ring-red-100' : 'shadow-md hover:shadow-lg'
            }`}
            style={live.recording ? undefined : { background: BRAND_GRAD }}
          >
            {finalizing ? <Loader2 size={24} className="animate-spin" /> : live.recording ? <Square size={22} /> : <Mic size={24} />}
          </button>
          <div className="font-mono text-xl font-bold text-ink flex items-center gap-2">
            {live.recording && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {fmtDuration(live.seconds)}
          </div>
          <p className="text-xs text-ink-muted text-center max-w-lg">
            {finalizing
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {recorderBlock}
            {advicePanel}
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
