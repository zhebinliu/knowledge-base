/**
 * CitedReportView — 带可点击角标的报告渲染
 *
 * Executor 后处理把 [D1] 转成 markdown link `[D1](#cite-<module_key>-D1)`,
 * 这里检测 `#cite-` 前缀,把链接渲染为可点击 chip + tooltip:
 *  - hover:显示原文摘要
 *  - click:触发 onCitationClick(moduleKey, refId) → 父组件跳右栏引用面板
 *
 * 不依赖 rehype-raw,只用 react-markdown + remark-gfm 默认能力。
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type ProvenanceEntry } from '../../api/client'

interface Props {
  content: string
  provenance: Record<string, Record<string, ProvenanceEntry>>   // {module_key: {D1/K1/W1: entry}}
  onCitationClick: (moduleKey: string, refId: string) => void
}

export default function CitedReportView({ content, provenance, onCitationClick }: Props) {
  return (
    <div className={[
      // prose 基础排版 + 限宽继承父容器
      'prose prose-sm max-w-none',
      // 标题层级:h1 大粗,h2 加上分隔线 + 充足上下间距,h3 中等
      'prose-headings:font-bold prose-headings:text-ink',
      'prose-h1:text-2xl prose-h1:mb-4 prose-h1:pb-3 prose-h1:border-b prose-h1:border-line',
      'prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-1.5 prose-h2:border-b prose-h2:border-orange-100',
      'prose-h3:text-[15px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-[#D96400]',
      // 段落 / 列表
      'prose-p:my-2.5 prose-p:leading-relaxed prose-p:text-[14px]',
      'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5',
      // 表格:全边框 + cell padding + 表头底色 + 横向滚动兜底
      'prose-table:border-collapse prose-table:my-4 prose-table:text-[12.5px] prose-table:w-full',
      'prose-th:border prose-th:border-line prose-th:bg-orange-50/50 prose-th:px-2.5 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold',
      'prose-td:border prose-td:border-line prose-td:px-2.5 prose-td:py-1.5 prose-td:align-top',
      // 行内强调 / 链接 / 代码
      'prose-strong:text-ink prose-strong:font-semibold',
      'prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none',
      'prose-blockquote:border-l-4 prose-blockquote:border-orange-300 prose-blockquote:bg-orange-50/30 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:my-3 prose-blockquote:not-italic prose-blockquote:text-ink-secondary',
      'prose-hr:my-6 prose-hr:border-line',
    ].join(' ')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            // 检测 #cite-<module_key>-<refId>
            if (href && href.startsWith('#cite-')) {
              const id = href.slice(6)              // moduleKey-refId
              const lastDash = id.lastIndexOf('-')
              if (lastDash > 0) {
                const moduleKey = id.slice(0, lastDash)
                const refId = id.slice(lastDash + 1)
                const meta = provenance?.[moduleKey]?.[refId]
                return (
                  <CitationChip
                    moduleKey={moduleKey}
                    refId={refId}
                    meta={meta}
                    onClick={() => onCitationClick(moduleKey, refId)}
                  />
                )
              }
            }
            // 其他链接照常
            return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CitationChip({
  refId, meta, onClick,
}: {
  moduleKey: string
  refId: string
  meta: ProvenanceEntry | undefined
  onClick: () => void
}) {
  // 颜色按 source 类型:doc=橙、kb=蓝、web=紫
  const colorCls = !meta
    ? 'bg-slate-100 text-slate-500'
    : meta.type === 'doc' ? 'bg-orange-50 text-[#D96400] hover:bg-orange-100 border-orange-200'
    : meta.type === 'kb'  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
  const tooltip = meta
    ? `${meta.label}\n${(meta.snippet || '').slice(0, 200)}`
    : `引用 ${refId}(原文未存)`

  return (
    <sup className="not-prose">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onClick() }}
        title={tooltip}
        className={`inline-flex items-center px-1 mx-0.5 text-[0.75em] font-bold rounded border align-baseline cursor-pointer transition-colors ${colorCls}`}
        style={{ lineHeight: 1.2 }}
      >
        {refId}
      </button>
    </sup>
  )
}
