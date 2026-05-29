/**
 * GlobalSearchModal — 工作台全局搜索浮层
 * 按 ⌘K 或点 dock 搜索图标打开,跨「项目 / 会议 / 文档」前端过滤,
 * 命中跳转到对应详情/列表
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, FolderKanban, Mic, FileText, ArrowRight, Loader2 } from 'lucide-react'
import { listProjects, listMeetings, listDocuments } from '../../api/client'

interface Props {
  open: boolean
  onClose: () => void
}

/** 命中后跳路由 — 根据当前是工作台 (/console/*) 还是后台 (/qa /projects 等) 选不同根 */
function buildRoutes(pathname: string) {
  const inConsole = pathname.startsWith('/console')
  return {
    project: (id: string) => (inConsole ? `/console/projects/${id}` : `/projects/${id}`),
    meeting: (id: number) => (inConsole ? `/console/meeting/${id}` : `/console/meeting/${id}`),
    document: (id: string) => `/documents?id=${id}`,
  }
}

type Hit =
  | { kind: 'project'; id: string; title: string; subtitle: string }
  | { kind: 'meeting'; id: number; title: string; subtitle: string }
  | { kind: 'document'; id: string; title: string; subtitle: string }

const KIND_META = {
  project:  { label: '项目', icon: FolderKanban, color: '#FF8D1A' },
  meeting:  { label: '会议', icon: Mic,          color: '#A78BFA' },
  document: { label: '文档', icon: FileText,     color: '#38BDF8' },
} as const

export default function GlobalSearchModal({ open, onClose }: Props) {
  const nav = useNavigate()
  const loc = useLocation()
  const routes = useMemo(() => buildRoutes(loc.pathname), [loc.pathname])
  const inputRef = useRef<HTMLInputElement>(null)
  const [keyword, setKeyword] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)

  // 三个 list API 并行拉(仅在打开时)
  const { data: projects } = useQuery({
    queryKey: ['gs-projects'],
    queryFn: listProjects,
    enabled: open,
    staleTime: 60 * 1000,
  })
  const { data: meetings } = useQuery({
    queryKey: ['gs-meetings'],
    queryFn: () => listMeetings(),
    enabled: open,
    staleTime: 60 * 1000,
  })
  const { data: docsResp } = useQuery({
    queryKey: ['gs-documents'],
    queryFn: () => listDocuments({ limit: 200 }),
    enabled: open,
    staleTime: 60 * 1000,
  })

  const loading = open && (!projects || !meetings || !docsResp)

  // 关键词过滤(前端模糊匹配)
  const hits = useMemo<Hit[]>(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return []
    const out: Hit[] = []
    for (const p of (projects || [])) {
      const hay = `${p.name} ${p.customer || ''} ${p.industry || ''} ${(p.aliases || []).join(' ')}`.toLowerCase()
      if (hay.includes(kw)) {
        out.push({
          kind: 'project',
          id: p.id,
          title: p.name,
          subtitle: [p.customer, p.industry].filter(Boolean).join(' · ') || '—',
        })
      }
    }
    for (const m of (meetings || [])) {
      const hay = `${m.title} ${m.project_name || ''}`.toLowerCase()
      if (hay.includes(kw)) {
        out.push({
          kind: 'meeting',
          id: m.id,
          title: m.title,
          subtitle: m.project_name ? `关联项目:${m.project_name}` : '未关联项目',
        })
      }
    }
    for (const d of (docsResp?.items || [])) {
      const hay = `${d.filename} ${(d as any).description || ''}`.toLowerCase()
      if (hay.includes(kw)) {
        out.push({
          kind: 'document',
          id: d.id,
          title: d.filename,
          subtitle: `${d.original_format} · ${d.conversion_status === 'completed' ? '已索引' : d.conversion_status}`,
        })
      }
    }
    return out.slice(0, 40)
  }, [keyword, projects, meetings, docsResp])

  // 打开时聚焦 + 重置
  useEffect(() => {
    if (open) {
      setKeyword('')
      setHighlightIdx(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // 键盘:ESC 关 / ↑↓ 翻 / Enter 跳
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx(i => Math.min(i + 1, hits.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = hits[highlightIdx]
        if (hit) onPick(hit)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hits, highlightIdx])

  const onPick = (hit: Hit) => {
    if (hit.kind === 'project') nav(routes.project(hit.id))
    else if (hit.kind === 'meeting') nav(routes.meeting(hit.id))
    else nav(routes.document(hit.id))
    onClose()
  }

  if (!open) return null

  // 命中按类型分组渲染顺序保持 hits 顺序;但展示时按 kind 分块更清晰
  const grouped: { kind: Hit['kind']; items: { hit: Hit; idx: number }[] }[] = []
  ;(['project', 'meeting', 'document'] as const).forEach(k => {
    const items = hits
      .map((h, i) => ({ hit: h, idx: i }))
      .filter(it => it.hit.kind === k)
    if (items.length) grouped.push({ kind: k, items })
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15, 18, 36, 0.30)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'rd-fade-up .2s var(--rd-ease) both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        style={{
          width: 'min(680px, 92vw)',
          maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          boxShadow: '0 30px 60px -14px rgba(15, 18, 36, .30), inset 0 1px 0 rgba(255,255,255,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* 输入条 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(0,0,0,0.25)',
        }}>
          <Search size={16} color="var(--rd-text-2)" />
          <input
            ref={inputRef}
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setHighlightIdx(0) }}
            placeholder="搜索项目 / 会议 / 文档…"
            style={{
              flex: 1,
              fontSize: 15,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--rd-text)',
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
          />
          <kbd style={{
            fontSize: 12, color: 'var(--rd-text-3)',
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--rd-line)',
            fontFamily: 'ui-monospace, monospace',
          }}>ESC</kbd>
          <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }}>
            <X size={14} />
          </button>
        </div>

        {/* 结果区 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!keyword.trim() ? (
            <div style={{
              padding: '36px 24px', textAlign: 'center',
              color: 'var(--rd-text-3)', fontSize: 13, lineHeight: 1.7,
            }}>
              输入关键词搜索<br />
              <span style={{ fontSize: 12, opacity: 0.8 }}>项目名 / 客户名 / 会议标题 / 文档名 都能找到</span>
            </div>
          ) : loading ? (
            <div style={{
              padding: '36px 24px', textAlign: 'center',
              color: 'var(--rd-text-3)', fontSize: 13,
            }}>
              <Loader2 size={14} className="animate-spin" style={{ display: 'inline-block', marginRight: 6 }} />
              加载索引中…
            </div>
          ) : hits.length === 0 ? (
            <div style={{
              padding: '36px 24px', textAlign: 'center',
              color: 'var(--rd-text-3)', fontSize: 13,
            }}>
              没有匹配 "<span style={{ color: 'var(--rd-text-2)' }}>{keyword}</span>" 的内容
            </div>
          ) : (
            <div style={{ padding: '6px 0 12px' }}>
              {grouped.map(g => (
                <div key={g.kind}>
                  <div style={{
                    padding: '10px 18px 4px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--rd-text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>
                    {KIND_META[g.kind].label} · {g.items.length}
                  </div>
                  {g.items.map(({ hit, idx }) => {
                    const Icon = KIND_META[hit.kind].icon
                    const color = KIND_META[hit.kind].color
                    const active = idx === highlightIdx
                    return (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        onClick={() => onPick(hit)}
                        onMouseEnter={() => setHighlightIdx(idx)}
                        style={{
                          width: '100%', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '9px 18px',
                          background: active ? 'rgba(255, 141, 26, 0.10)' : 'transparent',
                          borderLeft: active ? '2px solid var(--rd-accent)' : '2px solid transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background .12s',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{
                          flexShrink: 0,
                          width: 28, height: 28, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${color}1A`,
                          color,
                        }}>
                          <Icon size={14} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: 13.5, color: 'var(--rd-text)', fontWeight: 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{hit.title}</div>
                          <div style={{
                            fontSize: 12, color: 'var(--rd-text-3)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{hit.subtitle}</div>
                        </div>
                        {active && <ArrowRight size={13} color="var(--rd-accent)" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div style={{
          flexShrink: 0,
          padding: '8px 18px',
          borderTop: '1px solid rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 12, color: 'var(--rd-text-3)',
        }}>
          <span><kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd> 切换</span>
          <span><kbd style={kbdStyle}>↵</kbd> 打开</span>
          <span style={{ marginLeft: 'auto' }}>
            前端关键词匹配 · 命中上限 40 条
          </span>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  marginRight: 4,
  fontSize: 11,
  fontFamily: 'ui-monospace, monospace',
  color: 'var(--rd-text-2)',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--rd-line)',
  borderRadius: 4,
}
