import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, ClipboardList, Lightbulb, Sparkles, Send, Download, RefreshCw,
  CheckCircle, XCircle, Loader2, Clock, Wand2, Search, Play, ExternalLink,
} from 'lucide-react'
import {
  listProjects, listOutputs, getProjectMeta, TOKEN_STORAGE_KEY,
  createOutputChat, sendOutputChatMessage, finalizeOutputChat,
  type Project, type CuratedBundle, type OutputKind, type OutputChat, type OutputChatMessage,
} from '../../api/client'
import MarkdownView from '../../components/MarkdownView'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface KindMeta {
  id: OutputKind
  icon: typeof FileText
  title: string
  desc: string
  color: string
}

const KINDS: KindMeta[] = [
  { id: 'kickoff_pptx', icon: FileText, title: '启动会 PPT', desc: '客户启动会用的 PPT 大纲 + 导出 .pptx', color: '#D96400' },
  { id: 'survey', icon: ClipboardList, title: '实施调研问卷', desc: '按五大维度展开的调研题库，导出 Markdown / Word', color: '#2563EB' },
  { id: 'insight', icon: Lightbulb, title: '项目洞察报告', desc: '面向高管的项目状态 + 风险 + 建议报告', color: '#7C3AED' },
]
const KIND_MAP = Object.fromEntries(KINDS.map(k => [k.id, k])) as Record<OutputKind, KindMeta>

const CHOICES_RE = /<choices(\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>/i
// 防御：把 `<choices>...</choices>`、```xml\n<choices>...</choices>\n``` 这类被代码化的写法里的围栏一并剥掉
const FENCED_CHOICES_RE = /(```[a-zA-Z]*\s*)?`?\s*<choices(?:\s+multi=(?:"true"|'true'|true))?\s*>\s*(\[[\s\S]*?\])\s*<\/choices>\s*`?(\s*```)?/i

function parseChoicesArray(raw: string): string[] | null {
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr
  } catch { /* fall through to tolerant parse */ }
  // 容错：模型生成的数组里常带未转义的 " (例如 ("提升""更好"这种))。
  // 用 "," 作为项分隔符切分，去掉首尾的 [" 和 "]。
  const inner = raw.trim().replace(/^\[\s*"/, '').replace(/"\s*\]$/, '')
  if (!inner) return null
  const parts = inner.split(/"\s*,\s*"/)
  if (parts.length === 0) return null
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'done') return <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />已完成</span>
  if (status === 'failed') return <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle size={12} />失败</span>
  if (status === 'generating') return <span className="flex items-center gap-1 text-blue-500 text-xs"><Loader2 size={12} className="animate-spin" />生成中</span>
  return <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock size={12} />排队中</span>
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ConsoleOutputs() {
  const qc = useQueryClient()
  const [kind, setKind] = useState<OutputKind>('kickoff_pptx')
  const [scope, setScope] = useState<'project' | 'industry'>('project')
  const [projectId, setProjectId] = useState<string>('')
  const [industry, setIndustry] = useState<string>('')
  const [chat, setChat] = useState<OutputChat | null>(null)
  const [messages, setMessages] = useState<OutputChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pickedMulti, setPickedMulti] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const { data: outputs, refetch: refetchOutputs } = useQuery({
    queryKey: ['outputs'],
    queryFn: () => listOutputs({ page: 1 }),
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? []
      return items.some((b: CuratedBundle) => b.status === 'pending' || b.status === 'generating') ? 5000 : false
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const ready = scope === 'project' ? !!projectId : !!industry

  const startChat = async () => {
    if (!ready) return
    setError(''); setStarting(true)
    try {
      const c = await createOutputChat({
        kind,
        project_id: scope === 'project' ? projectId : null,
        industry: scope === 'industry' ? industry : null,
      })
      setChat(c)
      setMessages(c.messages)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '开启对话失败')
    } finally {
      setStarting(false)
    }
  }

  const resetChat = () => {
    setChat(null); setMessages([]); setDraft(''); setPickedMulti([]); setError('')
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
      refetchOutputs()
      // 标记对话已触发生成
      if (chat) setChat({ ...chat, status: 'generating' })
    },
    onError: () => setError('生成失败，请稍后重试'),
  })

  const submit = () => {
    const text = draft.trim()
    if (!text || sendMut.isPending) return
    sendMut.mutate(text)
  }

  const submitChoice = (choice: string) => {
    if (sendMut.isPending) return
    sendMut.mutate(choice)
  }

  const submitMulti = () => {
    if (pickedMulti.length === 0 || sendMut.isPending) return
    sendMut.mutate(pickedMulti.join('、'))
  }

  // 只对最后一条 assistant 消息解析 choices，避免历史消息误渲染
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i
    return -1
  }, [messages])

  const downloadBundle = (b: CuratedBundle) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    fetch(`/api/outputs/${b.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) { alert('下载失败'); return }
        const disposition = res.headers.get('content-disposition') || ''
        const match = disposition.match(/filename="([^"]+)"/)
        const filename = match ? match[1] : b.title
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      })
  }

  const playBundle = (b: CuratedBundle) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    fetch(`/api/outputs/${b.id}/view`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) { alert('在线播放失败'); return }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        // 10 分钟后释放
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
      })
  }

  const isHtmlBundle = (b: CuratedBundle) => b.kind === 'kickoff_pptx' && b.has_file

  const currentKind = KIND_MAP[kind]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium mb-3">
          <Sparkles size={11} /> 输出中心
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">对话式生成交付物</h1>
        <p className="text-sm text-ink-secondary max-w-2xl">
          选择智能体和作用域（项目或行业）后开始对话。智能体会基于配置的提示词和技能来提问、检索知识库，并最终生成交付文档。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* 左：对话区 */}
        <div className="rounded-2xl border border-line bg-white flex flex-col" style={{ minHeight: 560 }}>
          {!chat ? (
            <div className="flex-1 flex items-center justify-center text-center px-6 py-10 text-sm text-ink-muted">
              <div>
                <Wand2 size={28} className="mx-auto mb-3 text-[#FF8D1A]" />
                <p className="mb-1 text-ink">右侧完成设置后，点击「开始对话」</p>
                <p className="text-xs">智能体会先问候并抛出第一个问题</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-line flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <currentKind.icon size={16} style={{ color: currentKind.color }} />
                  <span className="text-sm font-semibold text-ink truncate">{currentKind.title}</span>
                  <span className="text-xs text-ink-muted truncate">
                    · {scope === 'project'
                        ? (projects?.find(p => p.id === chat.project_id)?.name ?? '项目')
                        : `行业：${chat.industry}`}
                  </span>
                  {chat.refs_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 shrink-0">
                      <Search size={10} /> 已检索 {chat.refs_count}
                    </span>
                  )}
                </div>
                <button onClick={resetChat} className="text-xs text-ink-muted hover:text-ink px-2 py-1 rounded hover:bg-gray-50">
                  重新开始
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {messages.map((m, idx) => {
                  const isLastAssistant = idx === lastAssistantIdx
                  // 历史 assistant 也要剥掉 <choices> 标签，避免渲染成代码
                  const { cleaned, choices, multi } = m.role === 'assistant'
                    ? extractChoices(m.content)
                    : { cleaned: m.content, choices: [] as string[], multi: false }
                  return (
                    <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`${m.role === 'user' ? 'bg-orange-50 border-orange-100' : 'bg-white border-line'} border rounded-2xl px-4 py-3 max-w-[85%]`}>
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
                          <div className="mt-3 flex flex-wrap gap-2">
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
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-2 mb-2">
                              {choices.map(c => {
                                const on = pickedMulti.includes(c)
                                return (
                                  <button
                                    key={c}
                                    onClick={() => setPickedMulti(arr => on ? arr.filter(x => x !== c) : [...arr, c])}
                                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
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

              <div className="px-5 py-3 border-t border-line shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                    }}
                    placeholder="输入回答，Enter 发送，Shift+Enter 换行"
                    className="flex-1 border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-300"
                    style={{ minHeight: 48, maxHeight: 140 }}
                    disabled={sendMut.isPending || chat.status !== 'active'}
                  />
                  <button
                    onClick={submit}
                    disabled={!draft.trim() || sendMut.isPending || chat.status !== 'active'}
                    className="px-3 py-2 rounded-lg text-white disabled:opacity-50"
                    style={{ background: BRAND_GRAD }}
                    title="发送"
                  >
                    {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-ink-muted">
                    {chat.status === 'active'
                      ? '聊够了就点右边「生成文档」，智能体会基于整段对话产出交付物'
                      : chat.status === 'generating'
                        ? '已提交生成任务，请在下方列表查看进度'
                        : '对话已结束'}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右：配置面板（sticky，随页面滚动保持可见，生成按钮常驻） */}
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">智能体</p>
            <div className="space-y-1.5">
              {KINDS.map(k => {
                const active = kind === k.id
                return (
                  <button
                    key={k.id}
                    onClick={() => !chat && setKind(k.id)}
                    disabled={!!chat}
                    className={`w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 transition-all ${
                      active ? 'border-[#FF8D1A] bg-orange-50/60' : 'border-line hover:bg-gray-50'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <k.icon size={14} style={{ color: k.color }} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${active ? 'font-semibold text-ink' : 'text-ink'}`}>{k.title}</p>
                      <p className="text-[11px] text-ink-muted line-clamp-2">{k.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">作用域</p>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => !chat && setScope('project')}
                disabled={!!chat}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  scope === 'project' ? 'border-[#FF8D1A] bg-orange-50 text-orange-700' : 'border-line text-ink-secondary hover:bg-gray-50'
                } disabled:opacity-60`}
              >具体项目</button>
              <button
                onClick={() => !chat && setScope('industry')}
                disabled={!!chat}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  scope === 'industry' ? 'border-[#FF8D1A] bg-orange-50 text-orange-700' : 'border-line text-ink-secondary hover:bg-gray-50'
                } disabled:opacity-60`}
              >行业（无项目）</button>
            </div>
            {scope === 'project' ? (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                disabled={!!chat}
                className="w-full border border-line rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
              >
                <option value="">-- 选择项目 --</option>
                {(projects ?? []).map((p: Project) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.customer ? ` · ${p.customer}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                disabled={!!chat}
                className="w-full border border-line rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
              >
                <option value="">-- 选择行业 --</option>
                {(meta?.industries ?? []).map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            )}
          </div>

          {!chat ? (
            <button
              onClick={startChat}
              disabled={!ready || starting}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND_GRAD }}
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />}
              {starting ? '开启中…' : '开始对话'}
            </button>
          ) : (
            <>
              <button
                onClick={() => generateMut.mutate()}
                disabled={generateMut.isPending || chat.status !== 'active' || messages.length < 2}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND_GRAD }}
                title={chat.status !== 'active' ? '已经提交过生成' : messages.length < 2 ? '至少要有一轮对话' : '基于整段对话生成交付文档'}
              >
                {generateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={13} />}
                {chat.status === 'generating' ? '已提交生成' : '生成文档'}
              </button>
              <p className="text-[11px] text-ink-muted -mt-2">
                {messages.filter(m => m.role === 'user').length} 轮问答 · 已引用知识库 {chat.refs_count} 条
              </p>
            </>
          )}
        </div>
      </div>

      {/* 我的输出 */}
      <div className="rounded-2xl border border-line bg-white p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">我的输出</h2>
          <button onClick={() => refetchOutputs()} className="p-1 text-gray-400 hover:text-gray-600 rounded"><RefreshCw size={13} /></button>
        </div>

        {!outputs || outputs.items.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-8">还没有生成记录</p>
        ) : (
          <div className="space-y-2">
            {outputs.items.map((b: CuratedBundle) => {
              const k = KIND_MAP[b.kind as OutputKind]
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-gray-50">
                  {k && (
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <k.icon size={15} style={{ color: k.color }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{b.title}</p>
                    <p className="text-xs text-ink-muted">{fmt(b.created_at)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                  {b.status === 'done' && isHtmlBundle(b) && (
                    <button
                      onClick={() => playBundle(b)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 shrink-0"
                    >
                      <ExternalLink size={12} /> 在线播放
                    </button>
                  )}
                  {b.status === 'done' && (b.has_file || b.has_content) && (
                    <button
                      onClick={() => downloadBundle(b)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 shrink-0"
                    >
                      <Download size={12} /> 下载
                    </button>
                  )}
                  {b.status === 'failed' && b.error && (
                    <span className="text-[10px] text-red-500 max-w-32 truncate" title={b.error}>{b.error}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
