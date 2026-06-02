/**
 * SmartAdviceBanner — 项目级 AI 智能建议(常驻在项目详情页项目名下方)。
 *
 * 形态:
 *   - 默认折叠成一行 hint:「💡 建议:<开头一句>... · 风险 ×N」
 *   - 点击展开看完整 markdown + 下一步 + 风险列表 + 手动刷新按钮
 *   - 后端事件触发后(文档上传/输出物完成/在线编辑/问卷)前端 invalidate query, 自动重生成
 *   - is_stale=true 时显示「正在更新…」标识 + 自动 refetch
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, ChevronDown, ChevronUp, RotateCw, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { getSmartAdvice, refreshSmartAdvice, type SmartAdviceDto } from '../../api/client'
import ReportMarkdown from '../markdown/ReportMarkdown'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export function smartAdviceQueryKey(projectId: string) {
  return ['smart-advice', projectId] as const
}

export default function SmartAdviceBanner({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  // GET advice — 首次会触发后端同步生成(几秒); 后续 cache 命中即返
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: smartAdviceQueryKey(projectId),
    queryFn: () => getSmartAdvice(projectId, false),
    staleTime: 60 * 1000,                 // 1 min stale time, refetch 触发后端 hash 检查
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // 手动刷新
  const refreshMut = useMutation({
    mutationFn: () => refreshSmartAdvice(projectId),
    onSuccess: (fresh) => {
      qc.setQueryData(smartAdviceQueryKey(projectId), { exists: true, ...fresh })
    },
  })

  // 后端 is_stale=true 时, 自动后台 refetch 一次
  useEffect(() => {
    if (data?.is_stale && !isFetching && !refreshMut.isPending) {
      refetch()
    }
  }, [data?.is_stale, isFetching, refreshMut.isPending, refetch])

  // —— 渲染 ——
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-canvas/50 text-xs text-ink-secondary">
        <Loader2 size={13} className="animate-spin" style={{ color: '#D96400' }} />
        <span>AI 正在分析项目并生成建议(首次约 5-15 秒)…</span>
      </div>
    )
  }

  if (error || !data || data.exists === false) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-dashed border-line bg-canvas/30 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><Sparkles size={12} /> 暂无智能建议</span>
        <button
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
          className="flex items-center gap-1 text-[#D96400] hover:underline disabled:opacity-50"
        >
          {refreshMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {refreshMut.isPending ? '生成中…' : '生成建议'}
        </button>
      </div>
    )
  }

  const advice = data.advice_md ?? ''
  const nextSteps = data.next_steps ?? []
  const risks = data.risks ?? []
  const isStale = !!data.is_stale
  const updating = isFetching || refreshMut.isPending

  // 折叠态摘要:取建议第一句(到第一个 。或换行) + 风险数
  const summary = (() => {
    const md = advice.trim()
    if (!md) return '建议生成中…'
    // 去 markdown header
    const cleaned = md.replace(/^#+\s+/gm, '').replace(/\*\*/g, '')
    const firstSentence = cleaned.split(/[。\n]/).find((s) => s.trim().length > 0)?.trim() ?? cleaned.slice(0, 80)
    return firstSentence.length > 80 ? firstSentence.slice(0, 78) + '…' : firstSentence
  })()

  return (
    <div
      className="rounded-xl border bg-gradient-to-r from-orange-50/60 via-amber-50/40 to-white shadow-sm overflow-hidden transition-all"
      style={{
        borderColor: isStale ? '#FBBF24' : 'rgba(255, 141, 26, 0.30)',
      }}
    >
      {/* 折叠态 header (永远可见, 点击 toggle) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-orange-50/40 transition-colors"
      >
        <span
          className="flex items-center justify-center rounded-md flex-shrink-0 mt-0.5"
          style={{ width: 22, height: 22, background: BRAND_GRAD, boxShadow: '0 0 8px rgba(255,141,26,0.45)' }}
        >
          <Sparkles size={11} className="text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#D96400]">
              AI 智能建议
            </span>
            {updating && (
              <span className="flex items-center gap-1 text-[10px] text-amber-700">
                <Loader2 size={10} className="animate-spin" /> 更新中
              </span>
            )}
            {!updating && isStale && (
              <span className="text-[10px] text-amber-700">⚠ 信息已变, 待刷新</span>
            )}
            {risks.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 font-medium">
                风险 ×{risks.length}
              </span>
            )}
            {data.generated_at && (
              <span className="text-[10px] text-ink-muted ml-auto mr-2">
                {fmtRelative(data.generated_at)}
              </span>
            )}
          </div>
          {!expanded && (
            <div className="mt-0.5 text-xs text-ink-secondary line-clamp-1">
              {summary}
            </div>
          )}
        </div>
        <span className="text-ink-muted flex-shrink-0 mt-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* 展开态 — 完整 markdown + 下一步 + 风险 + 刷新按钮 */}
      {expanded && (
        <div className="border-t border-orange-100 bg-white/40 px-3 py-3 space-y-3">
          {/* 主建议 markdown */}
          {advice && (
            <div className="text-[13px] text-ink leading-relaxed prose prose-sm max-w-none prose-headings:text-ink prose-strong:text-ink">
              <ReportMarkdown content={advice} />
            </div>
          )}

          {/* 下一步 */}
          {nextSteps.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold text-ink-muted tracking-widest mb-1.5">
                下一步动作
              </div>
              <ul className="space-y-1">
                {nextSteps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-ink leading-relaxed">
                    <ArrowRight size={12} className="mt-1 flex-shrink-0 text-[#D96400]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 风险 */}
          {risks.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold text-rose-700 tracking-widest mb-1.5">
                关键风险
              </div>
              <ul className="space-y-1">
                {risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-ink leading-relaxed">
                    <AlertTriangle size={12} className="mt-1 flex-shrink-0 text-rose-600" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 错误展示 */}
          {data.error && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1">
              ⚠ 上次生成失败: {data.error}
            </div>
          )}

          {/* 底部:模型 + 刷新按钮 */}
          <div className="flex items-center gap-2 pt-2 border-t border-orange-100">
            <span className="text-[10px] text-ink-muted">
              {data.model_used && `模型: ${data.model_used}`}
            </span>
            <button
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-line text-ink-secondary hover:bg-canvas disabled:opacity-50"
            >
              {refreshMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
              {refreshMut.isPending ? '刷新中…' : '刷新建议'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── helpers ──
function fmtRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime()
    const dt = (Date.now() - t) / 1000
    if (dt < 60) return '刚刚'
    if (dt < 3600) return `${Math.floor(dt / 60)} 分钟前`
    if (dt < 86400) return `${Math.floor(dt / 3600)} 小时前`
    return `${Math.floor(dt / 86400)} 天前`
  } catch {
    return ''
  }
}
