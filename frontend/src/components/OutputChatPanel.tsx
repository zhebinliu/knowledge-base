import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Search, Sparkles, Wand2, Play, RefreshCw } from 'lucide-react'
import {
  createOutputChat, sendOutputChatMessage, finalizeOutputChat, listOutputChats, getOutputChat,
  type OutputChat, type OutputChatMessage, type OutputKind,
} from '../api/client'
import MarkdownView from './MarkdownView'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const CHOICES_RE = /<choices(\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>/i
const FENCED_CHOICES_RE = /(```[a-zA-Z]*\s*)?`?\s*<choices(?:\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>\s*`?(\s*```)?/i

function parseChoicesArray(raw: string): string[] | null {
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr
  } catch { /* fall through */ }
  const inner = raw.trim().replace(/^\[\s*"/, '').replace(/"\s*\]$/, '')
  if (!inner) return null
  const parts = inner.split(/"\s*,\s*"/)
  return parts.map(s => s.trim()).filter(Boolean)
}

function extractChoices(text: string): { cleaned: string; choices: string[]; multi: boolean } {
  const m = text.match(CHOICES_RE)
  if (!m) return { cleaned: text, choices: [], multi: false }
  const arr = parseChoicesArray(m[2])
  if (arr && arr.length > 0) {
    const cleaned = text.replace(FENCED_CHOICES_RE, '').replace(/\n{3,}/g, '\n\n').trim()
    return { cleaned, choices: arr, multi: !!m[1] }
  }
  return { cleaned: text, choices: [], multi: false }
}

interface Props {
  kind: OutputKind
  projectId: string
  /** 标题，例如「项目洞察」「启动会 PPT」 */
  stageTitle: string
  /** finalize 提交成功后的回调（用来刷新外部 bundles 列表） */
  onGenerated?: () => void
  /** 没有 chat 时显示的占位文案 */
  emptyHint?: string
}

export default function OutputChatPanel({ kind, projectId, stageTitle, onGenerated, emptyHint }: Props) {
  const qc = useQueryClient()
  const [chat, setChat] = useState<OutputChat | null>(null)
  const [messages, setMessages] = useState<OutputChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pickedMulti, setPickedMulti] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // kind / project 切换时清空内嵌 chat（外层应给不同 key 强制 remount，但这里也兜底）
  useEffect(() => {
    setChat(null); setMessages([]); setDraft(''); setPickedMulti([]); setError('')
  }, [kind, projectId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const { data: existingChats } = useQuery({
    queryKey: ['output-chats', kind, projectId],
    queryFn: () => listOutputChats({ kind, project_id: projectId, limit: 5 }),
    enabled: !chat && !!projectId,
  })
  const resumableChat = useMemo(() => {
    if (!existingChats || existingChats.length === 0) return null
    return existingChats.find(c => c.status === 'active') || existingChats[0]
  }, [existingChats])

  const resumeChat = async (id: string) => {
    setError(''); setStarting(true)
    try {
      const c = await getOutputChat(id)
      setChat(c); setMessages(c.messages)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '加载历史对话失败')
    } finally { setStarting(false) }
  }

  const startChat = async () => {
    setError(''); setStarting(true)
    try {
      const c = await createOutputChat({ kind, project_id: projectId })
      setChat(c); setMessages(c.messages)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '开启对话失败')
    } finally { setStarting(false) }
  }

  const sendMut = useMutation({
    mutationFn: async (content: string) => {
      if (!chat) throw new Error('no chat')
      return await sendOutputChatMessage(chat.id, content)
    },
    onSuccess: (res, content) => {
      setMessages(ms => [...ms, { role: 'user', content }, { role: 'assistant', content: res.reply, tool_uses: res.tool_uses }])
      setDraft(''); setPickedMulti([])
    },
    onError: () => setError('发送失败，请重试'),
  })

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!chat) throw new Error('no chat')
      return await finalizeOutputChat(chat.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outputs'] })
      qc.invalidateQueries({ queryKey: ['project-bundles', projectId] })
      if (chat) setChat({ ...chat, status: 'generating' })
      onGenerated?.()
    },
    onError: () => setError('生成失败，请稍后重试'),
  })

  const submit = () => {
    const text = draft.trim()
    if (!text || sendMut.isPending) return
    sendMut.mutate(text)
  }
  const submitChoice = (c: string) => { if (!sendMut.isPending) sendMut.mutate(c) }
  const submitMulti = () => {
    if (pickedMulti.length === 0 || sendMut.isPending) return
    sendMut.mutate(pickedMulti.join('、'))
  }

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i
    return -1
  }, [messages])

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6 py-10 text-sm text-ink-muted">
        <div>
          <Wand2 size={28} className="mx-auto mb-3 text-[#FF8D1A]" />
          <p className="mb-1 text-ink">{stageTitle} · 对话生成</p>
          <p className="text-xs">{emptyHint || '点击下方「开始对话」，智能体会先问候并抛出第一个问题'}</p>
          {resumableChat && (
            <div className="mt-5 inline-flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-orange-50 border border-orange-100">
              <p className="text-xs text-ink">
                已有一条历史对话（{resumableChat.status === 'active' ? '进行中' : resumableChat.status}）
              </p>
              <button
                onClick={() => resumeChat(resumableChat.id)}
                disabled={starting}
                className="text-xs text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: BRAND_GRAD }}
              >继续上次对话</button>
            </div>
          )}
          <div className="mt-4">
            <button
              onClick={startChat}
              disabled={starting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND_GRAD }}
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />}
              {starting ? '开启中…' : '开始对话'}
            </button>
          </div>
          {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 py-2.5 border-b border-line flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-[#D96400] shrink-0" />
          <span className="text-sm font-semibold text-ink truncate">{stageTitle}</span>
          {chat.refs_count > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 shrink-0">
              <Search size={10} /> 已检索 {chat.refs_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending || chat.status !== 'active' || messages.length < 2}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
            title={chat.status !== 'active' ? '已经提交过生成' : messages.length < 2 ? '至少要有一轮对话' : '基于整段对话生成交付物'}
          >
            {generateMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {chat.status === 'generating' ? '生成中' : '生成交付物'}
          </button>
          <button
            onClick={() => { setChat(null); setMessages([]); setDraft(''); setPickedMulti([]); setError('') }}
            className="text-xs text-ink-muted hover:text-ink px-2 py-1 rounded hover:bg-gray-50"
            title="重新开始一段对话"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, idx) => {
          const isLastAssistant = idx === lastAssistantIdx
          const { cleaned, choices, multi } = m.role === 'assistant'
            ? extractChoices(m.content)
            : { cleaned: m.content, choices: [] as string[], multi: false }
          return (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`${m.role === 'user' ? 'bg-orange-50 border-orange-100' : 'bg-white border-line'} border rounded-2xl px-3 py-2 max-w-[85%]`}>
                {m.role === 'assistant' && m.tool_uses && m.tool_uses.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.tool_uses.map((t, i) => {
                      let q = ''
                      try { q = JSON.parse(t.arguments)?.query || '' } catch { /* */ }
                      return (
                        <span key={i} className="flex items-center gap-1 text-[10px] text-ink-muted bg-gray-50 border border-line rounded-full px-2 py-0.5">
                          <Search size={9} /> {q || t.name}
                        </span>
                      )
                    })}
                  </div>
                )}
                <MarkdownView content={cleaned || '…'} size="sm" toolbar={false} />
                {isLastAssistant && choices.length > 0 && !multi && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {choices.map(c => (
                      <button
                        key={c}
                        onClick={() => submitChoice(c)}
                        disabled={sendMut.isPending}
                        className="px-3 py-1 text-xs rounded-full border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 disabled:opacity-50"
                      >{c}</button>
                    ))}
                  </div>
                )}
                {isLastAssistant && choices.length > 0 && multi && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {choices.map(c => {
                        const on = pickedMulti.includes(c)
                        return (
                          <button
                            key={c}
                            onClick={() => setPickedMulti(arr => on ? arr.filter(x => x !== c) : [...arr, c])}
                            className={`px-3 py-1 text-xs rounded-full border ${
                              on
                                ? 'bg-orange-100 text-orange-800 border-orange-300'
                                : 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50'
                            }`}
                          >{c}</button>
                        )
                      })}
                    </div>
                    <button
                      onClick={submitMulti}
                      disabled={pickedMulti.length === 0 || sendMut.isPending}
                      className="px-3 py-1 text-xs rounded-lg text-white disabled:opacity-50"
                      style={{ background: BRAND_GRAD }}
                    >提交选择 ({pickedMulti.length})</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {sendMut.isPending && (
          <div className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 size={13} className="animate-spin" /> 智能体思考中…</div>
        )}
        {error && <div className="text-xs text-red-500">{error}</div>}
      </div>

      <div className="px-4 py-2.5 border-t border-line shrink-0 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Enter 发送，Shift+Enter 换行"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-300"
            style={{ minHeight: 44, maxHeight: 120 }}
            disabled={sendMut.isPending || chat.status !== 'active'}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || sendMut.isPending || chat.status !== 'active'}
            className="px-3 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
          >
            {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}
