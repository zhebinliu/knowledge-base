import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listReviewQueue, approveReview, rejectReview } from '../api/client'
import {
  CheckCircle, XCircle, ClipboardCheck, AlertTriangle,
  Cpu, MapPin, Tag, ChevronLeft, ChevronRight, SkipForward,
} from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import { useAuth } from '../auth/AuthContext'
import { ltcLabel, industryLabel, tagLabel } from '../utils/labels'

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.85 ? 'bg-green-400' : value >= 0.6 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold tabular-nums ${
        value >= 0.85 ? 'text-green-600' : value >= 0.6 ? 'text-amber-600' : 'text-red-500'
      }`}>{pct}%</span>
    </div>
  )
}

export default function Review() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const reviewer = user?.username || 'unknown'
  const [cursor, setCursor] = useState(0)

  const { data: items, isLoading } = useQuery({
    queryKey: ['review-queue'],
    queryFn: listReviewQueue,
    refetchInterval: 15_000,
  })

  const total = items?.length ?? 0
  // Keep cursor in bounds: after an approve/reject the list shrinks,
  // old cursor now naturally points to the next item (or stays at last).
  const safeIdx = total > 0 ? Math.min(cursor, total - 1) : 0
  const item = items?.[safeIdx]

  const go = (dir: 1 | -1) =>
    setCursor(c => Math.max(0, Math.min(total - 1, c + dir)))

  const skip = () =>
    setCursor(c => (c + 1 >= total ? 0 : c + 1))

  const approve = useMutation({
    mutationFn: ({ id }: { id: string }) => approveReview(id, reviewer),
    // Don't advance cursor — after refetch the acted item is gone,
    // so the same cursor index naturally points to the next item.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })

  const reject = useMutation({
    mutationFn: ({ id }: { id: string }) => rejectReview(id, reviewer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })

  const acting = approve.isPending || reject.isPending

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">审核队列</h1>
        {total > 0 && (
          <div className="flex items-center gap-2">
            {/* Prev / counter / Next */}
            <button
              onClick={() => go(-1)}
              disabled={safeIdx === 0}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
              title="上一条"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm tabular-nums font-medium text-gray-600 min-w-[56px] text-center">
              {safeIdx + 1} / {total}
            </span>
            <button
              onClick={() => go(1)}
              disabled={safeIdx === total - 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
              title="下一条"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-center text-gray-400 py-12">加载中…</p>}

      {!isLoading && total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ClipboardCheck size={48} className="mb-3 opacity-30" />
          <p className="text-sm">暂无待审核内容</p>
        </div>
      )}

      {/* Progress bar */}
      {total > 1 && (
        <div className="flex gap-0.5 mb-4">
          {items!.map((_, i) => (
            <button
              key={i}
              onClick={() => setCursor(i)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i === safeIdx ? 'bg-orange-500' : 'bg-gray-200 hover:bg-gray-300'
              }`}
              title={`第 ${i + 1} 条`}
            />
          ))}
        </div>
      )}

      {/* Single card */}
      {item && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Header banner */}
          <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-orange-700 font-medium mb-2">{item.reason}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {item.chunk_ltc_stage && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 font-medium">
                        {ltcLabel(item.chunk_ltc_stage)}
                      </span>
                      {item.chunk_ltc_stage_confidence != null && (
                        <div className="w-24">
                          <ConfidenceBar value={item.chunk_ltc_stage_confidence} />
                        </div>
                      )}
                    </div>
                  )}
                  {item.chunk_industry && item.chunk_industry !== 'other' && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin size={11} className="text-gray-400" />
                      {industryLabel(item.chunk_industry)}
                    </span>
                  )}
                  {item.chunk_module && (
                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                      {item.chunk_module}
                    </span>
                  )}
                  {item.chunk_source_section && (
                    <span className="text-xs text-gray-400 truncate max-w-[200px]" title={item.chunk_source_section}>
                      § {item.chunk_source_section}
                    </span>
                  )}
                  {item.chunk_generated_by_model && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto flex-shrink-0">
                      <Cpu size={10} />{item.chunk_generated_by_model}
                    </span>
                  )}
                </div>

                {item.chunk_tags && item.chunk_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    <Tag size={10} className="text-gray-400" />
                    {item.chunk_tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {tagLabel(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                {new Date(item.created_at).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </div>
          </div>

          {/* Chunk content */}
          <div className="px-5 py-4 min-h-[120px]">
            {item.chunk_content ? (
              <MarkdownView content={item.chunk_content} size="sm" />
            ) : (
              <p className="text-sm text-gray-400 italic">
                Chunk ID: {item.chunk_id}（内容加载中或已删除）
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
            <button
              onClick={() => approve.mutate({ id: item.id })}
              disabled={acting}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle size={14} /> 通过
            </button>
            <button
              onClick={() => reject.mutate({ id: item.id })}
              disabled={acting}
              className="flex items-center gap-1.5 px-5 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <XCircle size={14} /> 拒绝
            </button>
            <div className="flex-1" />
            <button
              onClick={skip}
              disabled={acting || total <= 1}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors"
            >
              <SkipForward size={14} /> 跳过
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
