/**
 * FloatingQA — 浮动聊天窗里的轻量项目问答
 *
 * 与 pages/QA.tsx 的关键区别:
 *  - 单列布局(没有 历史侧栏 + 来源侧栏)
 *  - 一次会话(浮窗里 一个 project = 一段聊天,关闭即丢;不入 localStorage)
 *  - 来源以「N 条来源 ▼」折叠 chip 内联在每条 assistant 消息底部
 *  - 不展示 persona 切换 / LTC stage 选择 / 文档生成 tab
 *  - 直接走 /api/qa/ask-stream 流式接口
 *
 * 使用场景:用户在项目详情页随手提问、不打断主流程。
 */
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, Loader2, Bot, User, ChevronDown, ChevronUp, FileText, Trash2, MessageSquarePlus,
} from 'lucide-react'
import type { QASource } from '../../api/client'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  sources?: QASource[]
}

interface Props {
  projectId: string
}

export default function FloatingQA({ projectId }: Props) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 切换 project 时清空
  useEffect(() => {
    setMessages([])
    setInput('')
    setError(null)
    abortRef.current?.abort()
  }, [projectId])

  // 自动滚到底
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = async () => {
    const q = input.trim()
    if (!q || streaming) return
    setInput('')
    setError(null)

    const history = messages
      .filter(m => m.content.trim())
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: '' },
    ])
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
          history,
          persona: 'pm',
          project_id: projectId,
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
              setMessages(prev => {
                const out = [...prev]
                const last = out[out.length - 1]
                if (last?.role === 'assistant') {
                  out[out.length - 1] = { ...last, content: last.content + parsed.token }
                }
                return out
              })
            } else if (parsed.sources) {
              setMessages(prev => {
                const out = [...prev]
                const last = out[out.length - 1]
                if (last?.role === 'assistant') {
                  out[out.length - 1] = { ...last, sources: parsed.sources }
                }
                return out
              })
            } else if (parsed.error) {
              setError(parsed.error)
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e?.message || '请求失败')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearAll = () => {
    setMessages([])
    setError(null)
    abortRef.current?.abort()
    inputRef.current?.focus()
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶栏(轻量):新对话 + 锁定项目提示 */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-line bg-slate-50/40 flex items-center gap-2">
        <span className="text-[10px] text-ink-muted">
          🔒 仅查询本项目知识库
        </span>
        <button
          onClick={clearAll}
          disabled={messages.length === 0 || streaming}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[11px] text-ink-muted hover:text-[#D96400] disabled:opacity-40"
          title="清空对话"
        >
          <MessageSquarePlus size={11} /> 新对话
        </button>
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 bg-canvas/30">
        {messages.length === 0 && (
          <div className="text-center py-12 text-xs text-ink-muted">
            <Bot size={28} className="mx-auto mb-2 text-orange-300" />
            问问关于这个项目的事 — 客户背景 / 风险 / 文档摘要…
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="flex-shrink-0 border-t border-line p-2 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={streaming ? 'AI 回答中…' : '输入问题,Enter 发送,Shift+Enter 换行'}
            disabled={streaming}
            rows={2}
            className="flex-1 resize-none px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white disabled:bg-slate-50"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-white shadow-sm disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
            title="发送 (Enter)"
          >
            {streaming
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 单条消息 bubble ─────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
        isUser ? 'bg-orange-100 text-[#D96400]' : 'bg-slate-100 text-slate-600'
      }`}>
        {isUser ? <User size={12} /> : <Bot size={12} />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
          isUser
            ? 'bg-orange-50 text-ink border border-orange-100'
            : 'bg-white text-ink border border-line'
        }`}>
          {isUser
            ? <span className="whitespace-pre-wrap">{msg.content}</span>
            : msg.content
              ? (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-pre:my-2 text-[13px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )
              : <Loader2 size={12} className="animate-spin text-ink-muted" />
          }
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <SourcesCollapsed sources={msg.sources} />
        )}
      </div>
    </div>
  )
}

function SourcesCollapsed({ sources }: { sources: QASource[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1 w-full">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10.5px] text-ink-muted hover:text-[#D96400]"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <FileText size={10} /> {sources.length} 条来源
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {sources.map((s, i) => (
            <div key={s.id ?? i} className="text-[11px] bg-slate-50 border border-slate-200 rounded p-1.5">
              <div className="flex items-center gap-1 text-ink-secondary mb-0.5">
                <span className="text-ink-muted">#{i + 1}</span>
                {s.source_section && <span className="truncate">· {s.source_section}</span>}
                {typeof s.score === 'number' && (
                  <span className="ml-auto text-ink-muted text-[9.5px]">{s.score.toFixed(2)}</span>
                )}
              </div>
              {s.content && (
                <div className="text-ink-muted leading-snug line-clamp-3">
                  {s.content.slice(0, 200)}{s.content.length > 200 ? '…' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
