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
      background: 'rgba(255,255,255,0.50)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      borderLeft: '1px solid rgba(255,255,255,0.55)',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.80)',
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
                background: 'rgba(15, 18, 36, .04)',
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
                    entry.type === 'prior' ? '#059669' :
                                              '#7C3AED'
  const onClick = () => {
    if (entry.type === 'doc' && entry.doc_id) onPreviewDoc(entry.doc_id)
    else if (entry.type === 'web' && entry.url) window.open(entry.url, '_blank', 'noopener,noreferrer')
    else if (entry.type === 'prior' && entry.prior_kind && projectId)
      navigate(`/console/projects/${projectId}?stage=${encodeURIComponent(entry.prior_kind)}`)
  }
  const clickable = (entry.type === 'doc' && !!entry.doc_id)
                 || (entry.type === 'web' && !!entry.url)
                 || (entry.type === 'prior' && !!entry.prior_kind && !!projectId)

  return (
    <div
      data-ref={`${moduleKey}:${refId}`}
      onClick={clickable ? onClick : undefined}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--rd-line)',
        borderLeft: highlighted ? '2px solid var(--rd-accent)' : '2px solid transparent',
        background: highlighted ? 'rgba(255, 141, 26, .08)' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (clickable && !highlighted) e.currentTarget.style.background = 'rgba(15, 18, 36, .03)' }}
      onMouseLeave={e => { if (!highlighted) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span className="rd-mono" style={{
          padding: '1px 6px', fontSize: 12, fontWeight: 700,
          borderRadius: 4, background: 'rgba(15, 18, 36, .06)', color: 'var(--rd-text-2)',
          flexShrink: 0,
        }}>{refId}</span>
        <Icon size={11} color={typeColor} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div title={entry.label} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--rd-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{entry.label}</div>
          {entry.snippet && (
            <div style={{
              fontSize: 12, color: 'var(--rd-text-3)', marginTop: 4,
              lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{entry.snippet}</div>
          )}
          {entry.type === 'web' && entry.url && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#7C3AED', marginTop: 4 }}>
              <ExternalLink size={9} /> {entry.domain}
            </div>
          )}
          {entry.type === 'prior' && entry.stage_label && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#047857', marginTop: 4 }}>
              <GitBranch size={9} /> 跳转 · {entry.stage_label}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
