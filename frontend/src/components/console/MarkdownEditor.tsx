/**
 * MarkdownEditor — 产物所见即所得编辑器(基于 Tiptap)
 *
 * 适用 kind:insight / survey_outline / survey
 * 用户在渲染好的报告样式上直接编辑 → 保存时反向 serialize 成 markdown 写回。
 *
 * 核心:
 * - Tiptap StarterKit:标题 / 段落 / 列表 / 加粗 / 斜体 / 行内代码 / 块代码 等
 * - Table 扩展:GFM 表格(行 / 列 / 表头单元格)
 * - tiptap-markdown:自动 markdown ↔ HTML 双向转换,保存时直接 (editor.storage as any).markdown.getMarkdown()
 *
 * 设计取舍:
 * - 角标 [D1][K1][W1] 在编辑器里显示成 plain text(用户看见 "[D1]")。这样不需要自定义 Citation node。
 *   读视图(CitedReportView)依然把它渲染成漂亮的彩色徽章。
 * - 不维护编辑历史(覆盖式)
 * - 不自动同步 provenance — 用户改了角标后,CitationsPanel 仍按原 provenance 渲染
 */
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Markdown } from 'tiptap-markdown'
import {
  Save, X, AlertCircle, Loader2,
  Bold, Italic, Code, List, ListOrdered, Quote, Heading2, Heading3, Undo, Redo,
} from 'lucide-react'
import { saveOutputContent, type CuratedBundle } from '../../api/client'

interface Props {
  bundle: CuratedBundle
  initialContent: string
  onClose: () => void
  onSaved: () => void
}

export default function MarkdownEditor({ bundle, initialContent, onClose, onSaved }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const qc = useQueryClient()

  const editor = useEditor({
    extensions: [
      StarterKit,
      // GFM 表格 — markdown round-trip 需要
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // markdown round-trip 核心 — 输入 markdown,输出 markdown
      Markdown.configure({
        html: false,           // 不允许编辑器内嵌 HTML(防注入)
        tightLists: true,      // 列表项不加空行
        bulletListMarker: '-', // 与 KB 输出风格一致
        linkify: true,
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        // index.css 里的 .kb-editor — 自定义最小样式(没装 tailwind typography)
        class: 'kb-editor px-8 py-7 min-h-full',
      },
    },
    onUpdate: () => setDirty(true),
  })

  // 卸载时销毁
  useEffect(() => {
    return () => { editor?.destroy() }
  }, [editor])

  const mut = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('编辑器未就绪')
      // tiptap-markdown 提供的 markdown serializer
      const md = (editor.storage as any).markdown.getMarkdown() as string
      return saveOutputContent(bundle.id, md)
    },
    onSuccess: () => {
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
    if (!editor) return
    const md = ((editor.storage as any).markdown.getMarkdown() as string).trim()
    if (!md) {
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

      {/* 工具栏 */}
      {editor && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-line bg-slate-50/30 flex items-center gap-0.5 flex-wrap">
          <ToolbarBtn active={editor.isActive('heading', { level: 2 })}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                      title="二级标题"><Heading2 size={13} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('heading', { level: 3 })}
                      onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                      title="三级标题"><Heading3 size={13} /></ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn active={editor.isActive('bold')}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      title="加粗 (Ctrl+B)"><Bold size={13} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('italic')}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      title="斜体 (Ctrl+I)"><Italic size={13} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('code')}
                      onClick={() => editor.chain().focus().toggleCode().run()}
                      title="行内代码"><Code size={13} /></ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn active={editor.isActive('bulletList')}
                      onClick={() => editor.chain().focus().toggleBulletList().run()}
                      title="无序列表"><List size={13} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('orderedList')}
                      onClick={() => editor.chain().focus().toggleOrderedList().run()}
                      title="有序列表"><ListOrdered size={13} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('blockquote')}
                      onClick={() => editor.chain().focus().toggleBlockquote().run()}
                      title="引用"><Quote size={13} /></ToolbarBtn>
          <ToolbarSep />
          <ToolbarBtn onClick={() => editor.chain().focus().undo().run()}
                      disabled={!editor.can().undo()}
                      title="撤销 (Ctrl+Z)"><Undo size={13} /></ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().redo().run()}
                      disabled={!editor.can().redo()}
                      title="重做 (Ctrl+Y)"><Redo size={13} /></ToolbarBtn>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </div>
      )}

      {/* 编辑区 — 在白卡内,跟读视图同款灰底环境 */}
      <div className="flex-1 min-h-0 overflow-auto bg-canvas px-5 py-5">
        <div className="max-w-[1200px] mx-auto">
          <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 工具栏小组件 ────────────────────────────────────────────────────────────────

function ToolbarBtn({ active, disabled, onClick, title, children }: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-orange-100 text-[#D96400]' : 'text-ink-secondary hover:bg-slate-100 hover:text-ink'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function ToolbarSep() {
  return <span className="w-px h-4 bg-line mx-1" />
}
