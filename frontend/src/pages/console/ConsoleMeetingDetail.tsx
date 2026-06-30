/**
 * ConsoleMeetingDetail — 会议详情(多 tab)
 *
 * 6 个 tab:
 *  - overview: 元信息 + 关联项目编辑 + 主要操作
 *  - transcript: raw / polished 双栏(编辑保存)
 *  - minutes: 摘要 / 关键议题 / 决议 / 待办 / 未决(JSON 可视化)
 *  - requirements: 需求清单表格
 *  - stakeholders: 干系人列表 + 关系列表(reactflow 后续接入)
 *  - actions: 同步 KB / 飞书导出 / 多维表同步 / 单点 actions
 */
import { useState, useEffect, useMemo, useRef, createContext, useContext, Fragment } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  ChevronLeft, Loader2, RefreshCw, Trash2, FolderKanban, CheckCircle2, AlertCircle, Mic,
  FileText, ListChecks, Users, Settings as SettingsIcon, Info, ExternalLink, Save,
  Download, Pencil, X, Check, Clock, Share2, GitBranch, ChevronRight, Palette,
  Maximize2, Copy, Sparkles,
} from 'lucide-react'
import {
  getMeeting, deleteMeeting, processMeeting, patchMeeting, linkMeetingProject,
  runMeetingAction, syncMeetingToKB, syncMeetingStakeholdersToKB,
  exportMeetingToFeishu, syncMeetingRequirementsToBitable,
  syncActionItemsToBitable, createActionKanban, checkFeishuUrl,
  getIllustrationStyles, type IllustrationStyle, type IllustrationStylesResponse,
  listProjects, getFeishuCredentials, putFeishuCredentials, deleteFeishuCredentials,
  exportMeetingDocxUrl, TOKEN_STORAGE_KEY,
  putMeetingStakeholderMap, patchMeetingRequirement, renameStakeholderRefs,
  createMeetingRequirement, deleteMeetingRequirement,
  syncMeetingStakeholdersToProject,
  type Meeting, type MeetingStatus, type MeetingMinutes, type MeetingRequirement,
  type StakeholderItem, type FeishuUrlCheckResult,
  type MeetingIllustration,
  getLiveAdvice, runLiveAdvice, resolveLiveAdvice, dismissLiveAdvice, pendLiveAdvice,
  type LiveAdviceItem, type LiveAdviceCategory,
} from '../../api/client'
import { getMeetingAudioUrl } from '../../api/meeting-ext'
import AudioPlayer, { type AudioPlayerHandle } from '../../components/AudioPlayer'
import ChatWidget from '../../components/ChatSidebar'
import MeetingShareModal from '../../components/MeetingShareModal'
import { toast } from '../../components/Toaster'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TemplateSelector from '../../components/TemplateSelector'
import { MermaidBlock } from '../../components/markdown/ReportMarkdown'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
type TopView = 'overview' | 'split' | 'actions'
type LeftTab = 'minutes' | 'advice' | 'requirements' | 'process_flows' | 'stakeholders' | 'illustrations'
type RightTab = 'transcript' | 'polished'

// ── 时间戳跳转 Context ────────────────────────────────────────────────────

export const SeekToContext = createContext<((seconds: number) => void) | null>(null)

/** 格式化秒数为 MM:SS */
export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 可点击的时间戳标记 */
function TimestampBadge({ seconds, label }: { seconds: number | null | undefined; label?: string }) {
  const seekTo = useContext(SeekToContext)
  if (seconds == null || !Number.isFinite(seconds)) return null
  const text = label || fmtSeconds(seconds)
  if (!seekTo) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted bg-gray-100 px-1.5 py-0.5 rounded">
        <Clock size={10} /> {text}
      </span>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); seekTo(seconds) }}
      className="inline-flex items-center gap-0.5 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-pointer"
      title={`跳转到 ${text}`}
    >
      <Clock size={10} /> {text}
    </button>
  )
}

/** 显示时间区间,如 "03:20 - 05:00" */
function TimeRangeBadge({ start, end }: { start: number | null | undefined; end: number | null | undefined }) {
  const seekTo = useContext(SeekToContext)
  const s = fmtSeconds(start)
  const e = fmtSeconds(end)
  if (!s && !e) return null
  if (s && e) {
    if (!seekTo) {
      return (
        <span className="text-[10px] text-ink-muted bg-gray-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
          <Clock size={10} /> {s} - {e}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px]">
        <button
          onClick={(ev) => { ev.stopPropagation(); seekTo(start!) }}
          className="text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-pointer inline-flex items-center gap-0.5"
          title={`从 ${s} 开始播放`}
        >
          <Clock size={10} /> {s}
        </button>
        <span className="text-ink-muted">-</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); seekTo(end!) }}
          className="text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-pointer inline-flex items-center gap-0.5"
          title={`跳转到 ${e}`}
        >
          {e}
        </button>
      </span>
    )
  }
  // 只有一个
  return <TimestampBadge seconds={start || end} />
}

const TOP_VIEWS: Array<{ key: TopView; label: string; Icon: typeof Info }> = [
  { key: 'split',    label: '分栏', Icon: FileText },
  { key: 'overview', label: '概览', Icon: Info },
  { key: 'actions',  label: '操作', Icon: SettingsIcon },
]

const LEFT_TABS: Array<{ key: LeftTab; label: string; Icon: typeof Info }> = [
  { key: 'minutes',       label: '纪要',     Icon: ListChecks },
  { key: 'advice',        label: 'Co-pilot 建议', Icon: Sparkles },
  { key: 'requirements',  label: '需求清单', Icon: ListChecks },
  { key: 'process_flows', label: '业务流程', Icon: GitBranch },
  { key: 'stakeholders',  label: '干系人',   Icon: Users },
  { key: 'illustrations', label: '解释图',   Icon: Palette },
]

const RIGHT_TABS: Array<{ key: RightTab; label: string; Icon: typeof Info }> = [
  { key: 'transcript', label: '原文',   Icon: FileText },
  { key: 'polished',   label: 'AI润色', Icon: FileText },
]

// ── 会议 Co-pilot 建议(会后复盘:展示调研建议,先给方案再引导客户确认) ──────────
const ADVICE_CATS: { key: LiveAdviceCategory; label: string; color: string }[] = [
  { key: 'clarification', label: '需进一步明确', color: '#2563eb' },
  { key: 'ambiguity',     label: '歧义点',       color: '#d97706' },
  { key: 'gap',           label: '可能遗漏(影响方案)', color: '#dc2626' },
  { key: 'industry',      label: '行业专属问题', color: '#7c3aed' },
  { key: 'consensus',     label: '已达成共识',   color: '#059669' },
]
const ADVICE_PRIO: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#9ca3af' }

// 转写分段:把转写按时间戳拆成段,供建议按 source_ts 落段对齐。兼容两种格式:
//  1) 录音边录边传:行首 [MM:SS]/[HH:MM:SS] + 同行正文;
//  2) 妙记/飞书上传:「说话人 N HH:MM:SS」/「@张三 HH:MM:SS」表头行 + 正文在后续行。
// 无时间戳的行并入上一段(多行发言、前导的录音主题/时间等)。
type TxSeg = { ts: number | null; text: string }
const TS_AT_START = /^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/
const SPEAKER_HEADER = /^\s*(?:说话人\s*\d+|@\S{1,20}|\S{1,16})?\s*(\d{1,2}):(\d{2}):(\d{2})\s*$/
function parseTxSegments(raw: string): TxSeg[] {
  const segs: TxSeg[] = []
  for (const rawLine of (raw || '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const mStart = line.match(TS_AT_START)
    if (mStart) {
      const ts = mStart[3] != null ? +mStart[1] * 3600 + +mStart[2] * 60 + +mStart[3] : +mStart[1] * 60 + +mStart[2]
      segs.push({ ts, text: (mStart[4] || '').trim() })
      continue
    }
    const mHead = line.match(SPEAKER_HEADER)
    if (mHead) {
      segs.push({ ts: +mHead[1] * 3600 + +mHead[2] * 60 + +mHead[3], text: '' })
      continue
    }
    if (segs.length) {
      const last = segs[segs.length - 1]
      last.text += (last.text ? '\n' : '') + line
    } else {
      segs.push({ ts: null, text: line })
    }
  }
  return segs.filter((s) => s.text || s.ts != null)
}

// 时间戳秒 → MM:SS(超 1 小时显示 H:MM:SS),跳转条标签用
const fmtClock = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function AdviceTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [showDone, setShowDone] = useState(false)
  const [activeAdvice, setActiveAdvice] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const segRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [leftPct, setLeftPct] = useState(52)  // 转写/建议分栏左侧占比,中缝可拖
  const onSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const rect = scrollRef.current?.getBoundingClientRect()
      if (!rect || !rect.width) return
      setLeftPct(Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100)))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const { data, isLoading } = useQuery({
    queryKey: ['meeting-advice', meeting.id],
    queryFn: () => getLiveAdvice(meeting.id, true),
  })
  const advice: LiveAdviceItem[] = data?.advice || []
  const resolved: LiveAdviceItem[] = data?.resolved_advice || []
  const carryover: LiveAdviceItem[] = data?.carryover || []
  const genMut = useMutation({
    mutationFn: () => runLiveAdvice(meeting.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-advice', meeting.id] }),
  })
  const resolveMut = useMutation({
    mutationFn: (aid: number) => resolveLiveAdvice(meeting.id, aid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-advice', meeting.id] }),
  })
  const dismissMut = useMutation({
    mutationFn: (aid: number) => dismissLiveAdvice(meeting.id, aid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-advice', meeting.id] }),
  })
  const pendMut = useMutation({
    mutationFn: (aid: number) => pendLiveAdvice(meeting.id, aid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-advice', meeting.id] }),
  })

  // 转写分段 + 建议落段:advice.id → 出处段下标(点建议时左栏定位用)
  const segs = useMemo(() => parseTxSegments(meeting.raw_transcript || ''), [meeting.raw_transcript])
  const hasTimeline = segs.some((s) => s.ts != null)
  const adviceToSeg: Record<number, number> = {}
  const adviceBySeg: Record<number, LiveAdviceItem[]> = {}
  const unlocated: LiveAdviceItem[] = []
  if (hasTimeline) {
    for (const a of advice) {
      if (a.source_ts == null) { unlocated.push(a); continue }
      let idx = -1
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].ts != null && (segs[i].ts as number) <= (a.source_ts as number)) idx = i
      }
      if (idx >= 0) { adviceToSeg[a.id] = idx; (adviceBySeg[idx] = adviceBySeg[idx] || []).push(a) }
      else unlocated.push(a)
    }
  }
  const adviceSegs = new Set(Object.values(adviceToSeg))
  const sortedAdvice = [...advice].sort((a, b) => (a.source_ts ?? 1e9) - (b.source_ts ?? 1e9))
  const activeSeg = activeAdvice != null && adviceToSeg[activeAdvice] != null ? adviceToSeg[activeAdvice] : -1

  // 点建议:整块(转写+建议一起)滚到该建议所在行并居中,行内两侧一起高亮
  const jumpTo = (a: LiveAdviceItem) => {
    setActiveAdvice(a.id)
    const c = scrollRef.current
    const el = cardRefs.current[a.id] || (adviceToSeg[a.id] != null ? segRefs.current[adviceToSeg[a.id]] : null)
    if (c && el) c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2), behavior: 'smooth' })
  }

  const renderCard = (a: LiveAdviceItem) => {
    const cat = ADVICE_CATS.find((c) => c.key === a.category)
    const color = cat?.color || '#6b7280'
    const on = activeAdvice === a.id
    return (
      <div key={a.id} ref={(el) => { cardRefs.current[a.id] = el }}
        className={`rounded-lg border bg-white px-3 py-2.5 group transition-shadow ${on ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {a.source_ts != null && <TimestampBadge seconds={a.source_ts} />}
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ color, background: color + '1a' }}>
              {cat?.label || a.category_label}
            </span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ADVICE_PRIO[a.priority] || ADVICE_PRIO.medium }} />
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
            <button type="button" onClick={() => resolveMut.mutate(a.id)} title="完成(标记已处理)"
              className="p-0.5 rounded text-ink-muted hover:text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
            <button type="button" onClick={() => pendMut.mutate(a.id)} title="待定(存着下次调研再问)"
              className="p-0.5 rounded text-ink-muted hover:text-amber-600 hover:bg-amber-50"><Clock size={14} /></button>
            <button type="button" onClick={() => dismissMut.mutate(a.id)} title="删除"
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

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
            <Sparkles size={16} className="text-brand" /> 会议 Co-pilot 建议
          </h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            右侧竖轴每点一条建议(颜色=类型,悬停看时间/类型,点击跳转);中缝可拖动调宽窄;✓完成、✕删除。
          </p>
        </div>
        <button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md text-white inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
          style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
        >
          {genMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {advice.length ? '重新分析' : '生成建议'}
        </button>
      </div>

      {carryover.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <div className="text-[12px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
            <Clock size={13} /> 上次调研待定 · 本次记得问({carryover.length})
          </div>
          <div className="space-y-1">
            {carryover.map((a) => (
              <div key={a.id} className="text-[12px] text-ink-secondary leading-snug">
                • {a.title}
                {a.question && <span className="text-ink-muted">　{a.question}</span>}
                {a.from_meeting_title && <span className="text-ink-muted/70 text-[11px]">(来自:{a.from_meeting_title})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-ink-muted py-10 text-center">加载中…</div>
      ) : advice.length === 0 && resolved.length === 0 ? (
        <div className="text-sm text-ink-muted py-12 text-center leading-relaxed">
          还没有建议。点右上「生成建议」,让 Co-pilot 基于本次会议内容分析一轮。
        </div>
      ) : (
        <>
          {advice.length === 0 ? (
            <div className="text-[13px] text-ink-muted py-4 text-center">未决建议已全部处理 ✓</div>
          ) : hasTimeline ? (
            <div className="flex gap-1.5">
              {/* 左:转写/建议分栏(中缝可拖动改宽窄,每段行内对齐一起滚动) */}
              <div ref={scrollRef} className="relative overflow-y-auto flex-1 min-w-0" style={{ maxHeight: '60vh' }}>
                <div className="grid" style={{ gridTemplateColumns: `${leftPct}% ${100 - leftPct}%` }}>
                  {segs.map((seg, i) => (
                    <Fragment key={i}>
                      <div
                        ref={(el) => { segRefs.current[i] = el }}
                        className={`px-2 py-1.5 rounded-l-md transition-colors ${activeSeg === i ? 'bg-brand/10' : ''}`}
                      >
                        <div className="flex gap-2">
                          {seg.ts != null && (
                            <span className="shrink-0 mt-0.5 flex items-center gap-1">
                              <TimestampBadge seconds={seg.ts} />
                              {adviceSegs.has(i) && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" title="此处有建议" />}
                            </span>
                          )}
                          <span className="text-[13px] text-ink-secondary leading-relaxed whitespace-pre-wrap flex-1 min-w-0">{seg.text}</span>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 border-l border-line space-y-2 transition-colors ${activeSeg === i ? 'bg-brand/5' : ''}`}>
                        {(adviceBySeg[i] || []).map(renderCard)}
                      </div>
                    </Fragment>
                  ))}
                </div>
                {unlocated.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-line">
                    <div className="text-[11px] text-ink-muted mb-1.5 px-2">未定位到具体时间</div>
                    <div className="space-y-2.5 px-2">{unlocated.map(renderCard)}</div>
                  </div>
                )}
                {/* 拖动中缝 */}
                <div onMouseDown={onSplitDrag} title="拖动调整左右宽度"
                  className="absolute top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand/30 z-10"
                  style={{ left: `calc(${leftPct}% - 3px)` }} />
              </div>
              {/* 右:竖向时间轴 —— 每条建议一个胶囊药丸,内含时间戳;颜色=类型,hover 看类型名,点击跳转 */}
              {sortedAdvice.length > 0 && (
                <div className="flex flex-col items-end gap-1 overflow-y-auto py-1 shrink-0" style={{ maxHeight: '60vh', minWidth: 56 }}>
                  {sortedAdvice.map((a) => {
                    const cat = ADVICE_CATS.find((c) => c.key === a.category)
                    const color = cat?.color || '#6b7280'
                    const on = activeAdvice === a.id
                    const timeText = a.source_ts != null ? fmtClock(a.source_ts) : '—:—'
                    return (
                      <button key={a.id} type="button" onClick={() => jumpTo(a)}
                        title={`${timeText} · ${cat?.label || a.category_label}`}
                        className="rounded-full transition-all shrink-0 font-mono text-[10px] leading-none px-2 py-1 border whitespace-nowrap hover:brightness-95"
                        style={{
                          background: `${color}1a`,
                          borderColor: `${color}80`,
                          color,
                          fontWeight: on ? 700 : 500,
                          boxShadow: on ? `0 0 0 2px ${color}33` : undefined,
                        }}>
                        {timeText}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedAdvice.map(renderCard)}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setShowDone((s) => !s)}
                className="text-[12px] text-ink-secondary inline-flex items-center gap-1.5 hover:text-ink"
              >
                <CheckCircle2 size={14} className="text-emerald-600" /> 已完成 ({resolved.length})
                <ChevronRight size={13} className={`transition-transform ${showDone ? 'rotate-90' : ''}`} />
              </button>
              {showDone && (
                <div className="space-y-1.5 mt-2">
                  {resolved.map((a) => (
                    <div key={a.id} className="rounded-lg border border-line bg-canvas/30 px-3 py-2 flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-ink-muted leading-snug">{a.title}</div>
                        {a.source_ts != null && <div className="mt-1"><TimestampBadge seconds={a.source_ts} /></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const cfg = {
    recording:  { cls: 'bg-amber-50 border-amber-200 text-amber-700',     Icon: Mic,           label: '录制中' },
    processing: { cls: 'bg-blue-50 border-blue-200 text-blue-700',         Icon: Loader2,       label: '处理中' },
    completed:  { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', Icon: CheckCircle2, label: '已完成' },
    failed:     { cls: 'bg-rose-50 border-rose-200 text-rose-700',          Icon: AlertCircle,  label: '失败' },
  }[status]
  if (!cfg) return null
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

export function fmt(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

// ── Tab: Overview ─────────────────────────────────────────────────────────

export function OverviewTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState(meeting.project_id || '')
  useEffect(() => { setProjectId(meeting.project_id || '') }, [meeting.project_id])

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const linkMut = useMutation({
    mutationFn: () => linkMeetingProject(meeting.id, projectId || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <Field label="标题" value={meeting.title} />
      <Field label="状态">
        <div className="flex items-center gap-2">
          <StatusBadge status={meeting.status} />
          {meeting.asr_engine && (
            <span className="text-[11px] text-ink-muted">ASR: {meeting.asr_engine}</span>
          )}
        </div>
      </Field>
      <Field label="创建时间" value={fmt(meeting.created_at)} />
      {meeting.end_time && <Field label="结束时间" value={fmt(meeting.end_time)} />}

      <Field label="关联项目">
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-md border border-line text-sm bg-white"
          >
            <option value="">(不关联)</option>
            {(projects || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => linkMut.mutate()}
            disabled={linkMut.isPending || projectId === (meeting.project_id || '')}
            className="px-3 py-1.5 rounded-md text-sm bg-canvas hover:bg-canvas-elevated border border-line text-ink disabled:opacity-50"
          >
            {linkMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '保存'}
          </button>
        </div>
      </Field>

      {(meeting.kb_doc_id || meeting.feishu_url) && (
        <Field label="已发布">
          <div className="space-y-1 text-sm">
            {meeting.kb_doc_id && (
              <div>
                <span className="text-ink-muted">KB 纪要:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.kb_url || '#'} target="_blank" rel="noreferrer">
                  /documents/{meeting.kb_doc_id.slice(0, 8)}… <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
            {meeting.stakeholder_kb_doc_id && (
              <div>
                <span className="text-ink-muted">KB 干系人:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.stakeholder_kb_url || '#'} target="_blank" rel="noreferrer">
                  /documents/{meeting.stakeholder_kb_doc_id.slice(0, 8)}… <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
            {meeting.feishu_url && (
              <div>
                <span className="text-ink-muted">飞书文档:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.feishu_url} target="_blank" rel="noreferrer">
                  打开 <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
          </div>
        </Field>
      )}
    </div>
  )
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
      <div className="text-sm text-ink-muted pt-1">{label}</div>
      <div className="text-sm text-ink">{children ?? (value || <span className="text-ink-muted">-</span>)}</div>
    </div>
  )
}

// ── Tab: Transcript ──────────────────────────────────────────────────────

export function TranscriptTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [raw, setRaw] = useState(meeting.raw_transcript || '')
  const [polished, setPolished] = useState(meeting.polished_transcript || '')
  useEffect(() => {
    setRaw(meeting.raw_transcript || '')
    setPolished(meeting.polished_transcript || '')
  }, [meeting.id, meeting.raw_transcript, meeting.polished_transcript])

  const saveMut = useMutation({
    mutationFn: () => patchMeeting(meeting.id, { raw_transcript: raw, polished_transcript: polished }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('转写已保存')
    },
  })

  const polishMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'polish'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('润色任务已触发')
    },
  })

  const dirty = raw !== (meeting.raw_transcript || '') || polished !== (meeting.polished_transcript || '')

  // Cmd/Ctrl+S 保存(2026-05-12)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saveMut.isPending) saveMut.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saveMut.isPending])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-muted">原始转写 + 润色版本。可手动编辑后保存,或重新触发润色。</div>
        <div className="flex gap-2">
          <button
            onClick={() => polishMut.mutate()}
            disabled={polishMut.isPending || !raw}
            className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {polishMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新润色
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ background: BRAND_GRAD }}
          >
            {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            保存
          </button>
        </div>
      </div>

      {/* 2026-05-12 加宽:用全宽 + 双栏 + 高 textarea(占据 viewport 65%) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <div className="text-xs font-medium text-ink-muted mb-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
            原始转写(ASR 输出)
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-line text-sm font-mono leading-relaxed resize-y bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
            style={{ height: 'calc(100vh - 360px)', minHeight: 480 }}
          />
        </div>
        <div className="flex flex-col">
          <div className="text-xs font-medium text-ink-muted mb-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            润色版本
          </div>
          <textarea
            value={polished}
            onChange={(e) => setPolished(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-line text-sm leading-relaxed resize-y bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
            style={{ height: 'calc(100vh - 360px)', minHeight: 480 }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Tab: Minutes ─────────────────────────────────────────────────────────

export function MinutesTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const m: MeetingMinutes = meeting.meeting_minutes || {}
  const [editing, setEditing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'summarize'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  // 元信息 + 摘要的本地草稿(用户改字段时缓存,点保存才落库)
  const [draft, setDraft] = useState<MeetingMinutes>(m)
  useEffect(() => { setDraft(m) }, [meeting.id, meeting.meeting_minutes])

  const saveMut = useMutation({
    mutationFn: () => patchMeeting(meeting.id, { meeting_minutes: { ...m, ...draft } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setEditing(false)
      toast.success('纪要已保存')
    },
  })

  // Cmd/Ctrl+S 触发保存,Esc 退出编辑(2026-05-12)
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (!saveMut.isPending) saveMut.mutate()
      } else if (e.key === 'Escape') {
        setDraft(m); setEditing(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, saveMut.isPending])

  if (!meeting.meeting_minutes) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <ListChecks size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未生成纪要</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即生成
        </button>
      </div>
    )
  }

  // 元信息字段(模板表头):优先 minutes 抽取的,缺时回退 meeting 自带
  const metaTime = m.meeting_time || (meeting.start_time
    ? new Date(meeting.start_time).toLocaleString('zh-CN', { hour12: false })
    : '')
  const metaTitle = m.meeting_title || meeting.title || '(未命名会议)'

  return (
    <div className="space-y-4">
      {/* Top bar:操作按钮 */}
      <div className="flex justify-end gap-2">
        {editing ? (
          <>
            <button
              onClick={() => { setDraft(m); setEditing(false) }}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
            >
              <X size={13} /> 取消
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: BRAND_GRAD }}
            >
              {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              保存
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
            >
              <Pencil size={13} /> 编辑
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
              title={meeting.project_id ? '分享给项目成员或其他用户' : '分享给指定用户'}
            >
              <Share2 size={13} /> 分享
            </button>
            <button
              onClick={() => {
                // 程序化下载：fetch → Blob → 强制 .docx 文件名，不依赖服务器 Content-Disposition
                const token = localStorage.getItem(TOKEN_STORAGE_KEY)
                const safeTitle = (meeting.title || '会议纪要').replace(/[/\\:*?"<>|]/g, '_')
                fetch(exportMeetingDocxUrl(meeting.id), {
                  headers: { Authorization: `Bearer ${token}` },
                })
                  .then(async resp => {
                    if (!resp.ok) {
                      const text = await resp.text().catch(() => '')
                      throw new Error(text || `导出失败 (${resp.status})`)
                    }
                    return resp.blob()
                  })
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${safeTitle}.docx`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  })
                  .catch(err => toast.error(`docx 导出失败: ${err.message}`))
              }}
              className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 hover:opacity-90"
              style={{ background: BRAND_GRAD }}
              title="按模板生成 docx 下载"
            >
              <Download size={13} /> 导出 docx
            </button>
            <button
              onClick={() => regenMut.mutate()}
              disabled={regenMut.isPending}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
            >
              {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重新生成
            </button>
          </>
        )}
      </div>

      {/* 纪要主体:模板风格的表格化展示 */}
      <div className="border border-line rounded-lg overflow-hidden bg-white shadow-sm">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b-2 border-ink/10 text-center"
             style={{ background: 'linear-gradient(135deg, #FFF8F0, #FFF4E6)' }}>
          <h2 className="text-base font-bold text-ink tracking-wide">{metaTitle}</h2>
        </div>

        {/* 元信息表(2 列 × 多行) */}
        <div className="grid grid-cols-[120px_1fr_120px_1fr] text-[13px] border-b border-line">
          <MetaCell label="会议名称" editing={editing}
            value={draft.meeting_title || metaTitle}
            onChange={v => setDraft({ ...draft, meeting_title: v })}>
            {metaTitle}
          </MetaCell>
          <MetaCell label="召集人员" editing={editing}
            value={draft.organizer || ''}
            onChange={v => setDraft({ ...draft, organizer: v })}>
            {m.organizer || '—'}
          </MetaCell>
          <MetaCell label="会议时间" editing={editing}
            value={draft.meeting_time || ''}
            onChange={v => setDraft({ ...draft, meeting_time: v })}>
            {metaTime || '—'}
          </MetaCell>
          <MetaCell label="会议地点" editing={editing}
            value={draft.meeting_location || ''}
            onChange={v => setDraft({ ...draft, meeting_location: v })}>
            {m.meeting_location || '—'}
          </MetaCell>
          <MetaCell label="会议主持" editing={editing}
            value={draft.meeting_host || ''}
            onChange={v => setDraft({ ...draft, meeting_host: v })}>
            {m.meeting_host || '—'}
          </MetaCell>
          <MetaCell label="会议记录" editing={editing}
            value={draft.meeting_recorder || ''}
            onChange={v => setDraft({ ...draft, meeting_recorder: v })}>
            {m.meeting_recorder || '—'}
          </MetaCell>
          <MetaCell label="会议形式" span={3} editing={editing}
            value={draft.meeting_format || ''}
            onChange={v => setDraft({ ...draft, meeting_format: v })}>
            {m.meeting_format || '—'}
          </MetaCell>
          <MetaCell label="参会人员" span={3} editing={editing}
            value={(draft.attendees || []).join('\n')}
            onChange={v => setDraft({ ...draft, attendees: v.split(/\n+/).map(s => s.trim()).filter(Boolean) })}
            multiline
            hint="每行一个,如「客户方:xxx、xxx」">
            {m.attendees && m.attendees.length > 0
              ? <div className="flex flex-wrap gap-1.5">
                  {m.attendees.map((a, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[12px] text-ink">{a}</span>
                  ))}
                </div>
              : '—'}
          </MetaCell>
        </div>

        {/* 会议主题及内容 */}
        <div className="px-5 py-3 border-b border-line bg-canvas">
          <h3 className="text-sm font-bold text-ink">会议主题及内容</h3>
        </div>
        <div className="px-5 py-4 border-b border-line space-y-4 text-[13px] leading-relaxed">
          {(m.summary || editing) && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1">会议摘要</div>
              {editing ? (
                <textarea
                  value={draft.summary || ''}
                  onChange={e => setDraft({ ...draft, summary: e.target.value })}
                  rows={4}
                  placeholder="2-4 句话概括会议核心内容"
                  className="w-full px-3 py-2 rounded border border-orange-200 text-[13px] leading-relaxed focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                />
              ) : (
                <p className="text-ink">{m.summary}</p>
              )}
            </div>
          )}
          {/* 会议主题(key_points)— edit 模式下支持增删改 */}
          {(editing || (m.key_points && m.key_points.length > 0)) && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-2 flex items-center justify-between">
                <span>会议主题</span>
                {editing && (
                  <button
                    onClick={() => setDraft({ ...draft, key_points: [...(draft.key_points || []), { topic: '', content: '' }] })}
                    className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-0.5 normal-case tracking-normal font-normal"
                  >
                    + 添加议题
                  </button>
                )}
              </div>
              {editing ? (
                <ol className="space-y-2.5 list-none">
                  {(draft.key_points || []).map((kp, i) => (
                    <li key={i} className="flex gap-2 items-start group">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-bold inline-flex items-center justify-center mt-1">{i + 1}</span>
                      <div className="flex-1 space-y-1">
                        <input
                          value={kp.topic}
                          onChange={e => {
                            const next = [...(draft.key_points || [])]
                            next[i] = { ...next[i], topic: e.target.value }
                            setDraft({ ...draft, key_points: next })
                          }}
                          placeholder="议题名称"
                          className="w-full px-2 py-1 rounded border border-orange-200 text-sm font-semibold focus:outline-none focus:border-orange-400"
                        />
                        <textarea
                          value={kp.content}
                          onChange={e => {
                            const next = [...(draft.key_points || [])]
                            next[i] = { ...next[i], content: e.target.value }
                            setDraft({ ...draft, key_points: next })
                          }}
                          rows={3}
                          placeholder="讨论要点归纳"
                          className="w-full px-2 py-1 rounded border border-orange-200 text-[12.5px] leading-relaxed focus:outline-none focus:border-orange-400"
                        />
                      </div>
                      <button
                        onClick={() => setDraft({ ...draft, key_points: (draft.key_points || []).filter((_, j) => j !== i) })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 mt-1 text-ink-muted hover:text-rose-600"
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="space-y-2.5 list-none">
                  {(m.key_points || []).map((kp, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-bold inline-flex items-center justify-center">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-ink flex items-center gap-2">
                          {kp.topic}
                          <TimeRangeBadge start={(kp as any).start_seconds} end={(kp as any).end_seconds} />
                        </div>
                        <div className="text-[12.5px] text-ink-secondary mt-0.5 whitespace-pre-wrap">{kp.content}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* 决议事项 */}
          {(editing || (m.decisions && m.decisions.length > 0)) && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-2 flex items-center justify-between">
                <span>决议事项</span>
                {editing && (
                  <button
                    onClick={() => setDraft({ ...draft, decisions: [...(draft.decisions || []), { content: '', owner: '' }] })}
                    className="text-[11px] text-orange-600 hover:text-orange-700 normal-case tracking-normal font-normal"
                  >
                    + 添加决议
                  </button>
                )}
              </div>
              {editing ? (
                <ul className="space-y-1.5 text-[13px]">
                  {(draft.decisions || []).map((d, i) => (
                    <li key={i} className="flex gap-2 items-start group">
                      <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-2" />
                      <textarea
                        value={d.content}
                        onChange={e => {
                          const next = [...(draft.decisions || [])]
                          next[i] = { ...next[i], content: e.target.value }
                          setDraft({ ...draft, decisions: next })
                        }}
                        rows={2}
                        placeholder="决议内容"
                        className="flex-1 px-2 py-1 rounded border border-orange-200 text-[13px] focus:outline-none focus:border-orange-400"
                      />
                      <input
                        value={d.owner || ''}
                        onChange={e => {
                          const next = [...(draft.decisions || [])]
                          next[i] = { ...next[i], owner: e.target.value }
                          setDraft({ ...draft, decisions: next })
                        }}
                        placeholder="负责人"
                        className="w-24 px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400"
                      />
                      <button
                        onClick={() => setDraft({ ...draft, decisions: (draft.decisions || []).filter((_, j) => j !== i) })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-muted hover:text-rose-600 mt-1"
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-1 text-[13px]">
                  {(m.decisions || []).map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span className="flex-1 text-ink">
                        {d.content}
                        {d.owner && <span className="text-ink-muted text-[12px] ml-1">(负责人:{d.owner})</span>}
                        <span className="ml-2"><TimeRangeBadge start={(d as any).start_seconds} end={(d as any).end_seconds} /></span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 待办项 */}
        <div className="px-5 py-3 border-b border-line bg-canvas flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">待办项</h3>
          {editing && (
            <button
              onClick={() => setDraft({ ...draft, action_items: [...(draft.action_items || []), { task: '', owner: '', deadline: '', priority: 'medium', remark: '' }] })}
              className="text-[11px] text-orange-600 hover:text-orange-700"
            >+ 添加待办</button>
          )}
        </div>
        <ActionItemsList
          items={editing ? (draft.action_items || []) : (m.action_items || [])}
          editing={editing}
          onChange={(next) => setDraft({ ...draft, action_items: next })}
        />

        {/* 待确认项 */}
        <div className="px-5 py-3 border-b border-line bg-canvas flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">待确认项</h3>
          {editing && (
            <button
              onClick={() => setDraft({ ...draft, unresolved: [...(draft.unresolved || []), { issue: '', owner: '', reason: '', remark: '' }] })}
              className="text-[11px] text-orange-600 hover:text-orange-700"
            >+ 添加待确认</button>
          )}
        </div>
        <UnresolvedList
          items={editing ? (draft.unresolved || []) : (m.unresolved || [])}
          editing={editing}
          onChange={(next) => setDraft({ ...draft, unresolved: next })}
        />
      </div>

      <p className="text-[11px] text-ink-muted text-center">
        以上信息为本次会议沟通概要,部分细节可在后续阶段进一步细化落地。
      </p>

      <MeetingShareModal
        meetingId={meeting.id}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}

/** 待办项列表(view + edit 切换) */
function ActionItemsList({
  items, editing, onChange,
}: {
  items: NonNullable<MeetingMinutes['action_items']>
  editing: boolean
  onChange: (next: NonNullable<MeetingMinutes['action_items']>) => void
}) {
  if (!editing) {
    if (items.length === 0) {
      return <div className="px-5 py-4 text-[12.5px] text-ink-muted text-center border-b border-line">暂无待办项</div>
    }
    return (
      <table className="w-full text-[12.5px] border-b border-line">
        <thead className="bg-slate-50/60 text-ink-muted">
          <tr>
            <Th className="w-12 text-center">序号</Th>
            <Th>事项</Th>
            <Th className="w-28">负责人</Th>
            <Th className="w-24">时间</Th>
            <Th className="w-48">备注</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i} className="border-t border-line/60 hover:bg-slate-50/30">
              <td className="px-3 py-2 text-center text-ink-muted tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 text-ink">{a.task}</td>
              <td className="px-3 py-2 text-ink-secondary">{a.owner || '—'}</td>
              <td className="px-3 py-2">
                <TimeRangeBadge start={(a as any).start_seconds} end={(a as any).end_seconds} />
              </td>
              <td className="px-3 py-2 text-ink-secondary">
                {[
                  a.deadline ? `截止 ${a.deadline}` : null,
                  a.priority ? { high: '高优', medium: '中优', low: '低优' }[a.priority] : null,
                  a.remark,
                ].filter(Boolean).join(' · ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  // edit mode
  return (
    <table className="w-full text-[12.5px] border-b border-line">
      <thead className="bg-slate-50/60 text-ink-muted">
        <tr>
          <Th className="w-12 text-center">#</Th>
          <Th>事项</Th>
          <Th className="w-28">负责人</Th>
          <Th className="w-24">截止</Th>
          <Th className="w-24">优先级</Th>
          <Th className="w-36">备注</Th>
          <Th className="w-12">{' '}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((a, i) => (
          <tr key={i} className="border-t border-line/60 group">
            <td className="px-2 py-1.5 text-center text-ink-muted tabular-nums">{i + 1}</td>
            <td className="px-2 py-1.5">
              <textarea value={a.task} onChange={e => { const next = [...items]; next[i] = { ...next[i], task: e.target.value }; onChange(next) }}
                rows={2}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12.5px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <input value={a.owner || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], owner: e.target.value }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <input value={a.deadline || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], deadline: e.target.value }; onChange(next) }}
                placeholder="如 5/20"
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <select value={a.priority || 'medium'} onChange={e => { const next = [...items]; next[i] = { ...next[i], priority: e.target.value as 'high' | 'medium' | 'low' }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] bg-white focus:outline-none focus:border-orange-400">
                <option value="high">高优</option>
                <option value="medium">中优</option>
                <option value="low">低优</option>
              </select>
            </td>
            <td className="px-2 py-1.5">
              <input value={a.remark || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], remark: e.target.value }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5 text-center">
              <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-muted hover:text-rose-600" title="删除">
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
        {items.length === 0 && (
          <tr><td colSpan={7} className="px-3 py-4 text-center text-[12px] text-ink-muted">点上方「+ 添加待办」加一条</td></tr>
        )}
      </tbody>
    </table>
  )
}

/** 待确认项列表(同款 view/edit 切换) */
function UnresolvedList({
  items, editing, onChange,
}: {
  items: NonNullable<MeetingMinutes['unresolved']>
  editing: boolean
  onChange: (next: NonNullable<MeetingMinutes['unresolved']>) => void
}) {
  if (!editing) {
    if (items.length === 0) {
      return <div className="px-5 py-4 text-[12.5px] text-ink-muted text-center">暂无待确认项</div>
    }
    return (
      <table className="w-full text-[12.5px]">
        <thead className="bg-slate-50/60 text-ink-muted">
          <tr>
            <Th className="w-12 text-center">序号</Th>
            <Th>事项</Th>
            <Th className="w-28">负责人</Th>
            <Th className="w-24">时间</Th>
            <Th className="w-48">备注</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((u, i) => (
            <tr key={i} className="border-t border-line/60 hover:bg-slate-50/30">
              <td className="px-3 py-2 text-center text-ink-muted tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 text-ink">{u.issue}</td>
              <td className="px-3 py-2 text-ink-secondary">{u.owner || '—'}</td>
              <td className="px-3 py-2">
                <TimeRangeBadge start={(u as any).start_seconds} end={(u as any).end_seconds} />
              </td>
              <td className="px-3 py-2 text-ink-secondary">
                {[u.reason ? `原因:${u.reason}` : null, u.remark].filter(Boolean).join(' · ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <table className="w-full text-[12.5px]">
      <thead className="bg-slate-50/60 text-ink-muted">
        <tr>
          <Th className="w-12 text-center">#</Th>
          <Th>问题</Th>
          <Th className="w-28">负责人</Th>
          <Th className="w-44">原因</Th>
          <Th className="w-32">备注</Th>
          <Th className="w-12">{' '}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((u, i) => (
          <tr key={i} className="border-t border-line/60 group">
            <td className="px-2 py-1.5 text-center text-ink-muted tabular-nums">{i + 1}</td>
            <td className="px-2 py-1.5">
              <textarea value={u.issue} onChange={e => { const next = [...items]; next[i] = { ...next[i], issue: e.target.value }; onChange(next) }}
                rows={2}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12.5px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <input value={u.owner || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], owner: e.target.value }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <input value={u.reason || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], reason: e.target.value }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5">
              <input value={u.remark || ''} onChange={e => { const next = [...items]; next[i] = { ...next[i], remark: e.target.value }; onChange(next) }}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400" />
            </td>
            <td className="px-2 py-1.5 text-center">
              <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-muted hover:text-rose-600" title="删除">
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
        {items.length === 0 && (
          <tr><td colSpan={6} className="px-3 py-4 text-center text-[12px] text-ink-muted">点上方「+ 添加待确认」加一条</td></tr>
        )}
      </tbody>
    </table>
  )
}

function MetaCell({
  label, children, span,
  editing = false, value, onChange,
  multiline = false, hint,
}: {
  label: string
  children: React.ReactNode
  span?: number
  editing?: boolean
  value?: string
  onChange?: (v: string) => void
  multiline?: boolean
  hint?: string
}) {
  return (
    <>
      <div className="px-4 py-2.5 bg-canvas/80 text-ink-muted font-medium border-r border-line text-[12px] flex items-center">
        {label}
      </div>
      <div
        className={`px-4 py-2 text-ink border-r border-line last:border-r-0 flex items-center`}
        style={span && span > 1 ? { gridColumn: `span ${span}` } : {}}
      >
        {editing && onChange ? (
          <div className="w-full">
            {multiline ? (
              <textarea
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                rows={3}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
              />
            ) : (
              <input
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className="w-full px-2 py-1 rounded border border-orange-200 text-[13px] focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
              />
            )}
            {hint && <div className="text-[10px] text-ink-muted mt-0.5">{hint}</div>}
          </div>
        ) : (
          <div className="w-full">{children}</div>
        )}
      </div>
    </>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider ${className || ''}`}>{children}</th>
}

// ── Tab: Requirements ────────────────────────────────────────────────────

export function RequirementsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const reqs = meeting.requirements || []
  const [filter, setFilter] = useState<string>('all')
  const [editingId, setEditingId] = useState<number | null>(null)

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_requirements'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const editMut = useMutation({
    mutationFn: (payload: { id: number; patch: Parameters<typeof patchMeetingRequirement>[2] }) =>
      patchMeetingRequirement(meeting.id, payload.id, payload.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setEditingId(null)
    },
  })

  const createMut = useMutation({
    mutationFn: () => createMeetingRequirement(meeting.id, { description: '' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      // 新建后立即进入编辑模式
      setEditingId(r.id)
    },
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteMeetingRequirement(meeting.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const filtered = useMemo(() =>
    filter === 'all' ? reqs : reqs.filter(r => r.priority === filter),
  [reqs, filter])

  if (reqs.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <ListChecks size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未提取需求</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即提取
        </button>
      </div>
    )
  }

  // 按 priority 分桶统计
  const counts: Record<string, number> = { all: reqs.length, P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const r of reqs) if (counts[r.priority] !== undefined) counts[r.priority]++

  return (
    <div className="space-y-4">
      {/* Top bar:筛选 + 操作 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                filter === p ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-line text-ink-muted hover:text-ink hover:bg-canvas/60 bg-white'
              }`}
            >
              {p === 'all' ? `全部` : p} <span className="ml-0.5 tabular-nums text-ink-muted">{counts[p]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
            title="新增一条空需求,自动进入编辑"
          >
            {createMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '+'} 新增需求
          </button>
          <button
            onClick={() => regenMut.mutate()}
            disabled={regenMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
          >
            {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新提取
          </button>
        </div>
      </div>

      {/* 需求清单:模板表格化 */}
      <div className="border border-line rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-3 border-b-2 border-ink/10 text-center"
             style={{ background: 'linear-gradient(135deg, #FFF8F0, #FFF4E6)' }}>
          <h2 className="text-base font-bold text-ink tracking-wide">需求清单</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">本次会议提取的 {reqs.length} 条 CRM 实施需求</p>
        </div>

        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/60 text-ink-muted">
            <tr>
              <Th className="w-20 text-center">编号</Th>
              <Th className="w-28">模块</Th>
              <Th>需求描述</Th>
              <Th className="w-20 text-center">优先级</Th>
              <Th className="w-20">时间</Th>
              <Th className="w-24">提出人</Th>
              <Th className="w-12">{' '}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: MeetingRequirement) =>
              editingId === r.id
                ? <RequirementEditRow
                    key={r.id}
                    req={r}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => editMut.mutate({ id: r.id, patch })}
                    onDelete={() => {
                      if (window.confirm(`确认删除「${r.req_id}」?`)) {
                        delMut.mutate(r.id)
                        setEditingId(null)
                      }
                    }}
                    saving={editMut.isPending}
                  />
                : <RequirementViewRow
                    key={r.id}
                    req={r}
                    onEdit={() => setEditingId(r.id)}
                    onDelete={() => {
                      if (window.confirm(`确认删除「${r.req_id}」?`)) delMut.mutate(r.id)
                    }}
                  />
            )}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[12px] text-ink-muted">
                  没有匹配当前筛选条件的需求
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RequirementViewRow({ req: r, onEdit, onDelete }: { req: MeetingRequirement; onEdit: () => void; onDelete: () => void }) {
  const ext = r as MeetingRequirement & { start_seconds?: number | null; end_seconds?: number | null }
  return (
    <tr className="border-t border-line/60 hover:bg-slate-50/30 group">
      <td className="px-3 py-2.5 text-center text-ink-muted font-mono text-[11px]" title={r.req_id}>{r.req_id}</td>
      <td className="px-3 py-2.5">
        {r.module ? (
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[11px]">{r.module}</span>
        ) : '—'}
      </td>
      <td className="px-3 py-2.5 text-ink leading-relaxed">
        {r.description}
        {r.source && (
          <div className="text-[11px] text-ink-muted italic mt-1 pl-2 border-l-2 border-line">
            原文:{r.source}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
          r.priority === 'P0' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
          r.priority === 'P1' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
          r.priority === 'P2' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
          'bg-gray-50 text-ink-muted border border-line'
        }`}>{r.priority}</span>
      </td>
      <td className="px-3 py-2.5">
        <TimeRangeBadge start={ext.start_seconds} end={ext.end_seconds} />
      </td>
      <td className="px-3 py-2.5 text-ink-secondary text-[12px]">{r.speaker || '—'}</td>
      <td className="px-3 py-2.5 text-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 justify-center">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-canvas text-ink-muted hover:text-orange-600"
            title="编辑"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-canvas text-ink-muted hover:text-rose-600"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function RequirementEditRow({
  req: r, onCancel, onSave, onDelete, saving,
}: {
  req: MeetingRequirement
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchMeetingRequirement>[2]) => void
  onDelete: () => void
  saving: boolean
}) {
  const ext = r as MeetingRequirement & { start_seconds?: number | null; end_seconds?: number | null }
  const [module, setModule] = useState(r.module || '')
  const [description, setDescription] = useState(r.description || '')
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2' | 'P3'>(r.priority as any || 'P2')
  const [speaker, setSpeaker] = useState(r.speaker || '')
  const [startSeconds, setStartSeconds] = useState(ext.start_seconds != null ? String(ext.start_seconds) : '')
  const [endSeconds, setEndSeconds] = useState(ext.end_seconds != null ? String(ext.end_seconds) : '')

  return (
    <tr className="border-t-2 border-orange-300 bg-orange-50/30">
      <td className="px-3 py-2.5 text-center text-ink-muted font-mono text-[11px]">{r.req_id}</td>
      <td className="px-2 py-2">
        <input
          value={module}
          onChange={e => setModule(e.target.value)}
          className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400"
        />
      </td>
      <td className="px-2 py-2">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full px-2 py-1 rounded border border-orange-200 text-[13px] leading-relaxed focus:outline-none focus:border-orange-400"
        />
        {r.source && (
          <div className="text-[11px] text-ink-muted italic mt-1 pl-2 border-l-2 border-line">
            原文(只读):{r.source}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as 'P0' | 'P1' | 'P2' | 'P3')}
          className="px-2 py-1 rounded border border-orange-200 text-[12px] bg-white focus:outline-none focus:border-orange-400"
        >
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <input
            value={startSeconds}
            onChange={e => setStartSeconds(e.target.value)}
            placeholder="开始秒"
            className="w-16 px-1 py-1 rounded border border-orange-200 text-[11px] focus:outline-none focus:border-orange-400"
          />
          <input
            value={endSeconds}
            onChange={e => setEndSeconds(e.target.value)}
            placeholder="结束秒"
            className="w-16 px-1 py-1 rounded border border-orange-200 text-[11px] focus:outline-none focus:border-orange-400"
          />
        </div>
      </td>
      <td className="px-2 py-2">
        <input
          value={speaker}
          onChange={e => setSpeaker(e.target.value)}
          className="w-full px-2 py-1 rounded border border-orange-200 text-[12px] focus:outline-none focus:border-orange-400"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-0.5 justify-center">
          <button onClick={onDelete} disabled={saving}
            className="p-1 rounded text-ink-muted hover:bg-canvas hover:text-rose-600"
            title="删除">
            <Trash2 size={13} />
          </button>
          <button onClick={onCancel} disabled={saving}
            className="p-1 rounded hover:bg-canvas text-ink-muted"
            title="取消">
            <X size={13} />
          </button>
          <button onClick={() => {
            const s = startSeconds.trim() ? parseFloat(startSeconds) : undefined
            const e = endSeconds.trim() ? parseFloat(endSeconds) : undefined
            onSave({ module, description, priority, speaker, start_seconds: s, end_seconds: e } as any)
          }}
            disabled={saving || !description.trim()}
            className="p-1 rounded text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }} title="保存">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Tab: Stakeholders ────────────────────────────────────────────────────

const SIDE_LABEL: Record<string, { label: string; cls: string }> = {
  internal: { label: '我方',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  customer: { label: '客户',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vendor:   { label: '合作方', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  unknown:  { label: '未知',  cls: 'bg-gray-50 text-ink-muted border-line' },
}

export function StakeholdersTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const smap = meeting.stakeholder_map || { stakeholders: [], relations: [] }
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_stakeholders'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  // 保存编辑后的 stakeholder:更新整个 map + 如果名字变了 → 触发同步
  const saveMut = useMutation({
    mutationFn: async (payload: { idx: number; old: StakeholderItem; next: StakeholderItem }) => {
      const newStakes = [...(smap.stakeholders || [])]
      newStakes[payload.idx] = payload.next
      await putMeetingStakeholderMap(meeting.id, { ...smap, stakeholders: newStakes })
      const nameChanged = payload.old.name && payload.next.name && payload.old.name !== payload.next.name
      let sync = { replaced_in_minutes: 0, replaced_in_requirements: 0 }
      if (nameChanged) {
        sync = await renameStakeholderRefs(meeting.id, {
          old_name: payload.old.name,
          new_name: payload.next.name,
          old_aliases: payload.old.aliases || [],
        })
      }
      return sync
    },
    onSuccess: (sync) => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setEditIdx(null)
      if ((sync.replaced_in_minutes || 0) + (sync.replaced_in_requirements || 0) > 0) {
        console.log('[stakeholder rename] minutes:', sync.replaced_in_minutes, 'reqs:', sync.replaced_in_requirements)
      }
    },
  })

  const delMut = useMutation({
    mutationFn: (idx: number) => {
      const newStakes = [...(smap.stakeholders || [])].filter((_, i) => i !== idx)
      return putMeetingStakeholderMap(meeting.id, { ...smap, stakeholders: newStakes })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setEditIdx(null)
    },
  })

  const addMut = useMutation({
    mutationFn: () => {
      const newStakes = [...(smap.stakeholders || []), {
        name: '新干系人',
        aliases: [],
        role: '',
        organization: '',
        side: 'unknown' as const,
        key_points: [],
        responsibilities: [],
      }]
      return putMeetingStakeholderMap(meeting.id, { ...smap, stakeholders: newStakes })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      // 自动跳到新加的最后一张进入编辑
      setEditIdx((smap.stakeholders || []).length)
    },
  })

  const syncToProjectMut = useMutation({
    mutationFn: () => {
      if (!meeting.project_id) throw new Error('请先关联项目')
      return syncMeetingStakeholdersToProject(meeting.project_id, meeting.id)
    },
    onSuccess: (r) => {
      toast.success(`已沉淀到项目资产:${r.merged} 条合并 / ${r.created} 条新增 / 共 ${r.total} 人`)
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
    },
  })

  if (!smap.stakeholders || smap.stakeholders.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <Users size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未提取干系人</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即提取
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-ink-muted">
          共识别 <span className="font-semibold text-ink">{smap.stakeholders.length}</span> 个干系人
          {smap.relations && smap.relations.length > 0 && (
            <> · <span className="font-semibold text-ink">{smap.relations.length}</span> 条协作关系</>
          )}
          <span className="ml-2 text-[12px] text-ink-muted">改名后会自动同步到纪要和需求</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {meeting.project_id && (
            <button
              onClick={() => syncToProjectMut.mutate()}
              disabled={syncToProjectMut.isPending}
              className="px-3 py-1.5 rounded-md text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1.5 disabled:opacity-50"
              title="把本会议干系人合并到项目级资产"
            >
              {syncToProjectMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '⇪'}
              沉淀到项目
            </button>
          )}
          <button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
            title="新增一个空的干系人卡片,自动进入编辑"
          >
            {addMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '+'} 新增干系人
          </button>
          <button
            onClick={() => regenMut.mutate()}
            disabled={regenMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
          >
            {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新提取
          </button>
        </div>
      </div>

      {/* Stakeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {smap.stakeholders.map((s, i) =>
          editIdx === i
            ? <StakeholderEditCard
                key={i}
                stake={s}
                onCancel={() => setEditIdx(null)}
                onSave={(next) => saveMut.mutate({ idx: i, old: s, next })}
                onDelete={() => {
                  if (window.confirm(`确认删除干系人「${s.name}」?`)) delMut.mutate(i)
                }}
                saving={saveMut.isPending || delMut.isPending}
              />
            : <StakeholderViewCard
                key={i}
                stake={s}
                onEdit={() => setEditIdx(i)}
              />
        )}
      </div>

      {/* Relations */}
      {smap.relations && smap.relations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-2">协作关系</h3>
          <ul className="space-y-1 text-sm">
            {smap.relations.map((r, i) => (
              <li key={i} className="text-ink">
                <span className="font-medium">{r.from}</span>
                <span className="text-ink-muted mx-1.5">→</span>
                <span className="font-medium">{r.to}</span>
                {r.type && <span className="ml-2 text-[11px] text-ink-muted">{r.type}</span>}
                {r.description && <div className="text-[12px] text-ink-secondary ml-3">{r.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Tab: 业务流程(Mermaid) ───────────────────────────────────────────────

const FLOW_CATEGORY_CLS: Record<string, string> = {
  '业务流程': 'bg-blue-50 text-blue-700 border-blue-200',
  '工作流':   'bg-purple-50 text-purple-700 border-purple-200',
  '审批流':   'bg-amber-50 text-amber-700 border-amber-200',
  '操作步骤': 'bg-teal-50 text-teal-700 border-teal-200',
}

export function ProcessFlowsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const flows = meeting.process_flows?.flows || []
  const [expandedId, setExpandedId] = useState<string | null>(flows[0]?.flow_id ?? null)

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_process_flows'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  if (flows.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <GitBranch size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-1">尚未识别业务流程</p>
        <p className="text-xs mb-4 text-ink-muted/80">AI 将从会议讨论中提取工作流、审批流等,并生成 Mermaid 流程图</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即识别
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <p className="text-sm text-ink-muted">
          共识别 <span className="font-semibold text-ink">{flows.length}</span> 个流程
        </p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新识别
        </button>
      </div>

      <div className="space-y-3">
        {flows.map((flow) => {
          const open = expandedId === flow.flow_id
          const catCls = FLOW_CATEGORY_CLS[flow.category] || 'bg-slate-50 text-slate-600 border-line'
          return (
            <div
              key={flow.flow_id}
              className="rounded-xl border border-line bg-white overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : flow.flow_id)}
                className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-canvas/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-mono text-ink-muted">{flow.flow_id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${catCls}`}>{flow.category}</span>
                    <TimeRangeBadge start={flow.start_seconds} end={flow.end_seconds} />
                  </div>
                  <div className="font-semibold text-ink text-[15px]">{flow.title}</div>
                  {flow.summary && (
                    <p className="text-[13px] text-ink-secondary mt-0.5 line-clamp-2">{flow.summary}</p>
                  )}
                </div>
                <span className="text-ink-muted text-xs shrink-0 pt-1">{open ? '收起' : '展开'}</span>
              </button>

              {open && (
                <div className="px-4 pb-4 border-t border-line/60 pt-3 space-y-3">
                  {flow.description && (
                    <p className="text-[13px] text-ink-secondary leading-relaxed">{flow.description}</p>
                  )}
                  {flow.source && (
                    <blockquote className="text-[12px] text-ink-muted border-l-2 border-orange-200 pl-3 italic">
                      「{flow.source}」
                      {flow.speaker && <span className="not-italic ml-1">— {flow.speaker}</span>}
                    </blockquote>
                  )}
                  <MermaidBlock code={flow.mermaid} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: 解释图 ─────────────────────────────────────────────────────────

export function IllustrationsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [lightbox, setLightbox] = useState<MeetingIllustration | null>(null)
  const [styleId, setStyleId] = useState<string>('auto')
  const illustrations = meeting.illustrations?.illustrations || []
  const currentStyleId = meeting.illustrations?.style_id

  // 获取风格列表
  const { data: stylesData } = useQuery({
    queryKey: ['illustration-styles'],
    queryFn: getIllustrationStyles,
    staleTime: 10 * 60 * 1000,
  })
  const styles = stylesData?.styles || []
  const groups = stylesData?.groups || {}

  const genMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_illustrations', { style_id: styleId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('配图生成完成')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '生成失败'),
  })

  const handleDownload = (ill: MeetingIllustration) => {
    if (!ill.image_url) return
    const a = document.createElement('a')
    a.href = ill.image_url
    a.download = `${ill.id}-${ill.title}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleCopy = async (ill: MeetingIllustration) => {
    if (!ill.image_url) return
    try {
      const resp = await fetch(ill.image_url)
      const blob = await resp.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败,请使用下载')
    }
  }

  // 封面图和正文图分离
  const cover = illustrations.find(i => i.image_type === 'cover')
  const bodyImages = illustrations.filter(i => i.image_type !== 'cover')

  // 找当前风格名
  const currentStyleName = currentStyleId
    ? (styles.find(s => s.id === currentStyleId)?.name || currentStyleId)
    : '自动匹配'

  if (illustrations.length === 0) {
    return (
      <div className="text-center py-12">
        <Palette size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-ink-muted mb-4">将会议内容转化为封面图 + 正文配图</p>
        {/* 风格选择器 */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-xs text-ink-muted">风格:</span>
          <select
            value={styleId}
            onChange={e => setStyleId(e.target.value)}
            className="text-xs border border-line rounded px-2 py-1 bg-white text-ink"
          >
            <option value="auto">自动匹配</option>
            {Object.entries(groups).map(([groupName, groupStyles]) => (
              <optgroup key={groupName} label={groupName}>
                {groupStyles.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          className="px-4 py-2 rounded-lg text-sm text-white inline-flex items-center gap-1.5"
          style={{ background: BRAND_GRAD }}
        >
          {genMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
          {genMut.isPending ? '生成中…' : '生成配图'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink tracking-wide">解释图</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
            {currentStyleName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={styleId}
            onChange={e => setStyleId(e.target.value)}
            className="text-[11px] border border-line rounded px-1.5 py-1 bg-white text-ink"
          >
            <option value="auto">自动匹配</option>
            {Object.entries(groups).map(([groupName, groupStyles]) => (
              <optgroup key={groupName} label={groupName}>
                {groupStyles.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5"
            style={{ background: BRAND_GRAD }}
          >
            {genMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新生成
          </button>
        </div>
      </div>

      {/* 封面图(21:9,占满一行) */}
      {cover && (
        <div className="mb-4">
          <div className="rounded-lg border border-line bg-white overflow-hidden shadow-sm group">
            <div
              className="relative bg-gray-50 cursor-pointer"
              style={{ aspectRatio: '21/9' }}
              onClick={() => cover.image_url && setLightbox(cover)}
            >
              {cover.image_url ? (
                <img src={cover.image_url} alt={cover.title} className="w-full h-full object-contain" />
              ) : (
                <div className="flex items-center justify-center h-full text-ink-muted text-sm">
                  封面生成失败 · 可重新生成
                </div>
              )}
              {cover.image_url && (
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleCopy(cover) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="复制"><Copy size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(cover) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="下载"><Download size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setLightbox(cover) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="放大"><Maximize2 size={14} /></button>
                </div>
              )}
              {/* 封面标签 */}
              <div className="absolute top-2 left-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500 text-white">封面 21:9</span>
              </div>
            </div>
            <div className="p-3">
              <div className="text-sm font-medium text-ink mb-0.5">{cover.title}</div>
              {cover.subtitle && <div className="text-[12px] text-ink-secondary">{cover.subtitle}</div>}
              {cover.bottom_conclusion && <div className="text-[11px] text-ink-muted mt-1 italic">「{cover.bottom_conclusion}」</div>}
            </div>
          </div>
        </div>
      )}

      {/* 正文配图(16:9,两列) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {bodyImages.map(ill => (
          <div key={ill.id} className="rounded-lg border border-line bg-white overflow-hidden shadow-sm group">
            <div
              className="relative bg-gray-50 cursor-pointer"
              style={{ aspectRatio: '16/9' }}
              onClick={() => ill.image_url && setLightbox(ill)}
            >
              {ill.image_url ? (
                <img src={ill.image_url} alt={ill.title} className="w-full h-full object-contain" />
              ) : (
                <div className="flex items-center justify-center h-full text-ink-muted text-sm">
                  图像生成失败 · 可重新生成
                </div>
              )}
              {ill.image_url && (
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleCopy(ill) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="复制"><Copy size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(ill) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="下载"><Download size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setLightbox(ill) }} className="p-1.5 rounded bg-black/50 text-white hover:bg-black/70" title="放大"><Maximize2 size={14} /></button>
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                {ill.structure && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {ill.structure}
                  </span>
                )}
                <span className="text-xs text-ink-muted">{ill.id}</span>
              </div>
              <div className="text-sm font-medium text-ink mb-0.5">{ill.title}</div>
              {ill.bubble_text && <div className="text-[11px] text-orange-600 mt-0.5">💬 {ill.bubble_text}</div>}
              {ill.bottom_conclusion && <div className="text-[11px] text-ink-muted mt-0.5 italic">「{ill.bottom_conclusion}」</div>}
              {ill.annotations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ill.annotations.map((a, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-ink-muted">{a}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && lightbox.image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightbox.image_url} alt={lightbox.title} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4 rounded-b-lg">
              <div className="text-white text-sm font-medium">{lightbox.title}</div>
              {lightbox.bubble_text && <div className="text-white/80 text-[12px]">💬 {lightbox.bubble_text}</div>}
              {lightbox.bottom_conclusion && <div className="text-white/60 text-[11px] italic">「{lightbox.bottom_conclusion}」</div>}
            </div>
            <button onClick={() => setLightbox(null)} className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={18} /></button>
            <div className="absolute top-3 left-3 flex gap-2">
              <button onClick={() => handleCopy(lightbox)} className="px-3 py-1.5 rounded-lg bg-black/50 text-white text-sm hover:bg-black/70 inline-flex items-center gap-1.5"><Copy size={14} /> 复制</button>
              <button onClick={() => handleDownload(lightbox)} className="px-3 py-1.5 rounded-lg bg-black/50 text-white text-sm hover:bg-black/70 inline-flex items-center gap-1.5"><Download size={14} /> 下载</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 干系人卡片(view / edit)─────────────────────────────────────────────

function StakeholderViewCard({ stake, onEdit }: { stake: StakeholderItem; onEdit: () => void }) {
  const side = SIDE_LABEL[stake.side || 'unknown'] || SIDE_LABEL.unknown
  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-sm hover:border-orange-200 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{stake.name}</div>
          {stake.role && <div className="text-[12px] text-ink-secondary truncate">{stake.role}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${side.cls}`}>{side.label}</span>
          <button
            onClick={onEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-canvas text-ink-muted hover:text-orange-600"
            title="编辑"
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>
      {stake.organization && (
        <div className="text-[12px] text-ink-muted mb-1">{stake.organization}</div>
      )}
      {stake.aliases && stake.aliases.length > 0 && (
        <div className="text-[11px] text-ink-muted mb-1 flex flex-wrap gap-1 items-center">
          <span>昵称:</span>
          {stake.aliases.map((a, j) => (
            <span key={j} className="px-1.5 py-0.5 rounded bg-canvas border border-line">{a}</span>
          ))}
        </div>
      )}
      {stake.responsibilities && stake.responsibilities.length > 0 && (
        <div className="text-[12px] text-ink mt-1.5">
          <span className="text-ink-muted">职责:</span> {stake.responsibilities.join('、')}
        </div>
      )}
      {stake.key_points && stake.key_points.length > 0 && (
        <ul className="text-[12px] text-ink mt-1.5 space-y-0.5">
          {stake.key_points.map((kp, j) => (
            <li key={j} className="leading-relaxed">· {kp}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StakeholderEditCard({
  stake, onCancel, onSave, onDelete, saving,
}: {
  stake: StakeholderItem
  onCancel: () => void
  onSave: (next: StakeholderItem) => void
  onDelete: () => void
  saving: boolean
}) {
  const [name, setName] = useState(stake.name || '')
  const [aliasesText, setAliasesText] = useState((stake.aliases || []).join('、'))
  const [role, setRole] = useState(stake.role || '')
  const [organization, setOrganization] = useState(stake.organization || '')
  const [side, setSide] = useState<StakeholderItem['side']>(stake.side || 'unknown')
  const [respText, setRespText] = useState((stake.responsibilities || []).join('、'))
  const [keyPointsText, setKeyPointsText] = useState((stake.key_points || []).join('\n'))

  const handleSave = () => {
    const splitList = (s: string) => s.split(/[、,;\s]+/).map(x => x.trim()).filter(Boolean)
    const splitLines = (s: string) => s.split(/\n+/).map(x => x.trim()).filter(Boolean)
    onSave({
      ...stake,
      name: name.trim() || stake.name,
      aliases: splitList(aliasesText),
      role: role.trim(),
      organization: organization.trim(),
      side,
      responsibilities: splitList(respText),
      key_points: splitLines(keyPointsText),
    })
  }

  return (
    <div className="rounded-lg border-2 border-orange-300 bg-white p-3 shadow-sm space-y-2 text-[13px]">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-line/60">
        <span className="text-[11px] text-orange-700 font-medium">编辑干系人</span>
        <div className="flex gap-0.5">
          <button onClick={onDelete} disabled={saving}
            className="p-1 rounded text-ink-muted hover:bg-canvas hover:text-rose-600" title="删除">
            <Trash2 size={13} />
          </button>
          <button onClick={onCancel} disabled={saving}
            className="p-1 rounded hover:bg-canvas text-ink-muted" title="取消">
            <X size={13} />
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="p-1 rounded text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }} title="保存">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
        </div>
      </div>

      <Field2 label="姓名">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
        />
      </Field2>

      <Field2 label="昵称(别名)" hint="多个用 、 或逗号分隔,会议中能识别的所有称呼">
        <input
          value={aliasesText}
          onChange={e => setAliasesText(e.target.value)}
          placeholder="张总、张工、老张"
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
        />
      </Field2>

      <div className="grid grid-cols-2 gap-2">
        <Field2 label="角色 / 职位">
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="如 项目经理"
            className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
          />
        </Field2>
        <Field2 label="立场">
          <select
            value={side}
            onChange={e => setSide(e.target.value as StakeholderItem['side'])}
            className="w-full px-2 py-1 rounded border border-line text-[13px] bg-white focus:outline-none focus:border-orange-300"
          >
            <option value="internal">我方</option>
            <option value="customer">客户</option>
            <option value="vendor">合作方</option>
            <option value="unknown">未知</option>
          </select>
        </Field2>
      </div>

      <Field2 label="组织">
        <input
          value={organization}
          onChange={e => setOrganization(e.target.value)}
          placeholder="如 西门子"
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
        />
      </Field2>

      <Field2 label="职责" hint="多个用 、 或逗号分隔">
        <input
          value={respText}
          onChange={e => setRespText(e.target.value)}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
        />
      </Field2>

      <Field2 label="关键观点 / 表述" hint="每行一条,如「希望 5 月底前完成」">
        <textarea
          value={keyPointsText}
          onChange={e => setKeyPointsText(e.target.value)}
          rows={2}
          className="w-full px-2 py-1 rounded border border-line text-[13px] focus:outline-none focus:border-orange-300"
        />
      </Field2>

      <p className="text-[10px] text-ink-muted pt-1 border-t border-line/60">
        姓名修改会自动同步到本会议的纪要和需求清单
      </p>
    </div>
  )
}

function Field2({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-muted mb-0.5 flex items-center gap-1">
        {label}
        {hint && <span className="text-[10px] text-ink-muted/70">· {hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Tab: Actions ─────────────────────────────────────────────────────────

function FeishuCredsCard() {
  const qc = useQueryClient()
  const { data: status } = useQuery({ queryKey: ['feishu-creds'], queryFn: getFeishuCredentials })
  const [editing, setEditing] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')

  const saveMut = useMutation({
    mutationFn: () => putFeishuCredentials({ app_id: appId.trim(), app_secret: appSecret.trim() }),
    onSuccess: (data) => {
      qc.setQueryData(['feishu-creds'], { configured: true, app_id: data.app_id })
      setEditing(false); setAppId(''); setAppSecret('')
      toast.success('飞书凭证保存成功')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || '保存失败,请检查 App ID/Secret 是否正确'
      toast.error(msg)
    },
  })
  const delMut = useMutation({
    mutationFn: deleteFeishuCredentials,
    onSuccess: () => {
      qc.setQueryData(['feishu-creds'], { configured: false, app_id: null })
      toast.success('飞书凭证已清除')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || err?.message || '清除失败')
    },
  })

  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-ink">飞书凭证</h3>
          <p className="text-[12px] text-ink-secondary mt-0.5">
            用于"导出飞书文档"和"同步多维表"。每个用户配置自己的飞书自建应用凭证。
            前往{' '}
            <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="text-brand underline">
              飞书开放平台
            </a>
            {' '}创建自建应用拿到 App ID + Secret。
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            也可在{' '}
            <a href="/personal-settings" className="text-brand underline">
              个人设置 → 飞书集成
            </a>
            {' '}中统一管理凭证。
          </p>
        </div>
        {status?.configured && !editing && (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
            已配置
          </span>
        )}
      </div>

      {!editing ? (
        <div className="flex items-center gap-2 mt-2">
          {status?.configured ? (
            <>
              <span className="text-[12px] text-ink-muted font-mono">App ID: {status.app_id}</span>
              <button onClick={() => { setAppId(status!.app_id || ''); setEditing(true) }}
                className="text-[12px] px-2 py-1 rounded border border-line hover:bg-canvas-elevated">
                修改
              </button>
              <button onClick={() => { if (confirm('确认清除飞书凭证?')) delMut.mutate() }}
                className="text-[12px] px-2 py-1 rounded border border-line text-ink-muted hover:text-rose-600 hover:border-rose-200">
                清除
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="text-sm px-3 py-1.5 rounded-md text-white"
              style={{ background: BRAND_GRAD }}>
              立即配置
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          <input
            value={appId} onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID(形如 cli_xxx)"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <input
            type="password"
            value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
            placeholder="App Secret"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={!appId.trim() || !appSecret.trim() || saveMut.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              style={{ background: BRAND_GRAD }}
            >
              {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
              保存
            </button>
            <button
              onClick={() => { setEditing(false); setAppId(''); setAppSecret('') }}
              className="px-3 py-1.5 rounded-md text-sm border border-line text-ink hover:bg-canvas-elevated"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ActionsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [bitableToken, setBitableToken] = useState('')
  const [bitableTable, setBitableTable] = useState('')
  const [todoBitableToken, setTodoBitableToken] = useState('')
  const [todoBitableTable, setTodoBitableTable] = useState('')
  const [feishuFolder, setFeishuFolder] = useState('')

  // 双路径模式切换
  const [exportMode, setExportMode] = useState<'auto' | 'existing'>('auto')
  const [reqMode, setReqMode] = useState<'manual' | 'url'>('manual')
  const [todoMode, setTodoMode] = useState<'auto' | 'url'>('auto')

  // URL 输入
  const [exportDocUrl, setExportDocUrl] = useState('')
  const [reqBitableUrl, setReqBitableUrl] = useState('')
  const [todoBitableUrl, setTodoBitableUrl] = useState('')

  // 权限检查状态
  const [exportUrlCheck, setExportUrlCheck] = useState<FeishuUrlCheckResult | null>(null)
  const [reqUrlCheck, setReqUrlCheck] = useState<FeishuUrlCheckResult | null>(null)
  const [todoUrlCheck, setTodoUrlCheck] = useState<FeishuUrlCheckResult | null>(null)
  const [exportUrlChecking, setExportUrlChecking] = useState(false)
  const [reqUrlChecking, setReqUrlChecking] = useState(false)
  const [todoUrlChecking, setTodoUrlChecking] = useState(false)
  const [reqSelectedTable, setReqSelectedTable] = useState('')
  const [todoSelectedTable, setTodoSelectedTable] = useState('')

  const { data: feishuStatus } = useQuery({
    queryKey: ['feishu-creds'],
    queryFn: getFeishuCredentials,
  })

  const syncKbMut = useMutation({
    mutationFn: () => syncMeetingToKB(meeting.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('纪要已同步到知识库')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '同步 KB 失败'),
  })
  const syncStakeKbMut = useMutation({
    mutationFn: () => syncMeetingStakeholdersToKB(meeting.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('干系人图已同步')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '同步干系人失败'),
  })
  const exportFeishuMut = useMutation({
    mutationFn: () => {
      if (exportMode === 'existing' && exportDocUrl.trim()) {
        return exportMeetingToFeishu(meeting.id, { existingDocUrl: exportDocUrl.trim() })
      }
      return exportMeetingToFeishu(meeting.id, { folderToken: feishuFolder.trim() || undefined })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success(exportMode === 'existing' ? '会议纪要已写入已有文档' : '会议纪要已导出到飞书文档')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '导出飞书失败'),
  })
  const syncBitableMut = useMutation({
    mutationFn: () => {
      if (reqMode === 'url' && reqBitableUrl.trim()) {
        return syncMeetingRequirementsToBitable(meeting.id, {
          bitable_url: reqBitableUrl.trim(),
          table_id: reqSelectedTable,
        })
      }
      return syncMeetingRequirementsToBitable(meeting.id, {
        bitable_app_token: bitableToken.trim(),
        table_id: bitableTable.trim(),
      })
    },
    onSuccess: (data: any) => toast.success(`已写入 ${data.rows} 条需求到多维表`),
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '同步需求失败'),
  })
  const syncTodoMut = useMutation({
    mutationFn: () => {
      if (todoMode === 'url' && todoBitableUrl.trim()) {
        return syncActionItemsToBitable(meeting.id, {
          bitable_url: todoBitableUrl.trim(),
          table_id: todoSelectedTable,
        })
      }
      return syncActionItemsToBitable(meeting.id, {
        bitable_app_token: todoBitableToken.trim(),
        table_id: todoBitableTable.trim(),
      })
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success(`已写入 ${data.rows} 条待办到看板`)
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '同步待办失败'),
  })
  const createKanbanMut = useMutation({
    mutationFn: () => createActionKanban(meeting.id, feishuFolder.trim() || undefined),
    onSuccess: (data: any) => {
      setTodoBitableToken(data.app_token)
      setTodoBitableTable(data.table_id)
      toast.success('看板已创建,可直接同步待办')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || err?.message || '创建看板失败'),
  })

  // URL 权限检查辅助函数
  const handleCheckExportUrl = async () => {
    if (!exportDocUrl.trim()) return
    setExportUrlChecking(true)
    setExportUrlCheck(null)
    try {
      const result = await checkFeishuUrl(meeting.id, exportDocUrl.trim())
      setExportUrlCheck(result)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || '检查文档权限失败')
    } finally {
      setExportUrlChecking(false)
    }
  }
  const handleCheckReqUrl = async () => {
    if (!reqBitableUrl.trim()) return
    setReqUrlChecking(true)
    setReqUrlCheck(null)
    try {
      const result = await checkFeishuUrl(meeting.id, reqBitableUrl.trim())
      setReqUrlCheck(result)
      if (result.tables?.length) {
        setReqSelectedTable(result.table_id || result.tables[0].table_id)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || '检查多维表权限失败')
    } finally {
      setReqUrlChecking(false)
    }
  }
  const handleCheckTodoUrl = async () => {
    if (!todoBitableUrl.trim()) return
    setTodoUrlChecking(true)
    setTodoUrlCheck(null)
    try {
      const result = await checkFeishuUrl(meeting.id, todoBitableUrl.trim())
      setTodoUrlCheck(result)
      if (result.tables?.length) {
        setTodoSelectedTable(result.table_id || result.tables[0].table_id)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || '检查多维表权限失败')
    } finally {
      setTodoUrlChecking(false)
    }
  }

  const feishuConfigured = feishuStatus?.configured

  // 待办数量
  const actionItems = meeting.meeting_minutes?.action_items || []
  const todoCount = actionItems.length

  const inputClass = 'w-full px-3 py-1.5 rounded-md border border-line text-[12px] font-mono bg-canvas focus:outline-none focus:ring-1 focus:ring-brand/50'
  const btnClass = 'px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-40 inline-flex items-center gap-1.5 font-medium'
  const secondaryBtnClass = 'shrink-0 px-2.5 py-1.5 rounded-md text-[12px] border border-line text-ink-secondary hover:bg-canvas-elevated disabled:opacity-50 inline-flex items-center gap-1'
  const modeTabClass = (active: boolean) => `px-3 py-1 rounded text-[12px] font-medium cursor-pointer transition-colors ${active ? 'text-white' : 'text-ink-muted hover:bg-canvas-elevated'}`
  const modeTabStyle = (active: boolean) => active ? { background: BRAND_GRAD } : {}

  return (
    <div className="space-y-6 max-w-2xl">
      <FeishuCredsCard />

      <ActionCard
        title="同步纪要到 KB"
        desc="把会议纪要作为一份 Markdown 文档写入 kb-system 知识库,关联到当前项目(若已关联)。"
        buttonText={meeting.kb_doc_id ? '重新同步(覆盖)' : '同步'}
        onClick={() => syncKbMut.mutate()}
        loading={syncKbMut.isPending}
        disabled={!meeting.meeting_minutes}
        hint={!meeting.meeting_minutes ? '需先生成纪要' : meeting.kb_doc_id ? `已同步:${meeting.kb_url}` : ''}
      />

      <ActionCard
        title="同步干系人图到 KB"
        desc="把干系人列表作为 Markdown 写入 KB,作为项目文档。"
        buttonText={meeting.stakeholder_kb_doc_id ? '重新同步' : '同步'}
        onClick={() => syncStakeKbMut.mutate()}
        loading={syncStakeKbMut.isPending}
        disabled={!meeting.stakeholder_map}
        hint={!meeting.stakeholder_map ? '需先提取干系人' : meeting.stakeholder_kb_doc_id ? `已同步` : ''}
      />

      {/* ═══════════════ 导出纪要到飞书云空间 ═══════════════ */}
      <div className="rounded-lg border border-line bg-canvas-elevated p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">导出纪要至飞书云空间</h3>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-canvas rounded-md p-0.5 mb-3 w-fit">
          <button onClick={() => { setExportMode('auto'); setExportUrlCheck(null); }} className={modeTabClass(exportMode === 'auto')} style={modeTabStyle(exportMode === 'auto')}>自动创建新文档</button>
          <button onClick={() => { setExportMode('existing'); setExportUrlCheck(null); }} className={modeTabClass(exportMode === 'existing')} style={modeTabStyle(exportMode === 'existing')}>写入已有文档</button>
        </div>

        {exportMode === 'auto' ? (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">自动在飞书云空间创建新文档并写入纪要。</p>
            <input value={feishuFolder} onChange={(e) => setFeishuFolder(e.target.value)}
              placeholder="文件夹 token(可选,从飞书文件夹 URL 获取,如 fldcnXXX)" className={inputClass} />
            <div className="flex items-center justify-between mt-2">
              <div>
                {!feishuConfigured && <p className="text-[12px] text-ink-muted">请先在 设置 中配置飞书凭证</p>}
                {!meeting.meeting_minutes && <p className="text-[12px] text-ink-muted">需先生成会议纪要</p>}
                {meeting.feishu_url && (
                  <span className="text-[12px] text-emerald-700">✓ 已导出 · <a href={meeting.feishu_url} target="_blank" rel="noreferrer" className="underline">打开文档</a></span>
                )}
              </div>
              <button onClick={() => exportFeishuMut.mutate()}
                disabled={!feishuConfigured || !meeting.meeting_minutes || exportFeishuMut.isPending}
                className={btnClass} style={{ background: BRAND_GRAD }}>
                {exportFeishuMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}导出
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">
              粘贴已有飞书文档链接,系统将清空旧内容后写入新会议纪要。
            </p>
            <div className="flex gap-2">
              <input value={exportDocUrl} onChange={(e) => { setExportDocUrl(e.target.value); setExportUrlCheck(null); }}
                placeholder="飞书文档链接,如 https://xxx.feishu.cn/docx/XXXX" className={inputClass + ' flex-1'} />
              <button onClick={handleCheckExportUrl}
                disabled={!exportDocUrl.trim() || exportUrlChecking}
                className={secondaryBtnClass}>
                {exportUrlChecking ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                检查权限
              </button>
            </div>

            {/* Permission check result */}
            {exportUrlCheck && (
              <div className={`mt-2 p-2.5 rounded text-[12px] ${exportUrlCheck.has_permission ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {exportUrlCheck.has_permission ? (
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="font-medium">有权限访问</p>
                      {exportUrlCheck.title && <p className="text-[11px] mt-0.5 opacity-75">文档: {exportUrlCheck.title}</p>}
                      <button onClick={() => exportFeishuMut.mutate()}
                        disabled={exportFeishuMut.isPending || !meeting.meeting_minutes}
                        className="mt-1.5 px-2.5 py-1 rounded text-[12px] text-white inline-flex items-center gap-1 disabled:opacity-40"
                        style={{ background: BRAND_GRAD }}>
                        {exportFeishuMut.isPending ? <Loader2 size={11} className="animate-spin" /> : null}写入纪要
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
                    <div className="flex-1 whitespace-pre-wrap">{exportUrlCheck.message}{exportUrlCheck.guidance ? '\n\n' + exportUrlCheck.guidance : ''}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ 同步需求到飞书多维表 ═══════════════ */}
      <div className="rounded-lg border border-line bg-canvas-elevated p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">同步需求到飞书多维表</h3>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-canvas rounded-md p-0.5 mb-3 w-fit">
          <button onClick={() => { setReqMode('manual'); setReqUrlCheck(null); }} className={modeTabClass(reqMode === 'manual')} style={modeTabStyle(reqMode === 'manual')}>手动输入 token</button>
          <button onClick={() => { setReqMode('url'); setReqUrlCheck(null); }} className={modeTabClass(reqMode === 'url')} style={modeTabStyle(reqMode === 'url')}>粘贴多维表链接</button>
        </div>

        {reqMode === 'manual' ? (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">字段对齐: req_id / module / description / priority / source / speaker / status</p>
            <div className="space-y-2">
              <input value={bitableToken} onChange={(e) => setBitableToken(e.target.value)}
                placeholder="多维表 app_token" className={inputClass} />
              <input value={bitableTable} onChange={(e) => setBitableTable(e.target.value)}
                placeholder="table_id" className={inputClass} />
              <button onClick={() => syncBitableMut.mutate()}
                disabled={!feishuConfigured || !bitableToken || !bitableTable || syncBitableMut.isPending || !meeting.requirements?.length}
                className={btnClass} style={{ background: BRAND_GRAD }}>
                {syncBitableMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}写入多维表
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">
              粘贴飞书多维表链接,系统自动解析并校验权限。
            </p>
            <div className="flex gap-2 mb-2">
              <input value={reqBitableUrl} onChange={(e) => { setReqBitableUrl(e.target.value); setReqUrlCheck(null); }}
                placeholder="飞书多维表链接,如 https://xxx.feishu.cn/base/XXXX?table=YYYY" className={inputClass + ' flex-1'} />
              <button onClick={handleCheckReqUrl}
                disabled={!reqBitableUrl.trim() || reqUrlChecking}
                className={secondaryBtnClass}>
                {reqUrlChecking ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                检查
              </button>
            </div>

            {/* Permission check result */}
            {reqUrlCheck && (
              <div className={`p-2.5 rounded text-[12px] ${reqUrlCheck.has_permission ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {reqUrlCheck.has_permission ? (
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="font-medium">有权限访问</p>
                      {reqUrlCheck.tables && reqUrlCheck.tables.length > 0 ? (
                        <div className="mt-1.5">
                          <label className="text-[11px]">选择目标表:</label>
                          <select value={reqSelectedTable} onChange={(e) => setReqSelectedTable(e.target.value)}
                            className="w-full mt-1 px-2 py-1 rounded border border-emerald-200 text-[12px] bg-white">
                            {reqUrlCheck.tables.map(t => (
                              <option key={t.table_id} value={t.table_id}>{t.name || t.table_id}</option>
                            ))}
                          </select>
                          <button onClick={() => syncBitableMut.mutate()}
                            disabled={syncBitableMut.isPending || !meeting.requirements?.length}
                            className="mt-2 px-2.5 py-1 rounded text-[12px] text-white inline-flex items-center gap-1 disabled:opacity-40"
                            style={{ background: BRAND_GRAD }}>
                            {syncBitableMut.isPending ? <Loader2 size={11} className="animate-spin" /> : null}写入多维表
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] mt-1 opacity-70">该多维表中暂无数据表,请先在飞书中创建</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
                    <div className="flex-1 whitespace-pre-wrap">{reqUrlCheck.message}{reqUrlCheck.guidance ? '\n\n' + reqUrlCheck.guidance : ''}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {syncBitableMut.data && (
          <div className="text-[12px] text-emerald-700 mt-2">
            ✓ 已写入 {syncBitableMut.data.rows} 条 ·{' '}
            <a href={syncBitableMut.data.url} target="_blank" rel="noreferrer" className="underline">打开多维表</a>
          </div>
        )}
        {!feishuConfigured && <p className="text-[12px] text-ink-muted mt-1.5">请先在 设置 中配置飞书凭证</p>}
      </div>

      {/* ═══════════════ 同步待办到飞书看板 ═══════════════ */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
        <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-1.5 mb-3">
          同步待办到飞书看板
          {todoCount > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">{todoCount} 条待办</span>
          )}
        </h3>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-white/70 rounded-md p-0.5 mb-3 w-fit">
          <button onClick={() => { setTodoMode('auto'); setTodoUrlCheck(null); }} className={modeTabClass(todoMode === 'auto')} style={modeTabStyle(todoMode === 'auto')}>一键创建看板</button>
          <button onClick={() => { setTodoMode('url'); setTodoUrlCheck(null); }} className={modeTabClass(todoMode === 'url')} style={modeTabStyle(todoMode === 'url')}>已有看板链接</button>
        </div>

        {todoMode === 'auto' ? (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">
              自动创建飞书多维表看板(含任务/负责人/截止日期/优先级/状态字段),然后写入待办。
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input value={todoBitableToken} onChange={(e) => setTodoBitableToken(e.target.value)}
                  placeholder="多维表 app_token(留空则自动创建)" className={inputClass + ' flex-1'} />
                <button onClick={() => createKanbanMut.mutate()}
                  disabled={!feishuConfigured || createKanbanMut.isPending}
                  className="shrink-0 px-2.5 py-1.5 rounded-md text-[12px] border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 inline-flex items-center gap-1">
                  {createKanbanMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <FolderKanban size={12} />}
                  一键创建看板
                </button>
              </div>
              <input value={todoBitableTable} onChange={(e) => setTodoBitableTable(e.target.value)}
                placeholder="table_id(自动创建后填入)" className={inputClass} />
              <button onClick={() => syncTodoMut.mutate()}
                disabled={!feishuConfigured || !todoBitableToken || !todoBitableTable || syncTodoMut.isPending || todoCount === 0}
                className={btnClass} style={{ background: BRAND_GRAD }}>
                {syncTodoMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <ListChecks size={13} />}
                同步待办到看板
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-ink-secondary mb-2">
              粘贴已有飞书多维表/看板链接,系统自动校验权限后写入待办。
            </p>
            <div className="flex gap-2 mb-2">
              <input value={todoBitableUrl} onChange={(e) => { setTodoBitableUrl(e.target.value); setTodoUrlCheck(null); }}
                placeholder="飞书多维表链接,如 https://xxx.feishu.cn/base/XXXX?table=YYYY" className={inputClass + ' flex-1'} />
              <button onClick={handleCheckTodoUrl}
                disabled={!todoBitableUrl.trim() || todoUrlChecking}
                className={secondaryBtnClass}>
                {todoUrlChecking ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                检查
              </button>
            </div>

            {/* Permission check result */}
            {todoUrlCheck && (
              <div className={`p-2.5 rounded text-[12px] ${todoUrlCheck.has_permission ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {todoUrlCheck.has_permission ? (
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="font-medium">有权限访问</p>
                      {todoUrlCheck.tables && todoUrlCheck.tables.length > 0 ? (
                        <div className="mt-1.5">
                          <label className="text-[11px]">选择目标表:</label>
                          <select value={todoSelectedTable} onChange={(e) => setTodoSelectedTable(e.target.value)}
                            className="w-full mt-1 px-2 py-1 rounded border border-emerald-200 text-[12px] bg-white">
                            {todoUrlCheck.tables.map(t => (
                              <option key={t.table_id} value={t.table_id}>{t.name || t.table_id}</option>
                            ))}
                          </select>
                          <button onClick={() => syncTodoMut.mutate()}
                            disabled={syncTodoMut.isPending || todoCount === 0}
                            className="mt-2 px-2.5 py-1 rounded text-[12px] text-white inline-flex items-center gap-1 disabled:opacity-40"
                            style={{ background: BRAND_GRAD }}>
                            {syncTodoMut.isPending ? <Loader2 size={11} className="animate-spin" /> : null}同步待办
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] mt-1 opacity-70">该多维表中暂无数据表,请先在飞书中创建</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
                    <div className="flex-1 whitespace-pre-wrap">{todoUrlCheck.message}{todoUrlCheck.guidance ? '\n\n' + todoUrlCheck.guidance : ''}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {syncTodoMut.data && (
          <div className="text-[12px] text-emerald-700 mt-2">
            ✓ 已写入 {syncTodoMut.data.rows} 条待办 ·{' '}
            <a href={syncTodoMut.data.url} target="_blank" rel="noreferrer" className="underline">打开看板</a>
          </div>
        )}
        {!feishuConfigured && <p className="text-[12px] text-ink-muted mt-1.5">请先在 设置 中配置飞书凭证</p>}
        {feishuConfigured && todoCount === 0 && <p className="text-[12px] text-ink-muted mt-1.5">会议纪要中暂无待办事项</p>}
      </div>
    </div>
  )
}

function ActionCard({ title, desc, buttonText, onClick, loading, disabled, hint }: {
  title: string; desc: string; buttonText: string; onClick: () => void
  loading: boolean; disabled: boolean; hint: string
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas-elevated p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-[12px] text-ink-secondary mt-0.5">{desc}</p>
        </div>
        <button
          onClick={onClick}
          disabled={loading || disabled}
          className="shrink-0 px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-40 inline-flex items-center gap-1.5"
          style={{ background: BRAND_GRAD }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : null}
          {buttonText}
        </button>
      </div>
      {hint && <p className="text-[11px] text-ink-muted mt-1">{hint}</p>}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function ConsoleMeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const meetingId = Number(id)
  const nav = useNavigate()
  const qc = useQueryClient()
  // URL ?from_project=<pid>:从项目详情页跳过来,返回时回项目页而不是会议总列表
  const [searchParams] = useSearchParams()
  const fromProject = searchParams.get('from_project') || ''
  const backHref = fromProject ? `/console/projects/${fromProject}` : '/console/meeting'
  const backLabel = fromProject ? '返回项目' : '返回列表'
  const [topView, setTopView] = useState<TopView>('split')
  const [leftTab, setLeftTab] = useState<LeftTab>('minutes')
  const [rightTab, setRightTab] = useState<RightTab>('transcript')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const audioPlayerRef = useRef<AudioPlayerHandle>(null)

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => getMeeting(meetingId),
    enabled: Number.isFinite(meetingId),
    refetchInterval: (qq) => {
      const m = qq.state.data as Meeting | undefined
      return m && (m.status === 'processing' || m.status === 'recording') ? 5000 : false
    },
  })

  const processMut = useMutation({
    mutationFn: () => processMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  })

  const delMut = useMutation({
    mutationFn: () => deleteMeeting(meetingId),
    onSuccess: () => nav(backHref),
  })

  const handleSeekTo = (seconds: number) => {
    audioPlayerRef.current?.seekTo(seconds)
  }

  const hasAudio = !!meeting?.audio_object_key
  const hasContent = !!(meeting && (meeting.raw_transcript || meeting.meeting_minutes))

  if (!Number.isFinite(meetingId)) {
    return <div className="p-8 text-ink-muted">无效的会议 ID</div>
  }
  if (isLoading) {
    return <div className="p-8 text-ink-muted"><Loader2 size={16} className="inline animate-spin mr-2" /> 加载中…</div>
  }
  if (error || !meeting) {
    return <div className="p-8 text-rose-600">会议不存在或无权访问</div>
  }

  const audioUrl = hasAudio ? getMeetingAudioUrl(meeting.id) : ''

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-screen-2xl mx-auto px-6 py-5">
        {/* 返回:URL 带 from_project 时回项目页,否则回会议总列表 */}
        <button
          onClick={() => nav(backHref)}
          className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-3"
        >
          <ChevronLeft size={16} /> {backLabel}
        </button>

        {/* Header 卡片 */}
        <div className="bg-white border border-line rounded-xl shadow-sm px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink truncate">{meeting.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-[12px] text-ink-muted">
              <StatusBadge status={meeting.status} />
              <span>·</span>
              <span>{fmt(meeting.created_at)}</span>
              {meeting.project_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FolderKanban size={11} />
                    {meeting.project_name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            <button
              onClick={() => processMut.mutate()}
              disabled={processMut.isPending || !meeting.raw_transcript}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas disabled:opacity-50 inline-flex items-center gap-1.5"
              title="重新跑完整 AI pipeline"
            >
              {processMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重新处理
            </button>
            <button
              onClick={() => {
                if (window.confirm(`确认删除「${meeting.title}」?`)) delMut.mutate()
              }}
              className="px-3 py-1.5 rounded-md text-sm border border-line text-ink-muted hover:text-rose-600 hover:border-rose-200 bg-white"
              title="删除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* 音频播放器(仅当有录音文件时显示) */}
        {hasAudio && (
          <div className="mt-3">
            <AudioPlayer ref={audioPlayerRef} audioUrl={audioUrl} />
          </div>
        )}

        {/* 转写进度条(2026-05-12 加):processing + total_chunks > 0 才显示 */}
        {meeting.status === 'processing' && meeting.total_chunks > 0 && (
          <div className="mt-3 bg-white border border-line rounded-xl shadow-sm px-5 py-3">
            <div className="flex items-center justify-between mb-2 text-[12px]">
              <span className="text-ink-secondary flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin text-orange-600" />
                正在切片并发转写 · {meeting.asr_engine || 'xiaomi'} ASR
              </span>
              <span className="font-mono text-ink-muted tabular-nums">
                {meeting.done_chunks} / {meeting.total_chunks} 片
                ({Math.round((meeting.done_chunks / meeting.total_chunks) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-orange-100">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(meeting.done_chunks / meeting.total_chunks) * 100}%`,
                  background: BRAND_GRAD,
                }}
              />
            </div>
            {meeting.raw_transcript && (
              <div className="mt-2 text-[12px] text-ink-secondary max-h-24 overflow-y-auto bg-canvas/40 rounded p-2 leading-relaxed border border-line">
                {meeting.raw_transcript.slice(-400)}
                <span className="inline-block w-0.5 h-3 bg-orange-500 ml-0.5 animate-pulse align-middle" />
              </div>
            )}
          </div>
        )}

        {/* 会议纪要模板选择与导出 */}
        {hasContent && meeting.meeting_minutes && (
          <div className="mt-4">
            <TemplateSelector meetingId={meeting.id} meetingTitle={meeting.title} variant="legacy" />
          </div>
        )}

        {/* 主内容区 — 顶栏快捷切换 + 分栏/全屏内容 */}
        <div className="mt-4 bg-white border border-line rounded-xl shadow-sm overflow-hidden">
          {/* 顶部视图切换: 分栏 / 概览 / 操作 */}
          <div className="border-b border-line bg-slate-50/40">
            <div className="flex overflow-x-auto overflow-y-hidden">
              {TOP_VIEWS.map(v => {
                const Icon = v.Icon
                const active = topView === v.key
                return (
                  <button
                    key={v.key}
                    onClick={() => setTopView(v.key)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'border-brand text-brand bg-brand/5'
                        : 'border-transparent text-ink-muted hover:text-ink hover:bg-canvas/60'
                    }`}
                  >
                    <Icon size={14} /> {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          <SeekToContext.Provider value={hasAudio ? handleSeekTo : null}>
            {/* 概览视图 */}
            {topView === 'overview' && (
              <div className="p-6">
                <OverviewTab meeting={meeting} />
              </div>
            )}

            {/* 操作视图 */}
            {topView === 'actions' && (
              <div className="p-6">
                <ActionsTab meeting={meeting} />
              </div>
            )}

            {/* ── 左右分栏视图 ── */}
            {topView === 'split' && (
              <div className="grid grid-cols-1 lg:grid-cols-5" style={{ minHeight: 480 }}>
                {/* 左侧面板: 纪要 / 需求清单 / 干系人 */}
                <div className={`relative ${rightPanelOpen && leftTab !== 'advice' ? 'lg:col-span-3 border-r border-line' : 'lg:col-span-5'}`}>
                  {/* 左侧 Tab 栏 */}
                  <div className="flex border-b border-line bg-slate-50/30 items-center">
                    <div className="flex flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
                      {LEFT_TABS.map(t => {
                        const Icon = t.Icon
                        const active = leftTab === t.key
                        return (
                          <button
                            key={t.key}
                            onClick={() => setLeftTab(t.key)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                              active
                                ? 'border-brand text-brand bg-brand/5'
                                : 'border-transparent text-ink-muted hover:text-ink hover:bg-canvas/40'
                            }`}
                          >
                            <Icon size={13} /> {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* 左侧内容 */}
                  <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
                    {leftTab === 'minutes'       && <MinutesTab meeting={meeting} />}
                    {leftTab === 'advice'        && <AdviceTab meeting={meeting} />}
                    {leftTab === 'requirements'  && <RequirementsTab meeting={meeting} />}
                    {leftTab === 'process_flows' && <ProcessFlowsTab meeting={meeting} />}
                    {leftTab === 'stakeholders'   && <StakeholdersTab meeting={meeting} />}
                    {leftTab === 'illustrations' && <IllustrationsTab meeting={meeting} />}
                  </div>
                  {/* 展开手柄 — 转写面板收起后,贴在右边缘,点一下重新展开(建议 tab 下转写已内嵌,不显示)*/}
                  {!rightPanelOpen && leftTab !== 'advice' && (
                    <button
                      type="button"
                      onClick={() => setRightPanelOpen(true)}
                      title="展开转写面板"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-5 h-16 rounded-full border border-line bg-white text-ink-muted shadow-sm hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <ChevronLeft size={15} />
                    </button>
                  )}
                </div>

                {/* 右侧面板: 原文 / AI润色(可收起;建议 tab 下转写已内嵌于时间轴,隐藏避免重复)*/}
                {rightPanelOpen && leftTab !== 'advice' && (
                  <div className="lg:col-span-2 relative">
                    {/* 收起手柄 — 贴在两栏分割线上,点一下折叠转写面板 */}
                    <button
                      type="button"
                      onClick={() => setRightPanelOpen(false)}
                      title="收起转写面板"
                      className="absolute left-0 top-1/2 -translate-y-1/2 lg:-translate-x-1/2 z-20 flex items-center justify-center w-5 h-16 rounded-full border border-line bg-white text-ink-muted shadow-sm hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <ChevronRight size={15} />
                    </button>
                    {/* 右侧 Tab 栏 */}
                    <div className="flex border-b border-line bg-slate-50/30 items-center">
                      <div className="flex flex-1 min-w-0">
                        {RIGHT_TABS.map(t => {
                          const Icon = t.Icon
                          const active = rightTab === t.key
                          return (
                            <button
                              key={t.key}
                              onClick={() => setRightTab(t.key)}
                              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                                active
                                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                  : 'border-transparent text-ink-muted hover:text-ink hover:bg-canvas/40'
                              }`}
                            >
                              <Icon size={13} /> {t.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {/* 右侧内容 */}
                    <div className="p-4 overflow-y-auto bg-canvas/30" style={{ maxHeight: 'calc(100vh - 360px)' }}>
                      <TranscriptPanel meeting={meeting} tab={rightTab} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </SeekToContext.Provider>
        </div>
      </div>

      {/* 智能问答悬浮球 + 侧边栏 */}
      <ChatWidget meetingId={meeting.id} hasContent={hasContent} />
    </div>
  )
}

// ── 右侧转录面板: 原文 / AI润色 切换展示 ───────────────────────────────────────

function TranscriptPanel({ meeting, tab }: { meeting: Meeting; tab: RightTab }) {
  const content = tab === 'transcript'
    ? (meeting.raw_transcript || '暂无原始转写')
    : (meeting.polished_transcript || '暂无润色转写，可在「操作」页触发 AI 润色')

  const isEmpty = tab === 'transcript' ? !meeting.raw_transcript : !meeting.polished_transcript

  if (isEmpty) {
    return (
      <div className="text-center py-12 text-sm text-ink-muted">
        {tab === 'transcript'
          ? '暂无原始转写内容'
          : (
            <div className="space-y-3">
              <p>暂无润色版本</p>
              <p className="text-xs">切换到「操作」标签可触发 AI 润色</p>
            </div>
          )}
      </div>
    )
  }

  return (
    <div className="text-[13px] leading-relaxed text-ink-secondary prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-2 prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5">
      {tab === 'polished' ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <pre
          className="whitespace-pre-wrap font-sans text-inherit bg-transparent p-0 m-0 border-none"
          style={{ lineHeight: 1.8 }}
        >{content}</pre>
      )}
    </div>
  )
}
