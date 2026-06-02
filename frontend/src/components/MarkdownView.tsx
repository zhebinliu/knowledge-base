import { useState } from 'react'
import { type Components } from 'react-markdown'
import { Copy, Check, Code, Eye } from 'lucide-react'
import ReportMarkdown from './markdown/ReportMarkdown'

interface Props {
  content: string
  /** Size preset for typography — 'sm' for compact (chunk rows), 'base' for drawers/main views */
  size?: 'sm' | 'base'
  /** Show the toolbar with copy / source-toggle buttons. Default true. */
  toolbar?: boolean
  /** Extra classes for the outer wrapper */
  className?: string
}

// 元素主题(亮色 prose 风格)。code/a 的行为(mermaid / 引用)由 ReportMarkdown 统一叠加,
// 这里只保留各元素的视觉样式 —— 渲染引擎(清洗 + 表格修复 + mermaid)跟其他报告共用一份。
const MD_COMPONENTS: Components = {
  code: ({ children, className }: any) =>
    className
      ? <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre my-2">{children}</code>
      : <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
  a: ({ href, children }: any) =>
    <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">{children}</a>,
  table: ({ children }: any) =>
    <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
  th: ({ children }: any) =>
    <th className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }: any) =>
    <td className="border border-gray-200 px-3 py-1.5">{children}</td>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-0.5 my-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-0.5 my-1">{children}</ol>,
  h1: ({ children }: any) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="my-1 leading-relaxed">{children}</p>,
  blockquote: ({ children }: any) =>
    <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-600 italic my-2">{children}</blockquote>,
  hr: () => <hr className="my-2 border-gray-200"/>,
}

/**
 * 通用 markdown 渲染器(亮色)。底层走共享的 ReportMarkdown —— 跟 insight / 蓝图 / 对象字段表
 * 同一套清洗 + 表格分隔行修复 + mermaid,只是元素样式用这里的 prose 主题。
 * 自带工具条:复制原文 / 切换源码视图。
 */
export default function MarkdownView({
  content,
  size = 'base',
  toolbar = true,
  className = '',
}: Props) {
  const [showSource, setShowSource] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }

  const proseCls =
    size === 'sm'
      ? 'prose prose-xs prose-gray max-w-none text-xs'
      : 'prose prose-sm prose-gray max-w-none text-sm'

  return (
    <div className={`relative ${className}`}>
      {toolbar && (
        <div className="flex items-center justify-end gap-1.5 mb-2">
          <button
            onClick={() => setShowSource(s => !s)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            title={showSource ? '查看渲染效果' : '查看 Markdown 源码'}
            type="button"
          >
            {showSource ? <Eye size={12}/> : <Code size={12}/>}
            {showSource ? '渲染' : '源码'}
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            title="复制 Markdown 源码"
            type="button"
          >
            {copied ? <Check size={12} className="text-green-600"/> : <Copy size={12}/>}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}

      {showSource ? (
        <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-lg p-4 border border-gray-100">
          {content}
        </pre>
      ) : (
        <div className={proseCls}>
          <ReportMarkdown content={content} components={MD_COMPONENTS} />
        </div>
      )}
    </div>
  )
}
