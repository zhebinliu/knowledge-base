/**
 * NewCitationsPanel — 项目洞察右栏「引用追溯」(Liquid Glass)
 * 功能 100% 等价 — bundle.provenance / highlightedRefId / 点击跳转
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileText, Globe, Database, ExternalLink, X, GitBranch } from 'lucide-react'
import { type CuratedBundle, type ProvenanceEntry } from '../../api/client'

interface Props {
  bundle: CuratedBundle | undefined
  highlightedRefId: string | null
  onPreviewDoc: (docId: string) => void
  onClose?: () => void
}

const TYPE_ICON = { doc: FileText, kb: Database, web: Globe, prior: GitBranch }

export default function NewCitationsPanel({ bundle, highlightedRefId, onPreviewDoc, onClose }: Props) {
  const provenance = bundle?.provenance || {}
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlightedRefId || !containerRef.current) return
    const el = containerRef.current.querySelector(`[data-ref="${CSS.escape(highlightedRefId)}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedRefId])

  const totalSources = Object.values(provenance).reduce((acc, m) => acc + Object.keys(m).length, 0)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.10)',
    }}>
      <div style={{
        flexShrink: 0, padding: '10px 14px',
        borderBottom: '1px solid var(--rd-line)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Database size={13} color="var(--rd-accent-2)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>引用追溯</span>
        <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>{totalSources} 条来源</span>
        {onClose && (
          <button
            onClick={onClose}
            className="rd-icon-btn"
            style={{ width: 24, height: 24, marginLeft: 'auto' }}
            title="收起"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {totalSources === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)' }}>
            <Database size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
            <div style={{ lineHeight: 1.6 }}>
              报告生成后,这里展示每个模块引用的所有原始素材<br />
              点击报告里的角标 [^D1] 可定位到此面板对应位置
            </div>
          </div>
        ) : (
          Object.entries(provenance).map(([moduleKey, sources]) => (
            <div key={moduleKey}>
              <div style={{
                position: 'sticky', top: 0, zIndex: 1,
                padding: '8px 14px',
                background: 'rgba(0,0,0,0.25)',
                borderBottom: '1px solid var(--rd-line)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text-2)' }}>{moduleKey}</span>
                <span style={{ fontSize: 12, color: 'var(--rd-text-3)', marginLeft: 6 }}>{Object.keys(sources).length} 条</span>
              </div>
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
          ))
        )}
      </div>
    </div>
  )
}

function CitationItem({ moduleKey, refId, entry, highlighted, onPreviewDoc }: {
  moduleKey: string; refId: string; entry: ProvenanceEntry
  highlighted: boolean; onPreviewDoc: (docId: string) => void
}) {
  const navigate = useNavigate()
  const { id: projectId } = useParams<{ id: string }>()
  const Icon = TYPE_ICON[entry.type] || Database
  const typeColor = entry.type === 'doc' ? 'var(--rd-accent-2)' :
                    entry.type === 'kb'    ? '#2563EB' :
                    entry.type === 'prior' ? '#34D399' :
                                              '#A78BFA'
  const onClick = () => {
    if (entry.type === 'doc' && entry.doc_id) onPreviewDoc(entry.doc_id)
    else if (entry.type === 'web' && entry.url) window.open(entry.url, '_blank', 'noopener,noreferrer')
    else if (entry.type === 'prior' && entry.prior_kind && projectId)
      navigate(`/console/projects/${projectId}?stage=${encodeURIComponent(entry.prior_kind)}`)
  }
  const clickable = (entry.type === 'doc' && !!entry.doc_id)
                 || (entry.type === 'web' && !!entry.url)
                 || (entry.type === 'prior' && !!entry.prior_kind && !!projectId)

  // PPT slide 5 风格 — 按 type 给出 accent 色 + accentBg + 类型中文标签
  const accent = entry.type === 'doc'   ? 'var(--rd-accent)' :
                 entry.type === 'kb'    ? '#60A5FA' :
                 entry.type === 'prior' ? '#34D399' :
                                          '#C084FC'   // web
  const accentRgb = entry.type === 'doc'   ? '255,141,26' :
                    entry.type === 'kb'    ? '96,165,250' :
                    entry.type === 'prior' ? '52,211,153' :
                                             '192,132,252'
  const typeLabel = entry.type === 'doc'   ? '文档' :
                    entry.type === 'kb'    ? '知识库' :
                    entry.type === 'prior' ? '上游阶段' :
                                             'Web'

  return (
    <div
      data-ref={`${moduleKey}:${refId}`}
      onClick={clickable ? onClick : undefined}
      className={highlighted ? 'ppt-pulse-border' : ''}
      style={{
        margin: '0 12px 12px',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid rgba(${accentRgb}, ${highlighted ? 0.55 : 0.30})`,
        boxShadow: highlighted
          ? `0 0 18px -4px rgba(${accentRgb}, 0.55), inset 0 1px 0 rgba(255,255,255,0.05)`
          : `0 0 12px -6px rgba(${accentRgb}, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)`,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background .15s, border-color .15s, box-shadow .15s',
      }}
      onMouseEnter={e => {
        if (clickable) {
          e.currentTarget.style.background = 'rgba(0,0,0,0.35)'
          e.currentTarget.style.borderColor = `rgba(${accentRgb}, 0.55)`
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.25)'
        e.currentTarget.style.borderColor = `rgba(${accentRgb}, ${highlighted ? 0.55 : 0.30})`
      }}
    >
      {/* 顶行:[refId] 类型 pill + source 路径 mono */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span
          className="rd-mono"
          style={{
            padding: '1px 8px', fontSize: 12, fontWeight: 700,
            borderRadius: 4,
            color: accent,
            background: `rgba(${accentRgb}, 0.18)`,
            border: `1px solid rgba(${accentRgb}, 0.45)`,
            boxShadow: `0 0 8px rgba(${accentRgb}, 0.35)`,
            flexShrink: 0,
          }}
        >
          [{refId}] {typeLabel}
        </span>
        <Icon size={11} color={accent} style={{ flexShrink: 0 }} />
        <span
          className="rd-mono"
          title={entry.label}
          style={{
            fontSize: 12, color: 'var(--rd-text-3)', letterSpacing: '0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, flex: 1,
          }}
        >
          {entry.label}
        </span>
      </div>
      {/* 引用原文 — 用类型色作 highlight 背景(对齐 slide 5) */}
      {entry.snippet && (
        <p style={{
          fontSize: 12.5, color: 'var(--rd-text)', lineHeight: 1.5, margin: 0,
        }}>
          <span style={{
            background: `rgba(${accentRgb}, 0.22)`,
            padding: '0 4px', borderRadius: 3,
            boxDecorationBreak: 'clone' as any,
            WebkitBoxDecorationBreak: 'clone' as any,
          }}>{entry.snippet}</span>
        </p>
      )}
      {entry.type === 'web' && entry.url && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: accent, marginTop: 6 }}>
          <ExternalLink size={9} /> {entry.domain}
        </div>
      )}
      {entry.type === 'prior' && entry.stage_label && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: accent, marginTop: 6 }}>
          <GitBranch size={9} /> 跳转 · {entry.stage_label}
        </div>
      )}
    </div>
  )
}
