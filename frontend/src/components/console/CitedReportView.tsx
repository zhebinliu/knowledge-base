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
      'text-[14px] text-ink leading-relaxed',
      // 标题层级 (用 [&_xxx]: arbitrary descendant 选择器,不依赖 prose 插件)
      '[&_h1]:text-[26px] [&_h1]:font-extrabold [&_h1]:text-ink [&_h1]:mb-5 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-line',
      '[&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-orange-100',
      '[&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-[#D96400] [&_h3]:mt-5 [&_h3]:mb-2',
      '[&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:text-ink [&_h4]:mt-4 [&_h4]:mb-1.5',
      // 段落 / 列表
      '[&_p]:my-2.5 [&_p]:leading-[1.75]',
      '[&_ul]:my-2.5 [&_ul]:pl-6 [&_ul]:list-disc',
      '[&_ol]:my-2.5 [&_ol]:pl-6 [&_ol]:list-decimal',
      '[&_li]:my-1 [&_li]:leading-[1.7]',
      // 表格:全边框 + cell padding + 表头底色
      '[&_table]:border-collapse [&_table]:my-4 [&_table]:w-full [&_table]:text-[13px]',
      '[&_th]:border [&_th]:border-line [&_th]:bg-orange-50/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink',
      '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-ink-secondary',
      // 行内
      '[&_strong]:text-ink [&_strong]:font-semibold',
      '[&_em]:italic [&_em]:text-ink-secondary',
      '[&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12.5px] [&_code]:font-mono',
      '[&_a:not(.not-prose_a)]:text-[#D96400] [&_a:not(.not-prose_a)]:no-underline hover:[&_a:not(.not-prose_a)]:underline',
      // 引用块
      '[&_blockquote]:border-l-4 [&_blockquote]:border-orange-300 [&_blockquote]:bg-orange-50/30 [&_blockquote]:py-2 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-ink-secondary [&_blockquote_p]:my-1',
      '[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line',
      // 代码块 (多行)
      '[&_pre]:bg-slate-50 [&_pre]:border [&_pre]:border-line [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:text-[12.5px]',
      '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
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
