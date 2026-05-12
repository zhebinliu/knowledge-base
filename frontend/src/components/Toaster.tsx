/**
 * 极简 Toast 系统(2026-05-12)。
 *
 * 用法:
 *   1. 在 App 根挂 <Toaster />(只挂一次)
 *   2. 任何地方调 toast.success('保存成功') / toast.error('xxx')
 *
 * 设计:不装第三方包(sonner/react-hot-toast),走全局事件总线,组件订阅 window event。
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  kind: ToastKind
  text: string
  // 毫秒,0 = 不自动消失
  duration: number
}

const TOAST_EVENT = 'kb-toast'
let nextId = 0

function emit(kind: ToastKind, text: string, duration = 3500) {
  const detail: ToastMessage = { id: ++nextId, kind, text, duration }
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }))
}

/** 简易 API:toast.success('...') / toast.error('...') / toast.info('...') */
export const toast = {
  success: (text: string, duration?: number) => emit('success', text, duration),
  error: (text: string, duration?: number) => emit('error', text, duration ?? 6000),
  info: (text: string, duration?: number) => emit('info', text, duration),
}

const KIND_STYLE: Record<ToastKind, { Icon: typeof CheckCircle2; cls: string }> = {
  success: { Icon: CheckCircle2, cls: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  error:   { Icon: AlertCircle,  cls: 'border-rose-300 bg-rose-50 text-rose-900' },
  info:    { Icon: Info,         cls: 'border-blue-300 bg-blue-50 text-blue-900' },
}

export default function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const msg = (e as CustomEvent<ToastMessage>).detail
      setMessages(prev => [...prev, msg])
      if (msg.duration > 0) {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== msg.id))
        }, msg.duration)
      }
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {messages.map(m => {
        const { Icon, cls } = KIND_STYLE[m.kind]
        return (
          <div
            key={m.id}
            className={`pointer-events-auto flex items-start gap-2 px-3 py-2.5 rounded-lg border shadow-md max-w-md text-sm ${cls} animate-in slide-in-from-right`}
          >
            <Icon size={15} className="shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed whitespace-pre-wrap break-words">{m.text}</span>
            <button
              onClick={() => setMessages(prev => prev.filter(x => x.id !== m.id))}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
