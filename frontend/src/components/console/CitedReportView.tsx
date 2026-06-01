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
import { useEffect, useId, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { type ProvenanceEntry } from '../../api/client'

// mermaid 全局初始化(模块级,只跑一次):securityLevel=loose 允许 click 事件
// 跟 LLM 偶尔输出的 click 指令兼容;主题用浅色,跟报告浅色风格匹配
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  themeVariables: {
    fontFamily: 'inherit',
    fontSize: '13px',
  },
})

interface Props {
  content: string
  provenance: Record<string, Record<string, ProvenanceEntry>>   // {module_key: {D1/K1/W1: entry}}
  onCitationClick: (moduleKey: string, refId: string) => void
}

// LLM 原始输出里的"section marker"和未被代码块包起来的 mermaid 图表
// 后端 assemble 时本该 strip 掉,但 LLM 偶尔写成 <<SECTION:..>> / <SECTION:..>>
// 各种变体绕过了正则。这里前端兜底清洗 — 看到啥洗啥,不依赖后端。
function cleanReportContent(raw: string): string {
  if (!raw) return ''
  let s = raw

  // 1. strip section markers:<<SECTION:xxx>>、<SECTION:xxx>>、<<<SECTION:xxx>>> 等
  s = s.replace(/<+\s*SECTION\s*:\s*[^<>]+\s*>+/g, '')

  // 2. mermaid 图表:LLM 没用 ```mermaid 包,直接 dump 出来的 flowchart 块
  //    启发式 — 找以 "flowchart LR/TB/RL/BT" 或 "graph LR/..." 单独成行起手的多行块,
  //    一直延伸到下一个非缩进 H2 标题 / 空 2 行 / "style X fill:#" 结尾再多 1 个 newline。
  //    包成 ```mermaid ... ``` 让前端 markdown 至少渲染成代码块(monospace),
  //    比散落在正文里看着舒服。后续加 mermaid render 再做真图。
  s = s.replace(
    /^(flowchart\s+(?:LR|TB|RL|BT|TD)|graph\s+(?:LR|TB|RL|BT|TD))([\s\S]*?)(?=\n{2,}(?:#|[^\s])|\n*$)/gm,
    (_m, header, body) => `\n\`\`\`mermaid\n${header}${body.trimEnd()}\n\`\`\`\n`,
  )

  return s
}

export default function CitedReportView({ content, provenance, onCitationClick }: Props) {
  const cleaned = cleanReportContent(content)
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
          code: ({ className, children, ...rest }: any) => {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match?.[1]
            const text = String(children || '').replace(/\n$/, '')
            // 代码块(```mermaid / ```flowchart 等)走 mermaid 渲染
            if (lang === 'mermaid' || lang === 'flowchart' || lang === 'graph') {
              return <MermaidBlock code={text} />
            }
            // 普通代码块 / 行内 code 保持默认渲染
            return <code className={className} {...rest}>{children}</code>
          },
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
        {cleaned}
      </ReactMarkdown>
    </div>
  )
}

// ── MermaidBlock — 把 ```mermaid 代码块渲染成 SVG 流程图 ───────────────────
function MermaidBlock({ code }: { code: string }) {
  const rawId = useId()
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSvg('')
    mermaid
      .render(id, code.trim())
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || String(e))
      })
    return () => { cancelled = true }
  }, [code, id])

  if (error) {
    return (
      <div className="my-3">
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-t">
          ⚠️ Mermaid 渲染失败:{error}
        </div>
        <pre className="text-xs bg-slate-50 border border-t-0 border-line p-3 rounded-b overflow-x-auto">
          {code}
        </pre>
      </div>
    )
  }
  if (!svg) {
    return (
      <pre className="text-xs text-gray-400 bg-gray-50 p-3 rounded my-3">渲染图表中…</pre>
    )
  }
  return (
    <div
      className="my-4 flex justify-center overflow-x-auto bg-white border border-line rounded-lg p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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
  // 颜色按 source 类型:doc=橙、kb=蓝、web=紫、prior(上游 stage)=绿
  const colorCls = !meta
    ? 'bg-slate-100 text-slate-500'
    : meta.type === 'doc'   ? 'bg-orange-50 text-[#D96400] hover:bg-orange-100 border-orange-200'
    : meta.type === 'kb'    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
    : meta.type === 'prior' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
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
