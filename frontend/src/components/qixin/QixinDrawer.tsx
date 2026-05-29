/**
 * QixinDrawer — 全局企信 IM 侧抽屉(2026-05-29)
 *
 * 右下浮动按钮 + 右侧抽屉(400px 宽):
 *   左半:会话列表(chat_id + 最近一条预览)
 *   右半:选中会话的消息流(时间倒序)
 *
 * Phase 1 用 5s polling 拉新数据,未配置凭证时引导去 /personal-settings。
 * 挂在 /console(老 Layout)和 /redesign/console(新 Layout)两边,样式纯 Tailwind。
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, X, RefreshCw, Settings, ChevronLeft, Send, Loader2 } from 'lucide-react'
import {
  getQixinCredentials,
  listQixinConversations,
  listQixinMessages,
  sendQixinMessage,
} from '../../api/client'

const POLL_INTERVAL_MS = 5000

export default function QixinDrawer() {
  const [open, setOpen] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  // 凭证状态 — 决定空态显示哪种
  const { data: creds } = useQuery({
    queryKey: ['qixin-creds'],
    queryFn: getQixinCredentials,
    staleTime: 60_000,
  })

  // 会话列表(开抽屉时才轮询)
  const conversationsQuery = useQuery({
    queryKey: ['qixin-conversations'],
    queryFn: () => listQixinConversations(50),
    enabled: open && !!creds?.configured,
    refetchInterval: open ? POLL_INTERVAL_MS : false,
    staleTime: POLL_INTERVAL_MS,
  })

  // 选中会话的消息流
  const messagesQuery = useQuery({
    queryKey: ['qixin-messages', activeChatId],
    queryFn: () => listQixinMessages(activeChatId!, { limit: 100 }),
    enabled: open && !!activeChatId && !!creds?.configured,
    refetchInterval: open && activeChatId ? POLL_INTERVAL_MS : false,
    staleTime: POLL_INTERVAL_MS,
  })

  const totalUnread = useMemo(
    () => (conversationsQuery.data || []).reduce((s, c) => s + c.count, 0),
    [conversationsQuery.data],
  )

  // 抽屉打开时锁滚动
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  return (
    <>
      {/* 右下浮动按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-orange-600 text-white shadow-lg hover:bg-orange-700 transition-colors"
          title="企信会话"
        >
          <MessageSquare size={16} />
          <span className="text-sm font-medium">企信</span>
          {creds?.configured && totalUnread > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-white text-orange-600">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* 抽屉 */}
      {open && (
        <>
          {/* 半透遮罩 */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="fixed top-0 right-0 z-50 h-full w-full sm:w-[440px] bg-white shadow-2xl flex flex-col">
            {/* 头 */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              {activeChatId && (
                <button
                  onClick={() => setActiveChatId(null)}
                  className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded"
                  title="返回会话列表"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <MessageSquare size={16} className="text-orange-500" />
              <h3 className="text-sm font-semibold text-gray-900 flex-1">
                {activeChatId ? `会话 · ${activeChatId.slice(0, 16)}…` : '企信会话'}
              </h3>
              <button
                onClick={() => {
                  if (activeChatId) messagesQuery.refetch()
                  else conversationsQuery.refetch()
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                title="刷新"
              >
                <RefreshCw
                  size={14}
                  className={
                    (activeChatId ? messagesQuery.isFetching : conversationsQuery.isFetching)
                      ? 'animate-spin'
                      : ''
                  }
                />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-hidden">
              {!creds?.configured ? (
                <UnconfiguredState onClose={() => setOpen(false)} />
              ) : !activeChatId ? (
                <ConversationList
                  data={conversationsQuery.data || []}
                  loading={conversationsQuery.isLoading}
                  onPick={setActiveChatId}
                />
              ) : (
                <MessageStream
                  chatId={activeChatId}
                  data={messagesQuery.data || []}
                  loading={messagesQuery.isLoading}
                  onSent={() => messagesQuery.refetch()}
                />
              )}
            </div>

            {/* 底部提示 */}
            <div className="shrink-0 px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-center">
              Phase 1 · 只看消息,不自动回复 · 每 5 秒刷新
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── 子组件 ──────────────────────────────────────────────────────────────────

function UnconfiguredState({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <MessageSquare size={36} className="text-gray-300 mb-3" />
      <p className="text-sm text-gray-700 mb-1.5">未配置企信 Bot 凭证</p>
      <p className="text-xs text-gray-500 mb-5 leading-relaxed">
        在「个人设置」里填 appId / appSecret 后,后端会自动建立 SSE 长连接,
        Bot 收到的私聊 / 被 @ 的群聊消息会出现在这里。
      </p>
      <Link
        to="/personal-settings"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700"
      >
        <Settings size={13} />
        去配置
      </Link>
    </div>
  )
}

function ConversationList({
  data,
  loading,
  onPick,
}: {
  data: Awaited<ReturnType<typeof listQixinConversations>>
  loading: boolean
  onPick: (chatId: string) => void
}) {
  if (loading) {
    return <div className="p-6 text-xs text-gray-400">加载中…</div>
  }
  if (!data.length) {
    return (
      <div className="p-6 text-xs text-gray-400 text-center">
        暂无消息。在企信里给 Bot 发条私聊试试。
      </div>
    )
  }
  return (
    <div className="overflow-y-auto h-full divide-y divide-gray-100">
      {data.map((c) => (
        <button
          key={c.chat_id}
          onClick={() => onPick(c.chat_id)}
          className="w-full text-left px-4 py-3 hover:bg-orange-50/40 transition-colors"
        >
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-xs font-medium text-gray-900 truncate">
              {c.last_message.sender_name || c.chat_id.slice(0, 16)}
            </span>
            <span className="text-[10px] text-gray-400 shrink-0">{formatTs(c.last_message.ts)}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-gray-500 line-clamp-2 flex-1">
              {c.last_message.direction === 'out' ? '我: ' : ''}
              {c.last_message.content_preview || '(空)'}
            </p>
            <span className="text-[10px] text-gray-400 shrink-0">{c.count}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function MessageStream({
  chatId,
  data,
  loading,
  onSent,
}: {
  chatId: string
  data: Awaited<ReturnType<typeof listQixinMessages>>
  loading: boolean
  onSent: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sendMut = useMutation({
    mutationFn: (text: string) => sendQixinMessage(chatId, text),
    onSuccess: () => {
      setDraft('')
      setSendError(null)
      onSent()
      qc.invalidateQueries({ queryKey: ['qixin-conversations'] })
    },
    onError: (err: any) => {
      setSendError(err?.response?.data?.detail || err?.message || '发送失败')
    },
  })

  // 数据更新后自动滚到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [data.length])

  // 后端按 created_at desc 返,这里再 reverse 让最新在底
  const ordered = [...data].reverse()

  const submit = () => {
    const t = draft.trim()
    if (!t || sendMut.isPending) return
    sendMut.mutate(t)
  }

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <div className="p-6 text-xs text-gray-400 flex-1">加载中…</div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/40"
        >
          {ordered.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                {m.direction !== 'out' && (
                  <div className="text-[10px] text-gray-400 mb-0.5">
                    {m.sender_name || m.sender_user_id || '未知'}
                  </div>
                )}
                <div
                  className={
                    m.direction === 'out'
                      ? 'bg-orange-500 text-white px-3 py-2 rounded-lg rounded-tr-sm text-xs whitespace-pre-wrap break-words'
                      : 'bg-white border border-gray-200 px-3 py-2 rounded-lg rounded-tl-sm text-xs text-gray-800 whitespace-pre-wrap break-words shadow-sm'
                  }
                >
                  {m.content || '(空)'}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{formatTs(m.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="shrink-0 border-t border-gray-100 px-3 py-2 bg-white">
        {sendError && (
          <div className="mb-1.5 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {sendError}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="输入消息(Enter 发送,Shift+Enter 换行)"
            rows={2}
            className="flex-1 resize-none px-2.5 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || sendMut.isPending}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-700"
            title="发送"
          >
            {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTs(ts: string | null): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}
