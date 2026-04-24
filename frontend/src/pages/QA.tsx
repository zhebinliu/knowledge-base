import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Send, Bot, User, Loader, MessageSquare, Trash2, ChevronRight, FileSearch, Cpu, ChevronDown, ChevronUp, FileText, Copy, Check, Sparkles, ThumbsUp, ThumbsDown, Star, Briefcase, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { generateDoc, listProjects, submitAnswerFeedback, type QAPersona, type QASource } from '../api/client'
import { ltcLabel } from '../utils/labels'

/** Strip Markdown syntax for plain-text previews in source cards */
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

type SourceItem = QASource

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
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

function SourcePanel({ sources, hasMessages }: { sources: SourceItem[]; hasMessages: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileSearch size={14} className="text-gray-400"/>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">参考来源</span>
        </div>
        {sources.length > 0 && (
          <span className="text-xs text-gray-400">{sources.length} 条</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sources.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8 px-4">
            {!hasMessages ? '提问后显示参考来源' : '等待回答完成…'}
          </p>
        )}
        {sources.map((s, i) => {
          const isExpanded = expanded[s.id] ?? false
          const stripped = s.content ? stripMarkdown(s.content) : ''
          const preview = stripped.slice(0, 120)
          const hasMore = stripped.length > 120
          return (
            <div key={s.id} className="mx-3 mb-2 border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
              <div
                className="flex items-center gap-1.5 px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => s.content && toggle(s.id)}
              >
                <span className="text-xs text-gray-400 font-mono flex-shrink-0">#{i + 1}</span>
                {s.ltc_stage && (
                  <span className="text-xs px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded-full flex-shrink-0">
                    {ltcLabel(s.ltc_stage)}
                  </span>
                )}
                <span className="flex-1"/>
                {s.score !== undefined && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {Math.round(s.score * 100)}%
                  </span>
                )}
                {s.content && (
                  isExpanded
                    ? <ChevronUp size={12} className="text-gray-400 flex-shrink-0"/>
                    : <ChevronDown size={12} className="text-gray-400 flex-shrink-0"/>
                )}
              </div>
              {s.source_section && (
                <div className="px-3 pt-0.5 pb-1 text-[11px] text-gray-400 truncate" title={s.source_section}>
                  {s.source_section}
                </div>
              )}
              <div className="px-3 pb-2.5">
                {s.document_id && (
                  <Link
                    to={`/documents?doc=${s.document_id}#chunk-${s.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline mb-1"
                    title="在文档中查看原文"
                  >
                    <ExternalLink size={10}/> 看原文
                  </Link>
                )}
                {isExpanded && s.content ? (
                  <div className="prose prose-xs prose-gray max-w-none text-xs leading-relaxed
                    [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
                    [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mt-1.5 [&_h2]:mb-0.5
                    [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1 [&_h3]:mb-0.5
                    [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-1 [&_h4]:mb-0.5
                    [&_p]:my-0.5 [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:my-0
                    [&_strong]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {preview + (hasMore && !isExpanded ? '…' : '')}
                  </p>
                )}
                {!s.content && (
                  <p className="text-xs text-gray-400 font-mono">ID: {s.id.slice(0, 12)}…</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const STORAGE_KEY = 'kb_qa_history'
const LTC_STAGES = ['', '线索', '商机', '报价', '合同', '回款', '售后']
const SUGGESTED = [
  '如何推进商机到报价阶段？',
  '回款跟进有哪些最佳实践？',
  '合同签署的标准流程是什么？',
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

function loadHistory(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}
function saveHistory(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 30))) }
  catch { /* ignore quota */ }
}

const markdownComponents = {
  code: ({ children, className }: any) =>
    className
      ? <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre my-2">{children}</code>
      : <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
  a: ({ href, children }: any) =>
    <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">{children}</a>,
  table: ({ children }: any) =>
    <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
  th: ({ children }: any) =>
    <th className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }: any) =>
    <td className="border border-gray-200 px-3 py-1.5">{children}</td>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-0.5 my-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-0.5 my-1">{children}</ol>,
  h1: ({ children }: any) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="my-1 leading-relaxed">{children}</p>,
  blockquote: ({ children }: any) =>
    <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-600 italic my-2">{children}</blockquote>,
  hr: () => <hr className="my-2 border-gray-200"/>,
}

// ── Feedback bar: thumbs up/down/star on each assistant message ─────────────
function FeedbackBar({
  questionLogId, current, onChange,
}: {
  questionLogId: string
  current: 'up' | 'down' | 'star' | null
  onChange: (r: 'up' | 'down' | 'star') => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const click = async (rating: 'up' | 'down' | 'star') => {
    setPending(rating)
    try {
      await submitAnswerFeedback({ question_log_id: questionLogId, rating })
      onChange(rating)
    } catch { /* 未登录时会 401，静默 */ }
    finally { setPending(null) }
  }
  const btnClass = (r: 'up' | 'down' | 'star', active: string) =>
    `p-1 rounded transition-colors ${
      current === r ? active : 'text-gray-300 hover:text-gray-500'
    } ${pending === r ? 'opacity-50' : ''}`
  return (
    <div className="flex items-center gap-1 mt-1 px-1">
      <button onClick={() => click('up')} className={btnClass('up', 'text-green-600')} title="有用">
        <ThumbsUp size={12}/>
      </button>
      <button onClick={() => click('down')} className={btnClass('down', 'text-red-500')} title="没帮上忙（进未解决队列）">
        <ThumbsDown size={12}/>
      </button>
      <button onClick={() => click('star')} className={btnClass('star', 'text-amber-500')} title="收藏为金句">
        <Star size={12}/>
      </button>
    </div>
  )
}


// ── Document Generation Component ──────────────────────────────────────────
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

  const handleCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = () => {
    if (!template.trim() || !projectName.trim() || !industry.trim()) return
    setResult('')
    gen.mutate({
      template,
      project_name: projectName,
      industry,
      query: query || undefined,
    })
  }

  const canGenerate = template.trim() && projectName.trim() && industry.trim()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Sparkles size={16} className="text-orange-500"/>
          文档生成
        </h1>
      </div>

      {/* Form + Result */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Form fields */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">项目名称 *</label>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="如：XX公司CRM实施"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">行业 *</label>
            <input
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="如：制造业、零售业"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">检索关键词</label>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="可选，不填则自动组合"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>
        </div>

        {/* Template */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">文档模板 *</label>
          <textarea
            value={template}
            onChange={e => setTemplate(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white resize-y"
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || gen.isPending}
            className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}
          >
            {gen.isPending ? <Loader size={14} className="animate-spin"/> : <Sparkles size={14}/>}
            {gen.isPending ? '生成中…' : '生成文档'}
          </button>
          {gen.isError && (
            <span className="text-xs text-red-500">生成失败：{String(gen.error)}</span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <FileText size={14} className="text-orange-500"/> 生成结果
              </h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-orange-600 border border-gray-200 rounded-lg hover:border-orange-300 transition-colors"
              >
                {copied ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>}
                {copied ? '已复制' : '复制全文'}
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 prose prose-sm prose-gray max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {result}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main QA Component ──────────────────────────────────────────────────────
interface QAProps {
  /** 如提供则锁定为 PM 视角并固定该项目，隐藏顶部的 persona/项目切换 */
  lockedProjectId?: string | null
}

export default function QA({ lockedProjectId }: QAProps = {}) {
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

  // 项目列表（PM persona 下拉）
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const activeConv = convs.find(c => c.id === activeId) ?? null
  const messages   = activeConv?.messages ?? []

  // 切换到已有对话时恢复其 persona / project（锁定模式下保持锁定值）
  useEffect(() => {
    if (activeConv) {
      if (lockedProjectId) {
        setPersona('pm')
        setProjectId(lockedProjectId)
      } else {
        setPersona(activeConv.persona ?? 'general')
        setProjectId(activeConv.projectId ?? null)
      }
    }
  }, [activeId, lockedProjectId])

  // lockedProjectId 变更时强制同步
  useEffect(() => {
    if (lockedProjectId) {
      setPersona('pm')
      setProjectId(lockedProjectId)
    }
  }, [lockedProjectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Conversation management ───────────────────────────────────────────
  const updateConvs = useCallback((fn: (prev: Conversation[]) => Conversation[]) => {
    setConvs(prev => {
      const next = fn(prev)
      saveHistory(next)
      return next
    })
  }, [])

  const newConv = () => {
    const id = Date.now().toString()
    updateConvs(prev => [{
      id, title: '新对话', messages: [], createdAt: new Date().toISOString(),
      persona, projectId,
    }, ...prev])
    setActiveId(id)
    setInput('')
  }

  const deleteConv = (id: string) => {
    updateConvs(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  // ── Streaming submit ──────────────────────────────────────────────────
  const submit = async () => {
    const q = input.trim()
    if (!q || streaming) return
    if (persona === 'pm' && !projectId) {
      alert('项目经理模式需要先选择一个项目')
      return
    }
    setInput('')

    // 构建 history：当前会话里已完成的 user+assistant 配对
    const prevMessages = activeConv?.messages ?? []
    const history = prevMessages
      .filter(m => m.content.trim())
      .map(m => ({ role: m.role, content: m.content }))

    // Ensure we have an active conversation
    let convId = activeId
    if (!convId) {
      convId = Date.now().toString()
      updateConvs(prev => [{
        id: convId!,
        title: q.slice(0, 24),
        messages: [],
        createdAt: new Date().toISOString(),
        persona, projectId,
      }, ...prev])
      setActiveId(convId)
    }

    // Append user message + empty assistant placeholder
    updateConvs(prev => prev.map(c => c.id === convId ? {
      ...c,
      title: c.messages.length === 0 ? q.slice(0, 24) : c.title,
      persona: c.persona ?? persona,
      projectId: c.projectId ?? projectId,
      messages: [
        ...c.messages,
        { role: 'user' as const, content: q },
        { role: 'assistant' as const, content: '' },
      ],
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

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const reader  = resp.body.getReader()
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
              // Append token to last assistant message
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
              // Attach sources to last assistant message
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
                  msgs[msgs.length - 1] = { ...last, content: `错误：${parsed.error}` }
                }
                return { ...c, messages: msgs }
              }))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateConvs(prev => prev.map(c => {
          if (c.id !== convId) return c
          const msgs = [...c.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && last.content === '') {
            msgs[msgs.length - 1] = { ...last, content: `错误：${String(err)}` }
          }
          return { ...c, messages: msgs }
        }))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  // Last assistant message sources for right panel
  const lastSources = [...messages].reverse()
    .find(m => m.role === 'assistant' && m.sources && m.sources.length > 0)?.sources ?? []

  const tabClass = (tab: 'qa' | 'docgen') =>
    `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
      activeTab === tab
        ? 'bg-orange-500 text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: History (only for QA tab, hidden on mobile) ────────────── */}
      {activeTab === 'qa' ? (
        <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-white hidden md:flex flex-col">
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">历史对话</span>
            <button
              onClick={newConv}
              className="text-xs px-2 py-1 text-white rounded-lg transition-all"
              style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}
            >
              + 新建
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {convs.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 px-3">暂无对话记录</p>
            )}
            {convs.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  activeId === conv.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                }`}
              >
                <MessageSquare size={13} className={activeId === conv.id ? 'text-orange-500' : 'text-gray-400'}/>
                <span className={`flex-1 text-xs truncate ${activeId === conv.id ? 'text-orange-700 font-medium' : 'text-gray-700'}`}>
                  {conv.title}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteConv(conv.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
                >
                  <Trash2 size={11}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 hidden md:flex flex-col items-center justify-center px-4">
          <Sparkles size={24} className="text-orange-300 mb-2"/>
          <p className="text-xs text-gray-400 text-center">输入模板和项目信息，AI 自动从知识库生成文档</p>
        </div>
      )}

      {/* ── Center: Chat or DocGen ───────────────────────────────────────── */}
      {activeTab === 'docgen' ? (
        <DocGen />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header with tabs */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap gap-2">
            <div className="flex gap-1">
              <button onClick={() => setActiveTab('qa')} className={tabClass('qa')}>
                <Bot size={14}/> 智能问答
              </button>
              <button onClick={() => setActiveTab('docgen')} className={tabClass('docgen')}>
                <Sparkles size={14}/> 文档生成
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!lockedProjectId && (
                <>
                  {/* Persona */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => { setPersona('general'); setProjectId(null) }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        persona === 'general' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                      }`}
                      disabled={streaming}
                      title="通用问答：不限项目"
                    >
                      <Bot size={11}/> 通用
                    </button>
                    <button
                      onClick={() => setPersona('pm')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        persona === 'pm' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500'
                      }`}
                      disabled={streaming}
                      title="虚拟项目经理：限定在选中项目的知识库"
                    >
                      <Briefcase size={11}/> 项目经理
                    </button>
                  </div>
                  {/* Project selector (only when PM) */}
                  {persona === 'pm' && (
                    <select
                      value={projectId ?? ''}
                      onChange={e => setProjectId(e.target.value || null)}
                      className="px-3 py-1.5 border border-orange-200 bg-orange-50 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      disabled={streaming}
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
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                  <Briefcase size={11}/> 项目经理模式
                </span>
              )}
              {/* LTC stage */}
              <select
                value={ltcStage}
                onChange={e => setLtcStage(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">不限阶段</option>
                {LTC_STAGES.filter(Boolean).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 pb-16">
                <Bot size={44} className="mb-3 opacity-20"/>
                <p className="text-sm font-medium text-gray-500">从知识库检索答案</p>
                <p className="text-xs text-gray-400 mt-1 mb-5">选择阶段后提问，获得更精准的答案</p>
                <div className="grid gap-2 w-full max-w-sm">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-left px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
                    >
                      <ChevronRight size={13} className="inline mr-1 opacity-50"/>{q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              // 流式等待中：最后一条 assistant 消息还没收到 token，交给下方 thinking 指示器渲染，不重复绘空气泡
              const isEmptyStreamingPlaceholder =
                streaming &&
                i === messages.length - 1 &&
                msg.role === 'assistant' &&
                !msg.content
              if (isEmptyStreamingPlaceholder) return null
              return (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'text-white' : 'bg-gray-100 border border-gray-200'
                }`}
                  style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #FF8D1A, #D96400)' } : {}}
                >
                  {msg.role === 'user'
                    ? <User size={14} className="text-white"/>
                    : <Bot size={14} className="text-gray-500"/>
                  }
                </div>
                <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white rounded-tr-sm whitespace-pre-wrap'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm prose prose-sm prose-gray max-w-none'
                    }`}
                    style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #FF8D1A, #D96400)' } : {}}
                  >
                    {msg.role === 'user' ? msg.content : (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {streaming && i === messages.length - 1 && (
                          <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle"/>
                        )}
                      </>
                    )}
                  </div>
                  {msg.model && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 mt-1">
                      <Cpu size={10} />{msg.model}
                    </span>
                  )}
                  {msg.sources && msg.sources.length > 0 && (
                    <p className="text-xs text-gray-400 px-1">参考了 {msg.sources.length} 个来源 →</p>
                  )}
                  {msg.role === 'assistant' && msg.question_log_id && !streaming && (
                    <FeedbackBar
                      questionLogId={msg.question_log_id}
                      current={msg.feedback ?? null}
                      onChange={(r) => {
                        updateConvs(prev => prev.map(c => c.id !== activeId ? c : {
                          ...c,
                          messages: c.messages.map((m, idx) =>
                            idx === i ? { ...m, feedback: r } : m
                          ),
                        }))
                      }}
                    />
                  )}
                </div>
              </div>
              )
            })}

            {/* "Thinking" indicator */}
            {streaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
              <div className="flex gap-3 -mt-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <Bot size={14} className="text-gray-500"/>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                  <Loader size={14} className="animate-spin" style={{ color: 'var(--accent)' }}/>
                  <span className="text-sm text-gray-400">正在检索并生成答案…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-gray-200 bg-white flex-shrink-0">
            <div className="flex gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
                placeholder="输入你的问题…"
                className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                disabled={streaming}
              />
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 bg-gray-500 rounded-sm inline-block"/>停止
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!input.trim()}
                  className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }}
                >
                  <Send size={13}/>发送
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Right: Sources (only for QA tab) ─────────────────────────────── */}
      {activeTab === 'qa' && (
        <SourcePanel sources={lastSources} hasMessages={messages.length > 0} />
      )}
    </div>
  )
}
