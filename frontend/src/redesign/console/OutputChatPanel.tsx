/**
 * NewOutputChatPanel — 输出对话面板(Liquid Glass)
 * 功能 100% 等价 — createOutputChat / sendOutputChatMessage / finalizeOutputChat /
 *                   listOutputChats / getOutputChat + <choices> 解析 + multi-pick
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Search, Sparkles, Wand2, Play, RefreshCw } from 'lucide-react'
import {
  createOutputChat, sendOutputChatMessage, finalizeOutputChat, listOutputChats, getOutputChat,
  type OutputChat, type OutputChatMessage, type OutputKind,
} from '../../api/client'
import MarkdownView from '../../components/MarkdownView'

const CHOICES_RE = /<choices(\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>/i
const FENCED_CHOICES_RE = /(```[a-zA-Z]*\s*)?`?\s*<choices(?:\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>\s*`?(\s*```)?/i

function parseChoicesArray(raw: string): string[] | null {
  try { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr } catch { /* */ }
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
  stageTitle: string
  onGenerated?: () => void
  emptyHint?: string
}

export default function NewOutputChatPanel({ kind, projectId, stageTitle, onGenerated, emptyHint }: Props) {
  const qc = useQueryClient()
  const [chat, setChat] = useState<OutputChat | null>(null)
  const [messages, setMessages] = useState<OutputChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pickedMulti, setPickedMulti] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

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
    try { const c = await getOutputChat(id); setChat(c); setMessages(c.messages) }
    catch (e: any) { setError(e?.response?.data?.detail || '加载历史对话失败') }
    finally { setStarting(false) }
  }

  const startChat = async () => {
    setError(''); setStarting(true)
    try { const c = await createOutputChat({ kind, project_id: projectId }); setChat(c); setMessages(c.messages) }
    catch (e: any) { setError(e?.response?.data?.detail || '开启对话失败') }
    finally { setStarting(false) }
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
    onError: () => setError('发送失败,请重试'),
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
    onError: () => setError('生成失败,请稍后重试'),
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
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--rd-text-3)',
      }}>
        <div>
          <Wand2 size={28} color="var(--rd-accent)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--rd-text)', marginBottom: 4 }}>{stageTitle} · 对话生成</p>
          <p style={{ fontSize: 12 }}>{emptyHint || '点击下方「开始对话」,智能体会先问候并抛出第一个问题'}</p>
          {resumableChat && (
            <div style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '12px 16px', marginTop: 20, borderRadius: 14,
              background: 'rgba(255, 141, 26, .08)', border: '1px solid rgba(255, 141, 26, .22)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--rd-text)' }}>
                已有一条历史对话({resumableChat.status === 'active' ? '进行中' : resumableChat.status})
              </p>
              <button
                onClick={() => resumeChat(resumableChat.id)}
                disabled={starting}
                className="rd-btn rd-btn-primary"
                style={{ fontSize: 12, padding: '5px 12px' }}
              >继续上次对话</button>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={startChat}
              disabled={starting}
              className="rd-btn rd-btn-primary"
            >
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} />}
              {starting ? '开启中…' : '开始对话'}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--rd-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Sparkles size={13} color="var(--rd-accent-2)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stageTitle}
          </span>
          {chat.refs_count > 0 && (
            <span className="rd-badge is-orange" style={{ flexShrink: 0 }}>
              <Search size={9} /> 已检索 {chat.refs_count}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending || chat.status !== 'active' || messages.length < 2}
            className="rd-btn rd-btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            title={chat.status !== 'active' ? '已经提交过生成' : messages.length < 2 ? '至少要有一轮对话' : '基于整段对话生成交付物'}
          >
            {generateMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {chat.status === 'generating' ? '生成中' : '生成交付物'}
          </button>
          <button
            onClick={() => { setChat(null); setMessages([]); setDraft(''); setPickedMulti([]); setError('') }}
            className="rd-icon-btn"
            style={{ width: 28, height: 28 }}
            title="重新开始一段对话"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, idx) => {
          const isLastAssistant = idx === lastAssistantIdx
          const { cleaned, choices, multi } = m.role === 'assistant'
            ? extractChoices(m.content)
            : { cleaned: m.content, choices: [] as string[], multi: false }
          const isUser = m.role === 'user'
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                padding: '8px 12px', borderRadius: 16,
                background: isUser
                  ? 'linear-gradient(135deg, rgba(255, 141, 26, .12), rgba(255, 141, 26, .04))'
                  : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isUser ? 'rgba(255, 141, 26, .22)' : 'var(--rd-line)'}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}>
                {m.role === 'assistant' && m.tool_uses && m.tool_uses.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {m.tool_uses.map((t, i) => {
                      let q = ''
                      try { q = JSON.parse(t.arguments)?.query || '' } catch { /* */ }
                      return (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 12, color: 'var(--rd-text-3)',
                          background: 'rgba(0,0,0,0.25)', border: '1px solid var(--rd-line)',
                          borderRadius: 999, padding: '1px 8px',
                        }}>
                          <Search size={9} /> {q || t.name}
                        </span>
                      )
                    })}
                  </div>
                )}
                <MarkdownView content={cleaned || '…'} size="sm" toolbar={false} />
                {isLastAssistant && choices.length > 0 && !multi && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {choices.map(c => (
                      <button
                        key={c}
                        onClick={() => submitChoice(c)}
                        disabled={sendMut.isPending}
                        className="rd-chip"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                      >{c}</button>
                    ))}
                  </div>
                )}
                {isLastAssistant && choices.length > 0 && multi && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                      {choices.map(c => {
                        const on = pickedMulti.includes(c)
                        return (
                          <button
                            key={c}
                            onClick={() => setPickedMulti(arr => on ? arr.filter(x => x !== c) : [...arr, c])}
                            className={`rd-chip${on ? ' is-active' : ''}`}
                            style={{ fontSize: 12, padding: '4px 12px' }}
                          >{c}</button>
                        )
                      })}
                    </div>
                    <button
                      onClick={submitMulti}
                      disabled={pickedMulti.length === 0 || sendMut.isPending}
                      className="rd-btn rd-btn-primary"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >提交选择 ({pickedMulti.length})</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {sendMut.isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--rd-text-3)' }}>
            <span className="rd-dots"><span /><span /><span /></span> 智能体思考中…
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
      </div>

      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--rd-line)', flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            className="rd-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Enter 发送,Shift+Enter 换行"
            disabled={sendMut.isPending || chat.status !== 'active'}
            style={{
              flex: 1, fontSize: 13, padding: '9px 12px', minHeight: 44, maxHeight: 120,
              resize: 'none',
            }}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || sendMut.isPending || chat.status !== 'active'}
            className="rd-btn rd-btn-primary"
            style={{ padding: '9px 14px' }}
          >
            {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}
