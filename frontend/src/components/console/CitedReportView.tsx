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

// mermaid 全局初始化(模块级,只跑一次):用 base theme + 自定义橙色主题变量,
// 跟报告里其他卡片配色一致;securityLevel=loose 允许 click 事件
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 16, nodeSpacing: 50, rankSpacing: 70 },
  sequence: { useMaxWidth: true, wrap: true, mirrorActors: false, boxMargin: 12 },
  themeVariables: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
    // 节点:浅橙 fill + 橙色边框 + 深灰文字
    primaryColor: '#FFF7ED',
    primaryTextColor: '#1F2937',
    primaryBorderColor: '#FB923C',
    // 状态机第二状态色(stateDiagram 用得多)
    secondaryColor: '#FEF3C7',
    secondaryTextColor: '#1F2937',
    secondaryBorderColor: '#F59E0B',
    // 三级色(subgraph 背景)
    tertiaryColor: '#F8FAFC',
    tertiaryTextColor: '#1F2937',
    tertiaryBorderColor: '#CBD5E1',
    // 连线:柔和的灰
    lineColor: '#94A3B8',
    // 背景白
    background: '#FFFFFF',
    mainBkg: '#FFF7ED',
    secondBkg: '#FEF3C7',
    // 文字
    textColor: '#1F2937',
    // 边粗细
    edgeLabelBackground: '#FFFFFF',
    // 状态机箭头
    transitionColor: '#6B7280',
    transitionLabelColor: '#6B7280',
    // 群组(cluster)
    clusterBkg: '#FAFBFC',
    clusterBorder: '#CBD5E1',
    // sequence diagram
    actorBkg: '#FFF7ED',
    actorBorder: '#FB923C',
    actorTextColor: '#1F2937',
    signalColor: '#6B7280',
    signalTextColor: '#374151',
    labelBoxBkgColor: '#FEF3C7',
    labelBoxBorderColor: '#F59E0B',
    labelTextColor: '#1F2937',
    noteBkgColor: '#FFFBEB',
    noteBorderColor: '#FCD34D',
    noteTextColor: '#1F2937',
  },
})

interface Props {
  content: string
  provenance: Record<string, Record<string, ProvenanceEntry>>   // {module_key: {D1/K1/W1: entry}}
  onCitationClick: (moduleKey: string, refId: string) => void
}

// LLM 输出残留清洗 — line-by-line 维护 fence 状态,只对**围栏外**做 mermaid 提升,
// 避免误把围栏内的 `flowchart LR` 起手当作裸露 mermaid 重复包装,破坏 fence 平衡。
function cleanReportContent(raw: string): string {
  if (!raw) return ''

  // 1. 先全局 strip section markers(<<SECTION:xxx>> / <SECTION:xxx>> 等变体)
  let s = raw.replace(/<+\s*SECTION\s*:\s*[^<>]+\s*>+/g, '')

  // 2. line-by-line 处理:跟踪 fence(```)开闭状态,只在围栏外做 mermaid 提升
  const lines = s.split('\n')
  const out: string[] = []
  const MERMAID_KEYWORDS = /^(flowchart\s+(?:LR|TB|RL|BT|TD)|graph\s+(?:LR|TB|RL|BT|TD)|stateDiagram(?:-v2)?|sequenceDiagram|classDiagram|erDiagram|journey|gantt|pie)\b/

  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const stripped = line.trim()

    if (stripped.startsWith('```')) {
      // 围栏行
      const afterFence = stripped.slice(3).trim()
      if (!inFence) {
        // 开围栏。如果无 lang,但下一行是 mermaid 关键字 → 提升为 ```mermaid 并吃掉下一行的字面 mermaid
        if (afterFence === '') {
          const next = (lines[i + 1] || '').trim()
          if (next === 'mermaid') {
            out.push('```mermaid')
            i += 1  // 跳过字面 "mermaid" 行
            inFence = true
            continue
          }
          if (MERMAID_KEYWORDS.test(next)) {
            // 围栏无 lang + 下一行直接是 flowchart/stateDiagram 等 → 提升为 ```mermaid + 保留首行
            out.push('```mermaid')
            inFence = true
            continue
          }
        }
        out.push(line)
        inFence = true
      } else {
        // 闭围栏
        out.push(line)
        inFence = false
      }
      continue
    }

    if (!inFence) {
      // 围栏外:如果整行是裸 mermaid 关键字起手(LLM 完全没用 ``` 包),
      // 启发式包一个 ```mermaid 块(向后吃到下一个空行或新章节)
      if (MERMAID_KEYWORDS.test(stripped)) {
        const block: string[] = [line]
        let j = i + 1
        while (j < lines.length) {
          const next = lines[j]
          const nt = next.trim()
          // 遇到空行连续 ≥1 个 + 下一个非空行是 # 或顶头普通文字 → 结束
          if (nt === '') {
            const peek = (lines[j + 1] || '').trim()
            if (peek.startsWith('#') || (peek && !peek.startsWith(' ') && !peek.startsWith('\t') && !/^[A-Za-z_]/.test(peek))) {
              break
            }
            block.push(next)
            j += 1
            continue
          }
          block.push(next)
          j += 1
        }
        out.push('```mermaid')
        out.push(...block)
        out.push('```')
        i = j - 1
        continue
      }
    }

    out.push(line)
  }

  return out.join('\n')
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

  // 防御性清洗:LLM 偶尔在代码块首行写字面 "mermaid"、或在内部嵌套 ```mermaid 围栏。
  // 直接喂给 mermaid.render 会语法错。这里 strip 掉所有 ``` 围栏行和单独成行的 "mermaid"。
  const cleaned = code
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (t === 'mermaid') return false              // 字面 mermaid 行
      if (/^```\s*\w*\s*$/.test(t)) return false      // 残留的 ``` / ```mermaid 围栏
      return true
    })
    .join('\n')
    .trim()

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSvg('')
    mermaid
      .render(id, cleaned)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || String(e))
      })
    return () => { cancelled = true }
  }, [cleaned, id])

  if (error) {
    return (
      <div className="my-3">
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-t">
          ⚠️ Mermaid 渲染失败:{error}
        </div>
        <pre className="text-xs bg-slate-50 border border-t-0 border-line p-3 rounded-b overflow-x-auto">
          {cleaned}
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
      className="mermaid-block my-5 flex justify-center overflow-x-auto bg-gradient-to-br from-orange-50/40 via-white to-white border border-orange-100 rounded-xl px-6 py-5 shadow-sm"
      style={{
        boxShadow: '0 1px 3px rgba(251, 146, 60, 0.06), 0 4px 12px rgba(20, 20, 40, 0.04)',
      }}
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
