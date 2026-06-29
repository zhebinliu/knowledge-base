/**
 * ReportMarkdown — 全项目唯一的 markdown 报告渲染核心。
 *
 * 收敛背景:此前 insight / 蓝图 / 对象字段表 / QA / 智能建议等「同样的报告内容」散落在
 * 7 个各写一遍的 renderer 里,只有 CitedReportView 修了 LLM 写错列数的表格分隔行 → 同一份
 * 对象字段表 legacy 能渲染、redesign 渲染成 raw 文本。本组件把**行为**收敛成一处:
 *   - cleanReportMarkdown:strip section marker + 修表格分隔行列数 + 裸 mermaid 提升为代码块
 *   - mermaid 代码块 → SVG(MermaidBlock)
 *   - [x](#cite-mod-ref) → 可点击引用 chip(传 citation 时启用)
 *
 * **主题不收敛**:各调用方仍通过自己的 `components`(元素渲染器)/ `className` 保留原样式
 * (亮/暗/紧凑/rd 变量),本组件只把 code/a 两个行为型渲染器叠加上去,不动其余元素样式。
 * 这样「同内容复用同逻辑」,又不会把各处外观推平、零视觉风险。
 */
import { useEffect, useId, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import elkLayouts from '@mermaid-js/layout-elk'
import { Pencil } from 'lucide-react'
import { type ProvenanceEntry } from '../../api/client'
import { useMermaidEdit } from '../console/flow/mermaidEditContext'
import { isStateDiagram } from '../console/flow/stateDiagram'

// mermaid 全局初始化(模块级,只跑一次):
// - ELK 布局引擎(替代默认 dagre)— 折线连接质量明显更高,密集分叉/汇聚不绕路、不穿节点,接近 Lucid。
// - base theme + 冷色调主题,矩形浅蓝/椭圆浅紫/菱形浅黄,前端三色自动分色。
// - curve: step,配合 ELK 走干净 L 型折线(用 dagre + step 会绕路,所以之前退回 basis)。
mermaid.registerLayoutLoaders(elkLayouts)
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  layout: 'elk',
  // 2026-06-09:关掉 mermaid 11+ 默认的"💣 + Syntax error in text" fallback SVG。
  // 关掉后,render() 失败会真正 reject promise,我们下面的 .catch 才能把错误写到
  // 红色提示卡 + 展示源码,而不是一片炸弹海洋。
  suppressErrorRendering: true,
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'step', padding: 16, nodeSpacing: 55, rankSpacing: 75 },
  sequence: { useMaxWidth: true, wrap: true, mirrorActors: false, boxMargin: 12 },
  themeVariables: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
    primaryColor: '#EEF2F8', primaryTextColor: '#1F2937', primaryBorderColor: '#94A3B8',
    secondaryColor: '#EDE9FE', secondaryTextColor: '#1F2937', secondaryBorderColor: '#A78BFA',
    tertiaryColor: '#FEF3C7', tertiaryTextColor: '#1F2937', tertiaryBorderColor: '#FBBF24',
    lineColor: '#475569', background: '#FFFFFF', mainBkg: '#EEF2F8', secondBkg: '#EDE9FE',
    textColor: '#1F2937', edgeLabelBackground: '#FFFFFF',
    transitionColor: '#475569', transitionLabelColor: '#475569',
    clusterBkg: '#F8FAFC', clusterBorder: '#CBD5E1',
    actorBkg: '#EEF2F8', actorBorder: '#94A3B8', actorTextColor: '#1F2937',
    signalColor: '#475569', signalTextColor: '#374151',
    labelBoxBkgColor: '#FEF3C7', labelBoxBorderColor: '#FBBF24', labelTextColor: '#1F2937',
    noteBkgColor: '#FFFBEB', noteBorderColor: '#FCD34D', noteTextColor: '#1F2937',
  },
  themeCSS: `
    .node rect, .node path, .node polygon, .node circle, .node ellipse { stroke-width: 1.2px; }
    .node rect { rx: 6px; ry: 6px; }
    .node polygon { fill: #FEF3C7; stroke: #FBBF24; }
    .node ellipse, .node circle { fill: #EDE9FE; stroke: #A78BFA; }
    .flowchart-link, .edgePath path { stroke-width: 1.4px; }
    .edgeLabel, .edgeLabel rect { background: #FFFFFF; fill: #FFFFFF; }
    .edgeLabel { color: #475569; }
  `,
})

const MERMAID_KEYWORDS = /^(flowchart\s+(?:LR|TB|RL|BT|TD)|graph\s+(?:LR|TB|RL|BT|TD)|stateDiagram(?:-v2)?|sequenceDiagram|classDiagram|erDiagram|journey|gantt|pie)\b/

/** LLM 输出清洗:section marker 去除 + 表格分隔行列数对齐 + 裸 mermaid 提升为代码块。幂等。 */
export function cleanReportMarkdown(raw: string): string {
  if (!raw) return ''

  // 1. strip section markers(<<SECTION:xxx>> / <SECTION:xxx>> 等变体)
  let s = raw.replace(/<+\s*SECTION\s*:\s*[^<>]+\s*>+/g, '')

  // 1.5 修复 markdown 表格分隔行列数 — LLM 偶尔把分隔行写多/少一列(表头 9 列、分隔行 10 个
  //     |---|),GFM 解析器整张表 reject → 退回 raw 文本。把每个 (header, separator) 对的
  //     separator 强制对齐 header 列数。
  {
    const lines = s.split('\n')
    const cellCount = (line: string): number => {
      const t = line.trim()
      if (!t.includes('|')) return 0
      let core = t
      if (core.startsWith('|')) core = core.slice(1)
      if (core.endsWith('|')) core = core.slice(0, -1)
      return core.split('|').length
    }
    const isSep = (line: string): boolean =>
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim())
    for (let i = 1; i < lines.length; i++) {
      if (!isSep(lines[i])) continue
      const headerCells = cellCount(lines[i - 1])
      const sepCells = cellCount(lines[i])
      if (headerCells === 0 || sepCells === headerCells) continue
      const orig = lines[i].trim()
      const hasLeading = orig.startsWith('|')
      const hasTrailing = orig.endsWith('|')
      let rebuilt = Array(headerCells).fill('---').join('|')
      if (hasLeading) rebuilt = '|' + rebuilt
      if (hasTrailing) rebuilt = rebuilt + '|'
      const indent = lines[i].match(/^\s*/)?.[0] || ''
      lines[i] = indent + rebuilt
    }
    s = lines.join('\n')
  }

  // 2. line-by-line:跟踪 fence(```)开闭,只在围栏外把裸 mermaid 提升为 ```mermaid 块
  const lines = s.split('\n')
  const out: string[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const stripped = line.trim()

    if (stripped.startsWith('```')) {
      const afterFence = stripped.slice(3).trim()
      if (!inFence) {
        if (afterFence === '') {
          const next = (lines[i + 1] || '').trim()
          if (next === 'mermaid') {
            out.push('```mermaid'); i += 1; inFence = true; continue
          }
          if (MERMAID_KEYWORDS.test(next)) {
            out.push('```mermaid'); inFence = true; continue
          }
        }
        out.push(line); inFence = true
      } else {
        out.push(line); inFence = false
      }
      continue
    }

    if (!inFence && MERMAID_KEYWORDS.test(stripped)) {
      const block: string[] = [line]
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j]
        const nt = next.trim()
        if (nt === '') {
          const peek = (lines[j + 1] || '').trim()
          if (peek.startsWith('#') || (peek && !peek.startsWith(' ') && !peek.startsWith('\t') && !/^[A-Za-z_]/.test(peek))) break
          block.push(next); j += 1; continue
        }
        block.push(next); j += 1
      }
      out.push('```mermaid'); out.push(...block); out.push('```'); i = j - 1
      continue
    }

    out.push(line)
  }

  return out.join('\n')
}

// ── MermaidBlock — ```mermaid 代码块渲染成 SVG ──────────────────────────────
export function MermaidBlock({ code }: { code: string }) {
  const rawId = useId()
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const mermaidEdit = useMermaidEdit()

  const cleaned = code
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (t === 'mermaid') return false
      if (/^```\s*\w*\s*$/.test(t)) return false
      return true
    })
    .join('\n')
    .trim()

  useEffect(() => {
    let cancelled = false
    setError(null); setSvg('')
    mermaid.render(id, cleaned)
      .then(({ svg }) => { if (!cancelled) setSvg(svg) })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)) })
    return () => { cancelled = true }
  }, [cleaned, id])

  if (error) {
    // 2026-06-05:识别 vite chunk 旧 hash 失效场景。新部署后旧 tab 引用旧 chunk,
    // mermaid lazy-load 子图类型(stateDiagram-v2 / gantt 等)时报 dynamically
    // imported module fetch 失败。main.tsx 已挂全局 vite:preloadError 自动 reload,
    // 这里是兜底:万一全局监听没接住(老浏览器 / 时序怪异),给用户一个明确的刷新按钮。
    const isStaleChunk = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(error)
    if (isStaleChunk) {
      return (
        <div className="my-3 text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded">
          <div className="text-amber-700 font-medium mb-1">⚠️ 检测到前端有新版本</div>
          <div className="text-amber-700/80 mb-2">
            页面缓存了旧的代码块,新版本部署后导致图表无法加载。刷新页面即可恢复。
          </div>
          <button
            onClick={() => { try { sessionStorage.removeItem('vite-preload-reload-at') } catch {}; window.location.reload() }}
            className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
          >
            立即刷新页面
          </button>
        </div>
      )
    }
    return (
      <div className="my-3">
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-t">
          ⚠️ Mermaid 渲染失败:{error}
        </div>
        <pre className="text-xs bg-slate-50 border border-t-0 border-line p-3 rounded-b overflow-x-auto">{cleaned}</pre>
      </div>
    )
  }
  if (!svg) return <pre className="text-xs text-gray-400 bg-gray-50 p-3 rounded my-3">渲染图表中…</pre>
  // 仅在有 Provider(可编辑工作区)且图是 stateDiagram-v2 时,露出「可视化编辑」入口
  const canVisualEdit = !!mermaidEdit && isStateDiagram(cleaned)
  return (
    <>
      <div
        className="mermaid-block my-5 flex justify-center overflow-x-auto bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm cursor-zoom-in relative group"
        style={{ boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)' }}
        onClick={() => setLightboxOpen(true)}
        title="点击查看大图(滚轮缩放 / 拖拽移动 / ESC 关闭)"
      >
        {canVisualEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); mermaidEdit!.requestEdit(cleaned) }}
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-orange-200 bg-white/90 text-orange-700 hover:bg-orange-50 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            title="可视化拖拽编辑这张流程图"
          >
            <Pencil size={11} /> 可视化编辑
          </button>
        )}
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {lightboxOpen && (
        <MermaidLightbox svg={svg} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  )
}

// ── MermaidLightbox — 点击 Mermaid 图弹出全屏大图 ────────────────────────────
// 滚轮缩放(0.3x – 8x)+ 鼠标拖拽平移 + 双击复原 + ESC / 点遮罩关闭 + 下载 SVG。
// 不引第三方库,纯 React + transform。
function MermaidLightbox({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ x: 0, y: 0 })

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // 锁定 body 滚动
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const reset = () => { setScale(1); setTx(0); setTy(0) }

  const onWheel = (e: React.WheelEvent) => {
    // 不调 preventDefault — React 的 wheel 是 passive 会 warn;body overflow 已 hidden,自然不滚穿
    const delta = -e.deltaY * 0.0015
    setScale(s => Math.min(8, Math.max(0.3, s * (1 + delta))))
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setDragging(true)
    dragRef.current.x = e.clientX - tx
    dragRef.current.y = e.clientY - ty
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setTx(e.clientX - dragRef.current.x)
    setTy(e.clientY - dragRef.current.y)
  }
  const stopDrag = () => setDragging(false)

  const downloadSvg = () => {
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mermaid-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.svg`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { console.warn('download svg failed', e) }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center select-none"
      onClick={onClose}
      onWheel={onWheel}
    >
      {/* 顶部工具栏 */}
      <div
        className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1.5"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setScale(s => Math.max(0.3, s * 0.8))}
          className="px-2 py-1 text-xs text-white hover:bg-white/10 rounded"
          title="缩小"
        >−</button>
        <span className="text-xs text-white/80 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale(s => Math.min(8, s * 1.25))}
          className="px-2 py-1 text-xs text-white hover:bg-white/10 rounded"
          title="放大"
        >+</button>
        <div className="w-px h-4 bg-white/20 mx-1" />
        <button onClick={reset} className="px-2 py-1 text-xs text-white hover:bg-white/10 rounded" title="复原">复原</button>
        <button onClick={downloadSvg} className="px-2 py-1 text-xs text-white hover:bg-white/10 rounded" title="下载 SVG">下载</button>
        <button onClick={onClose} className="px-2 py-1 text-xs text-white hover:bg-white/10 rounded" title="关闭 (ESC)">✕</button>
      </div>

      {/* 底部提示 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/60 bg-black/30 px-3 py-1 rounded-full pointer-events-none">
        滚轮缩放 · 拖拽移动 · 双击复原 · ESC 关闭
      </div>

      {/* 图区:用 div 包 svg + transform */}
      <div
        className="bg-white rounded-xl shadow-2xl"
        style={{
          maxWidth: '95vw',
          maxHeight: '92vh',
          padding: '16px',
          overflow: 'hidden',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onClick={e => e.stopPropagation()}
        onDoubleClick={reset}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        <div
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.08s ease-out',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}

// ── CitationChip — [x](#cite-mod-ref) 渲染成可点击角标 ──────────────────────
export function CitationChip({ refId, meta, onClick }: {
  moduleKey: string; refId: string; meta: ProvenanceEntry | undefined; onClick: () => void
}) {
  const colorCls = !meta
    ? 'bg-slate-100 text-slate-500'
    : meta.type === 'doc'   ? 'bg-orange-50 text-[#D96400] hover:bg-orange-100 border-orange-200'
    : meta.type === 'kb'    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
    : meta.type === 'prior' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
  const tooltip = meta ? `${meta.label}\n${(meta.snippet || '').slice(0, 200)}` : `引用 ${refId}(原文未存)`
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

export interface CitationConfig {
  provenance: Record<string, Record<string, ProvenanceEntry>>
  onCitationClick: (moduleKey: string, refId: string) => void
}

interface ReportMarkdownProps {
  content: string
  /** 外层 wrapper className —— 各调用方用它带自己的主题(亮/暗/紧凑) */
  className?: string
  /** 调用方自己的元素渲染器(表格 / 标题 / 段落等主题样式),会被本组件的 code/a 行为叠加 */
  components?: Components
  /** 传入则启用引用 chip(把 [x](#cite-mod-ref) 渲染成可点击角标) */
  citation?: CitationConfig
  /** 是否跑清洗(表格分隔行修复等),默认 true */
  clean?: boolean
  /** 是否把 mermaid 代码块渲染成图,默认 true */
  renderMermaid?: boolean
}

/**
 * 共享报告渲染器。调用方传自己的 `components`(主题)+ 可选 `citation`,本组件负责清洗、
 * mermaid、引用 chip 这些**所有报告都该一致**的行为。
 */
export default function ReportMarkdown({
  content, className, components, citation, clean = true, renderMermaid = true,
}: ReportMarkdownProps) {
  const md = clean ? cleanReportMarkdown(content || '') : (content || '')

  const merged: Components = {
    ...components,
    code: (props: any) => {
      const { className: cls, children } = props
      const lang = /language-(\w+)/.exec(cls || '')?.[1]
      if (renderMermaid && (lang === 'mermaid' || lang === 'flowchart' || lang === 'graph')) {
        return <MermaidBlock code={String(children || '').replace(/\n$/, '')} />
      }
      if (components?.code) return (components.code as any)(props)
      const { node, ...rest } = props
      return <code {...rest}>{children}</code>
    },
    a: (props: any) => {
      const { href, children } = props
      if (citation && href && href.startsWith('#cite-')) {
        const id = href.slice(6)
        const lastDash = id.lastIndexOf('-')
        if (lastDash > 0) {
          const moduleKey = id.slice(0, lastDash)
          const refId = id.slice(lastDash + 1)
          const meta = citation.provenance?.[moduleKey]?.[refId]
          return <CitationChip moduleKey={moduleKey} refId={refId} meta={meta} onClick={() => citation.onCitationClick(moduleKey, refId)} />
        }
      }
      if (components?.a) return (components.a as any)(props)
      const { node, ...rest } = props
      return <a target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
    },
  }

  const body = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={merged}>{md}</ReactMarkdown>
  )
  return className ? <div className={className}>{body}</div> : body
}
