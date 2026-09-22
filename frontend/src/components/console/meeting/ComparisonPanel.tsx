/**
 * 跨会议对比面板 — 把本场会议与本项目「上一场有纪要的会议」横向比。
 *
 * 唯一的长任务(要喂两场的纪要与转写摘录,单次 LLM 几十秒到两分钟),所以:
 *   POST 启动 → 拿 task_id → 每 4s 轮询状态 → SUCCESS 后 invalidate 会议详情
 * 结果不从这里取 —— 后端任务直接写回 `Meeting.comparison_insight`,轮询只用来
 * 判断「好了没」。这样刷新页面/关掉再打开也能看到上次的结果。
 *
 * 四态要分别处理,不能都渲染成空面板:
 *   running          生成中(含「正在和谁比」)
 *   done             有结果
 *   failed           有 error 文案(首场会议 / 上一场无纪要 / 模型失败)
 *   无 candidate     本项目根本没有更早的会议
 *
 * ⚠️ 变化条目必须展示 `evidence`。这是对「AI 说项目推进了」唯一的取证:
 *    后端已经把「原文里查无此句」的条目丢掉了,但留下的也必须让人自己看一眼。
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, CheckCircle2, GitCompareArrows, Lightbulb,
  Loader2, MinusCircle, RefreshCw, TrendingDown, TrendingUp, Sparkles,
} from 'lucide-react'
import {
  getCompareCandidate,
  getCompareInsightStatus,
  startCompareInsight,
  type Meeting,
} from '../../../api/client'
import { toast } from '../../Toaster'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const POLL_MS = 4000

// 趋势 → 图标 + 颜色。颜色只表达方向,不表达好坏 —— 「回退」用红是因为需要被注意到。
const TREND_STYLE: Record<string, { Icon: typeof TrendingUp; color: string; bg: string }> = {
  推进: { Icon: TrendingUp, color: '#047857', bg: '#ECFDF5' },
  新增: { Icon: Sparkles, color: '#B45309', bg: '#FFFBEB' },
  停滞: { Icon: MinusCircle, color: '#6B7280', bg: '#F9FAFB' },
  回退: { Icon: TrendingDown, color: '#B91C1C', bg: '#FEF2F2' },
  无变化: { Icon: MinusCircle, color: '#6B7280', bg: '#F9FAFB' },
}

const PRIORITY_COLOR: Record<string, string> = { 高: '#B91C1C', 中: '#B45309', 低: '#6B7280' }

export default function ComparisonPanel({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const stoppedRef = useRef(false)

  const data = meeting.comparison_insight
  const candidateQ = useQuery({
    queryKey: ['compare-candidate', meeting.id],
    queryFn: () => getCompareCandidate(meeting.id),
    // 上一场会议不会在页面停留期间变出来,查一次就够
    staleTime: 5 * 60 * 1000,
  })

  // 进页面时若后端还在跑(running),自动接上轮询 —— 否则用户会看到永远转不完的圈
  useEffect(() => {
    if (data?.status === 'running' && !taskId && !polling) {
      // 没有 task_id 也没关系:下面的 invalidate 轮询兜底
      setPolling(true)
    }
  }, [data?.status, taskId, polling])

  // task_id 轮询:只在本次会话发起的对比上跑
  useEffect(() => {
    if (!taskId || !polling) return
    stoppedRef.current = false
    const timer = setInterval(async () => {
      if (stoppedRef.current) return
      try {
        const st = await getCompareInsightStatus(meeting.id, taskId)
        if (st.state === 'SUCCESS' || st.state === 'FAILURE') {
          stoppedRef.current = true
          setPolling(false)
          setTaskId(null)
          qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
          if (st.state === 'FAILURE') toast.error(st.error || '对比失败')
        }
      } catch {
        // 单次轮询失败不打断:网络抖动而已,下一轮继续
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [taskId, polling, meeting.id, qc])

  // 没有 task_id 的 running(用户刷新了页面):靠 Invalidating 会议详情来判断有没有跑完,
  // 免得留下一个永远转的圈。
  useEffect(() => {
    if (data?.status !== 'running' || taskId) return
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
    }, POLL_MS * 2)
    return () => clearInterval(timer)
  }, [data?.status, taskId, meeting.id, qc])

  const startMut = useMutation({
    mutationFn: () => startCompareInsight(meeting.id),
    onSuccess: (r) => {
      setTaskId(r.task_id)
      setPolling(true)
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.info(`正在与「${r.prev_meeting_title}」对比…`)
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : '启动对比失败')
      toast.error(msg)
    },
  })

  const prev = candidateQ.data?.prev ?? null
  const reason = candidateQ.data?.reason ?? null
  const running = data?.status === 'running' || polling

  // ── 无上一场可比的三种情形 ────────────────────────────────────────────
  if (!meeting.project_id || (!prev && !reason && candidateQ.isFetched) || reason) {
    return (
      <Notice
        text={reason || (meeting.project_id ? '本项目没有更早的、已出纪要的会议' : '这场会议没有归属项目')}
        hint="对比需要同项目里至少两场已出纪要的会议"
      />
    )
  }

  // ── 有结果 ───────────────────────────────────────────────────────────
  if (data && data.status === 'done' && (data.changes?.length || data.suggestions?.length)) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 text-ink-secondary">
            <GitCompareArrows size={12} />
            对比基准:{data.prev_meeting_title || '上一场会议'}
            {data.prev_meeting_date && `(${data.prev_meeting_date})`}
          </span>
          {data.generated_at && (
            <span className="text-ink-muted">生成于 {data.generated_at.slice(0, 16).replace('T', ' ')}</span>
          )}
          <button
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending || running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-ink-secondary hover:bg-canvas disabled:opacity-50"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {running ? '对比中…' : '重新对比'}
          </button>
        </div>

        {data.summary && (
          <p className="mb-3 rounded-md border-l-2 border-brand bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-secondary">
            <span className="font-medium text-ink">总览:</span>
            {data.summary}
          </p>
        )}

        {data.changes?.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold text-ink">变化({data.changes.length})</h4>
            <div className="space-y-2">
              {data.changes.map((c, i) => {
                const st = TREND_STYLE[c.trend] ?? TREND_STYLE['无变化']
                const { Icon } = st
                return (
                  <div key={i} className="rounded-lg border border-line bg-white p-2.5">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ color: st.color, background: st.bg }}
                      >
                        <Icon size={11} />
                        {c.trend}
                      </span>
                      <span className="text-xs font-medium text-ink">{c.dimension}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
                      <span className="text-ink-muted">{c.before || '未提及'}</span>
                      <ArrowRight size={11} className="shrink-0 text-ink-muted" />
                      <span>{c.after}</span>
                    </div>
                    {/* 取证:必须显式展示,这是判断「AI 有没有编」的唯一依据 */}
                    {c.evidence && (
                      <p className="mt-1.5 border-l-2 border-line pl-2 text-[11px] italic text-ink-muted">
                        原文:{c.evidence}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {data.suggestions?.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-ink">
              <Lightbulb size={12} /> 建议({data.suggestions.length})
            </h4>
            <ol className="space-y-1.5">
              {data.suggestions.map((s, i) => (
                <li key={i} className="rounded-lg border border-line bg-white p-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ background: PRIORITY_COLOR[s.priority] ?? '#6B7280' }}
                    >
                      {s.priority}
                    </span>
                    <div>
                      <p className="text-xs text-ink">{s.action}</p>
                      {s.rationale && (
                        <p className="mt-0.5 text-[11px] text-ink-muted">{s.rationale}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {typeof data.evidence_dropped === 'number' && data.evidence_dropped > 0 && (
          <p className="mt-3 flex items-start gap-1 text-[11px] text-ink-muted">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
            已自动剔除 {data.evidence_dropped} 条「原文中查无实据」的变化 —— 这类内容多半是模型
            凭常识补的,不作为洞察展示。
          </p>
        )}
      </div>
    )
  }

  // ── 生成中 ───────────────────────────────────────────────────────────
  if (running) {
    return (
      <div className="py-8 text-center text-ink-muted">
        <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
        <p className="text-sm">
          正在{data?.prev_meeting_title ? `与「${data.prev_meeting_title}」` : ''}对比…
        </p>
        <p className="mt-1 text-xs">要读两场会议的纪要与转写,通常需要 1-2 分钟</p>
      </div>
    )
  }

  // ── failed(有 error 文案)/ 尚未生成 ─────────────────────────────────
  const failedMsg = data?.status === 'failed' ? data.error : null

  return (
    <div className="py-6 text-center">
      {failedMsg ? (
        <>
          <AlertTriangle size={24} className="mx-auto mb-2 text-amber-500" />
          <p className="mb-1 text-sm text-ink-secondary">对比未完成</p>
          <p className="mb-3 text-xs text-ink-muted">{failedMsg}</p>
        </>
      ) : (
        <>
          <GitCompareArrows size={26} className="mx-auto mb-2 text-ink-muted" />
          <p className="mb-1 text-sm text-ink-muted">尚未与上一场会议对比</p>
          {prev && (
            <p className="mb-3 text-xs text-ink-muted">
              将对比:<span className="text-ink-secondary">{prev.title}</span>
              {prev.created_at && `(${prev.created_at.slice(0, 10)})`}
            </p>
          )}
        </>
      )}
      <button
        onClick={() => startMut.mutate()}
        disabled={startMut.isPending}
        className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm text-white disabled:opacity-50"
        style={{ background: BRAND_GRAD }}
      >
        {startMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <GitCompareArrows size={13} />}
        与上一场会议对比
      </button>
    </div>
  )
}

function Notice({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="py-6 text-center text-sm text-ink-muted">
      <GitCompareArrows size={24} className="mx-auto mb-2" />
      {text}
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </div>
  )
}
