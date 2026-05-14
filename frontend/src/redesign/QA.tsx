/**
 * NewQA — Liquid Glass 版智能问答(单一组件,后台 /qa 和工作台 /console/qa 复用)
 *
 * 功能 100% 等价于生产 `frontend/src/pages/QA.tsx`(880 行):
 *   - localStorage 历史对话(最多 30 条) + 新建/切换/删除
 *   - SSE 流式生成(/api/qa/ask-stream),解析 token / sources / question_log_id / error
 *   - AbortController 中止
 *   - persona: general / pm(PM 模式必须选项目)
 *   - lockedProjectId: 给 ConsoleProjectDetail 内嵌用,锁 PM 模式 + 特定项目
 *   - ltc_stage 过滤(线索/商机/报价/合同/回款/售后)
 *   - FeedbackBar: 每条 AI 回复 👍/👎/⭐(调 submitAnswerFeedback)
 *   - SourcePanel: 右侧参考来源,可展开切片(Markdown 渲染)、跳到原文
 *   - DocGen tab: 模板填空生成文档(调 generateDoc),保留切 tab 逻辑
 *   - 空状态 SUGGESTED 3 个问题快速点击
 *   - thinking 指示器、model badge、来源数提示
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Send, Bot, FileSearch, ChevronDown, ChevronUp, FileText, Copy, Check,
  Sparkles, ThumbsUp, ThumbsDown, Star, Briefcase, ExternalLink, Loader,
  Plus, Trash2, MessageSquare, X, Cpu,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  generateDoc, listProjects, submitAnswerFeedback,
  type QAPersona, type QASource,
} from '../api/client'
import { ltcLabel } from '../utils/labels'
import GlowCard from './components/GlowCard'

// ── Constants(从生产搬过来,完全等价) ───────────────────────────────────
const STORAGE_KEY = 'kb_qa_history'
const LTC_STAGES = ['', '线索', '商机', '报价', '合同', '回款', '售后']
const SUGGESTED = [
  '如何推进商机到报价阶段?',
  '回款跟进有哪些最佳实践?',
  '合同签署的标准流程是什么?',
]
const DEFAULT_TEMPLATE = `# 项目实施方案

## 1. 项目概述
- 项目背景
- 项目目标
- 项目范围

## 2. 系统配置
- 模块启用
- 字段配置
- 流程设计

## 3. 数据迁移
- 数据范围
- 迁移方案
- 验证标准

## 4. 培训计划
- 培训对象
- 培训内容
- 培训安排

## 5. 上线计划
- 上线步骤
- 风险预案
- 验收标准`

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: QASource[]
  model?: string | null
  question_log_id?: string
  feedback?: 'up' | 'down' | 'star' | null
}
interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  persona?: QAPersona
  projectId?: string | null
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

function loadHistory(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}
function saveHistory(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 30))) }
  catch { /* ignore */ }
}

// ── Markdown styling for AI replies(轻量定制,贴合浅色玻璃风格) ──────
const markdownComponents = {
  code: ({ children, className }: any) =>
    className
      ? <code style={{ display: 'block', background: 'rgba(15, 18, 36, .05)', border: '1px solid var(--rd-line)', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontFamily: 'ui-monospace, monospace', overflowX: 'auto', whiteSpace: 'pre', margin: '8px 0' }}>{children}</code>
      : <code style={{ background: 'rgba(15, 18, 36, .06)', color: 'var(--rd-text)', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{children}</code>,
  a: ({ href, children }: any) =>
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--rd-accent-2)', textDecoration: 'underline' }}>{children}</a>,
  ul: ({ children }: any) => <ul style={{ listStyle: 'disc', paddingLeft: 22, margin: '6px 0' }}>{children}</ul>,
  ol: ({ children }: any) => <ol style={{ listStyle: 'decimal', paddingLeft: 22, margin: '6px 0' }}>{children}</ol>,
  li: ({ children }: any) => <li style={{ margin: '2px 0' }}>{children}</li>,
  h1: ({ children }: any) => <h1 style={{ fontSize: 16, fontWeight: 700, marginTop: 14, marginBottom: 6 }}>{children}</h1>,
  h2: ({ children }: any) => <h2 style={{ fontSize: 14.5, fontWeight: 700, marginTop: 12, marginBottom: 5 }}>{children}</h2>,
  h3: ({ children }: any) => <h3 style={{ fontSize: 13.5, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{children}</h3>,
  p: ({ children }: any) => <p style={{ margin: '6px 0', lineHeight: 1.7 }}>{children}</p>,
  blockquote: ({ children }: any) =>
    <blockquote style={{ borderLeft: '3px solid var(--rd-accent)', paddingLeft: 12, color: 'var(--rd-text-2)', fontStyle: 'italic', margin: '8px 0' }}>{children}</blockquote>,
  table: ({ children }: any) =>
    <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>{children}</table></div>,
  th: ({ children }: any) =>
    <th style={{ border: '1px solid var(--rd-line)', background: 'rgba(15, 18, 36, .03)', padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>{children}</th>,
  td: ({ children }: any) =>
    <td style={{ border: '1px solid var(--rd-line)', padding: '6px 10px' }}>{children}</td>,
  hr: () => <hr style={{ margin: '10px 0', border: 0, borderTop: '1px solid var(--rd-line)' }} />,
}

// ── FeedbackBar ──────────────────────────────────────────────────────────
function FeedbackBar({ questionLogId, current, onChange }: {
  questionLogId: string; current: 'up' | 'down' | 'star' | null; onChange: (r: 'up' | 'down' | 'star') => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const click = async (rating: 'up' | 'down' | 'star') => {
    setPending(rating)
    try { await submitAnswerFeedback({ question_log_id: questionLogId, rating }); onChange(rating) }
    catch { /* ignore */ }
    finally { setPending(null) }
  }
  const buttonStyle = (r: 'up' | 'down' | 'star', activeColor: string): React.CSSProperties => ({
    background: 'transparent', border: 'none', padding: 4, borderRadius: 6,
    color: current === r ? activeColor : 'var(--rd-text-3)',
    cursor: 'pointer',
    opacity: pending === r ? 0.5 : 1,
    transition: 'color .15s, background .15s',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 6 }}>
      <button onClick={() => click('up')} style={buttonStyle('up', '#059669')} title="有用"><ThumbsUp size={12} /></button>
      <button onClick={() => click('down')} style={buttonStyle('down', '#DC2626')} title="没帮上忙(进未解决队列)"><ThumbsDown size={12} /></button>
      <button onClick={() => click('star')} style={buttonStyle('star', '#D97706')} title="收藏为金句"><Star size={12} /></button>
    </div>
  )
}

// ── SourcePanel(右侧参考来源) ────────────────────────────────────────
function SourcePanel({ sources, hasMessages }: { sources: QASource[]; hasMessages: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      borderLeft: '1px solid var(--rd-line)',
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid var(--rd-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <FileSearch size={12} /> 参考来源
        </span>
        {sources.length > 0 && (
          <span className="rd-mono" style={{ fontSize: 12, color: 'var(--rd-accent-2)' }}>{sources.length} 条</span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {sources.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--rd-text-3)', textAlign: 'center', padding: '36px 16px' }}>
            {!hasMessages ? '提问后显示参考来源' : '等待回答完成…'}
          </p>
        )}
        {sources.map((s, i) => {
          const isExpanded = expanded[s.id] ?? false
          const stripped = s.content ? stripMarkdown(s.content) : ''
          const preview = stripped.slice(0, 120)
          const hasMore = stripped.length > 120
          return (
            <div key={s.id} style={{
              marginBottom: 8,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(255,255,255,0.95)',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .7)',
            }}>
              <div
                onClick={() => s.content && toggle(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px',
                  cursor: s.content ? 'pointer' : 'default',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => s.content && (e.currentTarget.style.background = 'rgba(15, 18, 36, .03)')}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="rd-mono" style={{ fontSize: 12, color: 'var(--rd-text-3)', flexShrink: 0 }}>#{i + 1}</span>
                {s.ltc_stage && (
                  <span className="rd-badge is-orange" style={{ fontSize: 12, padding: '1px 7px' }}>{ltcLabel(s.ltc_stage)}</span>
                )}
                <span style={{ flex: 1 }} />
                {s.score !== undefined && (
                  <span className="rd-mono" style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>
                    {Math.round(s.score * 100)}%
                  </span>
                )}
                {s.content && (
                  isExpanded ? <ChevronUp size={11} color="var(--rd-text-3)" /> : <ChevronDown size={11} color="var(--rd-text-3)" />
                )}
              </div>
              {s.source_section && (
                <div style={{
                  padding: '0 12px 4px', fontSize: 12, color: 'var(--rd-text-3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={s.source_section}>{s.source_section}</div>
              )}
              <div style={{ padding: '2px 12px 12px' }}>
                {s.document_id && (
                  <Link
                    to={`/documents?doc=${s.document_id}#chunk-${s.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', marginBottom: 6 }}
                    title="在文档中查看原文"
                  >
                    <ExternalLink size={10} /> 看原文
                  </Link>
                )}
                {isExpanded && s.content ? (
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {s.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--rd-text-2)', lineHeight: 1.55, margin: 0 }}>
                    {preview + (hasMore && !isExpanded ? '…' : '')}
                  </p>
                )}
                {!s.content && (
                  <p className="rd-mono" style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: 0 }}>ID: {s.id.slice(0, 12)}…</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ── DocGen 子组件 ────────────────────────────────────────────────────────
function DocGen() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [projectName, setProjectName] = useState('')
  const [industry, setIndustry] = useState('')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  const gen = useMutation({
    mutationFn: generateDoc,
    onSuccess: (data) => setResult(data.content),
  })
  const canGenerate = !!(template.trim() && projectName.trim() && industry.trim())

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--rd-line)',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        flexShrink: 0,
      }}>
        <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: 0 }}>
          <Sparkles size={15} color="var(--rd-accent)" /> 文档生成
        </h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: '项目名称 *', value: projectName, onChange: setProjectName, placeholder: '如:XX公司CRM实施' },
            { label: '行业 *',     value: industry,    onChange: setIndustry,    placeholder: '如:制造业、零售业' },
            { label: '检索关键词',  value: query,       onChange: setQuery,       placeholder: '可选,不填则自动组合' },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--rd-text-2)', marginBottom: 5 }}>{f.label}</label>
              <input className="rd-input" value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} style={{ fontSize: 13, padding: '8px 12px' }} />
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--rd-text-2)', marginBottom: 5 }}>文档模板 *</label>
          <textarea
            className="rd-input"
            value={template}
            onChange={e => setTemplate(e.target.value)}
            rows={12}
            style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button
            onClick={() => { setResult(''); gen.mutate({ template, project_name: projectName, industry, query: query || undefined }) }}
            disabled={!canGenerate || gen.isPending}
            className="rd-btn rd-btn-primary"
          >
            {gen.isPending ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {gen.isPending ? '生成中…' : '生成文档'}
          </button>
          {gen.isError && (
            <span style={{ fontSize: 12, color: '#DC2626' }}>生成失败:{String(gen.error)}</span>
          )}
        </div>

        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, margin: 0 }}>
                <FileText size={14} color="var(--rd-accent)" /> 生成结果
              </h3>
              <button
                onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="rd-btn"
                style={{ fontSize: 12, padding: '5px 10px' }}
              >
                {copied ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                {copied ? '已复制' : '复制全文'}
              </button>
            </div>
            <GlowCard style={{ padding: 22, fontSize: 13, lineHeight: 1.7 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{result}</ReactMarkdown>
            </GlowCard>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main NewQA ───────────────────────────────────────────────────────────
interface QAProps {
  /** 如提供则锁定为 PM 视角并固定该项目,隐藏顶部的 persona/项目切换 */
  lockedProjectId?: string | null
  /** 紧凑模式 — 用于 FloatingChat 等窄宽场景,隐藏左历史栏 + 右来源栏 */
  compact?: boolean
}

export default function NewQA({ lockedProjectId, compact = false }: QAProps = {}) {
  const [convs, setConvs]         = useState<Conversation[]>(loadHistory)
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [input, setInput]         = useState('')
  const [ltcStage, setLtcStage]   = useState('')
  const [persona, setPersona]     = useState<QAPersona>(lockedProjectId ? 'pm' : 'general')
  const [projectId, setProjectId] = useState<string | null>(lockedProjectId ?? null)
  const [streaming, setStreaming] = useState(false)
  const [activeTab, setActiveTab] = useState<'qa' | 'docgen'>('qa')
  const abortRef                  = useRef<AbortController | null>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const activeConv = convs.find(c => c.id === activeId) ?? null
  const messages   = activeConv?.messages ?? []

  useEffect(() => {
    if (activeConv) {
      if (lockedProjectId) {
        setPersona('pm'); setProjectId(lockedProjectId)
      } else {
        setPersona(activeConv.persona ?? 'general')
        setProjectId(activeConv.projectId ?? null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, lockedProjectId])

  useEffect(() => {
    if (lockedProjectId) {
      setPersona('pm'); setProjectId(lockedProjectId)
    }
  }, [lockedProjectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const updateConvs = useCallback((fn: (prev: Conversation[]) => Conversation[]) => {
    setConvs(prev => {
      const next = fn(prev)
      saveHistory(next)
      return next
    })
  }, [])

  const newConv = () => {
    const id = Date.now().toString()
    updateConvs(prev => [{ id, title: '新对话', messages: [], createdAt: new Date().toISOString(), persona, projectId }, ...prev])
    setActiveId(id); setInput('')
  }

  const deleteConv = (id: string) => {
    updateConvs(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  // ── Streaming submit(完全等价于生产)──────────────────────────────
  const submit = async () => {
    const q = input.trim()
    if (!q || streaming) return
    if (persona === 'pm' && !projectId) { alert('项目经理模式需要先选择一个项目'); return }
    setInput('')

    const prevMessages = activeConv?.messages ?? []
    const history = prevMessages.filter(m => m.content.trim()).map(m => ({ role: m.role, content: m.content }))

    let convId = activeId
    if (!convId) {
      convId = Date.now().toString()
      updateConvs(prev => [{
        id: convId!, title: q.slice(0, 24), messages: [],
        createdAt: new Date().toISOString(), persona, projectId,
      }, ...prev])
      setActiveId(convId)
    }

    updateConvs(prev => prev.map(c => c.id === convId ? {
      ...c,
      title: c.messages.length === 0 ? q.slice(0, 24) : c.title,
      persona: c.persona ?? persona,
      projectId: c.projectId ?? projectId,
      messages: [...c.messages, { role: 'user' as const, content: q }, { role: 'assistant' as const, content: '' }],
    } : c))

    setStreaming(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch('/api/qa/ask-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('kb_access_token')
            ? { Authorization: `Bearer ${localStorage.getItem('kb_access_token')}` }
            : {}),
        },
        body: JSON.stringify({
          question: q,
          ltc_stage: ltcStage || undefined,
          history,
          persona,
          project_id: persona === 'pm' ? projectId : undefined,
        }),
        signal: ctrl.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)

            if (parsed.token !== undefined) {
              updateConvs(prev => prev.map(c => {
                if (c.id !== convId) return c
                const msgs = [...c.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') {
                  msgs[msgs.length - 1] = { ...last, content: last.content + parsed.token }
                }
                return { ...c, messages: msgs }
              }))
            } else if (parsed.sources) {
              updateConvs(prev => prev.map(c => {
                if (c.id !== convId) return c
                const msgs = [...c.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') {
                  msgs[msgs.length - 1] = { ...last, sources: parsed.sources, model: parsed.model ?? null }
                }
                return { ...c, messages: msgs }
              }))
            } else if (parsed.question_log_id) {
              updateConvs(prev => prev.map(c => {
                if (c.id !== convId) return c
                const msgs = [...c.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') {
                  msgs[msgs.length - 1] = { ...last, question_log_id: parsed.question_log_id }
                }
                return { ...c, messages: msgs }
              }))
            } else if (parsed.error) {
              updateConvs(prev => prev.map(c => {
                if (c.id !== convId) return c
                const msgs = [...c.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') {
                  msgs[msgs.length - 1] = { ...last, content: `错误:${parsed.error}` }
                }
                return { ...c, messages: msgs }
              }))
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateConvs(prev => prev.map(c => {
          if (c.id !== convId) return c
          const msgs = [...c.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && last.content === '') {
            msgs[msgs.length - 1] = { ...last, content: `错误:${String(err)}` }
          }
          return { ...c, messages: msgs }
        }))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const lastSources = [...messages].reverse()
    .find(m => m.role === 'assistant' && m.sources && m.sources.length > 0)?.sources ?? []

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      minHeight: 0,
      width: '100%',
      overflow: 'hidden',
    }}>
      {/* ── 左侧历史(compact 时隐藏) ───────────────────────────────────── */}
      {!compact && activeTab === 'qa' && (
        <aside style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--rd-line)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--rd-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              历史对话
            </span>
            <button
              onClick={newConv}
              className="rd-btn rd-btn-primary"
              style={{ fontSize: 12, padding: '4px 10px', gap: 3 }}
            >
              <Plus size={11} /> 新建
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            {convs.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--rd-text-3)', textAlign: 'center', padding: '24px 12px' }}>暂无对话记录</p>
            )}
            {convs.map(conv => {
              const active = activeId === conv.id
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className="group"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: active ? 'rgba(255, 141, 26, 0.14)' : 'transparent',
                    transition: 'background .15s',
                    marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(15, 18, 36, .04)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <MessageSquare size={12} color={active ? 'var(--rd-accent-2)' : 'var(--rd-text-3)'} />
                  <span style={{
                    flex: 1, fontSize: 12,
                    color: active ? 'var(--rd-accent-2)' : 'var(--rd-text)',
                    fontWeight: active ? 600 : 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{conv.title}</span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteConv(conv.id) }}
                    style={{
                      background: 'transparent', border: 'none', padding: 2,
                      color: 'var(--rd-text-3)', cursor: 'pointer',
                      display: 'flex',
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      {/* ── 中央:对话区 OR DocGen ─────────────────────────────────────── */}
      {activeTab === 'docgen' ? <DocGen /> : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 顶部控制栏(Tab + Persona + 项目 + 阶段) */}
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid var(--rd-line)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setActiveTab('qa')}
                className={`rd-chip${activeTab === 'qa' ? ' is-active' : ''}`}
                style={{ fontSize: 12, padding: '5px 12px' }}
              >
                <Bot size={11} /> 智能问答
              </button>
              <button
                onClick={() => setActiveTab('docgen')}
                className={`rd-chip${(activeTab as string) === 'docgen' ? ' is-active' : ''}`}
                style={{ fontSize: 12, padding: '5px 12px' }}
              >
                <Sparkles size={11} /> 文档生成
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!lockedProjectId && (
                <>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: 'rgba(15, 18, 36, .04)',
                    borderRadius: 999, padding: 2,
                  }}>
                    {[
                      { v: 'general' as QAPersona, label: '通用', Icon: Bot, color: 'var(--rd-text)' },
                      { v: 'pm' as QAPersona, label: '项目经理', Icon: Briefcase, color: 'var(--rd-accent-2)' },
                    ].map(p => {
                      const active = persona === p.v
                      return (
                        <button
                          key={p.v}
                          onClick={() => { setPersona(p.v); if (p.v === 'general') setProjectId(null) }}
                          disabled={streaming}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 999,
                            background: active ? '#fff' : 'transparent',
                            color: active ? p.color : 'var(--rd-text-3)',
                            fontSize: 12, fontWeight: active ? 600 : 500,
                            border: 'none', cursor: 'pointer',
                            boxShadow: active ? '0 1px 4px rgba(15, 18, 36, .08)' : 'none',
                            transition: 'all .15s',
                            fontFamily: 'inherit',
                          }}
                        >
                          <p.Icon size={10} /> {p.label}
                        </button>
                      )
                    })}
                  </div>

                  {persona === 'pm' && (
                    <select
                      value={projectId ?? ''}
                      onChange={e => setProjectId(e.target.value || null)}
                      disabled={streaming}
                      className="rd-input"
                      style={{
                        fontSize: 12, padding: '6px 28px 6px 12px', width: 'auto', minWidth: 160,
                        borderColor: 'rgba(255, 141, 26, .35)',
                        background: 'rgba(255, 141, 26, .08)',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23D96400' stroke-width='2.5'><polyline points='6 9 12 15 18 9'/></svg>")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 10px center',
                      }}
                    >
                      <option value="">选择项目…</option>
                      {(projects ?? []).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.customer ? ` · ${p.customer}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {lockedProjectId && (
                <span className="rd-badge is-orange" style={{ fontSize: 12, padding: '3px 10px' }}>
                  <Briefcase size={10} /> 项目经理模式
                </span>
              )}

              <select
                value={ltcStage}
                onChange={e => setLtcStage(e.target.value)}
                className="rd-input"
                style={{
                  fontSize: 12, padding: '6px 28px 6px 12px', width: 'auto', minWidth: 110,
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%235C6273' stroke-width='2.5'><polyline points='6 9 12 15 18 9'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                <option value="">不限阶段</option>
                {LTC_STAGES.filter(Boolean).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 消息列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                paddingBottom: 60,
              }}>
                <Bot size={44} style={{ color: 'var(--rd-text-3)', opacity: 0.4, marginBottom: 12 }} />
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--rd-text-2)', margin: 0 }}>从知识库检索答案</p>
                <p style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 4, marginBottom: 20 }}>选择阶段后提问,获得更精准的答案</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 380 }}>
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="rd-chip"
                      style={{
                        textAlign: 'left', padding: '10px 14px', fontSize: 13,
                        justifyContent: 'flex-start',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.map((msg, i) => {
              const isEmptyStreamingPlaceholder =
                streaming && i === messages.length - 1 && msg.role === 'assistant' && !msg.content
              if (isEmptyStreamingPlaceholder) return null

              const isUser = msg.role === 'user'
              return (
                <div key={i} style={{ display: 'flex', gap: 12, flexDirection: isUser ? 'row-reverse' : 'row' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isUser
                      ? 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))'
                      : 'rgba(255,255,255,0.95)',
                    border: isUser ? 'none' : '1px solid var(--rd-line)',
                    boxShadow: isUser ? '0 4px 12px -2px rgba(255,141,26,.4)' : 'inset 0 1px 0 rgba(255,255,255,.6)',
                    color: isUser ? '#fff' : 'var(--rd-text-2)',
                  }}>
                    {isUser ? <span style={{ fontSize: 13, fontWeight: 700 }}>我</span> : <Bot size={14} />}
                  </div>
                  <div style={{
                    maxWidth: '78%',
                    display: 'flex', flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: 4,
                  }}>
                    <div style={isUser ? {
                      borderRadius: 16, borderTopRightRadius: 6,
                      padding: '11px 16px',
                      background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                      color: '#fff',
                      fontSize: 14, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      boxShadow: '0 4px 12px -2px rgba(255,141,26,.35)',
                    } : {
                      borderRadius: 16, borderTopLeftRadius: 6,
                      padding: '12px 18px',
                      background: 'rgba(255,255,255,0.95)',
                      backdropFilter: 'blur(20px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.95)',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .7), 0 1px 3px rgba(15, 18, 36, .05)',
                      color: 'var(--rd-text)',
                      fontSize: 13.5, lineHeight: 1.7,
                    }}>
                      {isUser ? msg.content : (
                        <>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                          {streaming && i === messages.length - 1 && (
                            <span style={{
                              display: 'inline-block',
                              width: 2, height: 14, background: 'var(--rd-accent)',
                              marginLeft: 2, verticalAlign: 'text-bottom',
                              animation: 'rd-blink 0.85s steps(2) infinite',
                            }} />
                          )}
                        </>
                      )}
                    </div>

                    {msg.model && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '1px 8px', borderRadius: 999,
                        background: 'rgba(124, 58, 237, .10)',
                        color: '#6D28D9',
                        fontSize: 12,
                        border: '1px solid rgba(124, 58, 237, .20)',
                      }}>
                        <Cpu size={9} />{msg.model}
                      </span>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: 0, padding: '0 4px' }}>
                        参考了 {msg.sources.length} 个来源 →
                      </p>
                    )}
                    {!isUser && msg.question_log_id && !streaming && (
                      <FeedbackBar
                        questionLogId={msg.question_log_id}
                        current={msg.feedback ?? null}
                        onChange={(r) => {
                          updateConvs(prev => prev.map(c => c.id !== activeId ? c : {
                            ...c,
                            messages: c.messages.map((m, idx) => idx === i ? { ...m, feedback: r } : m),
                          }))
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {/* thinking 指示器 */}
            {streaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid var(--rd-line)',
                  color: 'var(--rd-text-2)',
                }}>
                  <Bot size={14} />
                </div>
                <div style={{
                  borderRadius: 16, borderTopLeftRadius: 6,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.95)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.95)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span className="rd-dots"><span /><span /><span /></span>
                  <span style={{ fontSize: 13, color: 'var(--rd-text-2)' }}>正在检索并生成答案…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 输入框 */}
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--rd-line)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
              <input
                className="rd-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
                placeholder="输入你的问题…"
                disabled={streaming}
                style={{ paddingRight: 56, fontSize: 14, padding: '12px 56px 12px 18px' }}
              />
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    height: 36,
                    padding: '0 14px', borderRadius: 10,
                    background: 'rgba(15, 18, 36, .08)',
                    color: 'var(--rd-text)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: 'inherit',
                  }}
                >
                  <X size={11} /> 停止
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!input.trim()}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 40, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                    color: '#fff', border: 'none',
                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                    opacity: input.trim() ? 1 : 0.5,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px -2px rgba(255,141,26,.45)',
                    transition: 'transform .2s',
                  }}
                  onMouseEnter={e => input.trim() && (e.currentTarget.style.transform = 'translateY(-50%) scale(1.06)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(-50%)')}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 右侧来源(compact 时隐藏) */}
      {!compact && activeTab === 'qa' && <SourcePanel sources={lastSources} hasMessages={messages.length > 0} />}
    </div>
  )
}
