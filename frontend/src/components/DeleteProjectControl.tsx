/**
 * DeleteProjectControl — 项目删除(触发按钮 + 确认弹窗 + 调用)
 *
 * 一处实现,四处复用:console 列表卡片 / console 详情页 / redesign 同两处。
 * 删除走 purge_documents=true —— 项目下关联文档连带彻底删除(切片向量 + minio 原文件),不可恢复。
 * 删除成功后 invalidate ['projects'] / ['stage-summary'] / ['outputs'],并回调 onDeleted(详情页用来跳回列表)。
 *
 * variant:
 *   - 'card'   : 小号垃圾桶图标按钮(列表卡片右上角,绝对定位,hover 才显形 —— 由调用方包 relative group)
 *   - 'header' : 带文字的描边按钮(详情页头部)
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteProject } from '../api/client'

export default function DeleteProjectControl({
  project,
  onDeleted,
  variant = 'card',
  className = '',
}: {
  project: { id: string; name: string; document_count?: number }
  onDeleted?: () => void
  variant?: 'card' | 'header'
  className?: string
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const del = useMutation({
    mutationFn: () => deleteProject(project.id, { purgeDocuments: true }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: ['stage-summary'] }),
        qc.invalidateQueries({ queryKey: ['outputs'] }),
      ])
      setOpen(false)
      onDeleted?.()
    },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '删除失败'),
  })

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setError(null)
    setOpen(true)
  }
  const closeModal = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (del.isPending) return
    setOpen(false)
  }

  const docCount = project.document_count ?? 0

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={openModal}
          title="删除项目"
          className={`absolute top-3 right-3 z-10 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/90 border border-line text-ink-muted opacity-0 group-hover:opacity-100 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all ${className}`}
        >
          <Trash2 size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          title="删除项目"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-ink-muted hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors ${className}`}
        >
          <Trash2 size={13} /> 删除项目
        </button>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-line p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">删除项目</h3>
                <p className="text-sm text-ink-secondary mt-0.5">此操作不可恢复</p>
              </div>
            </div>

            <p className="text-sm text-ink-secondary leading-relaxed mb-2">
              确认删除项目 <span className="font-semibold text-ink">「{project.name}」</span>?
            </p>
            <p className="text-sm text-red-600 leading-relaxed mb-4">
              {docCount > 0
                ? <>该项目下的 <span className="font-semibold">{docCount}</span> 份关联文档将被<span className="font-semibold">一并永久删除</span>(含切片与原文件),无法恢复。</>
                : <>项目及其生成的全部交付物将被永久删除,无法恢复。</>}
            </p>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={del.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-line text-ink-secondary hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { setError(null); del.mutate() }}
                disabled={del.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {del.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {del.isPending ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
