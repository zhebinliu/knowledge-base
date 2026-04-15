import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listReviewQueue, approveReview, rejectReview } from '../api/client'
import { CheckCircle, XCircle, ClipboardCheck } from 'lucide-react'

export default function Review() {
  const qc = useQueryClient()

  const { data: items, isLoading } = useQuery({
    queryKey: ['review-queue'],
    queryFn: listReviewQueue,
    refetchInterval: 15_000,
  })

  const approve = useMutation({
    mutationFn: ({ id }: { id: string }) => approveReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })

  const reject = useMutation({
    mutationFn: ({ id }: { id: string }) => rejectReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">审核队列</h1>
        {items && (
          <span className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm font-medium">
            {items.length} 条待审核
          </span>
        )}
      </div>

      {isLoading && <p className="text-center text-gray-400 py-12">加载中…</p>}

      {!isLoading && items?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ClipboardCheck size={48} className="mb-3 opacity-30" />
          <p className="text-sm">暂无待审核内容</p>
        </div>
      )}

      <div className="space-y-4">
        {items?.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-600 font-medium mb-1">
                    原因：{item.reason}
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {/* If chunk content is embedded, show it; otherwise show chunk_id */}
                    {(item as any).chunk?.content ?? `Chunk ID: ${item.chunk_id}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(item.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => approve.mutate({ id: item.id })}
                    disabled={approve.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={14} /> 通过
                  </button>
                  <button
                    onClick={() => reject.mutate({ id: item.id })}
                    disabled={reject.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={14} /> 拒绝
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
