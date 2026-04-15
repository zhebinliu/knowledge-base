import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listReviewQueue, approveReview, rejectReview } from '../api/client'
import { CheckCircle, XCircle, ClipboardCheck, AlertTriangle } from 'lucide-react'

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
        {items && items.length > 0 && (
          <span className="px-3 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-sm font-medium">
            {items.length} 条待审核
          </span>
        )}
      </div>

      {isLoading && <p className="text-center text-gray-400 py-12">加载中…</p>}

      {!isLoading && items?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ClipboardCheck size={48} className="mb-3 opacity-30"/>
          <p className="text-sm">暂无待审核内容</p>
        </div>
      )}

      <div className="space-y-4">
        {items?.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Reason banner */}
            <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
              <AlertTriangle size={13} className="text-orange-500 flex-shrink-0"/>
              <p className="text-xs text-orange-700 font-medium">{item.reason}</p>
              <div className="ml-auto flex items-center gap-3">
                {item.chunk_ltc_stage && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                    {item.chunk_ltc_stage}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(item.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>

            {/* Chunk content */}
            <div className="px-5 py-4">
              {item.chunk_content ? (
                <p className="text-sm text-gray-800 leading-relaxed">
                  {item.chunk_content}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Chunk ID: {item.chunk_id}（内容加载中或已删除）
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => approve.mutate({ id: item.id })}
                disabled={approve.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle size={14}/> 通过
              </button>
              <button
                onClick={() => reject.mutate({ id: item.id })}
                disabled={reject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XCircle size={14}/> 拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
