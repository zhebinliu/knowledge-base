/**
 * BundleOverrideModal — 用户人工修订后上传覆盖 bundle.content_md
 *
 * 适用 kind:research_report / blueprint_design / object_field_layout / process_setup
 *
 * 三种输入形态(Tab 切换):
 *  1. 上传 .md / .markdown / .txt 文件  → multipart
 *  2. 上传 .docx 文件                   → multipart(后端 python-docx 转纯文本)
 *  3. 粘贴 markdown 文本                → JSON
 *
 * 上传成功后:
 *  - bundle.content_md 被覆盖
 *  - bundle.extra.user_modified_history 追加一条
 *  - 智能建议 mark_stale
 *  - 下游对象字段表 / 流程建设表再生成时,自动以修订版作为 [B1]
 */
import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  X, Upload, FileText, Clipboard, Loader2, AlertTriangle, CheckCircle2, FileType,
} from 'lucide-react'
import { overrideBundleMarkdown } from '../../api/client'

type Tab = 'upload-md' | 'upload-docx' | 'paste'

interface Props {
  open: boolean
  bundleId: string
  bundleKindLabel: string  // 例如 "蓝图设计"、"对象字段表"
  /** 当前内容字数,展示给用户对比修订前后体积 */
  currentChars?: number
  onClose: () => void
  /** 成功后调用,用于刷新 bundle 详情 */
  onSuccess: () => void
}

const MAX_BYTES = 4 * 1024 * 1024

export default function BundleOverrideModal({
  open, bundleId, bundleKindLabel, currentChars, onClose, onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>('upload-md')
  const [mdFile, setMdFile] = useState<File | null>(null)
  const [docxFile, setDocxFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ orig: number; new: number; source: string } | null>(null)
  const mdInputRef = useRef<HTMLInputElement>(null)
  const docxInputRef = useRef<HTMLInputElement>(null)

  const mut = useMutation({
    mutationFn: async () => {
      setError(null)
      if (tab === 'upload-md') {
        if (!mdFile) throw new Error('请先选择 .md / .markdown / .txt 文件')
        if (mdFile.size > MAX_BYTES) throw new Error(`文件超过 4MB(${mdFile.size} 字节)`)
        return overrideBundleMarkdown(bundleId, { file: mdFile }, 'upload-md')
      }
      if (tab === 'upload-docx') {
        if (!docxFile) throw new Error('请先选择 .docx 文件')
        if (docxFile.size > MAX_BYTES) throw new Error(`文件超过 4MB(${docxFile.size} 字节)`)
        return overrideBundleMarkdown(bundleId, { file: docxFile }, 'upload-docx')
      }
      // paste
      const text = pasteText.trim()
      if (!text) throw new Error('粘贴内容为空')
      const bytes = new Blob([text]).size
      if (bytes > MAX_BYTES) throw new Error(`粘贴内容超过 4MB(${bytes} 字节)`)
      return overrideBundleMarkdown(bundleId, { content_md: text }, 'paste')
    },
    onSuccess: (r) => {
      setSuccess({ orig: r.original_chars, new: r.new_chars, source: r.source })
      // 1.5s 后自动关闭 + 触发上层刷新
      setTimeout(() => {
        onSuccess()
        onClose()
        setSuccess(null)
        setMdFile(null); setDocxFile(null); setPasteText('')
      }, 1500)
    },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '上传失败'),
  })

  if (!open) return null

  const tabBtn = (key: Tab, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => { setTab(key); setError(null) }}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium transition-colors border-b-2 ${
        tab === key
          ? 'border-orange-500 text-orange-600 bg-orange-50/50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !mut.isPending) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <Upload size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-800">
            上传修订版「{bundleKindLabel}」覆盖原产出
          </h2>
          <button
            onClick={onClose}
            disabled={mut.isPending}
            className="ml-auto text-gray-400 hover:text-gray-700 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* 说明 */}
        <div className="px-5 py-2 bg-amber-50/60 border-b border-amber-100 text-[11px] text-amber-800 leading-relaxed">
          <AlertTriangle size={12} className="inline-block mr-1 -mt-0.5" />
          覆盖式更新 — 原内容会被替换。覆盖后下游产物再次生成时会以**当前**这份作为依据。
          {typeof currentChars === 'number' && (
            <span className="ml-2 text-gray-500">(当前 {currentChars.toLocaleString()} 字)</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {tabBtn('upload-md', '上传 .md', FileText)}
          {tabBtn('upload-docx', '上传 .docx', FileType)}
          {tabBtn('paste', '粘贴文本', Clipboard)}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {tab === 'upload-md' && (
            <div>
              <p className="text-xs text-gray-600 mb-3">
                推荐:在 Cursor / VS Code / Typora 编辑修订后,另存为 <code className="bg-gray-100 px-1 rounded text-[10px]">.md</code> 上传。
                <br />
                <span className="text-gray-400">支持 .md / .markdown / .txt(UTF-8 编码,上限 4MB)</span>
              </p>
              <input
                ref={mdInputRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={(e) => setMdFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => mdInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 hover:border-orange-300 rounded-lg py-8 text-center transition-colors group"
              >
                {mdFile ? (
                  <div>
                    <FileText size={24} className="mx-auto text-orange-500 mb-2" />
                    <p className="text-sm font-medium text-gray-700">{mdFile.name}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{(mdFile.size / 1024).toFixed(1)} KB · 点击重新选择</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto text-gray-300 group-hover:text-orange-400 mb-2" />
                    <p className="text-xs text-gray-500">点击选择 .md 文件</p>
                  </div>
                )}
              </button>
            </div>
          )}

          {tab === 'upload-docx' && (
            <div>
              <p className="text-xs text-gray-600 mb-3">
                适合从 Word / WPS / 飞书文档导出后直接上传。
                <br />
                <span className="text-gray-400">
                  注意:docx 仅保留段落 + 表格的纯文本,不会还原图片 / mermaid / 复杂格式。
                  要保留图表请用 .md 形态。
                </span>
              </p>
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setDocxFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => docxInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 hover:border-orange-300 rounded-lg py-8 text-center transition-colors group"
              >
                {docxFile ? (
                  <div>
                    <FileType size={24} className="mx-auto text-orange-500 mb-2" />
                    <p className="text-sm font-medium text-gray-700">{docxFile.name}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{(docxFile.size / 1024).toFixed(1)} KB · 点击重新选择</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto text-gray-300 group-hover:text-orange-400 mb-2" />
                    <p className="text-xs text-gray-500">点击选择 .docx 文件</p>
                  </div>
                )}
              </button>
            </div>
          )}

          {tab === 'paste' && (
            <div>
              <p className="text-xs text-gray-600 mb-3">
                直接粘贴修订后的 markdown 全文。
                <br />
                <span className="text-gray-400">上限 4MB,约 ~400 万字符</span>
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="粘贴 markdown 全文…"
                rows={14}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100 resize-y"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                当前 {pasteText.length.toLocaleString()} 字符
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          {error && (
            <p className="text-xs text-red-600 flex-1">
              <AlertTriangle size={11} className="inline-block mr-1 -mt-0.5" />
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-700 flex-1">
              <CheckCircle2 size={11} className="inline-block mr-1 -mt-0.5" />
              已覆盖成功 — 原 {success.orig.toLocaleString()} 字 → 新 {success.new.toLocaleString()} 字
              ({success.source})
            </p>
          )}
          {!error && !success && <div className="flex-1" />}
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending || !!success
              || (tab === 'upload-md' && !mdFile)
              || (tab === 'upload-docx' && !docxFile)
              || (tab === 'paste' && !pasteText.trim())
            }
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-md disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {mut.isPending && <Loader2 size={12} className="animate-spin" />}
            {mut.isPending ? '上传中…' : '确认覆盖'}
          </button>
        </div>
      </div>
    </div>
  )
}
