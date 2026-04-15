import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { askQuestion, type QAResponse } from '../api/client'
import { Send, Bot, User, Loader } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: QAResponse['sources']
}

const LTC_STAGES = ['', '线索', '商机', '报价', '合同', '回款', '售后']

export default function QA() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [ltcStage, setLtcStage] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const ask = useMutation({
    mutationFn: askQuestion,
    onMutate: ({ question }) => {
      setMessages(m => [...m, { role: 'user', content: question }])
    },
    onSuccess: data => {
      setMessages(m => [...m, {
        role: 'assistant',
        content: typeof data.answer === 'string' ? data.answer : JSON.stringify(data),
        sources: data.sources,
      }])
    },
    onError: err => {
      setMessages(m => [...m, {
        role: 'assistant',
        content: `错误：${String((err as any)?.response?.data?.detail ?? err)}`,
      }])
    },
  })

  const submit = () => {
    const q = input.trim()
    if (!q || ask.isPending) return
    setInput('')
    ask.mutate({ question: q, ltc_stage: ltcStage || undefined })
  }

  return (
    <div className="flex flex-col h-full p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">智能问答</h1>
        <select
          value={ltcStage}
          onChange={e => setLtcStage(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">不限阶段</option>
          {LTC_STAGES.filter(Boolean).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Bot size={48} className="mb-3 opacity-30" />
            <p className="text-sm">输入问题，从知识库中检索答案</p>
            <div className="mt-4 grid grid-cols-1 gap-2 w-full max-w-sm">
              {['如何推进商机到报价阶段？', '回款跟进有哪些最佳实践？', '合同签署的标准流程是什么？'].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-left px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-200'
            }`}>
              {msg.role === 'user' ? <User size={15} className="text-white" /> : <Bot size={15} className="text-gray-600" />}
            </div>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <details className="text-xs text-gray-400 cursor-pointer">
                  <summary>查看 {msg.sources.length} 个来源</summary>
                  <div className="mt-1 space-y-1">
                    {msg.sources.map((s, si) => (
                      <div key={si} className="bg-gray-50 rounded p-2 text-gray-600 line-clamp-2">
                        [{s.ltc_stage}] {s.content.slice(0, 100)}…
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <Bot size={15} className="text-gray-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader size={14} className="animate-spin text-gray-400" />
              <span className="text-sm text-gray-400">正在检索并生成答案…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3 bg-white border border-gray-200 rounded-xl p-2 shadow-sm">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
          placeholder="输入你的问题…"
          className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
        />
        <button
          onClick={submit}
          disabled={!input.trim() || ask.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <Send size={14} />
          发送
        </button>
      </div>
    </div>
  )
}
