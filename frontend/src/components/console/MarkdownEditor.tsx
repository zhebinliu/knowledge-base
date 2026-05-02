/**
 * MarkdownEditor — 产物 markdown 在线编辑器
 *
 * 适用 kind:insight / survey_outline / survey
 * 形态:左 textarea(可编辑)/ 右实时预览(MarkdownView)
 * 保存:PUT /outputs/{id}/content,覆盖 bundle.content_md
 *
 * 设计取舍:
 * - 简单 textarea + monospace 字体,不引入富文本编辑器(避免依赖 + bundle 体积)
 * - 实时预览方便用户看 markdown 效果,但保存时只传 markdown 文本
 * - 不维护编辑历史(覆盖式)— 想要旧版可重新生成
 * - 不自动同步 provenance — 用户改了角标后,CitationsPanel 仍按原 provenance 渲染
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X, AlertCircle, Loader2 } from 'lucide-react'
import { saveOutputContent, type CuratedBundle } from '../../api/client'
import MarkdownView from '../MarkdownView'

interface Props {
  bundle: CuratedBundle
  initialContent: string
  onClose: () => void
  onSaved: () => void
}

export default function MarkdownEditor({ bundle, initialContent, onClose, onSaved }: Props) {
  const [content, setContent] = useState(initialContent)
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()

  const dirty = content !== initialContent

  const mut = useMutation({
    mutationFn: () => saveOutputContent(bundle.id, content),
    onSuccess: () => {
      // 让 outline / report detail query 失效,触发重新拉取最新 content_md
      qc.invalidateQueries({ queryKey: ['output', bundle.id] })
      qc.invalidateQueries({ queryKey: ['research-outline-detail', bundle.id] })
      onSaved()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || err?.message || '保存失败')
    },
  })

  const handleSave = () => {
    setError(null)
    if (!content.trim()) {
      setError('正文不能为空')
      return
    }
    mut.mutate()
  }

  const handleCancel = () => {
    if (dirty && !confirm('有未保存的修改,确认放弃?')) return
    onClose()
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶栏:标题 + 操作 */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-line bg-slate-50/60 flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">编辑 · {bundle.title}</span>
        {dirty && (
          <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">未保存</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleCancel}
            disabled={mut.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-line text-ink-secondary hover:bg-white hover:text-ink disabled:opacity-50"
          >
            <X size={11} /> 取消
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || mut.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
          >
            {mut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {mut.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </div>
      )}

      {/* 编辑 + 预览双栏 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-line">
        {/* 左:textarea */}
        <div className="flex flex-col min-h-0">
          <div className="flex-shrink-0 px-3 py-1.5 border-b border-line bg-slate-50/30 text-[11px] text-ink-muted">
            Markdown 源码
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-0 w-full resize-none px-4 py-3 font-mono text-xs leading-relaxed text-ink bg-white outline-none border-0 focus:ring-0"
            placeholder="# 标题…"
          />
        </div>

        {/* 右:实时预览 */}
        <div className="flex flex-col min-h-0">
          <div className="flex-shrink-0 px-3 py-1.5 border-b border-line bg-slate-50/30 text-[11px] text-ink-muted">
            实时预览
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
            <MarkdownView content={content} />
          </div>
        </div>
      </div>
    </div>
  )
}
