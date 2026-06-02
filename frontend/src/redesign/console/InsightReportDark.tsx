/**
 * InsightReportDark — uat 专属、适配深色 Liquid Glass 的报告渲染
 *
 * 接口跟 prod 版 `components/console/CitedReportView` 完全一致,
 * 只是色板从「白底 + slate / orange-50 浅色」改为「深色玻璃 + 高对比白字 + 暖橙 accent」。
 *
 * 给 `redesign/console/CenterWorkspace.tsx` 的 `ReportView` 用。prod 路径不引用本组件。
 */
import { type ProvenanceEntry } from '../../api/client'
import ReportMarkdown from '../../components/markdown/ReportMarkdown'

interface Props {
  content: string
  provenance: Record<string, Record<string, ProvenanceEntry>>
  onCitationClick: (moduleKey: string, refId: string) => void
}

export default function InsightReportDark({ content, provenance, onCitationClick }: Props) {
  return (
    <div className="insight-report-dark">
      {/* 作用域 CSS — 只影响本组件内的 markdown 渲染 */}
      <style>{`
        /* 关键:容器自身有"深色纸面",挡住下面的网格 / 玻璃 / 扫描线 */
        .insight-report-dark {
          font-size: 14.5px;
          line-height: 1.78;
          color: rgba(255,255,255,0.96);
          background: rgba(10, 13, 24, 0.62);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 28px 32px;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          /* 锐化中文边缘 */
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* 标题层级 */
        .insight-report-dark h1 {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 18px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,141,26,0.32);
          letter-spacing: -0.01em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }
        .insight-report-dark h2 {
          font-size: 19px;
          font-weight: 700;
          color: #ffffff;
          margin: 28px 0 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255,141,26,0.22);
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }
        .insight-report-dark h3 {
          font-size: 16.5px;
          font-weight: 700;
          color: #FFC79A;
          margin: 20px 0 8px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }
        .insight-report-dark h4 {
          font-size: 14.5px;
          font-weight: 600;
          color: #ffffff;
          margin: 16px 0 6px;
        }

        /* 段落 / 列表 — 全部提到 0.94+,加微弱 text-shadow 锐化 */
        .insight-report-dark p {
          margin: 10px 0;
          line-height: 1.85;
          color: rgba(255,255,255,0.94);
          text-shadow: 0 1px 1.5px rgba(0,0,0,0.28);
        }
        .insight-report-dark ul,
        .insight-report-dark ol {
          margin: 10px 0;
          padding-left: 24px;
        }
        .insight-report-dark ul { list-style: disc; }
        .insight-report-dark ol { list-style: decimal; }
        .insight-report-dark li {
          margin: 5px 0;
          line-height: 1.75;
          color: rgba(255,255,255,0.94);
          text-shadow: 0 1px 1.5px rgba(0,0,0,0.28);
        }
        .insight-report-dark li::marker { color: rgba(255,141,26,0.65); }

        /* 表格 */
        .insight-report-dark table {
          border-collapse: separate;
          border-spacing: 0;
          margin: 16px 0;
          width: 100%;
          font-size: 13.5px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 10px;
          overflow: hidden;
        }
        .insight-report-dark thead { background: rgba(255,141,26,0.12); }
        .insight-report-dark th {
          padding: 10px 14px;
          text-align: left;
          font-weight: 600;
          color: #ffffff;
          border-bottom: 1px solid rgba(255,141,26,0.32);
          border-right: 1px solid rgba(255,255,255,0.10);
          text-shadow: 0 1px 1.5px rgba(0,0,0,0.4);
        }
        .insight-report-dark th:last-child { border-right: none; }
        .insight-report-dark td {
          padding: 10px 14px;
          vertical-align: top;
          color: rgba(255,255,255,0.94);
          border-top: 1px solid rgba(255,255,255,0.10);
          border-right: 1px solid rgba(255,255,255,0.08);
        }
        .insight-report-dark td:last-child { border-right: none; }
        .insight-report-dark tr:hover td { background: rgba(255,255,255,0.05); }

        /* 行内 */
        .insight-report-dark strong {
          color: #ffffff;
          font-weight: 700;
          text-shadow: 0 1px 2px rgba(0,0,0,0.45);
        }
        /* em 中文不要 italic(歪得难看),改为颜色 + 字重突出 */
        .insight-report-dark em {
          color: #FFC79A;
          font-style: normal;
          font-weight: 500;
        }
        .insight-report-dark code {
          background: rgba(255,255,255,0.10);
          color: #FFC79A;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 12.5px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          border: 1px solid rgba(255,255,255,0.10);
        }
        .insight-report-dark a:not(.not-prose a) {
          color: #FFC79A;
          text-decoration: none;
          border-bottom: 1px dotted rgba(255,199,154,0.45);
        }
        .insight-report-dark a:not(.not-prose a):hover {
          color: #fff;
          border-bottom-color: #fff;
        }

        /* 引用块 — 深色纸面环境下,加内部更深底 + 高对比文字 */
        .insight-report-dark blockquote {
          border-left: 3px solid rgba(255,141,26,0.7);
          background: rgba(0,0,0,0.35);
          padding: 12px 18px;
          margin: 14px 0;
          color: rgba(255,255,255,0.94);
          border-radius: 0 8px 8px 0;
          text-shadow: 0 1px 1.5px rgba(0,0,0,0.4);
        }
        .insight-report-dark blockquote p {
          margin: 4px 0;
          color: inherit;
          text-shadow: inherit;
        }

        /* 分隔线 */
        .insight-report-dark hr {
          margin: 26px 0;
          border: 0;
          border-top: 1px solid rgba(255,255,255,0.14);
        }

        /* 代码块 */
        .insight-report-dark pre {
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px;
          padding: 14px 16px;
          margin: 14px 0;
          overflow-x: auto;
          font-size: 12.5px;
          color: rgba(255,255,255,0.95);
        }
        .insight-report-dark pre code {
          background: transparent;
          color: inherit;
          padding: 0;
          border: none;
        }
      `}</style>

      {/* 共享渲染核心(清洗 / 表格修复 / mermaid),但用深色专属角标:把 dark 版 a 渲染器
          通过 components 传进去,不用 ReportMarkdown 的亮色 citation 默认实现。 */}
      <ReportMarkdown
        content={content}
        components={{
          a: ({ href, children, ...rest }: any) => {
            if (href && href.startsWith('#cite-')) {
              const id = href.slice(6)
              const lastDash = id.lastIndexOf('-')
              if (lastDash > 0) {
                const moduleKey = id.slice(0, lastDash)
                const refId = id.slice(lastDash + 1)
                const meta = provenance?.[moduleKey]?.[refId]
                return (
                  <CitationChipDark
                    moduleKey={moduleKey}
                    refId={refId}
                    meta={meta}
                    onClick={() => onCitationClick(moduleKey, refId)}
                  />
                )
              }
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
          },
        }}
      />
    </div>
  )
}

function CitationChipDark({
  refId, meta, onClick,
}: {
  moduleKey: string
  refId: string
  meta: ProvenanceEntry | undefined
  onClick: () => void
}) {
  // 深色环境的角标:稍亮的背景 + 高对比文字
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 6px',
    margin: '0 2px',
    fontSize: '0.72em',
    fontWeight: 700,
    borderRadius: 4,
    border: '1px solid',
    lineHeight: 1.3,
    cursor: 'pointer',
    transition: 'all .15s',
    verticalAlign: 'baseline',
    fontFamily: 'inherit',
  }
  const colorStyle: React.CSSProperties = !meta
    ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.42)', borderColor: 'rgba(255,255,255,0.12)' }
    : meta.type === 'doc'   ? { background: 'rgba(255,141,26,0.18)',  color: '#FFB066', borderColor: 'rgba(255,141,26,0.40)' }
    : meta.type === 'kb'    ? { background: 'rgba(96,165,250,0.18)',  color: '#93C5FD', borderColor: 'rgba(96,165,250,0.40)' }
    : meta.type === 'prior' ? { background: 'rgba(52,211,153,0.18)',  color: '#6EE7B7', borderColor: 'rgba(52,211,153,0.40)' }
                            : { background: 'rgba(192,132,252,0.18)', color: '#D8B4FE', borderColor: 'rgba(192,132,252,0.40)' }

  const tooltip = meta
    ? `${meta.label}\n${(meta.snippet || '').slice(0, 200)}`
    : `引用 ${refId}(原文未存)`

  return (
    <sup className="not-prose" style={{ display: 'inline-block', lineHeight: 0 }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onClick() }}
        title={tooltip}
        style={{ ...baseStyle, ...colorStyle }}
        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)' }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
      >
        {refId}
      </button>
    </sup>
  )
}
