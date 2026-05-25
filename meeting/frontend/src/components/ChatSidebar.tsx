/**
 * ChatSidebar — 会议智能问答侧边栏 + 卡通蜜蜂悬浮球入口(2026-05-21)。
 *
 * 悬浮球:卡通蜜蜂 SVG,固定在页面右下角。
 * 点击后在页面右侧滑出对话面板,可基于会议内容提问。
 */
import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, Send, Loader2, MessageCircle } from 'lucide-react'
import { chatWithMeeting, type ChatResponse } from '../api/meeting-ext'

// ── 卡通蜜蜂 SVG ──────────────────────────────────────────────────────────

function BeeIcon({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 身体 — 黄色椭圆 */}
      <ellipse cx="24" cy="28" rx="12" ry="14" fill="#FBBF24" />
      {/* 黑色条纹 */}
      <rect x="14" y="22" width="20" height="4" rx="2" fill="#1F2937" />
      <rect x="15" y="30" width="18" height="4" rx="2" fill="#1F2937" />
      {/* 翅膀 — 半透明白色 */}
      <ellipse cx="18" cy="17" rx="8" ry="6" fill="white" opacity="0.7" stroke="#E5E7EB" strokeWidth="0.8" transform="rotate(-15 18 17)" />
      <ellipse cx="30" cy="16" rx="8" ry="6" fill="white" opacity="0.7" stroke="#E5E7EB" strokeWidth="0.8" transform="rotate(15 30 16)" />
      {/* 头部 */}
      <circle cx="24" cy="14" r="6" fill="#FBBF24" />
      {/* 眼睛 */}
      <circle cx="22" cy="13" r="1.2" fill="#1F2937" />
      <circle cx="26" cy="13" r="1.2" fill="#1F2937" />
      {/* 微笑 */}
      <path d="M21 17 Q24 19.5 27 17" stroke="#1F2937" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* 触角 */}
      <line x1="21" y1="9" x2="18" y2="5" stroke="#1F2937" strokeWidth="1" strokeLinecap="round" />
      <line x1="27" y1="9" x2="30" y2="5" stroke="#1F2937" strokeWidth="1" strokeLinecap="round" />
      <circle cx="18" cy="5" r="1.5" fill="#1F2937" />
      <circle cx="30" cy="5" r="1.5" fill="#1F2937" />
      {/* 尾刺 */}
      <ellipse cx="24" cy="42" rx="1.5" ry="2" fill="#1F2937" />
    </svg>
  )
}

// ── 消息类型 ──────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ── 悬浮球 ────────────────────────────────────────────────────────────────

function BeeFloatingBall({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 p-1.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 group"
      style={{ background: 'linear-gradient(135deg,#FBBF24,#F59E0B)' }}
      title="会议智能问答"
    >
      <BeeIcon size={44} />
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 border-2 border-white" />
    </button>
  )
}

// ── 侧边栏 ────────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  meetingId: number
  open: boolean
  onClose: () => void
}

export function ChatSidebar({ meetingId, open, onClose }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是会议助手小蜜蜂 🐝\n你可以问我关于这场会议的任何问题,比如:\n- 这场会议主要讨论了什么？\n- 有哪些待办事项？\n- 谁负责哪些任务？\n- 提取了哪些需求？',
    },
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const chatMut = useMutation({
    mutationFn: (question: string) => chatWithMeeting(meetingId, question),
    onSuccess: (data: ChatResponse) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }])
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉,提问失败,请稍后重试。' }])
    },
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const q = input.trim()
    if (!q || chatMut.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setInput('')
    chatMut.mutate(q)
  }

  if (!open) return null

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* 侧边栏面板 */}
      <div className="fixed top-0 right-0 z-50 h-full w-[420px] max-w-[90vw] bg-white shadow-2xl border-l border-line flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0"
             style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)' }}>
          <div className="flex items-center gap-2">
            <BeeIcon size={28} />
            <div>
              <div className="text-sm font-bold text-ink">会议问答</div>
              <div className="text-[10px] text-ink-muted">基于会议内容智能回答</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-amber-100 text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'text-white'
                    : 'bg-amber-50 border border-amber-100 text-ink'
                }`}
                style={msg.role === 'user' ? { background: 'linear-gradient(135deg,#FF8D1A,#D96400)' } : {}}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {chatMut.isPending && (
            <div className="flex justify-start">
              <div className="bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-orange-500" />
                <span className="text-[12px] text-ink-muted">思考中...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-line shrink-0 bg-canvas">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="输入问题,按 Enter 发送..."
              className="flex-1 px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
              disabled={chatMut.isPending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chatMut.isPending}
              className="px-3 py-2 rounded-lg text-white disabled:opacity-40 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
            >
              {chatMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* 滑入动画 */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </>
  )
}

// ── 组合导出 ──────────────────────────────────────────────────────────────

interface ChatWidgetProps {
  meetingId: number
  /** 仅当有 audio 或 minutes 时才显示入口,避免空会议无意义对话 */
  hasContent: boolean
}

export default function ChatWidget({ meetingId, hasContent }: ChatWidgetProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <BeeFloatingBall visible={hasContent} onClick={() => setSidebarOpen(true)} />
      <ChatSidebar meetingId={meetingId} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  )
}
