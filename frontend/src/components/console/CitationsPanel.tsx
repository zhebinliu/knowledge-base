/**
 * CitationsPanel — 项目洞察右栏「引用面板」
 *
 * 显示当前 active bundle 的 provenance(按 module 分组,可点击 ID 跳到对应原文)。
 * Hover 显示 snippet 预览,点击:
 *  - doc:打开中栏 docId 预览
 *  - kb:暂时只展示信息(后期可深链到 KB)
 *  - web:新窗口打开 URL
 *
 * 父组件传入 highlightedRefId(用户点报告角标时同步定位)。
 */
import { useEffect, useRef } from 'react'
import {
  FileText, Globe, Database, ExternalLink, X,
} from 'lucide-react'
import { type CuratedBundle, type ProvenanceEntry } from '../../api/client'

interface Props {
  bundle: CuratedBundle | undefined
  highlightedRefId: string | null      // 形如 "M3_health_radar:D2"
  onPreviewDoc: (docId: string) => void
  onClose?: () => void
}

const TYPE_ICON = {
  doc: FileText,
  kb: Database,
  web: Globe,
}

export default function CitationsPanel({ bundle, highlightedRefId, onPreviewDoc, onClose }: Props) {
  const provenance = bundle?.provenance || {}
  const containerRef = useRef<HTMLDivElement>(null)

  // 自动滚到 highlighted 项
  useEffect(() => {
    if (!highlightedRefId || !containerRef.current) return
    const el = containerRef.current.querySelector(`[data-ref="${CSS.escape(highlightedRefId)}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedRefId])

  const totalSources = Object.values(provenance).reduce((acc, m) => acc + Object.keys(m).length, 0)

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶栏 */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-line flex items-center gap-2">
        <Database size={13} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">引用追溯</span>
        <span className="text-[11px] text-ink-muted">{totalSources} 条来源</span>
        {onClose && (
          <button onClick={onClose}
                  className="ml-auto p-1 text-ink-muted hover:text-ink"
                  title="收起">
            <X size={13} />
          </button>
        )}
      </div>

      {/* 内容 */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
        {totalSources === 0 ? (
          <div className="p-6 text-center text-xs text-ink-muted">
            <Database size={24} className="mx-auto mb-2 text-ink-muted/40" />
            报告生成后,这里展示每个模块引用的所有原始素材<br/>
            点击报告里的角标 [^D1] 可定位到此面板对应位置
          </div>
        ) : (
          <div className="divide-y divide-line">
            {Object.entries(provenance).map(([moduleKey, sources]) => (
              <div key={moduleKey}>
                <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-line z-[1]">
                  <span className="text-[11px] text-ink-muted font-semibold">{moduleKey}</span>
                  <span className="text-[10px] text-ink-muted ml-2">{Object.keys(sources).length} 条</span>
                </div>
                <div className="divide-y divide-line/60">
                  {Object.entries(sources).map(([refId, entry]) => (
                    <CitationItem
                      key={refId}
                      moduleKey={moduleKey}
                      refId={refId}
                      entry={entry}
                      highlighted={highlightedRefId === `${moduleKey}:${refId}`}
                      onPreviewDoc={onPreviewDoc}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CitationItem({
  moduleKey, refId, entry, highlighted, onPreviewDoc,
}: {
  moduleKey: string
  refId: string
  entry: ProvenanceEntry
  highlighted: boolean
  onPreviewDoc: (docId: string) => void
}) {
  const Icon = TYPE_ICON[entry.type] || Database
  const typeColor = entry.type === 'doc' ? 'text-[#D96400]' :
                    entry.type === 'kb'  ? 'text-blue-600' :
                                            'text-purple-600'
  const onClick = () => {
    if (entry.type === 'doc' && entry.doc_id) {
      onPreviewDoc(entry.doc_id)
    } else if (entry.type === 'web' && entry.url) {
      window.open(entry.url, '_blank', 'noopener,noreferrer')
    }
  }
  const clickable = (entry.type === 'doc' && entry.doc_id) || (entry.type === 'web' && entry.url)

  return (
    <div
      data-ref={`${moduleKey}:${refId}`}
      className={`px-3 py-2.5 transition-colors ${
        highlighted ? 'bg-orange-50 border-l-2 border-l-[#D96400]' : 'border-l-2 border-l-transparent'
      } ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-ink-secondary tabular-nums shrink-0">
          {refId}
        </span>
        <Icon size={11} className={`${typeColor} mt-0.5 shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink font-medium truncate" title={entry.label}>
            {entry.label}
          </div>
          {entry.snippet && (
            <div className="text-[10.5px] text-ink-muted mt-1 leading-relaxed line-clamp-3">
              {entry.snippet}
            </div>
          )}
          {entry.type === 'web' && entry.url && (
            <div className="text-[10px] text-purple-600 mt-1 flex items-center gap-0.5">
              <ExternalLink size={9} /> {entry.domain}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
