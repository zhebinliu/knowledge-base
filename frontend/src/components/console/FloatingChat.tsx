/**
 * FloatingChat — 项目问答浮动聊天窗
 *
 * 三态:closed / open(默认 480x680)/ minimized(右下角小气泡)/ fullscreen(撑满)
 * 切换其他视图、文档预览、生成报告时不影响 — 渲染在 ConsoleProjectDetail 顶层。
 *
 * Props:
 *  - projectId: 锁定到当前项目
 *  - state: { open, minimized, fullscreen }
 *  - onChange(state): 状态变更
 */
import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Minus, Maximize2, Minimize2, X, GripVertical,
} from 'lucide-react'
import FloatingQA from './FloatingQA'

export interface FloatingChatState {
  open: boolean
  minimized: boolean
  fullscreen: boolean
}

interface Props {
  projectId: string
  state: FloatingChatState
  onChange: (s: FloatingChatState) => void
}

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function FloatingChat({ projectId, state, onChange }: Props) {
  // 拖拽位置(只在 normal 模式下生效;fullscreen / minimized 忽略)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  useEffect(() => {
    if (!dragRef.current) return
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (!state.open) return null

  // 最小化:右下角气泡(上移避开中栏 sticky 操作栏)
  if (state.minimized) {
    return (
      <button
        onClick={() => onChange({ ...state, minimized: false })}
        className="fixed bottom-24 right-5 z-50 flex items-center gap-1.5 px-3 py-2 text-white text-xs font-medium rounded-full shadow-lg hover:shadow-xl transition-shadow"
        style={{ background: BRAND_GRAD }}
        title="展开项目问答"
      >
        <MessageSquare size={12} /> 项目问答
      </button>
    )
  }

  // 顶栏拖拽起点
  const onTitleDown = (e: React.MouseEvent) => {
    if (state.fullscreen) return
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos?.x ?? 0, origY: pos?.y ?? 0,
    }
    e.preventDefault()
  }

  // 容器样式
  const containerStyle: React.CSSProperties = state.fullscreen
    ? {
        position: 'fixed', inset: 0, zIndex: 50,
      }
    : {
        position: 'fixed',
        right: 20 - (pos?.x ?? 0),
        bottom: 20 - (pos?.y ?? 0),
        width: 'min(95vw, 480px)',
        height: 'min(85vh, 680px)',
        zIndex: 50,
      }

  return (
    <div
      style={containerStyle}
      className="bg-white border border-line shadow-2xl rounded-xl flex flex-col overflow-hidden"
    >
      {/* 顶栏 */}
      <div
        onMouseDown={onTitleDown}
        className={`flex-shrink-0 px-3 py-2.5 border-b border-line flex items-center gap-2 select-none ${
          state.fullscreen ? '' : 'cursor-move'
        }`}
        style={{ background: 'linear-gradient(to right, #FFF7ED 0%, #FFFFFF 100%)' }}
      >
        {!state.fullscreen && (
          <GripVertical size={12} className="text-ink-muted" />
        )}
        <MessageSquare size={13} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">项目问答</span>
        <span className="text-[10px] text-ink-muted">· 不影响后台对话进程</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => onChange({ ...state, minimized: true })}
            className="p-1 rounded hover:bg-slate-100 text-ink-muted hover:text-ink"
            title="最小化"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => onChange({ ...state, fullscreen: !state.fullscreen })}
            className="p-1 rounded hover:bg-slate-100 text-ink-muted hover:text-ink"
            title={state.fullscreen ? '退出全屏' : '全屏'}
          >
            {state.fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={() => onChange({ ...state, open: false })}
            className="p-1 rounded hover:bg-slate-100 text-ink-muted hover:text-ink"
            title="关闭"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 对话主体(轻量 FloatingQA — 单列,适配窄宽) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <FloatingQA projectId={projectId} />
      </div>
    </div>
  )
}
